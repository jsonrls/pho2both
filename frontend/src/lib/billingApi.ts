import { ApiError, fetchWithFallback } from "./api";

export interface PlanLimitMeta {
  layouts: number | "all";
  filters: number | "all";
  watermark: boolean;
  retentionDays: number | null;
  maxStripsPerSession: number;
  customBranding: boolean;
  rawOriginals: boolean;
}

export interface PlanItem {
  id: "free" | "creator_monthly" | "creator_yearly" | "event";
  name: string;
  price: number;
  interval: "month" | "year" | "one_time" | null;
  monthlyEquivalent?: number;
  discountPercent?: number;
  trialDays?: number;
  isHero?: boolean;
  description: string;
  features: string[];
  limits: PlanLimitMeta;
}

export interface BillingStatusResponse {
  user: { id: string; email: string; name: string };
  plan: "free" | "creator_monthly" | "creator_yearly" | "event";
  isPaid: boolean;
  canExportClean: boolean;
  subscription: {
    id: string;
    status: string;
    plan: string;
    polarCustomerId: string;
    currentPeriodEnd?: string | null;
    cancelAtPeriodEnd?: boolean;
  } | null;
  limits: PlanLimitMeta;
}

export async function fetchPlans(): Promise<{ plans: PlanItem[]; plansById: Record<string, PlanItem> }> {
  const response = await fetchWithFallback("/api/billing/plans", {
    method: "GET",
    credentials: "same-origin",
    cache: "no-store",
  });
  if (!response.ok) {
    throw new ApiError("Failed to fetch available plans.", response.status, "PLANS_FAILED");
  }
  return response.json();
}

export async function fetchBillingStatus(): Promise<BillingStatusResponse> {
  const response = await fetchWithFallback("/api/billing/status", {
    method: "GET",
    credentials: "same-origin",
    cache: "no-store",
  });
  if (!response.ok) {
    throw new ApiError("Failed to fetch billing status.", response.status, "BILLING_STATUS_FAILED");
  }
  return response.json();
}

export async function createCheckout(
  plan: "creator_monthly" | "creator_yearly" | "event",
  successUrl?: string
): Promise<{ checkoutUrl: string; checkoutId?: string }> {
  const response = await fetchWithFallback("/api/billing/checkout", {
    method: "POST",
    credentials: "same-origin",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ plan, successUrl }),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new ApiError(data?.error || "Failed to create checkout session.", response.status, "CHECKOUT_FAILED");
  }
  return response.json();
}

export async function createCustomerPortal(): Promise<{ portalUrl: string }> {
  const response = await fetchWithFallback("/api/billing/portal", {
    method: "POST",
    credentials: "same-origin",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
  });
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new ApiError(data?.error || "Failed to open customer portal.", response.status, "PORTAL_FAILED");
  }
  return response.json();
}
