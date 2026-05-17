// Phase 37 — clampInt makes pagination params total: any input
// (NaN-prone "abc", negative, over-max, missing) yields a finite
// integer in range, with no change for already-valid values.

import { describe, test, expect } from "bun:test";
import { clampInt, pageParams } from "./pagination";

describe("clampInt (Phase 37)", () => {
  const o = { def: 50, min: 1, max: 100 };
  test("valid passes through unchanged", () => {
    expect(clampInt("30", o)).toBe(30);
  });
  test("non-numeric → default", () => {
    expect(clampInt("abc", o)).toBe(50);
    expect(clampInt("", o)).toBe(50);
    expect(clampInt(undefined, o)).toBe(50);
    expect(clampInt(null, o)).toBe(50);
  });
  test("over max → clamped to max (no unbounded scan)", () => {
    expect(clampInt("100000", o)).toBe(100);
  });
  test("below min / negative → clamped to min", () => {
    expect(clampInt("0", o)).toBe(1);
    expect(clampInt("-5", o)).toBe(1);
  });
  test("pageParams clamps both; bad input is bounded", () => {
    const p = pageParams("abc", "-9", { defLimit: 50, maxLimit: 100 });
    expect(p.limit).toBe(50);
    expect(p.offset).toBe(0);
    const q = pageParams("99999", "20", { defLimit: 50, maxLimit: 100 });
    expect(q.limit).toBe(100);
    expect(q.offset).toBe(20);
  });
});
