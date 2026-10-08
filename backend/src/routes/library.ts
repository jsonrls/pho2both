import { createHash } from "node:crypto";
import { Router, type Request, type Response } from "express";
import { and, desc, eq, lt, or, sql, type AnyColumn } from "drizzle-orm";
import { getDb, schema } from "../db/index.js";
import { getIdentity, requireUser } from "../security/auth.js";
import { asyncHandler } from "../security/http.js";
import { imageDimensions } from "../security/media.js";
import { memoryPhotos, memorySessions, memoryStrips, ownedSession, pruneMemory, stripExpired, validId } from "../security/resources.js";

export const libraryRouter = Router();
libraryRouter.use(requireUser, (_req, res, next) => { res.vary("Cookie"); next(); });

const sessions = schema.boothSessions, photos = schema.capturedPhotos, strips = schema.photoStrips;
const activeStrip = sql`(${strips.expiresAt} is null or ${strips.expiresAt} > now())`;
type Cursor = { v: 1; scope: string; owner: string; time: string; id: string };
type Page = { limit: number; cursor: Cursor | null; scope: string; owner: string };
type Row = { id: string; createdAt: Date; cursorTime: string };

function invalidQuery(res: Response) { res.status(400).json({ error: "Invalid library query", code: "INVALID_QUERY" }); }
function ownerTag(res: Response) { return createHash("sha256").update(getIdentity(res).user!.id).digest("hex").slice(0, 16); }
function pageQuery(req: Request, res: Response, scope: string): Page | null {
  if (Object.keys(req.query).some(key => key !== "limit" && key !== "cursor")) { invalidQuery(res); return null; }
  const limit = req.query.limit === undefined ? 20 : typeof req.query.limit === "string" && /^[1-9]\d?$/.test(req.query.limit) ? Number(req.query.limit) : 0;
  if (limit < 1 || limit > 50) { invalidQuery(res); return null; }
  const owner = ownerTag(res);
  let cursor: Cursor | null = null;
  if (req.query.cursor !== undefined) {
    try {
      const value = req.query.cursor;
      if (typeof value !== "string" || value.length > 1024 || !/^[A-Za-z0-9_-]+$/.test(value)) throw new Error();
      const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
      if (!parsed || parsed.v !== 1 || parsed.scope !== scope || parsed.owner !== owner || typeof parsed.id !== "string" || !validId(parsed.id) || typeof parsed.time !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}$/.test(parsed.time)) throw new Error();
      const date = new Date(parsed.time + "Z");
      if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 23) !== parsed.time.slice(0, 23)) throw new Error();
      cursor = parsed;
    } catch { invalidQuery(res); return null; }
  }
  return { limit, cursor, scope, owner };
}

// Cursor timestamps retain Postgres microseconds; JavaScript Date alone would skip tied rows.
const cursorTime = (column: AnyColumn) => sql<string>`to_char(${column}, 'YYYY-MM-DD"T"HH24:MI:SS.US')`;
function before(column: AnyColumn, id: AnyColumn, page: Page) {
  if (!page.cursor) return undefined;
  const time = sql`cast(${page.cursor.time} as timestamp)`;
  return or(lt(column, time), and(eq(column, time), lt(id, page.cursor.id)));
}
function resultPage<T extends Row>(records: T[], page: Page) {
  const hasMore = records.length > page.limit, visible = records.slice(0, page.limit), last = visible.at(-1);
  const nextCursor = hasMore && last ? Buffer.from(JSON.stringify({ v: 1, scope: page.scope, owner: page.owner, time: last.cursorTime, id: last.id })).toString("base64url") : null;
  return { items: visible.map(({ cursorTime: _cursor, ...item }) => item), nextCursor };
}
function memoryPage<T extends { id: string; createdAt: Date }>(records: T[], page: Page) {
  return records.map(record => ({ ...record, cursorTime: record.createdAt.toISOString().replace("Z", "000") }))
    .filter(record => !page.cursor || record.cursorTime < page.cursor.time || (record.cursorTime === page.cursor.time && record.id < page.cursor.id))
    .sort((a, b) => a.cursorTime === b.cursorTime ? (a.id > b.id ? -1 : a.id < b.id ? 1 : 0) : a.cursorTime > b.cursorTime ? -1 : 1)
    .slice(0, page.limit + 1);
}
function memberSessions(res: Response) {
  pruneMemory();
  return [...memorySessions.values()].filter(session => !session.isGuest && session.userId === getIdentity(res).user!.id);
}
function memberStrips(res: Response, sessionId?: string) {
  const ids = new Set(memberSessions(res).map(session => session.id));
  return [...memoryStrips.values()].filter(strip => !strip.isGuest && strip.userId === getIdentity(res).user!.id && ids.has(strip.sessionId) && (!sessionId || strip.sessionId === sessionId) && !stripExpired(strip));
}
function sessionOwner(res: Response) { return and(eq(sessions.userId, getIdentity(res).user!.id), eq(sessions.isGuest, false)); }
function stripOwner(res: Response) { return and(sessionOwner(res), eq(strips.userId, getIdentity(res).user!.id), eq(strips.isGuest, false), activeStrip); }
const stripColumns = { id: strips.id, sessionId: strips.sessionId, createdAt: strips.createdAt, template: strips.template, headerText: strips.headerText, shareCode: strips.shareCode, cursorTime: cursorTime(strips.createdAt) };
const photoColumns = { id: photos.id, sessionId: photos.sessionId, createdAt: photos.createdAt, shotIndex: photos.shotIndex, width: photos.width, height: photos.height, filterName: photos.filterName, cursorTime: cursorTime(photos.createdAt) };
function stripMetadata(strip: typeof strips.$inferSelect) { return { id: strip.id, sessionId: strip.sessionId, createdAt: strip.createdAt, template: strip.template, headerText: strip.headerText, shareCode: strip.shareCode }; }
function photoMetadata(photo: typeof photos.$inferSelect) { return { id: photo.id, sessionId: photo.sessionId, createdAt: photo.createdAt, shotIndex: photo.shotIndex, width: photo.width, height: photo.height, filterName: photo.filterName }; }

libraryRouter.get("/sessions", asyncHandler(async (req, res) => {
  const page = pageQuery(req, res, "sessions");
  if (!page) return;
  const db = getDb();
  const records = db ? await db.select({
    id: sessions.id, createdAt: sessions.createdAt, boothName: sessions.boothName, layout: sessions.layout, status: sessions.status,
    storedPhotoCount: sql<number>`(select count(*) from ${photos} where ${photos.sessionId} = ${sessions.id})`.mapWith(Number),
    storedStripCount: sql<number>`(select count(*) from ${strips} where ${strips.sessionId} = ${sessions.id} and ${strips.userId} = ${getIdentity(res).user!.id} and ${strips.isGuest} = false and ${activeStrip})`.mapWith(Number),
    cursorTime: cursorTime(sessions.createdAt),
  }).from(sessions).where(and(sessionOwner(res), before(sessions.createdAt, sessions.id, page))).orderBy(desc(sessions.createdAt), desc(sessions.id)).limit(page.limit + 1) : memoryPage(memberSessions(res).map(session => ({ id: session.id, createdAt: session.createdAt, boothName: session.boothName, layout: session.layout, status: session.status, storedPhotoCount: memoryPhotos.get(session.id)?.length || 0, storedStripCount: memberStrips(res, session.id).length })), page);
  return res.json(resultPage(records, page));
}));

libraryRouter.get("/strips", asyncHandler(async (req, res) => {
  const page = pageQuery(req, res, "strips");
  if (!page) return;
  const db = getDb();
  const records = db ? await db.select(stripColumns).from(strips).innerJoin(sessions, eq(strips.sessionId, sessions.id)).where(and(stripOwner(res), before(strips.createdAt, strips.id, page))).orderBy(desc(strips.createdAt), desc(strips.id)).limit(page.limit + 1) : memoryPage(memberStrips(res).map(stripMetadata), page);
  return res.json(resultPage(records, page));
}));

libraryRouter.get("/sessions/:sessionId/photos", asyncHandler(async (req, res) => {
  const page = pageQuery(req, res, `photos:${req.params.sessionId}`);
  if (!page) return;
  if (!await ownedSession(req.params.sessionId, res, true)) return res.status(404).json({ error: "Photo session not found" });
  const db = getDb();
  const records = db ? await db.select(photoColumns).from(photos).where(and(eq(photos.sessionId, req.params.sessionId), before(photos.createdAt, photos.id, page))).orderBy(desc(photos.createdAt), desc(photos.id)).limit(page.limit + 1) : memoryPage((memoryPhotos.get(req.params.sessionId) || []).map(photoMetadata), page);
  return res.json(resultPage(records, page));
}));

libraryRouter.get("/sessions/:sessionId/strips", asyncHandler(async (req, res) => {
  const page = pageQuery(req, res, `strips:${req.params.sessionId}`);
  if (!page) return;
  if (!await ownedSession(req.params.sessionId, res, true)) return res.status(404).json({ error: "Photo session not found" });
  const db = getDb();
  const records = db ? await db.select(stripColumns).from(strips).innerJoin(sessions, eq(strips.sessionId, sessions.id)).where(and(stripOwner(res), eq(strips.sessionId, req.params.sessionId), before(strips.createdAt, strips.id, page))).orderBy(desc(strips.createdAt), desc(strips.id)).limit(page.limit + 1) : memoryPage(memberStrips(res, req.params.sessionId).map(stripMetadata), page);
  return res.json(resultPage(records, page));
}));

function sendImage(res: Response, data: string | undefined, maxBytes: number) {
  if (!data || !imageDimensions(data, maxBytes)) return res.status(404).json({ error: "Saved image is unavailable" });
  const separator = data.indexOf(","), type = data.slice(5, data.indexOf(";"));
  res.setHeader("Content-Type", type);
  res.setHeader("Content-Disposition", "inline");
  return res.send(Buffer.from(data.slice(separator + 1), "base64"));
}
libraryRouter.get("/photos/:photoId/media", asyncHandler(async (req, res) => {
  if (Object.keys(req.query).length) return invalidQuery(res);
  if (!validId(req.params.photoId)) return res.status(404).json({ error: "Saved photo not found" });
  const db = getDb();
  let data: string | undefined;
  if (db) data = (await db.select({ image: photos.imageData }).from(photos).innerJoin(sessions, eq(photos.sessionId, sessions.id)).where(and(eq(photos.id, req.params.photoId), sessionOwner(res))).limit(1))[0]?.image;
  else {
    const ids = new Set(memberSessions(res).map(session => session.id));
    for (const [id, records] of memoryPhotos) if (ids.has(id)) { const photo = records.find(item => item.id === req.params.photoId); if (photo) { data = photo.imageData; break; } }
  }
  return sendImage(res, data, 10 * 1024 * 1024);
}));
libraryRouter.get("/strips/:stripId/media", asyncHandler(async (req, res) => {
  if (Object.keys(req.query).length) return invalidQuery(res);
  if (!validId(req.params.stripId)) return res.status(404).json({ error: "Saved strip not found" });
  const db = getDb();
  const data = db ? (await db.select({ image: strips.stripData }).from(strips).innerJoin(sessions, eq(strips.sessionId, sessions.id)).where(and(eq(strips.id, req.params.stripId), stripOwner(res))).limit(1))[0]?.image : memberStrips(res).find(strip => strip.id === req.params.stripId)?.stripData;
  return sendImage(res, data, 20 * 1024 * 1024);
}));
