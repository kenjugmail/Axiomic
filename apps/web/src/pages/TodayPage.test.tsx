// Render test for the Today page's "Revisit recent lessons" card: a
// completed lesson from /me/today must render a link into the lesson player.
// Mirrors the createRoot + act + MemoryRouter + stubbed-fetch pattern.

import { describe, expect, test, beforeEach, afterEach, vi } from "vitest";
import * as React from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { MemoryRouter } from "react-router-dom";
import { TodayPage } from "./TodayPage";
import { useAuthStore } from "../stores/auth";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const PAYLOAD = {
  dueFlashcards: { count: 0, sample: [] },
  weakConcepts: [],
  decay: { staleCredentials: [], resolvedToRefresh: [] },
  activeCommitment: null,
  goalPathNext: [],
  reviewStreak: 3,
  streakInDanger: false,
  recentlyCompleted: [
    {
      nodeSlug: "intro",
      title: "Intro to Things",
      pathSlug: "demo-path",
      completedAt: "2026-05-20T00:00:00.000Z",
    },
  ],
};

function renderPage(): { container: HTMLDivElement; root: Root } {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      React.createElement(MemoryRouter, null, React.createElement(TodayPage)),
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

describe("TodayPage — revisit recent lessons", () => {
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

  test("renders a Revisit card linking a completed lesson to the player", async () => {
    const r = renderPage();
    root = r.root;
    container = r.container;
    await flush();

    const text = container.textContent ?? "";
    expect(text).toContain("Revisit recent lessons");
    expect(text).toContain("Intro to Things");

    const link = Array.from(container.querySelectorAll("a")).find((a) =>
      a.textContent?.includes("Intro to Things"),
    ) as HTMLAnchorElement | undefined;
    expect(link?.getAttribute("href")).toBe("/paths/demo-path/lessons/intro");
  });
});
