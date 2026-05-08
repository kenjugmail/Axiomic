// Sprint 48 — E2E smoke for the /verify transcript verifier.
//
// We don't have a signed transcript without a completed capstone, so
// this spec verifies the page loads, shows the server's public key,
// and rejects an obviously-tampered transcript.

import { test, expect } from "@playwright/test";

test("verify page renders + rejects tampered transcript", async ({ page }) => {
  await page.goto("/verify");
  await expect(page.getByRole("heading", { name: /verify a transcript/i })).toBeVisible();

  // Server public key shows up.
  await expect(page.getByText(/this server's signing key/i)).toBeVisible();

  // Paste a deliberately-broken transcript.
  const bogus = JSON.stringify({
    manifest: { foo: "bar" },
    signature: "0".repeat(128),
    publicKey: "0".repeat(64),
  });
  await page.getByPlaceholder(/paste/i).fill(bogus);
  await page.getByRole("button", { name: /verify signature/i }).click();
  await expect(page.getByText(/signature INVALID|invalid/i)).toBeVisible({
    timeout: 5_000,
  });
});
