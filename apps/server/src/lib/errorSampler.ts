// Sprint 53 — In-memory error ring buffer + per-kind counters.
//
// The error sampler is the cheapest "did anything go wrong?" surface
// the platform has — no external aggregator, no log search, just a
// 200-item ring buffer plus per-kind totals exposed to admins via
// GET /admin/error-stats.
//
// Memory is bounded; on restart the buffer resets. For richer
// observability, ship the structured logs from logger.ts to a real
// aggregator and treat this as a fast-glance dashboard.

const MAX_ENTRIES = 200;

export interface ErrorEntry {
  kind: string;
  msg: string;
  ts: string;
  fields?: Record<string, unknown>;
}

let buffer: ErrorEntry[] = [];
const counters = new Map<string, number>();

export function recordError(entry: ErrorEntry): void {
  buffer.push(entry);
  if (buffer.length > MAX_ENTRIES) {
    buffer = buffer.slice(buffer.length - MAX_ENTRIES);
  }
  counters.set(entry.kind, (counters.get(entry.kind) ?? 0) + 1);
}

export function getRecentErrors(limit = 50): ErrorEntry[] {
  const slice = buffer.slice(-limit);
  // Newest first.
  return slice.slice().reverse();
}

export function getCounters(): Record<string, number> {
  return Object.fromEntries(counters.entries());
}

export function resetSampler(): void {
  buffer = [];
  counters.clear();
}
