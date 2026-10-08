import { Router } from "express";
import { selectedLanIp } from "../security/http.js";
import { isNeonConfigured } from "../db/index.js";
export const healthRouter = Router();
healthRouter.get("/", (_req, res) => {
  const configured = isNeonConfigured();
  res.json({ status: "ok", neon: { configured, status: configured ? "connected" : "ready" } });
});
healthRouter.get("/network-ip", (_req, res) => {
  if (process.env.NODE_ENV !== "development") { res.status(404).json({ error: "Not found" }); return; }
  res.json({ ip: selectedLanIp() });
});
