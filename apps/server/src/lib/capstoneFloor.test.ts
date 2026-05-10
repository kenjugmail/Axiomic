import { describe, test, expect } from "bun:test";
import { validateLongArcFloor } from "./capstoneFloor";

const goodDeliverable = "x".repeat(220);

function valid(overrides: Parameters<typeof validateLongArcFloor>[0] | object = {}) {
  const base = {
    domains: ["mechE", "EE", "microbio"],
    estimatedHoursMin: 200,
    estimatedHoursMax: 700,
    realWorldDeliverableMd: goodDeliverable,
    milestones: [{ dueAt: "2026-08-01" }],
  };
  return { ...base, ...overrides };
}

describe("validateLongArcFloor", () => {
  test("accepts a valid long_arc payload", () => {
    const r = validateLongArcFloor(valid());
    expect(r.ok).toBe(true);
  });

  test("rejects fewer than 3 domains", () => {
    const r = validateLongArcFloor(valid({ domains: ["mechE", "EE"] }));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.join(" ")).toMatch(/3 domains/);
    }
  });

  test("rejects estimatedHoursMin below floor", () => {
    const r = validateLongArcFloor(valid({ estimatedHoursMin: 100, estimatedHoursMax: 700 }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join(" ")).toMatch(/estimatedHoursMin/);
  });

  test("rejects estimatedHoursMax above ceiling", () => {
    const r = validateLongArcFloor(valid({ estimatedHoursMin: 200, estimatedHoursMax: 5000 }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join(" ")).toMatch(/estimatedHoursMax/);
  });

  test("rejects min > max", () => {
    const r = validateLongArcFloor(valid({ estimatedHoursMin: 800, estimatedHoursMax: 700 }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join(" ")).toMatch(/must not exceed/);
  });

  test("rejects null hour range", () => {
    const r = validateLongArcFloor(valid({ estimatedHoursMin: null, estimatedHoursMax: null }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join(" ")).toMatch(/estimatedHoursMin/);
  });

  test("rejects too-short deliverable", () => {
    const r = validateLongArcFloor(valid({ realWorldDeliverableMd: "Just a working device." }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join(" ")).toMatch(/realWorldDeliverableMd/);
  });

  test("rejects when no milestone has dueAt", () => {
    const r = validateLongArcFloor(
      valid({ milestones: [{ dueAt: null }, { dueAt: "" }] }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join(" ")).toMatch(/dueAt/);
  });

  test("aggregates multiple errors", () => {
    const r = validateLongArcFloor({
      domains: ["mechE"],
      estimatedHoursMin: 50,
      estimatedHoursMax: 100,
      realWorldDeliverableMd: "tiny",
      milestones: [{ dueAt: null }],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.length).toBeGreaterThanOrEqual(4);
    }
  });
});
