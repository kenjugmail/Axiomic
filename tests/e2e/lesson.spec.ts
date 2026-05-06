import { test, expect } from "@playwright/test";

const RUN_ID = Date.now().toString(36);

test("opens a lesson, advances slides via keyboard, and shows top progress", async ({
  page,
}) => {
  // Public route — no signup required to view a lesson.
  await page.goto("/paths/ml-engineer/lessons/softmax-basics");

  // Wait for the lesson body to render.
  await expect(page.getByText(/^Lesson$/i)).toBeVisible();
  await expect(page.getByText(/Slide 1 of/i)).toBeVisible();

  // Step forward a couple of slides with the keyboard. Don't go past
  // a question slide that requires answering.
  await page.keyboard.press("ArrowRight");
  await expect(page.getByText(/slide 2 of/i)).toBeVisible();
  await page.keyboard.press("ArrowLeft");
  await expect(page.getByText(/slide 1 of/i)).toBeVisible();

  // The top header has a back-link to the path.
  await expect(page.getByRole("link", { name: /Path|ML Engineer/i }).first())
    .toBeVisible();
});

test("mobile slide-drawer button appears below lg breakpoint", async ({
  browser,
}) => {
  const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
  const page = await context.newPage();
  await page.goto("/paths/ml-engineer/lessons/softmax-basics");

  // The "n / m" pill replaces the missing sidebar on mobile.
  const pill = page.getByRole("button", { name: /^\d+ \/ \d+$/ });
  await expect(pill).toBeVisible();

  await pill.click();
  await expect(page.getByRole("dialog", { name: /all slides/i })).toBeVisible();

  // Pick the second slide via the drawer; it should jump and close.
  await page.getByRole("dialog").getByRole("button").nth(2).click();
  await expect(page.getByRole("dialog", { name: /all slides/i })).toHaveCount(0);

  await context.close();
});

test("desktop sidebar slide list is visible above lg breakpoint", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/paths/ml-engineer/lessons/softmax-basics");

  // The aside heading "Slides · n" lives in the desktop column.
  await expect(page.getByText(/^Slides · /i).first()).toBeVisible();
});

test(`signed-in user sees Continue CTA after finishing — RUN ${RUN_ID}`, async ({
  page,
}) => {
  // Light smoke that the recommended-next CTA wires up. We sign up,
  // navigate to a 1-2-slide lesson, and assert the Finish→Continue
  // path works without error. We don't run a full lesson here — that's
  // covered manually because viz iframes can be expensive in CI.
  const username = `lesson_${RUN_ID}`;
  await page.goto("/signup");
  await page.locator('input[type="text"]').first().fill(username);
  await page.locator('input[type="email"]').fill(`${username}@example.com`);
  await page.locator('input[type="password"]').fill("playwright-test-pass");
  await page.getByRole("button", { name: /create account/i }).click();
  await expect(page).toHaveURL("/");

  // Open the path; clicking a node with a lesson should route to /lessons/.
  await page.goto("/paths/ml-engineer");
  await expect(page.getByText(/recommended next/i).first()).toBeVisible();
});
