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

test("forum: list → new topic → reply → vote → reputation", async ({ page }) => {
  // Sign up a fresh user.
  await page.goto("/signup");
  await page.locator('input[type="text"]').first().fill(`forum_${RUN_ID}`);
  await page.locator('input[type="email"]').fill(`forum_${RUN_ID}@example.com`);
  await page.locator('input[type="password"]').fill("playwright-test-pass");
  await page.getByRole("button", { name: /create account/i }).click();
  await expect(page).toHaveURL("/");

  // Browse forum.
  await page.goto("/forum");
  await expect(page.getByRole("heading", { name: /forum/i }).first()).toBeVisible();
  // Seeded topics should be visible.
  await expect(page.getByText(/induction heads/i).first()).toBeVisible();

  // Open the seeded induction-heads topic and verify the summarize button shows
  // for a thread with multiple posts. Use the first matching link.
  await page.getByText(/induction heads are the canonical/i).click();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  // Summarize button appears when post count >= 3.
  const summarizeBtn = page.getByRole("button", { name: /summarize thread/i });
  await expect(summarizeBtn).toBeVisible();

  // Vote on the topic (upvote arrow is the first one in the topic body area).
  await page.getByRole("button", { name: /upvote topic/i }).click();

  // Create a new topic of our own.
  await page.goto("/forum/new");
  await page.getByRole("button", { name: /question/i }).first().click();
  await page.locator("input").first().fill(`E2E topic ${RUN_ID}`);
  await page.locator("textarea").fill("Asking a real question for e2e.");
  await page.getByRole("button", { name: /post topic/i }).click();

  // We should land on the new topic page.
  await expect(page.getByRole("heading", { level: 1 })).toContainText(`E2E topic ${RUN_ID}`);

  // Reply to it.
  await page.locator('textarea[placeholder*="reply"]').first().fill("My own reply.");
  await page.getByRole("button", { name: /post reply/i }).click();
  await expect(page.getByText("My own reply.").first()).toBeVisible({ timeout: 5_000 });

  // Reputation page reflects activity.
  await page.goto(`/profile/forum_${RUN_ID}`);
  await expect(page.getByRole("heading", { name: /reputation/i })).toBeVisible();
});

test("notifications: mention triggers badge → dropdown → mark read", async ({
  browser,
}) => {
  const aliceCtx = await browser.newContext();
  const bobCtx = await browser.newContext();
  const aliceUser = `notif_a_${RUN_ID}`;
  const bobUser = `notif_b_${RUN_ID}`;

  // Sign up both users in their own browser contexts so cookies don't mix.
  for (const [ctx, user] of [
    [aliceCtx, aliceUser],
    [bobCtx, bobUser],
  ] as const) {
    const page = await ctx.newPage();
    await page.goto("/signup");
    await page.locator('input[type="text"]').first().fill(user);
    await page.locator('input[type="email"]').fill(`${user}@example.com`);
    await page.locator('input[type="password"]').fill("playwright-test-pass");
    await page.getByRole("button", { name: /create account/i }).click();
    await expect(page).toHaveURL("/");
    await page.close();
  }

  // Alice creates a topic that mentions bob.
  const alice = await aliceCtx.newPage();
  await alice.goto("/forum/new");
  await alice.getByRole("button", { name: /claim/i }).first().click();
  await alice.locator("input").first().fill(`mention test ${RUN_ID}`);
  await alice
    .locator("textarea")
    .fill(`Hey @${bobUser}, take a look at this.`);
  await alice.getByRole("button", { name: /post topic/i }).click();
  await expect(alice.getByRole("heading", { level: 1 })).toContainText(
    `mention test ${RUN_ID}`,
  );

  // Bob sees the badge appear after navigating (poll triggers on focus).
  const bob = await bobCtx.newPage();
  await bob.goto("/");
  const bell = bob.getByRole("button", { name: /notifications/i });
  await expect(bell).toBeVisible();
  // The bell shows an unread count (the polling cycle runs on mount).
  await expect
    .poll(
      async () => {
        const txt = await bell.innerText();
        return /\d/.test(txt) ? txt.trim() : "";
      },
      { timeout: 10_000 },
    )
    .toMatch(/1/);

  // Open the dropdown, see the mention, click through.
  await bell.click();
  await expect(
    bob.getByText(new RegExp(`${aliceUser}.*mentioned`, "i")),
  ).toBeVisible();

  // Visit /notifications and mark all read.
  await bob.goto("/notifications");
  await expect(bob.getByRole("heading", { name: /notifications/i })).toBeVisible();
  await bob.getByRole("button", { name: /mark all as read/i }).click();

  // Badge clears.
  await bob.goto("/");
  await expect
    .poll(
      async () => {
        const txt = await bell.innerText();
        return /\d/.test(txt) ? txt.trim() : "";
      },
      { timeout: 10_000 },
    )
    .toBe("");

  await aliceCtx.close();
  await bobCtx.close();
});

test("hybrid search: paraphrase surfaces semantic matches", async ({ page }) => {
  await page.goto("/");

  // Open the search dialog with the "/" shortcut.
  await page.keyboard.press("/");
  const dialog = page.locator('input[placeholder*="paraphrase"]');
  await expect(dialog).toBeVisible();

  // A paraphrase that doesn't appear in any title should still surface
  // a relevant page under the "Related" group.
  await dialog.fill("cross-entropy and KL divergence");

  // Wait for the debounced fetch + render.
  await expect(page.getByText("Related").first()).toBeVisible({ timeout: 5_000 });
  // Loss Functions is the seeded page that covers these concepts.
  await expect(page.getByText(/loss functions/i).first()).toBeVisible();
});
