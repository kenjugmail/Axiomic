import { describe, test, expect } from "bun:test";
import { newCardState, schedule } from "./srs";

const FIXED_NOW = new Date("2026-05-03T12:00:00Z");

describe("SM-2 scheduler", () => {
  test("good rating on a new card schedules 1 day out", () => {
    const r = schedule(newCardState(), 4, FIXED_NOW);
    expect(r.repetitions).toBe(1);
    expect(r.interval).toBe(1);
    // Ease factor barely changes for a Good (4) rating.
    expect(r.easeFactor).toBeCloseTo(2.5, 2);
    expect(new Date(r.dueAt).getTime()).toBe(
      FIXED_NOW.getTime() + 24 * 60 * 60 * 1000,
    );
  });

  test("second consecutive Good rating schedules 6 days out", () => {
    const a = schedule(newCardState(), 4, FIXED_NOW);
    const b = schedule(a, 4, FIXED_NOW);
    expect(b.repetitions).toBe(2);
    expect(b.interval).toBe(6);
  });

  test("subsequent good ratings grow the interval by easeFactor", () => {
    let s = newCardState();
    s = schedule(s, 4, FIXED_NOW); // 1 day
    s = schedule(s, 4, FIXED_NOW); // 6 days
    s = schedule(s, 4, FIXED_NOW); // ~6 * EF days
    const expected = Math.round(6 * s.easeFactor); // EF after 3 Goods
    expect(s.repetitions).toBe(3);
    expect(s.interval).toBe(expected);
    expect(s.interval).toBeGreaterThan(6);
  });

  test("Easy (5) bumps ease faster than Good (4)", () => {
    const ease = schedule(newCardState(), 5, FIXED_NOW).easeFactor;
    const good = schedule(newCardState(), 4, FIXED_NOW).easeFactor;
    expect(ease).toBeGreaterThan(good);
  });

  test("Hard (3) lowers ease but still advances streak", () => {
    const r = schedule(newCardState(), 3, FIXED_NOW);
    expect(r.repetitions).toBe(1);
    expect(r.easeFactor).toBeLessThan(2.5);
  });

  test("Forgot (rating < 3) resets streak and schedules 1 day", () => {
    let s = newCardState();
    s = schedule(s, 4, FIXED_NOW);
    s = schedule(s, 4, FIXED_NOW); // now interval=6, reps=2
    const after = schedule(s, 1, FIXED_NOW);
    expect(after.repetitions).toBe(0);
    expect(after.interval).toBe(1);
    // Ease factor is unchanged on a forgot rating in SM-2.
    expect(after.easeFactor).toBe(s.easeFactor);
  });

  test("ease factor never drops below 1.3", () => {
    let s = newCardState();
    // Drive ease down with repeated Hard (3) ratings.
    for (let i = 0; i < 50; i++) {
      s = schedule(s, 3, FIXED_NOW);
    }
    expect(s.easeFactor).toBeGreaterThanOrEqual(1.3);
  });

  test("rating clamps to 0..5", () => {
    const above = schedule(newCardState(), 99, FIXED_NOW);
    const max = schedule(newCardState(), 5, FIXED_NOW);
    expect(above).toEqual(max);
    const below = schedule(newCardState(), -1, FIXED_NOW);
    const min = schedule(newCardState(), 0, FIXED_NOW);
    expect(below).toEqual(min);
  });
});
