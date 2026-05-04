import { test, expect } from "@playwright/test";

const RUN_ID = Date.now().toString(36);

test("script tag in a comment renders as text, not as a script", async ({ page }) => {
  // Sign up.
  await page.goto("/signup");
  await page.locator('input[type="text"]').first().fill(`xss_${RUN_ID}`);
  await page.locator('input[type="email"]').fill(`xss_${RUN_ID}@example.com`);
  await page.locator('input[type="password"]').fill("playwright-test-pass");
  await page.getByRole("button", { name: /create account/i }).click();
  await expect(page).toHaveURL("/");

  // Drop a comment that tries to escape via a markdown link with a javascript: scheme,
  // and via a literal script tag. Neither should execute.
  await page.goto("/wiki/attention");
  const payload = `\`<script>window.__pwned=true</script>\` and [click](javascript:window.__pwned=true)`;
  // Match the singular "Discussion" comments heading; the plural
  // "Discussions" forum-links panel above it would otherwise collide.
  await page.getByRole("heading", { name: /^Discussion$/i }).scrollIntoViewIfNeeded();
  const commentBox = page.locator('textarea[placeholder*="thoughts"]').first();
  await commentBox.fill(payload);
  await page.getByRole("button", { name: /post comment/i }).click();

  // Wait for the comment to appear. The literal text "window.__pwned" should be visible.
  await expect(page.locator("text=window.__pwned").first()).toBeVisible({ timeout: 10_000 });

  // No <script> element with our payload exists in the DOM.
  const scriptCount = await page.locator("script:has-text('window.__pwned=true')").count();
  expect(scriptCount).toBe(0);

  // No anchor with a javascript: href.
  const dangerousAnchors = await page.locator("a[href^='javascript:']").count();
  expect(dangerousAnchors).toBe(0);

  // The global was never set.
  const pwned = await page.evaluate(() => (window as any).__pwned);
  expect(pwned).toBeFalsy();
});
