// Phase 37 — total integer coercion for pagination query params.
//
// `parseInt(c.req.query("limit") || "50")` returns NaN for
// "abc", and `Math.min(NaN, max)` is NaN — which, fed to a SQL
// LIMIT/OFFSET, is implementation-defined (SQLite can treat it
// as no-limit, i.e. an unbounded scan). clampInt makes the
// result a finite integer in [min, max] for ANY input, with no
// behavior change for already-valid values.

export function clampInt(
  raw: string | undefined | null,
  opts: { def: number; min: number; max: number },
): number {
  const n = parseInt((raw ?? "").trim(), 10);
  if (!Number.isFinite(n)) return opts.def;
  return Math.min(opts.max, Math.max(opts.min, n));
}

// Convenience for the common (limit, offset) pair.
export function pageParams(
  limitRaw: string | undefined | null,
  offsetRaw: string | undefined | null,
  opts: { defLimit: number; maxLimit: number },
): { limit: number; offset: number } {
  return {
    limit: clampInt(limitRaw, {
      def: opts.defLimit,
      min: 1,
      max: opts.maxLimit,
    }),
    offset: clampInt(offsetRaw, { def: 0, min: 0, max: Number.MAX_SAFE_INTEGER }),
  };
}
