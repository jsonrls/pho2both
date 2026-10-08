import type { Response } from "express";
import { eq, sql } from "drizzle-orm";
import { getDb, schema } from "../db/index.js";
import type { BoothSession, CapturedPhoto, PhotoStrip } from "../db/schema.js";
import { getIdentity } from "./auth.js";

export const DAY = 86_400_000;
export const memorySessions = new Map<string, BoothSession>();
export const memoryPhotos = new Map<string, CapturedPhoto[]>();
export const memoryStrips = new Map<string, PhotoStrip>();
export const validId = (id: string) => /^[A-Za-z0-9_-]{1,36}$/.test(id);
export const validCode = (code: string) => /^(?:[A-Z0-9_-]{4,16}|[A-Z0-9_-]{32})$/.test(code);
export const storageName = (db: ReturnType<typeof getDb>) => db ? "neon-postgres" : "in-memory-fallback";
export function pruneMemory(): void {
  for (const [id, session] of memorySessions) {
    // Development storage is deliberately temporary, including member data.
    if (session.createdAt.getTime() + DAY <= Date.now()) {
      memorySessions.delete(id); memoryPhotos.delete(id);
    }
  }
  // Retain expired links for one extra day so their expiry response remains observable.
  for (const [code, strip] of memoryStrips) if (strip.createdAt.getTime() + 2 * DAY <= Date.now()) memoryStrips.delete(code);
}
export async function pruneExpiredGuestData(): Promise<void> {
  let db: ReturnType<typeof getDb> = null;
  try { db = getDb(); } catch { return; }
  if (!db) return;
  try {
    await db.execute(sql`
      DELETE FROM ${schema.boothSessions}
      WHERE ${schema.boothSessions.id} IN (
        SELECT ${schema.boothSessions.id} FROM ${schema.boothSessions}
        WHERE ${schema.boothSessions.isGuest} = true
          AND ${schema.boothSessions.createdAt} <= now() - interval '24 hours'
        ORDER BY ${schema.boothSessions.createdAt}
        LIMIT 100
        FOR UPDATE SKIP LOCKED
      )
    `);
  } catch (err) {
    console.warn("[guest-prune]", err);
  }
}
export function memoryCapacity(extraBytes = 0): boolean {
  pruneMemory();
  let bytes = extraBytes;
  for (const photos of memoryPhotos.values()) for (const photo of photos) bytes += photo.imageData.length;
  for (const strip of memoryStrips.values()) bytes += strip.stripData.length;
  return memorySessions.size < 1000 && bytes <= 128 * 1024 * 1024;
}
export const memberOwns = (session: BoothSession, res: Response) => !getIdentity(res).authInvalid && !session.isGuest && !!session.userId && session.userId === getIdentity(res).user?.id;
export function ownsSession(session: BoothSession, res: Response): boolean {
  if (getIdentity(res).authInvalid) return false;
  if (!session.isGuest) return memberOwns(session, res);
  return session.createdAt.getTime() + DAY > Date.now() && !!session.guestOwnerHash && session.guestOwnerHash === getIdentity(res).guestOwnerHash;
}
export async function ownedSession(id: string, res: Response, memberOnly = false): Promise<BoothSession | null> {
  if (!validId(id)) return null;
  const db = getDb(); pruneMemory();
  const session = db ? (await db.select().from(schema.boothSessions).where(eq(schema.boothSessions.id, id)).limit(1))[0] : memorySessions.get(id);
  return session && (memberOnly ? memberOwns(session, res) : ownsSession(session, res)) ? session : null;
}
export function sessionView(session: BoothSession) {
  const { guestOwnerHash: _secret, ...view } = session; return view;
}
export const stripExpiry = (strip: PhotoStrip): Date | null => strip.isGuest ? strip.expiresAt || new Date(strip.createdAt.getTime() + DAY) : strip.expiresAt;
export const stripExpired = (strip: PhotoStrip) => { const expiry = stripExpiry(strip); return !!expiry && expiry.getTime() <= Date.now(); };
export async function stripView(strip: PhotoStrip, res: Response) {
  const parent = await ownedSession(strip.sessionId, res, true);
  const db = getDb();
  const originals = parent ? db ? (await db.select({ id: schema.capturedPhotos.id }).from(schema.capturedPhotos).where(eq(schema.capturedPhotos.sessionId, parent.id)).limit(1)).length > 0 : !!memoryPhotos.get(parent.id)?.length : false;
  return { shareCode: strip.shareCode, stripData: strip.stripData, template: strip.template, headerText: strip.headerText, footerText: strip.footerText, frameColor: strip.frameColor, textColor: strip.textColor, isGuest: strip.isGuest, expiresAt: stripExpiry(strip), downloadCount: strip.downloadCount, createdAt: strip.createdAt, canDownloadOriginals: originals, ...(parent ? { sessionId: parent.id } : {}) };
}
export async function findStrip(code: string): Promise<PhotoStrip | undefined> {
  if (!validCode(code)) return undefined;
  const db = getDb(); pruneMemory();
  return db ? (await db.select().from(schema.photoStrips).where(eq(schema.photoStrips.shareCode, code)).limit(1))[0] : memoryStrips.get(code);
}
