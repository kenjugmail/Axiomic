// Phase N — DirectionPicker tests.
//
// Set window.matchMedia BEFORE importing the picker so the theme
// store can boot during module load. We then use direct (static)
// imports so the picker and the test share the SAME store instance.

import { describe, expect, test, beforeEach, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("../../lib/api", () => ({
  api: {
    settings: {
      get: vi.fn().mockRejectedValue(new Error("anon")),
      update: vi.fn().mockResolvedValue({}),
    },
  },
}));

// vi.hoisted runs before any other top-level statements in the file —
// crucial because the theme store calls window.matchMedia at module
// load time. Without this, the static import below would crash.
vi.hoisted(() => {
  Object.defineProperty(globalThis, "window", {
    value: globalThis.window ?? {},
    writable: true,
    configurable: true,
  });
  Object.defineProperty(globalThis.window, "matchMedia", {
    writable: true,
    configurable: true,
    value: (q: string) => ({
      matches: false,
      media: q,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
});

import { useThemeStore } from "../../stores/theme";
import { DirectionPicker } from "./DirectionPicker";

describe("DirectionPicker", () => {
  beforeEach(() => {
    document.documentElement.className = "";
    document.documentElement.removeAttribute("data-dir");
    document.documentElement.removeAttribute("style");
    localStorage.clear();
    // Reset the store back to defaults between cases so one test's
    // setDirection doesn't leak into the next.
    useThemeStore.getState().setDirection("warm-scholarly");
  });

  test("renders all five direction tiles", () => {
    const html = renderToStaticMarkup(<DirectionPicker />);
    expect(html).toContain("Warm scholarly");
    expect(html).toContain("Academic neutral");
    expect(html).toContain("Modern productivity");
    expect(html).toContain("Tech forward");
    expect(html).toContain("Editorial print");
  });

  test("each tile has a stable test id", () => {
    const html = renderToStaticMarkup(<DirectionPicker />);
    expect(html).toContain('data-testid="direction-tile-warm-scholarly"');
    expect(html).toContain('data-testid="direction-tile-tech-forward"');
    expect(html).toContain('data-testid="direction-tile-editorial-print"');
  });

  test("default render marks warm-scholarly tile as active", () => {
    // Initial store state is warm-scholarly. The render-time read of
    // the store via useSyncExternalStore (server snapshot) resolves
    // to that default. We do not assert on a post-setDirection render
    // because zustand's server-snapshot under renderToStaticMarkup
    // doesn't observe state changes made between mount calls; the
    // store-write side is covered by theme.test.ts.
    void useThemeStore;
    const html = renderToStaticMarkup(<DirectionPicker />);
    const wsIdx = html.indexOf(
      'data-testid="direction-tile-warm-scholarly"',
    );
    const wsTag = html.slice(
      html.lastIndexOf("<button", wsIdx),
      html.indexOf(">", wsIdx) + 1,
    );
    expect(wsTag).toContain('aria-checked="true"');
  });

  test("group has radiogroup role with a label", () => {
    const html = renderToStaticMarkup(<DirectionPicker />);
    expect(html).toContain('role="radiogroup"');
    expect(html).toContain('aria-label="Design direction"');
  });
});
