// Sprint 48 — E2E smoke for S47's dashboard cards.
//
// Confirms the four discoverability surfaces are reachable in one
// click from the signed-in dashboard: Knowledge MRI, Cohorts,
// Misconception marketplace, Peer review queue.

import { test, expect } from "@playwright/test";
import { signupFresh } from "./fixtures/auth";

const RUN_ID = Date.now().toString(36);

test("dashboard surfaces every differentiator within one click", async ({ page }) => {
  await signupFresh(page, `dash_${RUN_ID}`);
  await page.goto("/");
  await expect(page.getByText(/welcome back/i)).toBeVisible();

  // MRI card.
  await expect(page.getByRole("link", { name: /knowledge mri/i })).toBeVisible();

  // Cohorts card.
  await expect(page.getByRole("link", { name: /cohorts/i }).first()).toBeVisible();

  // Misconception marketplace card.
  await expect(page.getByRole("link", { name: /misconception/i }).first()).toBeVisible();

  // Peer review card.
  await expect(page.getByRole("link", { name: /peer review/i })).toBeVisible();
});
