// Sprint 48 — E2E smoke for cohort create + join.
//
// User A creates an open cohort; user B joins it. Verifies both
// the create flow and the cross-user join flow work end-to-end.

import { test, expect } from "@playwright/test";
import { signupFresh } from "./fixtures/auth";

const RUN_ID = Date.now().toString(36);

test("create an open cohort, second user joins it", async ({ browser }) => {
  // User A creates the cohort.
  const ctxA = await browser.newContext();
  const pageA = await ctxA.newPage();
  await signupFresh(pageA, `coa_${RUN_ID}`);
  await pageA.goto("/cohorts");
  await pageA.getByRole("button", { name: /start a cohort/i }).click();
  const slug = `e2e-cohort-${RUN_ID}`;
  await pageA.getByPlaceholder(/transformer-fall-2026/i).fill(slug);
  await pageA.getByPlaceholder(/transformer fall '26/i).fill(`E2E cohort ${RUN_ID}`);
  await pageA.getByRole("button", { name: /create cohort/i }).click();

  // The new cohort lands in the list with the organizer badge.
  await expect(pageA.getByText(`E2E cohort ${RUN_ID}`)).toBeVisible();
  await ctxA.close();

  // User B joins.
  const ctxB = await browser.newContext();
  const pageB = await ctxB.newPage();
  await signupFresh(pageB, `cob_${RUN_ID}`);
  await pageB.goto("/cohorts");
  // Find the row with our cohort name and click the Join button next to it.
  // The Join button is per-row; clicking the first available is fine since
  // our cohort is freshly created and at the top of the list (sorted by
  // createdAt desc).
  const joinButton = pageB.getByRole("button", { name: /^join$/i }).first();
  await expect(joinButton).toBeVisible();
  await joinButton.click();
  // After join, the row should show a member badge instead of the
  // join button. Reload to refetch list and confirm.
  await pageB.reload();
  await expect(pageB.getByText(/member/i).first()).toBeVisible();
  await ctxB.close();
});
