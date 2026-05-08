// Sprint 48 — shared auth helper for E2E specs.
//
// All post-S31 specs need a fresh signed-in user. This helper does
// the signup form dance once; specs unique-suffix their usernames
// so concurrent test workers don't collide.

import type { Page } from "@playwright/test";

export async function signupFresh(
  page: Page,
  username: string,
  password = "playwright-test-pass-xyz",
): Promise<void> {
  await page.goto("/signup");
  await page.locator('input[type="text"]').first().fill(username);
  await page.locator('input[type="email"]').fill(`${username}@example.com`);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole("button", { name: /create account/i }).click();
  await page.waitForURL("/", { timeout: 10_000 });
}
