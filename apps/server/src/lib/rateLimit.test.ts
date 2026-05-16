// Phase 36 — the rate-limit map must not grow unbounded. Expired
// entries were previously never removed (anon ip:* keys via
// X-Forwarded-For rotation accumulate forever). The lazy sweep
// reclaims them; behavior (allow/deny) is unchanged.

import { describe, test, expect } from "bun:test";
import { checkRateLimit, rateLimits } from "./rateLimit";

const run = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

describe("rateLimit lazy eviction (Phase 36)", () => {
  test("expired entries are swept; live entries and allow/deny unchanged", async () => {
    // Seed many short-window entries, then let them expire.
    const seeded: string[] = [];
    for (let i = 0; i < 200; i++) {
      const k = `sweep:${run}:${i}`;
      seeded.push(k);
      expect(checkRateLimit(k, 5, 1)).toBe(true); // 1ms window
    }
    expect(seeded.every((k) => rateLimits.has(k))).toBe(true);
    await new Promise((r) => setTimeout(r, 10)); // all now expired

    // >SWEEP_EVERY (1000) calls guarantee at least one sweep
    // regardless of the shared module counter's prior state.
    const live = `live:${run}`;
    for (let i = 0; i < 1001; i++) checkRateLimit(live, 100_000, 60_000);

    // Every seeded (expired) key is gone.
    expect(seeded.some((k) => rateLimits.has(k))).toBe(false);
    // The still-in-window key survives and kept counting (not reset).
    const entry = rateLimits.get(live);
    expect(entry).toBeDefined();
    expect(entry!.count).toBe(1001);

    // Allow/deny semantics unchanged: a fresh key blocks past max.
    const k = `cap:${run}`;
    expect(checkRateLimit(k, 2, 60_000)).toBe(true);
    expect(checkRateLimit(k, 2, 60_000)).toBe(true);
    expect(checkRateLimit(k, 2, 60_000)).toBe(false); // 3rd > max=2
  });
});
