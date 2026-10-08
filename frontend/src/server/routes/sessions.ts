import { Router } from "express";
import { getDb, schema } from "../db/index";
import { and, eq, desc } from "drizzle-orm";
import { nanoid } from "nanoid";
import { z } from "zod";
import { ensureGuestOwner, getIdentity, rejectInvalidSessionForWrite, requireUser } from "../security/auth";
import { asyncHandler, rateLimit } from "../security/http";
import { memorySessions, memoryPhotos, memoryStrips, memoryCapacity, ownedSession, memberOwns, sessionView, stripView, stripExpired, storageName, pruneExpiredGuestData } from "../security/resources";

export const sessionsRouter = Router();
const CreateSessionSchema = z.object({
  boothName: z.string().max(120).default("Pho2Booth"), theme: z.string().max(50).default("neon-glow"),
  layout: z.string().max(50).default("strip-4"), photoCount: z.number().int().min(1).max(8).default(4),
  countdownSeconds: z.number().int().min(0).max(10).default(3),
}).strict();
sessionsRouter.post("/", rateLimit(30), asyncHandler(async (req, res) => {
  if (rejectInvalidSessionForWrite(res)) return;
  const parsed = CreateSessionSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid session configuration" });
  const db = getDb(), user = getIdentity(res).user;
  if (!db && !memoryCapacity()) return res.status(503).json({ error: "Storage capacity reached" });
  if (db) void pruneExpiredGuestData();
  const session = { id: nanoid(16), userId: user?.id || null, isGuest: !user, guestOwnerHash: user ? null : ensureGuestOwner(req, res), sessionCode: nanoid(10).toUpperCase(), ...parsed.data, status: "active", createdAt: new Date(), updatedAt: new Date() };
  if (db) await db.insert(schema.boothSessions).values(session);
  else memorySessions.set(session.id, session);
  return res.status(201).json({ success: true, session: sessionView(session), storage: storageName(db) });
}));
sessionsRouter.get("/", requireUser, asyncHandler(async (_req, res) => {
  const db = getDb(), userId = getIdentity(res).user!.id;
  const records = db ? await db.select().from(schema.boothSessions).where(and(eq(schema.boothSessions.userId, userId), eq(schema.boothSessions.isGuest, false))).orderBy(desc(schema.boothSessions.createdAt)).limit(20) : [...memorySessions.values()].filter(s => s.userId === userId && !s.isGuest).reverse().slice(0, 20);
  return res.json({ sessions: records.map(sessionView), storage: storageName(db) });
}));
sessionsRouter.get("/:id", asyncHandler(async (req, res) => {
  const session = await ownedSession(req.params.id, res);
  if (!session) return res.status(404).json({ error: "Session not found" });
  const db = getDb();
  const photos = memberOwns(session, res) ? db ? await db.select().from(schema.capturedPhotos).where(eq(schema.capturedPhotos.sessionId, session.id)).orderBy(schema.capturedPhotos.shotIndex) : memoryPhotos.get(session.id) || [] : [];
  const strips = db ? await db.select().from(schema.photoStrips).where(eq(schema.photoStrips.sessionId, session.id)).limit(10) : [...memoryStrips.values()].filter(s => s.sessionId === session.id);
  return res.json({ session: sessionView(session), photos, strips: await Promise.all(strips.filter(s => !stripExpired(s)).map(s => stripView(s, res))), storage: storageName(db) });
}));
