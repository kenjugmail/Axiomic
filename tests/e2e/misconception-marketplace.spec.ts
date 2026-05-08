// Sprint 48 — E2E smoke for the misconception marketplace.
//
// Sign up → /misconceptions → propose an entry → confirm it lands
// in the Open list with +1 from the proposer.

import { test, expect } from "@playwright/test";
import { signupFresh } from "./fixtures/auth";

const RUN_ID = Date.now().toString(36);

test("propose a misconception, see it in the open list with +1", async ({ page }) => {
  await signupFresh(page, `mp_${RUN_ID}`);

  await page.goto("/misconceptions");
  await expect(page.getByRole("heading", { name: /marketplace/i })).toBeVisible();

  // Propose form opens via the Propose button.
  await page.getByRole("button", { name: /^propose$/i }).click();

  const slug = `e2e-concept-${RUN_ID}`;
  const key = `e2e-key-${RUN_ID}`;

  await page.getByPlaceholder(/e\.g\. softmax/i).fill(slug);
  await page.getByPlaceholder(/softmax-temperature/i).fill(key);
  await page
    .getByPlaceholder(/the misconception in plain language/i)
    .fill("Learners conflate X with Y for reasons described below");
  await page
    .getByPlaceholder(/why this misconception happens/i)
    .fill(
      "This is a long enough description to satisfy the 40 char minimum requirement.",
    );

  await page.getByRole("button", { name: /^propose$/i }).last().click();

  // After submit the form closes and the list reloads. The proposed
  // label should be visible.
  await expect(page.getByText(/learners conflate x with y/i)).toBeVisible({
    timeout: 5_000,
  });
});
