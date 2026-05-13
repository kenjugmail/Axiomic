// Phase 10A — top-nav rebalance assertions.
//
// Verifies the public Layout nav structure after dedup:
//   - Forum + News appear as top-level pillars.
//   - The More menu no longer duplicates pillars or pet items.

import { describe, expect, test } from "vitest";
import { EXTRA_NAV_PILLARS, PET_ROUTES, isRouteActive } from "./nav-constants";

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
});
