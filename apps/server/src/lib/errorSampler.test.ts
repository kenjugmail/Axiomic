// Sprint 63d — errorSampler honors ERROR_SAMPLER_BUFFER_SIZE +
// emits structured JSON on stdout when ERROR_LOG_DESTINATION includes
// stdout. We can't easily reset the cached env between cases (the
// loadEnv() Proxy caches on first read), so the tests focus on the
// observable side: buffer truncation + memory-only behavior in the
// test runner (NODE_ENV=test gates stdout output, so we verify
// console.error stays silent).

import { describe, test, expect, beforeEach, spyOn } from "bun:test";
import {
  recordError,
  getRecentErrors,
  getCounters,
  resetSampler,
} from "./errorSampler";

describe("errorSampler", () => {
  beforeEach(() => {
    resetSampler();
  });

  test("recordError stores entries in the ring buffer + counters", () => {
    recordError({ kind: "test_error", msg: "first", ts: "2026-01-01T00:00:00Z" });
    recordError({ kind: "test_error", msg: "second", ts: "2026-01-01T00:00:01Z" });
    recordError({ kind: "other_error", msg: "third", ts: "2026-01-01T00:00:02Z" });

    const recent = getRecentErrors();
    expect(recent.length).toBe(3);
    // Newest first.
    expect(recent[0].msg).toBe("third");
    expect(recent[2].msg).toBe("first");

    const counts = getCounters();
    expect(counts.test_error).toBe(2);
    expect(counts.other_error).toBe(1);
  });

  test("ring buffer caps at ERROR_SAMPLER_BUFFER_SIZE (default 200)", () => {
    for (let i = 0; i < 250; i++) {
      recordError({
        kind: "spam",
        msg: `${i}`,
        ts: new Date().toISOString(),
      });
    }
    const recent = getRecentErrors(300);
    // Default cap is 200; we shouldn't see more than that even when
    // requesting 300 back.
    expect(recent.length).toBeLessThanOrEqual(200);
    // Counter is unbounded.
    expect(getCounters().spam).toBe(250);
  });

  test("does NOT emit to stdout in NODE_ENV=test", () => {
    // The sampler should swallow stdout output during tests so it
    // doesn't pollute the runner. We assert that recording an error
    // doesn't trigger a structured JSON line on console.error.
    const errSpy = spyOn(console, "error").mockImplementation(() => {});
    try {
      recordError({
        kind: "test_silent",
        msg: "should not show on stdout",
        ts: "2026-01-01T00:00:00Z",
      });
      // Filter for our channel marker — other libraries may legit
      // log during the test (e.g., the search-index init).
      const ourCalls = errSpy.mock.calls.filter((args) =>
        typeof args[0] === "string" && args[0].includes("error_sample"),
      );
      expect(ourCalls.length).toBe(0);
    } finally {
      errSpy.mockRestore();
    }
  });

  test("resetSampler clears buffer + counters", () => {
    recordError({ kind: "x", msg: "a", ts: "2026-01-01T00:00:00Z" });
    expect(getRecentErrors().length).toBe(1);
    resetSampler();
    expect(getRecentErrors().length).toBe(0);
    expect(Object.keys(getCounters()).length).toBe(0);
  });
});
