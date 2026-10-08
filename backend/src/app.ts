import express from "express";
import cors from "cors";
import { healthRouter } from "./routes/health.js";
import { sessionsRouter } from "./routes/sessions.js";
import { photosRouter } from "./routes/photos.js";
import { stripsRouter } from "./routes/strips.js";
import { authRouter } from "./routes/auth.js";
import { libraryRouter } from "./routes/library.js";
import { billingRouter, getPublicPlans } from "./routes/billing.js";
import { identityMiddleware, rejectInvalidSessionForWrite } from "./security/auth.js";
import { errorHandler, rateLimit, trustedOrigins } from "./security/http.js";

export const app = express();
app.disable("x-powered-by");
app.set("trust proxy", false);
const origins = trustedOrigins();
app.use((_req, res, next) => { res.setHeader("Cache-Control", "private, no-store"); res.setHeader("X-Content-Type-Options", "nosniff"); next(); });
app.use(cors({ origin: (origin, callback) => callback(null, Boolean(origin && origins.has(origin))), credentials: true, methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"], allowedHeaders: ["Content-Type", "Accept", "webhook-id", "webhook-timestamp", "webhook-signature"] }));
app.use((req, res, next) => {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  if (req.path === "/api/billing/webhook") return next();
  if (!req.headers.origin || !origins.has(req.headers.origin)) { res.status(403).json({ error: "Trusted origin required", code: "ORIGIN_FORBIDDEN" }); return; }
  if (req.method === "DELETE" && !req.headers["content-type"]) return next();
  if (!req.is("application/json")) { res.status(415).json({ error: "JSON content type required", code: "UNSUPPORTED_MEDIA_TYPE" }); return; }
  next();
});
app.get("/", (_req, res) => { res.json({ status: "online" }); });
app.use("/api/health", healthRouter);
app.use("/api/billing/webhook", express.raw({ type: "*/*", limit: "1mb" }));
app.use("/api", rateLimit(300, 60_000));
app.get("/api/billing/plans", getPublicPlans);
app.use("/api", identityMiddleware);
app.use("/api", (req, res, next) => {
  const isAuthRecovery = req.method === "POST" && /^\/auth\/(signin|signup|logout|forgot-password|reset-password)\/?$/i.test(req.path);
  const isBillingWebhook = req.method === "POST" && /^\/billing\/webhook\/?$/i.test(req.path);
  if (!["GET", "HEAD", "OPTIONS"].includes(req.method) && !isAuthRecovery && !isBillingWebhook && rejectInvalidSessionForWrite(res)) return;
  next();
});
app.use("/api/auth", express.json({ limit: "16kb", inflate: false }), authRouter);
app.use("/api/library", libraryRouter);
app.use("/api/sessions", rateLimit(90, 60_000), express.json({ limit: "16kb", inflate: false }), sessionsRouter);
app.use("/api/photos", rateLimit(60, 60_000), express.json({ limit: "16mb", inflate: false }), photosRouter);
app.use("/api/strips", rateLimit(90, 60_000), express.json({ limit: "28mb", inflate: false }), stripsRouter);
app.use("/api/billing", express.json({ limit: "16kb", inflate: false }), billingRouter);
app.use((_req, res) => { res.status(404).json({ error: "Not found" }); });
app.use(errorHandler);
export default app;
