// Render test for the lesson-quality dashboard: mounts with a stubbed
// /admin/lesson-quality response and asserts the table renders rows,
// summary cards, deep-links, and that clicking a column header re-sorts.

import { describe, expect, test, beforeEach, afterEach, vi } from "vitest";
import * as React from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { MemoryRouter } from "react-router-dom";
import { AdminLessonQualityPage } from "./AdminLessonQualityPage";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const PAYLOAD = {
  lessons: [
    {
      nodeSlug: "thin-lesson",
      pathSlug: "demo-path",
      pathTitle: "Demo Path",
      title: "Thin Lesson",
      level: "apprentice",
      slideCount: 3,
      textSlideCount: 1,
      questionSubkindCount: 1,
      totalBodyWords: 120,
      nameDropCount: 2,
      hasViz: false,
      composite: 31,
      flags: ["LOW_TEXT_SLIDE_COUNT", "NO_VIZ"],
    },
    {
      nodeSlug: "rich-lesson",
      pathSlug: "demo-path",
      pathTitle: "Demo Path",
      title: "Rich Lesson",
      level: "expert",
      slideCount: 8,
      textSlideCount: 3,
      questionSubkindCount: 5,
      totalBodyWords: 900,
      nameDropCount: 22,
      hasViz: true,
      composite: 97,
      flags: [],
    },
  ],
  summary: { total: 2, scored: 2, missing: 0, avg: 64, median: 97, flaggedCount: 1 },
};

function renderPage(): { container: HTMLDivElement; root: Root } {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      React.createElement(MemoryRouter, null, React.createElement(AdminLessonQualityPage)),
    );
  });
  return { container, root };
}

// Flush the load() fetch promise chain.
async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("AdminLessonQualityPage", () => {
  let root: Root | null = null;
  let container: HTMLDivElement | null = null;

  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify(PAYLOAD), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );
  });

  afterEach(() => {
    if (root) act(() => root!.unmount());
    if (container?.parentNode) container.parentNode.removeChild(container);
    root = null;
    container = null;
    vi.unstubAllGlobals();
  });

  test("renders summary + a row per lesson, worst-first", async () => {
    const r = renderPage();
    root = r.root;
    container = r.container;
    await flush();

    const text = container.textContent ?? "";
    expect(text).toContain("Thin Lesson");
    expect(text).toContain("Rich Lesson");
    expect(text).toContain("64 / 100"); // avg summary card

    // Default sort is composite ascending → worst (Thin, 31) before Rich (97).
    const titles = Array.from(container.querySelectorAll("tbody tr")).map(
      (tr) => tr.querySelector("a")?.textContent ?? "",
    );
    expect(titles).toEqual(["Thin Lesson", "Rich Lesson"]);

    // Edit deep-link points at the lesson editor route.
    const editHref = Array.from(container.querySelectorAll("a")).find(
      (a) => a.textContent?.includes("Edit"),
    ) as HTMLAnchorElement | undefined;
    expect(editHref?.getAttribute("href")).toBe(
      "/paths/demo-path/lessons/thin-lesson/edit",
    );
  });

  test("clicking the Words header re-sorts the table", async () => {
    const r = renderPage();
    root = r.root;
    container = r.container;
    await flush();

    // Click "Words" → descending (most words first) → Rich before Thin.
    const wordsTh = Array.from(container.querySelectorAll("th")).find((th) =>
      th.textContent?.startsWith("Words"),
    )!;
    act(() => {
      (wordsTh as HTMLElement).click();
    });

    const titles = Array.from(container.querySelectorAll("tbody tr")).map(
      (tr) => tr.querySelector("a")?.textContent ?? "",
    );
    expect(titles).toEqual(["Rich Lesson", "Thin Lesson"]);
  });

  test("the By-path view rolls lessons up per path, weakest-first, and drills in", async () => {
    // Two paths so grouping is non-trivial; re-stub fetch for this test.
    const mk = (
      pathSlug: string,
      pathTitle: string,
      nodeSlug: string,
      composite: number,
    ) => ({
      nodeSlug,
      pathSlug,
      pathTitle,
      title: nodeSlug,
      level: "apprentice",
      slideCount: 6,
      textSlideCount: 3,
      questionSubkindCount: 3,
      totalBodyWords: 700,
      nameDropCount: 18,
      hasViz: false,
      composite,
      flags: composite < 80 ? ["NO_VIZ"] : [],
    });
    const payload = {
      lessons: [
        mk("easy-path", "Easy Path", "e1", 90),
        mk("easy-path", "Easy Path", "e2", 80),
        mk("hard-path", "Hard Path", "h1", 40),
        mk("hard-path", "Hard Path", "h2", 60),
      ],
      summary: { total: 4, scored: 4, missing: 0, avg: 68, median: 80, flaggedCount: 2 },
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify(payload), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

    const r = renderPage();
    root = r.root;
    container = r.container;
    await flush();

    // Switch to the By-path view.
    const byPath = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent === "By path",
    )!;
    act(() => {
      (byPath as HTMLElement).click();
    });

    // Two path rows, weakest avg first: Hard Path (avg 50) before Easy (85).
    const rowTexts = Array.from(container.querySelectorAll("tbody tr")).map(
      (tr) => tr.textContent ?? "",
    );
    expect(rowTexts[0]).toContain("Hard Path");
    expect(rowTexts[1]).toContain("Easy Path");
    // Hard Path's row carries its avg (50) and worst (40).
    expect(rowTexts[0]).toContain("50");
    expect(rowTexts[0]).toContain("40");

    // Clicking a path row drills into the lesson view filtered to it.
    act(() => {
      (container!.querySelector("tbody tr") as HTMLElement).click();
    });
    const filter = container!.querySelector("input") as HTMLInputElement;
    expect(filter.value).toBe("hard-path");
    const lessonRows = Array.from(container!.querySelectorAll("tbody tr"));
    expect(lessonRows.length).toBe(2); // only hard-path's two lessons
  });
});
