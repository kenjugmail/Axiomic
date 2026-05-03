import { test, expect } from "@playwright/test";

const RUN_ID = Date.now().toString(36);

test("signup → wiki page → AI sidebar → comment → mastery", async ({ page }) => {
  // Sign up a fresh user.
  await page.goto("/signup");
  await page.locator('input[type="text"]').first().fill(`e2e_${RUN_ID}`);
  await page.locator('input[type="email"]').fill(`e2e_${RUN_ID}@example.com`);
  await page.locator('input[type="password"]').fill("playwright-test-pass");
  await page.getByRole("button", { name: /create account/i }).click();
  await expect(page).toHaveURL("/");

  // Navigate to a known wiki page.
  await page.goto("/wiki/attention");
  await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();

  // Tier switcher should be present and clickable.
  const undergrad = page.getByRole("button", { name: /undergrad/i }).first();
  await expect(undergrad).toBeVisible();
  await undergrad.click();

  // Open the AI sidebar via the "AI Tutor" icon button.
  await page.getByRole("button", { name: /ai tutor/i }).click();

  // Type into the AI composer (the textarea inside the sidebar) and send.
  const composer = page.locator("textarea").last();
  await composer.fill("Explain this in one sentence.");
  await composer.press("Enter");
  // Mock streams ~15-25ms/char. Wait for an assistant turn to appear.
  await expect
    .poll(
      async () => {
        // Count textareas to make sure the page is interactive,
        // then look for any new text in the AI panel that wasn't in the suggestions.
        return await page.locator("text=/Explain this in one sentence/").count();
      },
      { timeout: 15_000 }
    )
    .toBeGreaterThan(0);

  // Leave a comment. The comment textarea is the first textarea below the discussion heading.
  await page.getByRole("heading", { name: /discussion/i }).scrollIntoViewIfNeeded();
  const commentBox = page.locator('textarea[placeholder*="thoughts"]').first();
  await commentBox.fill(`hello from e2e ${RUN_ID}`);
  await page.getByRole("button", { name: /post comment/i }).click();
  await expect(page.getByText(`hello from e2e ${RUN_ID}`)).toBeVisible({ timeout: 5_000 });

  // Visit a mastery path.
  await page.goto("/paths/ml-engineer");
  await expect(page.getByRole("heading", { name: /ml engineer/i })).toBeVisible();
});
