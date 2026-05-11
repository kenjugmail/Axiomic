import { test, expect } from "@playwright/test";

// Signed-out home (MarketingHero) and signed-in dashboard both surface the
// same tour link; `bun run dev` uses DEV_AUTH_BYPASS so CI may hit either.

test("home → competency loop tour shows checklist links", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: /competency loop tour/i }).first().click();
  await expect(page).toHaveURL(/\/demo\/competency-loop$/);
  await expect(
    page.getByRole("heading", { name: /competency loop demo/i }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: /open exams/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /open verifier/i })).toBeVisible();
});
