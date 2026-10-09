"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown, Crown, Info, Lock, Sparkles } from "lucide-react";
import { usePlan, PLAN_LABELS, type PlanId } from "@/lib/usePlan";
import type { PlanItem, PlanLimitMeta } from "@/lib/billingApi";
import styles from "./PlanBanner.module.css";

const MATRIX_ORDER: PlanId[] = ["free", "creator_monthly", "creator_yearly", "event"];

function limitLabel(value: number | "all", unit: string): string {
  return value === "all" ? `All ${unit}` : `${value} ${unit}`;
}

function retentionLabel(days: number | null): string {
  if (days === null) return "Never expire";
  if (days >= 365) return "1 year";
  return `${days} days`;
}

function limitsFor(plan: PlanId, plansById: Record<string, PlanItem>): PlanLimitMeta | null {
  return plansById[plan]?.limits ?? null;
}

export function PlanBanner() {
  const { plan, planLabel, isGuest, isPaid, limits, subscription, plansById } = usePlan();
  const [open, setOpen] = useState(false);

  const currentLimits = limitsFor(plan, plansById) ?? limits;
  const hasCatalog = MATRIX_ORDER.every((id) => Boolean(limitsFor(id, plansById)));

  const buildRow = (
    label: string,
    render: (meta: PlanLimitMeta) => string
  ): { label: string; values: Record<PlanId, string> } => {
    const values = {} as Record<PlanId, string>;
    for (const id of MATRIX_ORDER) {
      const meta = limitsFor(id, plansById);
      values[id] = meta ? render(meta) : "—";
    }
    return { label, values };
  };

  const rows = [
    buildRow("Layouts", (meta) => limitLabel(meta.layouts, "layouts")),
    buildRow("Filters", (meta) => limitLabel(meta.filters, "filters")),
    buildRow("Watermark", (meta) => (meta.watermark ? "Watermarked" : "Clean")),
    buildRow("Cloud link", (meta) => retentionLabel(meta.retentionDays)),
    buildRow("Strips / session", (meta) => String(meta.maxStripsPerSession)),
    buildRow("Custom captions", (meta) => (meta.customBranding ? "Full custom" : "Standard only")),
    buildRow("Raw originals", (meta) => (meta.rawOriginals ? "Download" : "—")),
  ];

  const headline = isGuest
    ? "You're creating as a guest"
    : isPaid
      ? `You're on ${planLabel}`
      : "You're on the Free plan";

  const subline = isGuest
    ? "Sign in for a free account to keep your keepsakes, or upgrade to Creator for clean prints and every layout."
    : isPaid
      ? subscription?.cancelAtPeriodEnd
        ? "Your plan is set to cancel at the end of the current period."
        : "Enjoy clean exports, every layout and filter, and permanent cloud links."
      : "Unlock all 23+ layouts, 40+ filters, clean prints, and permanent keepsakes.";

  return (
    <section className={styles.banner} aria-label="Your plan">
      <div className={styles.summary}>
        <span className={`${styles.badge} ${isPaid ? styles.badgePaid : isGuest ? styles.badgeGuest : styles.badgeFree}`}>
          {isPaid ? <Sparkles size={13} aria-hidden="true" /> : isGuest ? <Lock size={13} aria-hidden="true" /> : <Info size={13} aria-hidden="true" />}
          <span>{isGuest ? "Guest" : isPaid ? planLabel : "Free"}</span>
        </span>
        <div className={styles.copy}>
          <p className={styles.headline}>{headline}</p>
          <p className={styles.subline}>{subline}</p>
        </div>
      </div>

      <div className={styles.actions}>
        {isGuest || !isPaid ? (
          <Link href="/pricing" className={styles.upgrade}>
            <Crown size={14} aria-hidden="true" />
            {isGuest ? "See plans" : "Upgrade"}
          </Link>
        ) : null}
        <button
          type="button"
          className={styles.toggle}
          aria-expanded={open}
          aria-controls="plan-matrix"
          onClick={() => setOpen((value) => !value)}
        >
          Compare plans
          <ChevronDown size={14} aria-hidden="true" className={open ? styles.chevronOpen : undefined} />
        </button>
      </div>

      {open && (
        <div className={styles.matrix} id="plan-matrix">
          <div className={styles.matrixScroll}>
            <table className={styles.table}>
              <caption className="sr-only">Plan feature comparison</caption>
              <thead>
                <tr>
                  <th scope="col">Feature</th>
                  {MATRIX_ORDER.map((id) => (
                    <th key={id} scope="col" data-current={id === plan ? "true" : undefined}>
                      {plansById[id]?.name ?? PLAN_LABELS[id]}
                      {id === plan && <span className={styles.youTag}>Your plan</span>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.label}>
                    <th scope="row">{row.label}</th>
                    {MATRIX_ORDER.map((id) => (
                      <td key={id} data-current={id === plan ? "true" : undefined}>
                        {row.values[id]}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!hasCatalog && (
            <p className={styles.matrixNote}>
              Live plan details are still loading. Your current plan gives you {currentLimits.layouts === "all" ? "all layouts" : `${currentLimits.layouts} layouts`} and {currentLimits.filters === "all" ? "all filters" : `${currentLimits.filters} filters`}.
            </p>
          )}
          <p className={styles.matrixNote}>
            This is an informational summary. Limits are enforced when you save and share keepsakes.
          </p>
        </div>
      )}
    </section>
  );
}
