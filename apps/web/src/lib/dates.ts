// Server-side timestamps come from SQLite's `datetime('now')` default,
// which produces strings like `2024-01-15 10:30:00` (UTC, no T or Z).
// JavaScript's `new Date(...)` parses ISO 8601 strictly — Chrome is
// lenient and accepts the SQLite form, but Firefox + Safari return
// `Invalid Date`. Manually-inserted rows (`new Date().toISOString()`)
// produce the proper `2024-01-15T10:30:00.000Z` form.
//
// parseServerDate handles both shapes plus null/undefined defensively.
// All display sites should funnel through it instead of using
// `new Date(s)` directly.
export function parseServerDate(s: string | null | undefined): Date | null {
  if (!s) return null;
  // Already an ISO 8601 form — Date can parse it directly.
  if (s.includes("T")) {
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  }
  // SQLite default: `YYYY-MM-DD HH:mm:ss[.sss]`. Treat as UTC.
  const isoLike = s.replace(" ", "T");
  const withZone = /[zZ]|[+-]\d{2}:\d{2}$/.test(isoLike) ? isoLike : isoLike + "Z";
  const d = new Date(withZone);
  return isNaN(d.getTime()) ? null : d;
}

export function formatDate(s: string | null | undefined): string {
  const d = parseServerDate(s);
  return d ? d.toLocaleDateString() : "";
}

export function formatDateTime(s: string | null | undefined): string {
  const d = parseServerDate(s);
  return d ? d.toLocaleString() : "";
}

// "5m ago", "3h ago", "2d ago", or absolute date when older.
export function relativeTime(s: string | null | undefined): string {
  const d = parseServerDate(s);
  if (!d) return "";
  const seconds = Math.max(0, Math.floor((Date.now() - d.getTime()) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString();
}
