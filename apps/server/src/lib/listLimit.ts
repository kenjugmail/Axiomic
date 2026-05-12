// Phase J — list endpoint pagination helper.
//
// Centralize the parse-and-clamp pattern used by GET endpoints that
// accept a `?limit=` query so unbounded callers can't request all
// rows in one go.

export function parseLimit(
  raw: string | undefined,
  defaultLimit: number,
  maxLimit: number,
): number {
  const n = parseInt(raw ?? String(defaultLimit), 10);
  if (!Number.isFinite(n) || n <= 0) return defaultLimit;
  return Math.min(n, maxLimit);
}
