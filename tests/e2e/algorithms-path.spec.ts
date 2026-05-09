import { test, expect } from "@playwright/test";

// Sprint 68d — smoke for the algorithms-engineer path. Pins the
// integration so a future schema/renderer drift surfaces in CI rather
// than waiting for a manual click-through.

test("algorithms-engineer path renders all 9 nodes", async ({ page }) => {
  await page.goto("/paths/algorithms-engineer");

  // Path heading is visible.
  await expect(page.getByRole("heading", { name: /Algorithms Engineer/i }).first())
    .toBeVisible();

  // Each of the 9 nodes' titles should appear on the page.
  const nodeTitles = [
    /Asymptotic Analysis/i,
    /Arrays\s*&\s*Hashing/i,
    /Sorting Algorithms/i,
    /Trees\s*&\s*Linked Structures/i,
    /Graph Algorithms/i,
    /Dynamic Programming/i,
    /Greedy\s*\+\s*Divide\s*&\s*Conquer/i,
    /P,\s*NP/i,
    /Approximation\s*\+\s*Randomized/i,
  ];
  for (const title of nodeTitles) {
    await expect(page.getByText(title).first()).toBeVisible();
  }
});

test("first lesson (asymptotic-analysis) renders + advances slides", async ({ page }) => {
  await page.goto("/paths/algorithms-engineer/lessons/asymptotic-analysis");

  await expect(page.getByText(/^Lesson$/i)).toBeVisible();
  await expect(page.getByText(/Slide 1 of/i)).toBeVisible();

  // Advance once with keyboard; should still be on a non-question slide.
  await page.keyboard.press("ArrowRight");
  await expect(page.getByText(/slide 2 of/i)).toBeVisible();
});

test("a 68a-authored lesson (arrays-and-hashing) renders without console errors", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("pageerror", (err) => consoleErrors.push(String(err)));
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });

  await page.goto("/paths/algorithms-engineer/lessons/arrays-and-hashing");
  await expect(page.getByText(/Slide 1 of/i)).toBeVisible();
  // Walk to slide 2 (still text — the MC is on slide 3).
  await page.keyboard.press("ArrowRight");
  await expect(page.getByText(/slide 2 of/i)).toBeVisible();

  // Filter out benign third-party noise; surface anything else.
  const meaningful = consoleErrors.filter(
    (e) => !/favicon|chunk|net::ERR_/i.test(e),
  );
  expect(meaningful).toEqual([]);
});

test("big-o-notation wiki page renders with KaTeX math", async ({ page }) => {
  await page.goto("/wiki/big-o-notation");

  // Title should be visible.
  await expect(page.getByRole("heading", { name: /Big-O/i }).first()).toBeVisible();

  // KaTeX renders inline math into <span class="katex"> nodes once the
  // lazy chunk loads (Sprint 66a). Wait briefly for the chunk + the
  // first math node.
  await expect(page.locator(".katex").first()).toBeVisible({ timeout: 10000 });
});

test("build-a-production-search-engine capstone brief + milestones render", async ({ page }) => {
  await page.goto("/capstones/build-a-production-search-engine");

  await expect(page.getByRole("heading", { name: /Build a Production Search Engine/i }).first())
    .toBeVisible();

  // The capstone has 4 milestones — every one should surface on the
  // page somewhere as a heading or list entry. We don't pin the exact
  // text — just that we see four numbered "Milestone N" labels.
  for (const n of [1, 2, 3, 4]) {
    await expect(page.getByText(new RegExp(`Milestone\\s*${n}`, "i")).first())
      .toBeVisible();
  }
});

test("algorithms-frontier-2026 research paper renders", async ({ page }) => {
  await page.goto("/research/algorithms-frontier-2026");

  await expect(page.getByRole("heading", { name: /Algorithms in 2026/i }).first())
    .toBeVisible();
});
