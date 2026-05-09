// Sprint 53 — In-memory error ring buffer + per-kind counters.
//
// The error sampler is the cheapest "did anything go wrong?" surface
// the platform has — no external aggregator, no log search, just a
// 200-item ring buffer (size configurable via ERROR_SAMPLER_BUFFER_SIZE)
// plus per-kind totals exposed to admins via GET /admin/error-stats.
//
// Sprint 63d — when ERROR_LOG_DESTINATION includes `stdout` (the
// default `both` does), each sampled error also emits a structured
// JSON line on stdout. Ops can ship these lines to Loki / Datadog /
// CloudWatch / etc. without the server needing an SDK.

import { env } from "./envConfig";

export interface ErrorEntry {
  kind: string;
  msg: string;
  ts: string;
  fields?: Record<string, unknown>;
}

let buffer: ErrorEntry[] = [];
const counters = new Map<string, number>();

function maxEntries(): number {
  // Read fresh each time so tests + hot reload that mutate
  // ERROR_SAMPLER_BUFFER_SIZE see the change.
  return env.ERROR_SAMPLER_BUFFER_SIZE;
}

function destination(): "memory" | "stdout" | "both" {
  return env.ERROR_LOG_DESTINATION;
}

export function recordError(entry: ErrorEntry): void {
  // Sprint 63d — always update the ring buffer + counters when
  // memory is part of the destination. Memory is the cheap "is
  // anything broken right now?" view; the dashboard reads it.
  const dest = destination();
  if (dest === "memory" || dest === "both") {
    buffer.push(entry);
    const cap = maxEntries();
    if (buffer.length > cap) {
      buffer = buffer.slice(buffer.length - cap);
    }
    counters.set(entry.kind, (counters.get(entry.kind) ?? 0) + 1);
  }

  // Sprint 63d — structured stdout sink for external aggregators.
  // Skip in tests so test output stays clean.
  if (
    (dest === "stdout" || dest === "both") &&
    process.env.NODE_ENV !== "test"
  ) {
    try {
      const line = JSON.stringify({
        channel: "error_sample",
        kind: entry.kind,
        msg: entry.msg,
        ts: entry.ts,
        ...(entry.fields ?? {}),
      });
      // Single-line JSON via console.error so log shippers pick it up
      // alongside other structured logger.ts events.
      console.error(line);
    } catch {
      // JSON.stringify can fail on circular refs in fields; swallow
      // rather than break the request.
    }
  }
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
