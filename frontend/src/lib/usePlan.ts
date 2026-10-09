"use client";

import { useEffect, useState } from "react";
import { useAuth } from "./authContext";
import { isPaidPlan } from "./watermark";
import {
  fetchBillingStatus,
  fetchPlans,
  type BillingStatusResponse,
  type PlanItem,
  type PlanLimitMeta,
} from "./billingApi";

export type PlanId = "free" | "creator_monthly" | "creator_yearly" | "event";

export const PLAN_LABELS: Record<PlanId, string> = {
  free: "Free plan",
  creator_monthly: "Creator Monthly",
  creator_yearly: "Creator Yearly",
  event: "Event Pass",
};

const FALLBACK_FREE_LIMITS: PlanLimitMeta = {
  layouts: 4,
  filters: 10,
  watermark: true,
  retentionDays: 7,
  maxStripsPerSession: 10,
  customBranding: false,
  rawOriginals: false,
};

export interface UsePlanResult {
  plan: PlanId;
  planLabel: string;
  isGuest: boolean;
  isPaid: boolean;
  limits: PlanLimitMeta;
  subscription: BillingStatusResponse["subscription"];
  plans: PlanItem[];
  plansById: Record<string, PlanItem>;
}

/**
 * Read-only view of the signed-in visitor's plan and its limits.
 *
 * This hook is purely informational for the studio UI (current-plan banner and
 * the plan comparison matrix). It never enforces access — the server remains
 * the single source of truth for gating (see `services/polar.ts` `getUserPlan`).
 */
export function usePlan(): UsePlanResult {
  const { user, status } = useAuth();
  const [plans, setPlans] = useState<PlanItem[]>([]);
  const [plansById, setPlansById] = useState<Record<string, PlanItem>>({});
  const [billing, setBilling] = useState<{ userId: string; data: BillingStatusResponse | null } | null>(null);

  useEffect(() => {
    let active = true;
    fetchPlans()
      .then((data) => {
        if (!active) return;
        setPlans(data.plans);
        setPlansById(data.plansById);
      })
      .catch(() => {
        /* Catalog is optional; the banner still renders from known limits. */
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    if (status !== "authenticated" || !user) {
      // Nothing to fetch for guests; stale billing for a previous user is
      // ignored below by matching on the current user id.
      return;
    }
    fetchBillingStatus()
      .then((data) => {
        if (active) setBilling({ userId: user.id, data });
      })
      .catch(() => {
        /* Fall back to the plan stamped on the session cookie. */
        if (active) setBilling({ userId: user.id, data: null });
      });
    return () => {
      active = false;
    };
  }, [status, user]);

  const isGuest = status !== "authenticated" || !user;

  // Only trust billing data that belongs to the currently authenticated user.
  const currentBilling = !isGuest && billing && billing.userId === user?.id ? billing.data : null;

  let resolvedPlan: PlanId = "free";
  if (!isGuest) {
    if (currentBilling?.plan) resolvedPlan = currentBilling.plan;
    else if (isPaidPlan(user?.plan)) resolvedPlan = user!.plan as PlanId;
  }

  const catalogLimits = plansById[resolvedPlan]?.limits;
  const limits = currentBilling?.limits || catalogLimits || FALLBACK_FREE_LIMITS;
  const planLabel = plansById[resolvedPlan]?.name || PLAN_LABELS[resolvedPlan] || "Free plan";

  return {
    plan: resolvedPlan,
    planLabel,
    isGuest,
    isPaid: isPaidPlan(resolvedPlan),
    limits,
    subscription: currentBilling?.subscription ?? null,
    plans,
    plansById,
  };
}
