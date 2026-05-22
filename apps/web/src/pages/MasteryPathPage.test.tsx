// Render test for the mastery path list view: a COMPLETED node must offer a
// "Review lesson" affordance (so learners can revisit finished nodes), while
// an incomplete node shows "Start lesson". Mirrors the createRoot + act +
// MemoryRouter + stubbed-fetch pattern from AdminLessonQualityPage.test.tsx.

import { describe, expect, test, beforeEach, afterEach, vi } from "vitest";
import * as React from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { MasteryPathPage } from "./MasteryPathPage";
import { useAuthStore } from "../stores/auth";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const node = (
  id: string,
  slug: string,
  title: string,
  order: number,
) => ({
  id,
  slug,
  title,
  level: "apprentice",
  order,
  prerequisiteNodeIds: [],
  pageIds: [],
  hasLesson: true,
  nodeKind: "lesson",
  estimatedMinutes: 10,
  linkedTopics: [],
});

const PAYLOAD = {
  path: { slug: "demo", title: "Demo Path", description: "A path." },
  nodes: [node("n1", "intro", "Intro", 1), node("n2", "next", "Next Up", 2)],
  // n1 is completed → should be reviewable; n2 is not.
  progress: [{ nodeId: "n1", completed: true, quizScore: 0.9 }],
  nodeMastery: { n1: 100, n2: 0 },
  lockState: {},
  lastVisitedNodeSlug: null,
};

function renderPage(): { container: HTMLDivElement; root: Root } {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      React.createElement(
        MemoryRouter,
        { initialEntries: ["/paths/demo"] },
        React.createElement(
          Routes,
          null,
          React.createElement(Route, {
            path: "/paths/:slug",
            element: React.createElement(MasteryPathPage),
          }),
        ),
      ),
    );
  });
  return { container, root };
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("MasteryPathPage — review completed nodes", () => {
  let root: Root | null = null;
  let container: HTMLDivElement | null = null;

  beforeEach(() => {
    useAuthStore.setState({ user: { id: "u1", username: "alice" } as any, loading: false });
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
    useAuthStore.setState({ user: null, loading: false });
  });

  test("a completed node offers Review lesson; an incomplete node offers Start lesson", async () => {
    const r = renderPage();
    root = r.root;
    container = r.container;
    await flush();

    const text = container.textContent ?? "";
    expect(text).toContain("Intro");
    expect(text).toContain("Next Up");

    // The completed node (Intro) links to its lesson for review…
    const reviewLink = Array.from(container.querySelectorAll("a")).find(
      (a) => a.textContent?.includes("Review lesson"),
    ) as HTMLAnchorElement | undefined;
    expect(reviewLink).toBeTruthy();
    expect(reviewLink?.getAttribute("href")).toBe("/paths/demo/lessons/intro");

    // …while the incomplete node still shows the primary Start lesson CTA.
    expect(text).toContain("Start lesson");
    // The completed node also exposes a Retake quiz button.
    expect(text).toContain("Retake quiz");
  });
});
