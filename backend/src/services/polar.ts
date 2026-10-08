import { randomUUID } from "node:crypto";
import { eq, desc } from "drizzle-orm";
import { Webhook } from "standardwebhooks";
import { createPolar } from "@polar-sh/sdk/2026-10";
import { getDb, schema } from "../db/index.js";
import type { Subscription, User } from "../db/schema.js";
import { memoryUsers } from "../security/auth.js";

export type PlanId = "free" | "creator_monthly" | "creator_yearly" | "event";

export interface PlanMeta {
  id: PlanId;
  name: string;
  price: number;
  interval: "month" | "year" | "one_time" | null;
  monthlyEquivalent?: number;
  discountPercent?: number;
  trialDays?: number;
  isHero?: boolean;
  description: string;
  features: string[];
  limits: {
    layouts: number | "all";
    filters: number | "all";
    watermark: boolean;
    retentionDays: number | null;
    maxStripsPerSession: number;
    customBranding: boolean;
    rawOriginals: boolean;
  };
}

export const AVAILABLE_PLANS: Record<PlanId, PlanMeta> = {
  free: {
    id: "free",
    name: "Free Member",
    price: 0,
    interval: null,
    description: "Essential photo booth capturing for casual fun.",
    features: [
      "4 classic strip & grid layouts",
      "10 core vintage & color filters",
      "7-day cloud link sharing",
      "Up to 10 strips per session",
      "Instant local PNG downloads",
    ],
    limits: {
      layouts: 4,
      filters: 10,
      watermark: true,
      retentionDays: 7,
      maxStripsPerSession: 10,
      customBranding: false,
      rawOriginals: false,
    },
  },
  creator_monthly: {
    id: "creator_monthly",
    name: "Creator Monthly",
    price: 6,
    interval: "month",
    description: "Full creative suite billed monthly. Cancel anytime.",
    features: [
      "All 23+ vintage, grid & ticket layouts",
      "All 40+ retro filters & color adjustments",
      "Clean, unbranded high-res prints",
      "Permanent cloud links (never expire)",
      "Up to 100 strips per session",
      "Download all raw original shots",
      "Priority cloud processing",
    ],
    limits: {
      layouts: "all",
      filters: "all",
      watermark: false,
      retentionDays: null,
      maxStripsPerSession: 100,
      customBranding: true,
      rawOriginals: true,
    },
  },
  creator_yearly: {
    id: "creator_yearly",
    name: "Creator Yearly",
    price: 59,
    interval: "year",
    monthlyEquivalent: 4.92,
    discountPercent: 18,
    trialDays: 7,
    isHero: true,
    description: "Our best value. 18% off with a 7-day free trial.",
    features: [
      "7-day free trial included",
      "All 23+ vintage, grid & ticket layouts",
      "All 40+ retro filters & adjustments",
      "Clean, unbranded high-res prints",
      "Permanent cloud links (never expire)",
      "Up to 100 strips per session",
      "Download all raw original shots",
      "Annual renewal reminder notifications",
    ],
    limits: {
      layouts: "all",
      filters: "all",
      watermark: false,
      retentionDays: null,
      maxStripsPerSession: 100,
      customBranding: true,
      rawOriginals: true,
    },
  },
  event: {
    id: "event",
    name: "Event Pass",
    price: 19,
    interval: "one_time",
    description: "72-hour pass for parties, weddings & birthdays. No subscription.",
    features: [
      "72 hours of full Creator access",
      "Custom event header & footer captions",
      "All 23+ layouts & 40+ filters",
      "Clean unbranded keepsake downloads",
      "1-year cloud link retention for your guests",
      "Up to 100 strips per session",
      "Download all raw guest photos",
    ],
    limits: {
      layouts: "all",
      filters: "all",
      watermark: false,
      retentionDays: 365,
      maxStripsPerSession: 100,
      customBranding: true,
      rawOriginals: true,
    },
  },
};

export const memorySubscriptions = new Map<string, Subscription>();

function getPolarClient() {
  const token = process.env.POLAR_ACCESS_TOKEN?.trim();
  if (!token) return null;
  const environment = (process.env.POLAR_SERVER || (process.env.NODE_ENV === "production" ? "production" : "sandbox")) as "production" | "sandbox";
  return createPolar({ accessToken: token, environment });
}

export function getProductIdForPlan(plan: PlanId): string {
  switch (plan) {
    case "creator_monthly":
      return process.env.POLAR_PRODUCT_CREATOR_MONTHLY || "prod_creator_monthly";
    case "creator_yearly":
      return process.env.POLAR_PRODUCT_CREATOR_YEARLY || "prod_creator_yearly";
    case "event":
      return process.env.POLAR_PRODUCT_EVENT_PASS || "prod_event_pass";
    default:
      return "";
  }
}

export function getPlanForProductId(productId: string): PlanId | null {
  if (!productId) return null;
  const monthly = process.env.POLAR_PRODUCT_CREATOR_MONTHLY || "prod_creator_monthly";
  const yearly = process.env.POLAR_PRODUCT_CREATOR_YEARLY || "prod_creator_yearly";
  const event = process.env.POLAR_PRODUCT_EVENT_PASS || "prod_event_pass";
  if (productId === monthly) return "creator_monthly";
  if (productId === yearly) return "creator_yearly";
  if (productId === event) return "event";
  return null;
}

export async function createCheckoutSession(params: {
  userId: string;
  email: string;
  plan: PlanId;
  successUrl?: string;
}): Promise<{ checkoutUrl: string; checkoutId?: string }> {
  const { userId, email, plan, successUrl } = params;
  const productId = getProductIdForPlan(plan);
  if (!productId) {
    throw new Error(`Invalid plan for checkout: ${plan}`);
  }

  const client = getPolarClient();
  const returnUrl = successUrl || `${process.env.FRONTEND_URL || "http://localhost:3000"}/auth?checkout=success`;

  if (client) {
    const isYearly = plan === "creator_yearly";
    // Create checkout with metadata linking customer to user ID
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const payload: any = {
      productId,
      customerEmail: email,
      customerExternalId: userId,
      metadata: { userId, plan },
      successUrl: returnUrl,
    };
    if (isYearly) {
      payload.trialPeriodDays = 7;
    }
    const checkout = await client.checkouts.create(payload);
    return { checkoutUrl: checkout.url, checkoutId: checkout.id };
  }

  // Development/Test mock mode
  return {
    checkoutUrl: `https://sandbox.polar.sh/checkout/mock_${plan}?user_id=${encodeURIComponent(userId)}&email=${encodeURIComponent(email)}&success_url=${encodeURIComponent(returnUrl)}`,
    checkoutId: `chk_mock_${randomUUID()}`,
  };
}

export async function createCustomerPortalSession(polarCustomerId: string): Promise<{ portalUrl: string }> {
  if (!polarCustomerId) throw new Error("Missing Polar customer ID");
  const client = getPolarClient();
  if (client) {
    const session = await client.customerSessions.create({ customer_id: polarCustomerId });
    return { portalUrl: session.customer_portal_url };
  }
  return { portalUrl: `https://sandbox.polar.sh/portal/mock_${polarCustomerId}` };
}

export function verifyWebhook(
  payload: string | Buffer | Uint8Array,
  headers: Record<string, string | string[] | undefined>,
  secret?: string
): any {
  const webhookSecret = secret || process.env.POLAR_WEBHOOK_SECRET;
  if (!webhookSecret) {
    throw new Error("POLAR_WEBHOOK_SECRET is not configured");
  }
  const wh = new Webhook(webhookSecret);
  const cleanHeaders: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    if (typeof v === "string") cleanHeaders[k.toLowerCase()] = v;
    else if (Array.isArray(v) && v[0]) cleanHeaders[k.toLowerCase()] = v[0];
  }
  const rawString = typeof payload === "string" ? payload : Buffer.isBuffer(payload) ? payload.toString("utf8") : new TextDecoder().decode(payload);
  return wh.verify(rawString, cleanHeaders);
}

export async function syncWebhookEvent(event: { type: string; data: any }): Promise<{ processed: boolean; plan?: PlanId }> {
  const { type, data } = event;
  const db = getDb();
  const now = new Date();

  if (type === "order.created" || type === "order.paid") {
    const customerId = data.customerId || data.customer?.id;
    const metadata = data.metadata || {};
    const userId = metadata.userId || data.customerExternalId || data.customer?.externalId;
    const productId = data.productId || data.items?.[0]?.productId;
    const plan = (metadata.plan as PlanId) || (productId ? getPlanForProductId(productId) : null) || "event";

    if (!userId) return { processed: false };

    // For one-time Event Pass: grant 72 hours (3 days)
    const isEventPass = plan === "event";
    const periodEnd = isEventPass ? new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000) : null;

    const subRecord: Subscription = {
      id: randomUUID(),
      userId,
      polarCustomerId: customerId || `cust_${userId}`,
      polarSubscriptionId: data.subscriptionId || null,
      polarOrderId: data.id || null,
      productId: productId || getProductIdForPlan(plan),
      plan,
      status: "active",
      currentPeriodEnd: periodEnd,
      cancelAtPeriodEnd: false,
      createdAt: now,
      updatedAt: now,
    };

    if (db) {
      await db.insert(schema.subscriptions).values(subRecord);
      await db.update(schema.users).set({
        plan,
        polarCustomerId: subRecord.polarCustomerId,
        updatedAt: now,
      }).where(eq(schema.users.id, userId));
    } else {
      memorySubscriptions.set(subRecord.id, subRecord);
      const user = memoryUsers.get(userId);
      if (user) {
        user.plan = plan;
        user.polarCustomerId = subRecord.polarCustomerId;
        user.updatedAt = now;
      }
    }
    return { processed: true, plan };
  }

  if (type === "subscription.created" || type === "subscription.updated" || type === "subscription.active") {
    const customerId = data.customerId || data.customer?.id;
    const metadata = data.metadata || {};
    const userId = metadata.userId || data.customerExternalId || data.customer?.externalId;
    const productId = data.productId;
    const plan = (metadata.plan as PlanId) || (productId ? getPlanForProductId(productId) : null) || "creator_monthly";
    const status = data.status || "active";
    const currentPeriodEnd = data.currentPeriodEnd ? new Date(data.currentPeriodEnd) : null;
    const cancelAtPeriodEnd = Boolean(data.cancelAtPeriodEnd);

    if (!userId) return { processed: false };

    const isActive = status === "active" || status === "trialing";
    const effectivePlan: PlanId = isActive ? plan : "free";

    const subRecord: Subscription = {
      id: randomUUID(),
      userId,
      polarCustomerId: customerId || `cust_${userId}`,
      polarSubscriptionId: data.id,
      polarOrderId: null,
      productId: productId || getProductIdForPlan(plan),
      plan,
      status,
      currentPeriodEnd,
      cancelAtPeriodEnd,
      createdAt: now,
      updatedAt: now,
    };

    if (db) {
      await db.insert(schema.subscriptions).values(subRecord);
      await db.update(schema.users).set({
        plan: effectivePlan,
        polarCustomerId: subRecord.polarCustomerId,
        updatedAt: now,
      }).where(eq(schema.users.id, userId));
    } else {
      memorySubscriptions.set(subRecord.id, subRecord);
      const user = memoryUsers.get(userId);
      if (user) {
        user.plan = effectivePlan;
        user.polarCustomerId = subRecord.polarCustomerId;
        user.updatedAt = now;
      }
    }
    return { processed: true, plan: effectivePlan };
  }

  if (type === "subscription.canceled") {
    const customerId = data.customerId;
    const subId = data.id;
    if (db) {
      if (subId) {
        await db.update(schema.subscriptions).set({
          status: "canceled",
          cancelAtPeriodEnd: true,
          updatedAt: now,
        }).where(eq(schema.subscriptions.polarSubscriptionId, subId));
      }
    } else {
      for (const sub of memorySubscriptions.values()) {
        if (sub.polarSubscriptionId === subId) {
          sub.status = "canceled";
          sub.cancelAtPeriodEnd = true;
          sub.updatedAt = now;
        }
      }
    }
    return { processed: true };
  }

  if (type === "subscription.revoked") {
    const customerId = data.customerId;
    const metadata = data.metadata || {};
    const userId = metadata.userId || data.customerExternalId || data.customer?.externalId;
    if (userId) {
      if (db) {
        await db.update(schema.users).set({ plan: "free", updatedAt: now }).where(eq(schema.users.id, userId));
      } else {
        const user = memoryUsers.get(userId);
        if (user) { user.plan = "free"; user.updatedAt = now; }
      }
    }
    return { processed: true, plan: "free" };
  }

  return { processed: false };
}

export async function getUserPlan(userId: string): Promise<{
  plan: PlanId;
  isPaid: boolean;
  canExportClean: boolean;
  subscription: Subscription | null;
  limits: PlanMeta["limits"];
}> {
  if (!userId) {
    return {
      plan: "free",
      isPaid: false,
      canExportClean: false,
      subscription: null,
      limits: AVAILABLE_PLANS.free.limits,
    };
  }

  const db = getDb();
  let user: User | undefined;
  let activeSub: Subscription | undefined;

  if (db) {
    const userRows = await db.select().from(schema.users).where(eq(schema.users.id, userId)).limit(1);
    user = userRows[0];
    if (user) {
      const subRows = await db.select()
        .from(schema.subscriptions)
        .where(eq(schema.subscriptions.userId, userId))
        .orderBy(desc(schema.subscriptions.createdAt))
        .limit(1);
      activeSub = subRows[0];
    }
  } else {
    user = memoryUsers.get(userId);
    const userSubs = [...memorySubscriptions.values()]
      .filter(s => s.userId === userId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    activeSub = userSubs[0];
  }

  if (!user) {
    return {
      plan: "free",
      isPaid: false,
      canExportClean: false,
      subscription: null,
      limits: AVAILABLE_PLANS.free.limits,
    };
  }

  let plan: PlanId = (user.plan as PlanId) || "free";

  // Check event pass expiry (72 hours)
  if (plan === "event" && activeSub?.currentPeriodEnd && activeSub.currentPeriodEnd.getTime() <= Date.now()) {
    plan = "free";
  }

  // Check subscription status
  if ((plan === "creator_monthly" || plan === "creator_yearly") && activeSub) {
    if (activeSub.status === "revoked" || activeSub.status === "unpaid") {
      plan = "free";
    } else if (activeSub.status === "canceled" && activeSub.currentPeriodEnd && activeSub.currentPeriodEnd.getTime() <= Date.now()) {
      plan = "free";
    }
  }

  const isPaid = plan === "creator_monthly" || plan === "creator_yearly" || plan === "event";
  const planConfig = AVAILABLE_PLANS[plan] || AVAILABLE_PLANS.free;

  return {
    plan,
    isPaid,
    canExportClean: isPaid,
    subscription: activeSub || null,
    limits: planConfig.limits,
  };
}
