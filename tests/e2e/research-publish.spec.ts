// Sprint 48 — E2E smoke for the research-paper surface.
//
// The S49 seed publishes 3 research papers. This spec just verifies
// the list + detail renders for a signed-in user and that the Cite
// button on a published paper is reachable. We don't try to
// publish-via-UI because the wizard flow is heavy + already covered
// by server tests; a smoke render is the right level for an E2E.

import { test, expect } from "@playwright/test";
import { signupFresh } from "./fixtures/auth";

const RUN_ID = Date.now().toString(36);

test("research list renders + detail page loads cite affordance", async ({ page }) => {
  await signupFresh(page, `rp_${RUN_ID}`);

  await page.goto("/research");
  await expect(page.getByRole("heading", { name: /research/i }).first()).toBeVisible();

  // The seeded paper title contains "FlashAttention". Click into it.
  const link = page.getByRole("link", { name: /flashattention/i }).first();
  await link.click();

  await expect(page).toHaveURL(/\/research\/flash-attention-explainer/);
  await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();

  // Cite button should be visible on a published paper.
  await expect(page.getByRole("button", { name: /^cite$/i })).toBeVisible();
});
