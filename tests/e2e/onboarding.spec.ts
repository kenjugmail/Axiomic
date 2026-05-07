import { test, expect } from "@playwright/test";

const RUN_ID = Date.now().toString(36);

async function signupViaUI(
  page: any,
  username: string,
  email: string,
  password: string,
) {
  await page.goto("/signup");
  await page.locator('input[type="text"]').first().fill(username);
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole("button", { name: /create account/i }).click();
}

test("new signup lands on /welcome and can pick a path", async ({ page }) => {
  const username = `onb_${RUN_ID}`;
  await signupViaUI(
    page,
    username,
    `${username}@example.com`,
    "playwright-test-pass",
  );
  await expect(page).toHaveURL(/\/welcome$/);

  // Step 1 → step 2.
  await page.getByRole("button", { name: /choose a path/i }).click();
  await expect(page.getByText(/what do you want to learn first/i)).toBeVisible();

  // Pick the first available path.
  const pathButton = page.getByRole("button").filter({ hasText: /apprentice|researcher|engineer|mathematician|physicist/i }).first();
  await pathButton.click();

  await page.getByRole("button", { name: /^continue$/i }).click();
  await expect(page.getByText(/you're starting with/i)).toBeVisible();

  await page.getByRole("button", { name: /start the first lesson/i }).click();
  // Should land on a lesson or path page.
  await expect(page).toHaveURL(/\/paths\//);
});

test("skipping the wizard still marks the user onboarded", async ({ page }) => {
  const username = `onb_skip_${RUN_ID}`;
  await signupViaUI(
    page,
    username,
    `${username}@example.com`,
    "playwright-test-pass",
  );
  await expect(page).toHaveURL(/\/welcome$/);

  await page
    .getByRole("button", { name: /skip and explore on my own/i })
    .click();
  await expect(page).toHaveURL("/");

  // Visiting /welcome again should redirect to / since they're onboarded.
  await page.goto("/welcome");
  await expect(page).toHaveURL("/");
});
