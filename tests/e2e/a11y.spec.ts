// Sprint 66c — accessibility smoke. Runs axe-core against four
// high-traffic public routes and fails on serious + critical
// violations. Loose enough that the suite lands without churn,
// strict enough to catch a future regression like a missing
// document title or a button without a name.

import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const ROUTES = [
  { path: "/", name: "home" },
  { path: "/wiki", name: "wiki index" },
  { path: "/research", name: "research index" },
  { path: "/capstones", name: "capstones index" },
];

for (const route of ROUTES) {
  test(`a11y: ${route.name} (${route.path}) has no critical/serious violations`, async ({
    page,
  }) => {
    await page.goto(route.path);
    // Wait for the layout to settle — gives the lazy chunks a beat.
    await page.waitForLoadState("networkidle").catch(() => {});

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      // Disable color-contrast for now: the design system passes
      // visually but axe sometimes flags theme tokens because it
      // can't resolve CSS custom properties. Tighten in a follow-up
      // when we have the contrast story baked.
      .disableRules(["color-contrast"])
      .analyze();

    const blocking = results.violations.filter((v) =>
      ["serious", "critical"].includes(v.impact ?? ""),
    );
    if (blocking.length > 0) {
      // Surface the violations in the test output for triage.
      console.log(
        "axe violations:",
        JSON.stringify(
          blocking.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length })),
          null,
          2,
        ),
      );
    }
    expect(blocking).toEqual([]);
  });
}
