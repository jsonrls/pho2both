import { Router } from "express";
import { getDb, schema } from "../db/index";
import { and, eq, sql, desc } from "drizzle-orm";
import { customAlphabet } from "nanoid";
import { createHash } from "node:crypto";
import { z } from "zod";
import { getIdentity, rejectInvalidSessionForWrite, requireUser } from "../security/auth";
import { asyncHandler, rateLimit } from "../security/http";
import { imageDimensions } from "../security/media";
import { DAY, memoryStrips, memoryCapacity, ownedSession, stripView, stripExpired, findStrip, storageName } from "../security/resources";
import { getUserPlan } from "../services/polar";

export const stripsRouter = Router();
stripsRouter.use(rateLimit(90));
const shareCode = customAlphabet("ABCDEFGHIJKLMNOPQRSTUVWXYZ234567", 32);
const color = z.string().max(30).regex(/^#(?:[\da-fA-F]{3}|[\da-fA-F]{4}|[\da-fA-F]{6}|[\da-fA-F]{8})$/);
const SaveStripSchema = z.object({ sessionId: z.string().regex(/^[A-Za-z0-9_-]{1,36}$/), stripData: z.string().max(28_000_000), template: z.string().max(50).default("vertical-strip"), headerText: z.string().max(120).default(""), footerText: z.string().max(120).default("PHO2BOOTH • 2026"), frameColor: color.default("#0f172a"), textColor: color.default("#f8fafc") }).strict();
const DownloadStripSchema = z.object({}).strict();
stripsRouter.post("/", rateLimit(20), asyncHandler(async (req, res) => {
  if (rejectInvalidSessionForWrite(res)) return;
  const parsed = SaveStripSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid strip payload" });
  const parent = await ownedSession(parsed.data.sessionId, res);
  if (!parent) return res.status(404).json({ error: "Session not found" });
  if (!imageDimensions(parsed.data.stripData, 20 * 1024 * 1024)) return res.status(400).json({ error: "Invalid image" });
  const db = getDb();
  if (!db && !memoryCapacity(parsed.data.stripData.length)) return res.status(503).json({ error: "Storage capacity reached" });
  const userPlanInfo = parent.userId ? await getUserPlan(parent.userId) : null;
  const isPaidUser = Boolean(userPlanInfo?.isPaid);
  const maxStrips = isPaidUser ? 100 : 10;
  const existing = db ? await db.select({ id: schema.photoStrips.id }).from(schema.photoStrips).where(eq(schema.photoStrips.sessionId, parent.id)).limit(maxStrips) : [...memoryStrips.values()].filter(s => s.sessionId === parent.id);
  if (existing.length >= maxStrips) return res.status(409).json({ error: "Session strip limit reached" });
  // Fixed primary-key slots enforce the cap across processes without a read/count race.
  // Existing legacy rows consume slots too; these routes never delete individual strips.
  for (let slot = existing.length; slot < maxStrips; slot++) {
    const id = createHash("sha256").update(`strip:${parent.id}:${slot}`).digest("hex").slice(0, 36);
    const footerText = parent.isGuest && !parsed.data.footerText?.trim() ? "PHO2BOOTH • 2026" : parsed.data.footerText;
    const expiresAt = parent.isGuest
      ? new Date(Date.now() + DAY)
      : userPlanInfo?.plan === "event"
        ? new Date(Date.now() + 365 * DAY)
        : isPaidUser
          ? null
          : new Date(Date.now() + 7 * DAY);
    const strip = { id, ...parsed.data, footerText, userId: parent.isGuest ? null : parent.userId, isGuest: parent.isGuest, expiresAt, shareCode: shareCode(), downloadCount: 0, createdAt: new Date() };
    if (db) {
      const inserted = await db.insert(schema.photoStrips).values(strip).onConflictDoNothing({ target: schema.photoStrips.id }).returning({ id: schema.photoStrips.id });
      if (!inserted.length) continue;
    } else {
      if ([...memoryStrips.values()].some(s => s.id === id)) continue;
      memoryStrips.set(strip.shareCode, strip);
    }
    return res.status(201).json({ success: true, strip: await stripView(strip, res), storage: storageName(db) });
  }
  return res.status(409).json({ error: "Session strip limit reached" });
}));
stripsRouter.get("/user/:userId", requireUser, asyncHandler(async (req, res) => {
  if (req.params.userId !== getIdentity(res).user!.id) return res.status(404).json({ error: "Gallery not found" });
  const db = getDb();
  const records = db ? await db.select().from(schema.photoStrips).where(and(eq(schema.photoStrips.userId, req.params.userId), eq(schema.photoStrips.isGuest, false), sql`(${schema.photoStrips.expiresAt} is null or ${schema.photoStrips.expiresAt} > now())`)).orderBy(desc(schema.photoStrips.createdAt)).limit(50) : [...memoryStrips.values()].filter(s => !s.isGuest && s.userId === req.params.userId).reverse().slice(0, 50);
  return res.json({ strips: await Promise.all(records.filter(s => !stripExpired(s)).map(s => stripView(s, res))), storage: storageName(db) });
}));
stripsRouter.get("/:shareCode", asyncHandler(async (req, res) => {
  const strip = await findStrip(req.params.shareCode);
  if (!strip) return res.status(404).json({ error: "Photo strip not found" });
  if (stripExpired(strip)) return res.status(410).json({ error: "Photo strip expired", isExpired: true });
  return res.json({ strip: await stripView(strip, res), storage: storageName(getDb()) });
}));
stripsRouter.post("/:shareCode/download", asyncHandler(async (req, res) => {
  if (rejectInvalidSessionForWrite(res)) return;
  if (req.body && Object.keys(req.body).length > 0) {
    const parsed = DownloadStripSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid download payload" });
  }
  const strip = await findStrip(req.params.shareCode);
  if (!strip) return res.status(404).json({ error: "Photo strip not found" });
  if (stripExpired(strip)) return res.status(410).json({ error: "Photo strip expired", isExpired: true });
  const db = getDb();
  if (db) {
    const changed = await db.update(schema.photoStrips).set({ downloadCount: sql`${schema.photoStrips.downloadCount} + 1` }).where(and(eq(schema.photoStrips.shareCode, strip.shareCode), sql`(case when ${schema.photoStrips.isGuest} then coalesce(${schema.photoStrips.expiresAt}, ${schema.photoStrips.createdAt} + interval '24 hours') else ${schema.photoStrips.expiresAt} end is null or case when ${schema.photoStrips.isGuest} then coalesce(${schema.photoStrips.expiresAt}, ${schema.photoStrips.createdAt} + interval '24 hours') else ${schema.photoStrips.expiresAt} end > now())`)).returning({ count: schema.photoStrips.downloadCount });
    if (!changed.length) return res.status(410).json({ error: "Photo strip expired", isExpired: true });
  } else strip.downloadCount++;
  return res.json({ success: true, storage: storageName(db) });
}));
