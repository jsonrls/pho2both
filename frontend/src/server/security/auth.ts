import type { Request, Response, RequestHandler } from "express";
import { createHash, randomBytes } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { getDb, schema } from "../db/index";
import type { User } from "../db/schema";
import { asyncHandler } from "./http";

export type SafeUser = Pick<User, "id" | "email" | "name" | "avatarUrl" | "role" | "plan" | "createdAt">;
export type Identity = { user: SafeUser | null; authInvalid: false | "invalid" | "expired"; expiresAt: Date | null; sessionHash: string | null; guestOwnerHash: string | null };
export const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
export const SESSION_COOKIE = process.env.NODE_ENV === "production" ? "__Host-p2b_session" : "p2b_session";
export const GUEST_COOKIE = process.env.NODE_ENV === "production" ? "__Host-p2b_guest" : "p2b_guest";
const cookieOptions = { httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: "/" };
export const memoryUsers = new Map<string, User>();
const memorySessions = new Map<string, { userId: string; expiresAt: Date }>();
export const tokenHash = (token: string) => createHash("sha256").update(token).digest("hex");
export function safeUser(user: User): SafeUser {
  return { id: user.id, email: user.email, name: user.name, avatarUrl: user.avatarUrl, role: user.role, plan: user.plan || "free", createdAt: user.createdAt };
}
function readCookie(req: Request, name: string): { value: string | null; invalid: boolean } {
  const header = req.headers.cookie || "";
  if (header.length > 8192) return { value: null, invalid: true };
  const matches = header.split(";").map(item => item.trim()).filter(item => item.split("=", 1)[0] === name);
  if (!matches.length) return { value: null, invalid: false };
  const value = matches[0].slice(name.length + 1);
  return matches.length === 1 && /^[a-f0-9]{64}$/.test(value) ? { value, invalid: false } : { value: null, invalid: true };
}
export const getIdentity = (res: Response): Identity => res.locals.identity;
export const identityMiddleware = asyncHandler(async (req, res, next) => {
  const auth = readCookie(req, SESSION_COOKIE);
  const guest = readCookie(req, GUEST_COOKIE);
  const identity: Identity = { user: null, authInvalid: auth.invalid ? "invalid" : false, expiresAt: null, sessionHash: auth.value ? tokenHash(auth.value) : null, guestOwnerHash: guest.value ? tokenHash(guest.value) : null };
  res.locals.identity = identity;
  // Validate configuration even for anonymous requests; never silently use memory in production.
  const db = getDb();
  if (identity.sessionHash) {
    const session = db ? (await db.select().from(schema.authSessions).where(eq(schema.authSessions.tokenHash, identity.sessionHash)).limit(1))[0] : memorySessions.get(identity.sessionHash);
    if (!session) identity.authInvalid = "invalid";
    else if (session.expiresAt.getTime() <= Date.now()) identity.authInvalid = "expired";
    else {
      const user = db ? (await db.select().from(schema.users).where(eq(schema.users.id, session.userId)).limit(1))[0] : memoryUsers.get(session.userId);
      if (!user) identity.authInvalid = "invalid";
      else { identity.user = safeUser(user); identity.expiresAt = session.expiresAt; }
    }
  }
  next();
});
export function rejectInvalidSessionForWrite(res: Response): boolean {
  const reason = getIdentity(res).authInvalid;
  if (!reason) return false;
  res.status(401).json({ error: "Please sign in again", code: "SESSION_INVALID", reason });
  return true;
}
export const requireUser: RequestHandler = (_req, res, next) => {
  if (rejectInvalidSessionForWrite(res)) return;
  if (!getIdentity(res).user) { res.status(401).json({ error: "Sign in required", code: "AUTH_REQUIRED" }); return; }
  next();
};
export function ensureGuestOwner(_req: Request, res: Response): string {
  const identity = getIdentity(res);
  if (!identity.guestOwnerHash) {
    const token = randomBytes(32).toString("hex");
    identity.guestOwnerHash = tokenHash(token);
    res.cookie(GUEST_COOKIE, token, { ...cookieOptions, maxAge: 24 * 60 * 60 * 1000 });
  }
  return identity.guestOwnerHash;
}
export async function revokeSession(hash: string | null): Promise<void> {
  const db = getDb();
  if (!hash) return;
  if (db) await db.delete(schema.authSessions).where(eq(schema.authSessions.tokenHash, hash));
  else memorySessions.delete(hash);
}
export function clearSessionCookie(res: Response): void { res.clearCookie(SESSION_COOKIE, cookieOptions); }
export async function issueSession(res: Response, userId: string): Promise<Date> {
  const db = getDb();
  const token = randomBytes(32).toString("hex");
  const hash = tokenHash(token);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  // Revoke before minting; failures never leave the prior credential active after success.
  await revokeSession(getIdentity(res).sessionHash);
  if (db) {
    // Bound cleanup work and skip rows another authentication request is pruning.
    await db.execute(sql`
      DELETE FROM ${schema.authSessions}
      WHERE ${schema.authSessions.tokenHash} IN (
        SELECT ${schema.authSessions.tokenHash} FROM ${schema.authSessions}
        WHERE ${schema.authSessions.expiresAt} <= now()
        ORDER BY ${schema.authSessions.expiresAt}
        LIMIT 100
        FOR UPDATE SKIP LOCKED
      )
    `);
    await db.insert(schema.authSessions).values({ tokenHash: hash, userId, expiresAt });
  } else {
    for (const [key, value] of memorySessions) if (value.expiresAt.getTime() <= Date.now()) memorySessions.delete(key);
    if (memorySessions.size >= 10_000) throw new Error("Session capacity reached");
    memorySessions.set(hash, { userId, expiresAt });
  }
  res.cookie(SESSION_COOKIE, token, { ...cookieOptions, maxAge: SESSION_TTL_MS, expires: expiresAt });
  return expiresAt;
}
