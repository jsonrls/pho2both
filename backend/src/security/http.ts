import type { Request, Response, NextFunction, RequestHandler, ErrorRequestHandler } from "express";
import { createHash } from "node:crypto";
import { networkInterfaces } from "node:os";
import { HashBusyError } from "./password.js";

export const asyncHandler = (handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler =>
  (req, res, next) => { Promise.resolve(handler(req, res, next)).catch(next); };

export function rateLimit(limit = 120, windowMs = 60_000, key?: (req: Request) => string): RequestHandler {
  const entries = new Map<string, { count: number; until: number }>();
  return (req, res, next) => {
    const now = Date.now();
    for (const [id, entry] of entries) if (entry.until <= now) entries.delete(id);
    const id = createHash("sha256").update(key ? key(req) : req.socket.remoteAddress || "unknown").digest("hex");
    const entry = entries.get(id);
    if ((!entry && entries.size >= 10_000) || (entry && entry.count >= limit)) {
      res.setHeader("Retry-After", String(Math.ceil((entry ? entry.until - now : windowMs) / 1000)));
      res.status(429).json({ error: "Too many requests", code: "RATE_LIMITED" }); return;
    }
    entries.set(id, { count: (entry?.count || 0) + 1, until: entry?.until || now + windowMs });
    next();
  };
}
export function selectedLanIp(): string | null {
  return Object.values(networkInterfaces()).flat().find(item => item && item.family === "IPv4" && !item.internal)?.address || null;
}
export function trustedOrigins(): Set<string> {
  const configured = [
    ...(process.env.FRONTEND_URL || "").split(",").map(value => value.trim()),
    process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "",
    process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "",
  ].filter(Boolean);
  const origins = new Set<string>();
  for (const value of configured) {
    try { const url = new URL(value); if (["http:", "https:"].includes(url.protocol) && url.origin === value) origins.add(value); } catch { /* Invalid configuration is not trusted. */ }
  }
  if (process.env.NODE_ENV !== "production") {
    for (const host of ["localhost", "127.0.0.1", selectedLanIp()].filter(Boolean)) {
      for (const port of [3000, 3001]) origins.add(`http://${host}:${port}`);
    }
  }
  return origins;
}
export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (res.headersSent) return _next(error);
  if (error instanceof HashBusyError) { res.setHeader("Retry-After", "1"); res.status(429).json({ error: "Please try again shortly", code: "HASH_BUSY" }); return; }
  const type = error?.type;
  const status = type === "entity.too.large" ? 413 : type === "encoding.unsupported" || type === "charset.unsupported" ? 415 : type === "entity.parse.failed" || type === "request.aborted" || type === "request.size.invalid" ? 400 : 503;
  console.error(JSON.stringify({ event: "request_failed", status, category: status === 503 ? "storage_or_internal" : "invalid_body" }));
  res.status(status).json({ error: status === 503 ? "Service temporarily unavailable" : "Invalid request body", code: status === 503 ? "SERVICE_UNAVAILABLE" : status === 413 ? "BODY_TOO_LARGE" : status === 415 ? "UNSUPPORTED_MEDIA_TYPE" : "INVALID_JSON" });
};
