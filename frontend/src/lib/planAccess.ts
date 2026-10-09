import type { FilterType, LayoutItem, FilterOption } from "@/types/booth";
import { FILTERS, LAYOUTS } from "./constants";
import { isPaidPlan } from "./watermark";

/**
 * Client-side feature gating derived from the visitor's subscription plan.
 *
 * This is a UX guard only — the server (`server/services/polar.ts`
 * `getUserPlan` + `routes/strips.ts`) remains the single source of truth for
 * enforcement (strip counts, retention, ownership). Everything here mirrors
 * `AVAILABLE_PLANS` so free/guest visitors can never *reach* a paid feature in
 * the studio UI, and every locked control offers a clear upgrade path.
 */

/** The four layouts included on the Free plan (classic strip & grid). */
export const FREE_LAYOUT_IDS = ["strip-4", "strip-3", "strip-2", "grid-2x2"] as const;

/** The ten core filters included on the Free plan. */
export const FREE_FILTER_IDS = [
  "original",
  "auto",
  "warm",
  "cool",
  "vivid",
  "soft",
  "matte",
  "fresh",
  "citrus",
  "classic-bw",
] as const;

/** Legacy filter aliases mapped to their canonical preset. */
const FILTER_ALIASES: Partial<Record<string, FilterType>> = {
  none: "original",
  grayscale: "classic-bw",
  "cyber-neon": "neon",
  warmth: "golden-hour",
};

const freeLayoutSet = new Set<string>(FREE_LAYOUT_IDS);
const freeFilterSet = new Set<string>(FREE_FILTER_IDS);

/** True when the plan unlocks every layout and filter (Creator / Event Pass). */
export function hasFullAccess(plan?: string | null): boolean {
  return isPaidPlan(plan);
}

export function isLayoutUnlocked(plan: string | null | undefined, id: string): boolean {
  return hasFullAccess(plan) || freeLayoutSet.has(id);
}

export function isFilterUnlocked(plan: string | null | undefined, id: string): boolean {
  if (hasFullAccess(plan)) return true;
  const canonical = FILTER_ALIASES[id] ?? (id as FilterType);
  return freeFilterSet.has(canonical);
}

export function allowedLayouts(plan: string | null | undefined): LayoutItem[] {
  return hasFullAccess(plan) ? LAYOUTS : LAYOUTS.filter((layout) => freeLayoutSet.has(layout.id));
}

export function allowedFilters(plan: string | null | undefined): FilterOption[] {
  return hasFullAccess(plan) ? FILTERS : FILTERS.filter((filter) => freeFilterSet.has(filter.id));
}

/** Free and guest exports are watermarked; only paid plans export clean. */
export function shouldWatermark(plan?: string | null): boolean {
  return !hasFullAccess(plan);
}

/** Custom header/footer captions and clean prints are a paid feature. */
export function canCustomizeCaptions(plan?: string | null): boolean {
  return hasFullAccess(plan);
}

/** Downloading the raw original shots is a paid feature. */
export function canDownloadRawOriginals(plan?: string | null): boolean {
  return hasFullAccess(plan);
}
