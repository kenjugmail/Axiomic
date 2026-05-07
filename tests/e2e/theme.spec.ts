import { test, expect } from "@playwright/test";

const THEMES: Array<{
  label: RegExp;
  expected: string[];
  notExpected: string[];
}> = [
  { label: /^Light$/, expected: [], notExpected: ["dark", "theme-sepia", "theme-dim", "theme-high-contrast"] },
  { label: /^Dark$/, expected: ["dark"], notExpected: ["theme-sepia", "theme-dim", "theme-high-contrast"] },
  { label: /^Dim$/, expected: ["dark", "theme-dim"], notExpected: ["theme-sepia", "theme-high-contrast"] },
  { label: /^Sepia$/, expected: ["theme-sepia"], notExpected: ["dark", "theme-dim", "theme-high-contrast"] },
];

async function pickTheme(page: any, name: RegExp) {
  await page.getByRole("button", { name: /pick theme/i }).click();
  await page.getByRole("menuitemradio", { name }).click();
}

async function htmlClasses(page: any): Promise<string[]> {
  return await page.evaluate(() =>
    Array.from(document.documentElement.classList),
  );
}

test.describe("theme picker", () => {
  test("each non-system theme applies the right classes and persists", async ({
    page,
  }) => {
    await page.goto("/");

    for (const t of THEMES) {
      await pickTheme(page, t.label);
      const classes = await htmlClasses(page);
      for (const cls of t.expected) {
        expect(classes).toContain(cls);
      }
      for (const cls of t.notExpected) {
        expect(classes).not.toContain(cls);
      }

      const stored = await page.evaluate(() =>
        localStorage.getItem("axiomic-theme"),
      );
      expect(stored).toBeTruthy();
    }
  });

  test("theme survives a reload", async ({ page }) => {
    await page.goto("/");
    await pickTheme(page, /^Sepia$/);
    expect(await htmlClasses(page)).toContain("theme-sepia");

    await page.reload();
    expect(await htmlClasses(page)).toContain("theme-sepia");
  });
});
