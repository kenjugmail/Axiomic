import { test, expect } from "@playwright/test";

const RUN_ID = Date.now().toString(36);

async function signupAndDismissOnboarding(page: any, suffix: string) {
  const username = `auth_${suffix}_${RUN_ID}`;
  await page.goto("/signup");
  await page.locator('input[type="text"]').first().fill(username);
  await page.locator('input[type="email"]').fill(`${username}@example.com`);
  await page.locator('input[type="password"]').fill("playwright-test-pass");
  await page.getByRole("button", { name: /create account/i }).click();
  await expect(page).toHaveURL(/\/welcome$/);
  await page
    .getByRole("button", { name: /skip and explore on my own/i })
    .click();
  await expect(page).toHaveURL("/");
}

test("signed-in user can open the lesson editor and save a new title", async ({
  page,
}) => {
  await signupAndDismissOnboarding(page, "edit");

  // Open an existing lesson and click "Edit".
  await page.goto("/paths/ml-engineer/lessons/softmax-basics");
  await page.getByRole("link", { name: /^edit$/i }).click();
  await expect(page).toHaveURL(/\/edit$/);

  await expect(page.getByText(/^slides ·/i)).toBeVisible();

  // Bump the active text-slide title and save.
  const stamped = `auth-test-${RUN_ID}`;
  const title = page.locator('input[maxlength="200"]').first();
  await title.fill(stamped);
  await page
    .locator('input[placeholder="Edit message (optional)"]')
    .fill("e2e test bump");
  await page.getByRole("button", { name: /^save$/i }).click();

  // After save the version pill appears.
  await expect(page.getByText(/saved v\d+/i)).toBeVisible();

  // Reload the lesson view and confirm the title persisted.
  await page.goto("/paths/ml-engineer/lessons/softmax-basics");
  await expect(page.getByText(stamped).first()).toBeVisible();
});

test("anonymous user does not see the Edit link", async ({ page }) => {
  // Not signed in.
  await page.goto("/paths/ml-engineer/lessons/softmax-basics");
  await expect(page.getByRole("link", { name: /^edit$/i })).toHaveCount(0);
});
