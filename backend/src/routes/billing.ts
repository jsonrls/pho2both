import { Router, type RequestHandler } from "express";
import { z } from "zod";
import { asyncHandler, rateLimit } from "../security/http.js";
import { getIdentity, rejectInvalidSessionForWrite, requireUser } from "../security/auth.js";
import {
  AVAILABLE_PLANS,
  createCheckoutSession,
  createCustomerPortalSession,
  getUserPlan,
  syncWebhookEvent,
  verifyWebhook,
  type PlanId,
} from "../services/polar.js";

export const billingRouter = Router();

export const getPublicPlans: RequestHandler = (_req, res) => {
  res.json({
    plans: Object.values(AVAILABLE_PLANS),
    plansById: AVAILABLE_PLANS,
  });
};

// 2. GET /api/billing/status (Authenticated)
billingRouter.get("/status", requireUser, asyncHandler(async (_req, res) => {
  const user = getIdentity(res).user!;
  const planInfo = await getUserPlan(user.id);
  res.json({
    user: { id: user.id, email: user.email, name: user.name },
    ...planInfo,
  });
}));

// 3. POST /api/billing/checkout (Authenticated)
const checkoutSchema = z.object({
  plan: z.enum(["creator_monthly", "creator_yearly", "event"] as const),
  successUrl: z.string().url().max(512).optional(),
}).strict();

billingRouter.post("/checkout", requireUser, rateLimit(15, 60_000), asyncHandler(async (req, res) => {
  if (rejectInvalidSessionForWrite(res)) return;
  const parsed = checkoutSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid checkout plan selection", code: "INVALID_INPUT" });
    return;
  }
  const user = getIdentity(res).user!;
  try {
    const session = await createCheckoutSession({
      userId: user.id,
      email: user.email,
      plan: parsed.data.plan as PlanId,
      successUrl: parsed.data.successUrl,
    });
    res.json(session);
  } catch (err) {
    console.error("[billing-checkout-failed]", err);
    res.status(500).json({ error: "Could not initiate checkout session. Please try again.", code: "CHECKOUT_FAILED" });
  }
}));

// 4. POST /api/billing/portal (Authenticated)
billingRouter.post("/portal", requireUser, rateLimit(15, 60_000), asyncHandler(async (_req, res) => {
  if (rejectInvalidSessionForWrite(res)) return;
  const user = getIdentity(res).user!;
  const planInfo = await getUserPlan(user.id);
  const polarCustomerId = planInfo.subscription?.polarCustomerId;

  if (!polarCustomerId) {
    res.status(400).json({
      error: "No active billing customer record found. Upgrade to a plan first.",
      code: "NO_CUSTOMER_RECORD",
    });
    return;
  }

  try {
    const portal = await createCustomerPortalSession(polarCustomerId);
    res.json(portal);
  } catch (err) {
    console.error("[billing-portal-failed]", err);
    res.status(500).json({ error: "Could not open customer portal. Please try again.", code: "PORTAL_FAILED" });
  }
}));

// 5. POST /api/billing/webhook (Server-to-Server, HMAC verified)
billingRouter.post("/webhook", asyncHandler(async (req, res) => {
  const rawPayload = req.body;
  if (!rawPayload) {
    res.status(400).json({ error: "Missing webhook payload", code: "EMPTY_PAYLOAD" });
    return;
  }

  let event: any;
  try {
    event = verifyWebhook(rawPayload, req.headers);
  } catch (err) {
    console.warn("[polar-webhook-signature-invalid]", err instanceof Error ? err.message : err);
    res.status(403).json({ error: "Invalid webhook signature", code: "INVALID_SIGNATURE" });
    return;
  }

  try {
    const result = await syncWebhookEvent(event);
    res.status(200).json({ received: true, ...result });
  } catch (err) {
    console.error("[polar-webhook-processing-error]", err);
    res.status(500).json({ error: "Failed to process webhook event", code: "WEBHOOK_FAILED" });
  }
}));
