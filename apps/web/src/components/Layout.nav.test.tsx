// Phase 10A — top-nav rebalance assertions.
//
// Verifies the public Layout nav structure after dedup:
//   - Forum + News appear as top-level pillars.
//   - The More menu no longer duplicates pillars or pet items.

import { describe, expect, test } from "vitest";
import { EXTRA_NAV_PILLARS, PET_ROUTES, isRouteActive } from "./nav-constants";
import { NAV_PILLARS } from "../marketing/hubs";

describe("Layout nav constants — Phase 10A", () => {
  test("EXTRA_NAV_PILLARS has Forum and News", () => {
    const tos = EXTRA_NAV_PILLARS.map((p) => p.to);
    expect(tos).toContain("/forum");
    expect(tos).toContain("/news");
  });

  test("EXTRA_NAV_PILLARS labels render readable", () => {
    const labels = EXTRA_NAV_PILLARS.map((p) => p.label);
    expect(labels).toContain("Forum");
    expect(labels).toContain("News");
  });

  test("PET_ROUTES covers My pet, Inventory, Shop, Skins, Showcase", () => {
    expect(PET_ROUTES).toContain("/me/pet");
    expect(PET_ROUTES).toContain("/me/inventory");
    expect(PET_ROUTES).toContain("/shop");
    expect(PET_ROUTES).toContain("/skins");
    expect(PET_ROUTES).toContain("/explore/pets");
  });

  test("isRouteActive matches exact + sub-routes", () => {
    expect(isRouteActive("/forum", "/forum")).toBe(true);
    expect(isRouteActive("/forum/topic/123", "/forum")).toBe(true);
    expect(isRouteActive("/news", "/forum")).toBe(false);
    // Root path is exact-match only.
    expect(isRouteActive("/anything", "/")).toBe(false);
    expect(isRouteActive("/", "/")).toBe(true);
  });

  // Phase 42 — Research pillar links to the fused frontier feed but
  // stays highlighted across the whole /research* section.
  test("Research pillar links to /research/feed, active across /research*", () => {
    const research = NAV_PILLARS.find((p) => p.id === "research")!;
    expect(research.to).toBe("/research/feed");
    expect(research.match).toBe("/research");
    const activeFor = (path: string) =>
      isRouteActive(path, research.match ?? research.to);
    expect(activeFor("/research/feed")).toBe(true);
    expect(activeFor("/research")).toBe(true);
    expect(activeFor("/research/paper/abc")).toBe(true);
    expect(activeFor("/research/new")).toBe(true);
    expect(activeFor("/news")).toBe(false);
    // Pillars without `match` fall back to `to` (no regression).
    const learn = NAV_PILLARS.find((p) => p.id === "learn")!;
    expect(learn.match ?? learn.to).toBe(learn.to);
  });
});
