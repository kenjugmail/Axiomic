// Phase 32B — credential freshness band.
//
// Skills decay; a three-year-old proof should not read identical to
// yesterday's. This is a PURELY DERIVED, read-time annotation over
// the timestamps a credential already carries (mintedAt / earnedAt
// / issuedAt). The signed manifest is NOT changed and nothing is
// re-signed — verification stays a pure signature check. A verifier
// can recompute the exact same band from the public earnedAt.

// Day thresholds, module-top so they tune without touching callers.
export const FRESH_MAX_DAYS = 180; // ≤ 6 months → fresh
export const AGING_MAX_DAYS = 540; // ≤ 18 months → aging; else stale

export type Freshness = "fresh" | "aging" | "stale";

export function ageDays(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.floor((Date.now() - t) / 86_400_000));
}

export function freshnessBand(
  iso: string | null | undefined,
): Freshness | null {
  const d = ageDays(iso);
  if (d === null) return null;
  if (d <= FRESH_MAX_DAYS) return "fresh";
  if (d <= AGING_MAX_DAYS) return "aging";
  return "stale";
}
