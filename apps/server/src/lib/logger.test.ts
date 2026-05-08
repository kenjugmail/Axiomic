// Sprint 53 — Logger + error sampler tests.
//
// Verifies that error() logs feed the in-memory sampler so
// /admin/error-stats has something to surface.

import { describe, test, expect, beforeEach } from "bun:test";
import { logger } from "./logger";
import {
  getCounters,
  getRecentErrors,
  resetSampler,
} from "./errorSampler";

describe("logger + error sampler (Sprint 53)", () => {
  beforeEach(() => {
    resetSampler();
  });

  test("logger.error records an entry in the sampler", () => {
    logger.error({
      kind: "test_kind",
      msg: "boom",
      detail: "extra fields preserved",
    });
    const recent = getRecentErrors();
    expect(recent.length).toBe(1);
    expect(recent[0].kind).toBe("test_kind");
    expect(recent[0].msg).toBe("boom");
    expect(recent[0].fields?.detail).toBe("extra fields preserved");
  });

  test("counters increment per kind", () => {
    logger.error({ kind: "kind_a", msg: "1" });
    logger.error({ kind: "kind_a", msg: "2" });
    logger.error({ kind: "kind_b", msg: "3" });
    const counters = getCounters();
    expect(counters.kind_a).toBe(2);
    expect(counters.kind_b).toBe(1);
  });

  test("logger.warn does NOT feed the error sampler", () => {
    logger.warn({ kind: "soft_kind", msg: "just a warning" });
    expect(getRecentErrors().length).toBe(0);
    expect(getCounters().soft_kind).toBeUndefined();
  });

  test("ring buffer caps at 200 entries", () => {
    for (let i = 0; i < 250; i++) {
      logger.error({ kind: "burst", msg: `e${i}` });
    }
    const recent = getRecentErrors(500);
    expect(recent.length).toBe(200);
    // Newest first.
    expect(recent[0].msg).toBe("e249");
  });

  test("string-only error() falls back to a sensible record", () => {
    logger.error("plain message");
    const recent = getRecentErrors();
    expect(recent[0].kind).toBe("unknown");
    expect(recent[0].msg).toBe("plain message");
  });
});
