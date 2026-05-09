// Sprint 63e — mobile smoke flows.
//
// Visits the busiest surfaces at the Pixel 7 viewport (configured in
// playwright.config.ts via testMatch) and asserts:
// - No horizontal scroll (a frequent regression after content edits).
// - Key page chrome is rendered (proves the layout doesn't collapse).
//
// Runs only under the `mobile-chrome` project. Other E2E specs stay
// desktop-only to avoid doubling CI time.

import { test, expect } from "@playwright/test";

const RUN_ID = Date.now().toString(36);

async function signup(page: any) {
  await page.goto("/signup");
  await page.locator('input[type="text"]').first().fill(`m63e_${RUN_ID}`);
  await page.locator('input[type="email"]').fill(`m63e_${RUN_ID}@example.com`);
  await page.locator('input[type="password"]').fill("playwright-test-pass");
  await page.getByRole("button", { name: /create account/i }).click();
}

async function expectNoHorizontalScroll(page: any) {
  const overflow = await page.evaluate(() => {
    const doc = document.documentElement;
    return doc.scrollWidth - doc.clientWidth;
  });
  // Allow a small tolerance for borderlines / scrollbar quirks.
  expect(overflow).toBeLessThanOrEqual(2);
}

const ROUTES: { name: string; path: string }[] = [
  { name: "home (signed-in dashboard)", path: "/" },
  { name: "paths index", path: "/paths" },
  { name: "wiki page", path: "/wiki/attention" },
  { name: "research index", path: "/research" },
  { name: "capstones index", path: "/capstones" },
];

test.describe("mobile smoke", () => {
  test("signed-in user has no horizontal scroll on busy surfaces", async ({ page }) => {
    await signup(page);
    for (const route of ROUTES) {
      await page.goto(route.path);
      await page.waitForLoadState("networkidle").catch(() => {});
      await expectNoHorizontalScroll(page);
    }
  });

  test("signed-out wiki page renders without horizontal scroll", async ({ page }) => {
    await page.goto("/wiki/attention");
    await page.waitForLoadState("networkidle").catch(() => {});
    await expectNoHorizontalScroll(page);
    // Smoke: heading is visible.
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
  });
});
