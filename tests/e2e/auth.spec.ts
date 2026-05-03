import { test, expect } from "@playwright/test";

const RUN_ID = Date.now().toString(36);

async function signup(page: any, username: string, email: string, password: string) {
  await page.goto("/signup");
  await page.locator('input[type="text"]').first().fill(username);
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole("button", { name: /create account/i }).click();
}

test("login with wrong password shows error", async ({ page }) => {
  // Need a user to exist first.
  await signup(page, `auth_${RUN_ID}`, `auth_${RUN_ID}@example.com`, "correct-password-xyz");
  await expect(page).toHaveURL("/");

  // Log out via API and try wrong password.
  await page.evaluate(async () => {
    await fetch("/api/v1/auth/logout", { method: "POST", credentials: "include" });
  });

  await page.goto("/login");
  await page.locator('input[type="email"]').fill(`auth_${RUN_ID}@example.com`);
  await page.locator('input[type="password"]').fill("definitely-wrong");
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page.getByText(/invalid email or password/i)).toBeVisible();
});

test("signup with duplicate email is rejected", async ({ page }) => {
  const email = `dup_${RUN_ID}@example.com`;
  await signup(page, `dup_${RUN_ID}`, email, "playwright-test-pass");
  await expect(page).toHaveURL("/");

  await page.evaluate(async () => {
    await fetch("/api/v1/auth/logout", { method: "POST", credentials: "include" });
  });

  await signup(page, `dup2_${RUN_ID}`, email, "playwright-test-pass");
  await expect(page.getByText(/already registered/i)).toBeVisible();
});
