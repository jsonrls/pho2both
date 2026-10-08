import { Router } from "express";
import { getDb, schema } from "../db/index.js";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { z } from "zod";
import { rejectInvalidSessionForWrite, requireUser } from "../security/auth.js";
import { asyncHandler, rateLimit } from "../security/http.js";
import { imageDimensions } from "../security/media.js";
import { memoryPhotos, memoryCapacity, ownedSession, storageName } from "../security/resources.js";

export const photosRouter = Router();
const UploadPhotoSchema = z.object({ sessionId: z.string().regex(/^[A-Za-z0-9_-]{1,36}$/), shotIndex: z.number().int().min(0).max(7), imageData: z.string().max(14_000_000), filterName: z.string().max(50).default("normal"), width: z.number().int().min(1).max(8192).optional(), height: z.number().int().min(1).max(8192).optional() }).strict();
photosRouter.post("/", rateLimit(40), asyncHandler(async (req, res) => {
  if (rejectInvalidSessionForWrite(res)) return;
  const parsed = UploadPhotoSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid photo payload" });
  const session = await ownedSession(parsed.data.sessionId, res);
  if (!session) return res.status(404).json({ error: "Session not found" });
  if (parsed.data.shotIndex >= session.photoCount) return res.status(400).json({ error: "Invalid shot index" });
  const dimensions = imageDimensions(parsed.data.imageData, 10 * 1024 * 1024);
  if (!dimensions || (parsed.data.width !== undefined && dimensions.width !== parsed.data.width) || (parsed.data.height !== undefined && dimensions.height !== parsed.data.height)) return res.status(400).json({ error: "Invalid image" });
  const db = getDb();
  if (!db && !memoryCapacity(parsed.data.imageData.length)) return res.status(503).json({ error: "Storage capacity reached" });
  let photo = { ...parsed.data, ...dimensions, id: nanoid(16), createdAt: new Date() };
  if (db) {
    const rows = await db.insert(schema.capturedPhotos).values(photo).onConflictDoUpdate({ target: [schema.capturedPhotos.sessionId, schema.capturedPhotos.shotIndex], set: { imageData: photo.imageData, filterName: photo.filterName, width: photo.width, height: photo.height } }).returning();
    photo = { ...photo, id: rows[0].id, createdAt: rows[0].createdAt };
  } else {
    const photos = memoryPhotos.get(session.id) || [], index = photos.findIndex(p => p.shotIndex === photo.shotIndex);
    if (index >= 0) { photo.id = photos[index].id; photo.createdAt = photos[index].createdAt; photos[index] = photo; } else photos.push(photo);
    memoryPhotos.set(session.id, photos);
  }
  return res.status(201).json({ success: true, photo: { id: photo.id, sessionId: photo.sessionId, shotIndex: photo.shotIndex, filterName: photo.filterName, createdAt: photo.createdAt }, storage: storageName(db) });
}));
photosRouter.get("/:sessionId", requireUser, asyncHandler(async (req, res) => {
  const session = await ownedSession(req.params.sessionId, res, true);
  if (!session) return res.status(404).json({ error: "Session not found" });
  const db = getDb();
  const photos = db ? await db.select().from(schema.capturedPhotos).where(eq(schema.capturedPhotos.sessionId, session.id)).orderBy(schema.capturedPhotos.shotIndex) : [...(memoryPhotos.get(session.id) || [])].sort((a, b) => a.shotIndex - b.shotIndex);
  return res.json({ photos, storage: storageName(db) });
}));
