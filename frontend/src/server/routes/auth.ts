import { Router } from "express";
import { randomUUID, randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "../db/index";
import type { User } from "../db/schema";
import { asyncHandler, rateLimit } from "../security/http";
import { hashPassword, verifyPassword } from "../security/password";
import { clearSessionCookie, getIdentity, issueSession, memoryUsers, revokeSession, safeUser, tokenHash, requireUser } from "../security/auth";
import { memorySessions, memoryStrips } from "../security/resources";

export const authRouter = Router();
const email = z.string().trim().toLowerCase().max(255).email();
const passwordLength = (min: number) => z.string().refine(value => { const length = Array.from(value).length; return length >= min && length <= 128; });
const signIn = z.object({ email, password: passwordLength(1) }).strict();
const signUp = z.object({ email, password: passwordLength(15), name: z.string().trim().min(1).max(80).default("User") }).strict();
const logoutSchema = z.object({}).strict();
const peerLimit = rateLimit(30, 15 * 60_000);
const emailLimit = rateLimit(10, 15 * 60_000, req => typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase().slice(0, 255) : "invalid");
authRouter.get("/session", (req, res) => {
  const identity = getIdentity(res);
  if (identity.authInvalid) clearSessionCookie(res);
  res.json(identity.user ? { user: identity.user, expiresAt: identity.expiresAt } : { user: null, reason: identity.authInvalid || "anonymous" });
});
authRouter.post("/logout", asyncHandler(async (req, res) => {
  if (req.body && Object.keys(req.body).length > 0) {
    const parsed = logoutSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: "Invalid logout payload", code: "INVALID_INPUT" }); return; }
  }
  await revokeSession(getIdentity(res).sessionHash);
  clearSessionCookie(res);
  res.json({ success: true });
}));
authRouter.post("/signup", peerLimit, emailLimit, asyncHandler(async (req, res) => {
  const parsed = signUp.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Use a valid email, name up to 80 characters, and password of 15–128 characters", code: "INVALID_INPUT" }); return; }
  const { email, password, name } = parsed.data;
  const db = getDb();
  const passwordHash = await hashPassword(password);
  const existing = db ? (await db.select().from(schema.users).where(eq(schema.users.email, email)).limit(1))[0] : Array.from(memoryUsers.values()).find(user => user.email === email);
  if (existing) { res.status(409).json({ error: "Account already exists", code: "ACCOUNT_EXISTS" }); return; }
  const now = new Date();
  const user: User = { id: randomUUID(), email, name, passwordHash, salt: null, avatarUrl: null, provider: "email", role: "user", plan: "free", polarCustomerId: null, createdAt: now, updatedAt: now };
  if (db) {
    try { await db.insert(schema.users).values(user); }
    catch (error) {
      const failure = error as { code?: string; cause?: { code?: string } };
      if (failure.code === "23505" || failure.cause?.code === "23505") { res.status(409).json({ error: "Account already exists", code: "ACCOUNT_EXISTS" }); return; }
      throw error;
    }
  } else {
    if (memoryUsers.size >= 10_000) throw new Error("User capacity reached");
    memoryUsers.set(user.id, user);
  }
  const expiresAt = await issueSession(res, user.id);
  res.status(201).json({ success: true, user: safeUser(user), expiresAt });
}));
authRouter.post("/signin", peerLimit, emailLimit, asyncHandler(async (req, res) => {
  const parsed = signIn.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid email or password format", code: "INVALID_INPUT" }); return; }
  const db = getDb();
  const user = db ? (await db.select().from(schema.users).where(eq(schema.users.email, parsed.data.email)).limit(1))[0] : Array.from(memoryUsers.values()).find(user => user.email === parsed.data.email);
  const result = await verifyPassword(parsed.data.password, user?.passwordHash, user?.salt);
  if (!user || !result.valid) { res.status(401).json({ error: "Invalid email or password", code: "INVALID_CREDENTIALS" }); return; }
  if (result.upgradedHash) {
    if (db) await db.update(schema.users).set({ passwordHash: result.upgradedHash, salt: null, updatedAt: new Date() }).where(eq(schema.users.id, user.id));
    else { user.passwordHash = result.upgradedHash; user.salt = null; user.updatedAt = new Date(); }
  }
  const expiresAt = await issueSession(res, user.id);
  res.json({ success: true, user: safeUser(user), expiresAt });
}));
const memoryResetTokens = new Map<string, { userId: string; expiresAt: Date }>();

const forgotPasswordSchema = z.object({ email }).strict();
authRouter.post("/forgot-password", peerLimit, emailLimit, asyncHandler(async (req, res) => {
  const parsed = forgotPasswordSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid email format", code: "INVALID_INPUT" }); return; }
  for (const [key, val] of memoryResetTokens) if (val.expiresAt.getTime() <= Date.now()) memoryResetTokens.delete(key);
  const db = getDb();
  const user = db ? (await db.select().from(schema.users).where(eq(schema.users.email, parsed.data.email)).limit(1))[0] : Array.from(memoryUsers.values()).find(u => u.email === parsed.data.email);
  if (user) {
    const rawToken = randomBytes(32).toString("hex");
    const hash = tokenHash(rawToken);
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
    memoryResetTokens.set(hash, { userId: user.id, expiresAt });
    res.json({
      success: true,
      message: "If this email is registered, password reset instructions have been issued.",
      ...(process.env.NODE_ENV !== "production" ? { resetToken: rawToken } : {})
    });
    return;
  }
  res.json({ success: true, message: "If this email is registered, password reset instructions have been issued." });
}));

const resetPasswordSchema = z.object({ token: z.string().regex(/^[a-f0-9]{64}$/), password: passwordLength(15) }).strict();
const tokenLimit = rateLimit(10, 15 * 60_000, req => typeof req.body?.token === "string" ? req.body.token.slice(0, 64) : "invalid");
authRouter.post("/reset-password", peerLimit, tokenLimit, asyncHandler(async (req, res) => {
  const parsed = resetPasswordSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid reset token or password (15–128 characters required)", code: "INVALID_INPUT" }); return; }
  const hash = tokenHash(parsed.data.token);
  const resetEntry = memoryResetTokens.get(hash);
  if (!resetEntry || resetEntry.expiresAt.getTime() <= Date.now()) {
    if (resetEntry) memoryResetTokens.delete(hash);
    res.status(400).json({ error: "This password reset link is invalid or has expired", code: "INVALID_RESET_TOKEN" });
    return;
  }
  memoryResetTokens.delete(hash);
  const db = getDb();
  const passwordHash = await hashPassword(parsed.data.password);
  const now = new Date();
  if (db) {
    await db.update(schema.users).set({ passwordHash, salt: null, updatedAt: now }).where(eq(schema.users.id, resetEntry.userId));
    await db.delete(schema.authSessions).where(eq(schema.authSessions.userId, resetEntry.userId));
  } else {
    const user = memoryUsers.get(resetEntry.userId);
    if (user) { user.passwordHash = passwordHash; user.salt = null; user.updatedAt = now; }
  }
  const expiresAt = await issueSession(res, resetEntry.userId);
  const user = db ? (await db.select().from(schema.users).where(eq(schema.users.id, resetEntry.userId)).limit(1))[0] : memoryUsers.get(resetEntry.userId);
  res.json({ success: true, user: user ? safeUser(user) : null, expiresAt });
}));

const changePasswordSchema = z.object({ currentPassword: passwordLength(1), newPassword: passwordLength(15) }).strict();
authRouter.post("/change-password", peerLimit, requireUser, asyncHandler(async (req, res) => {
  const parsed = changePasswordSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "New password must be 15–128 characters", code: "INVALID_INPUT" }); return; }
  const currentUserId = getIdentity(res).user!.id;
  const db = getDb();
  const user = db ? (await db.select().from(schema.users).where(eq(schema.users.id, currentUserId)).limit(1))[0] : memoryUsers.get(currentUserId);
  if (!user) { res.status(401).json({ error: "User not found", code: "USER_NOT_FOUND" }); return; }
  const check = await verifyPassword(parsed.data.currentPassword, user.passwordHash, user.salt);
  if (!check.valid) { res.status(401).json({ error: "Current password is incorrect", code: "INVALID_CREDENTIALS" }); return; }
  const passwordHash = await hashPassword(parsed.data.newPassword);
  const now = new Date();
  if (db) {
    await db.update(schema.users).set({ passwordHash, salt: null, updatedAt: now }).where(eq(schema.users.id, user.id));
  } else {
    user.passwordHash = passwordHash; user.salt = null; user.updatedAt = now;
  }
  res.json({ success: true, message: "Password updated successfully" });
}));

authRouter.delete("/account", peerLimit, requireUser, asyncHandler(async (_req, res) => {
  const currentUserId = getIdentity(res).user!.id;
  const db = getDb();
  if (db) {
    await db.delete(schema.photoStrips).where(eq(schema.photoStrips.userId, currentUserId));
    await db.delete(schema.boothSessions).where(eq(schema.boothSessions.userId, currentUserId));
    await db.delete(schema.users).where(eq(schema.users.id, currentUserId));
  } else {
    memoryUsers.delete(currentUserId);
    for (const [id, s] of memorySessions) if (s.userId === currentUserId) memorySessions.delete(id);
    for (const [code, strip] of memoryStrips) if (strip.userId === currentUserId) memoryStrips.delete(code);
  }
  await revokeSession(getIdentity(res).sessionHash);
  clearSessionCookie(res);
  res.json({ success: true, message: "Account and personal data deleted" });
}));

authRouter.post("/social", peerLimit, (_req, res) => {
  res.status(501).json({ error: "Social login requires Neon Auth configuration. Use email authentication.", code: "NOT_IMPLEMENTED" });
});
