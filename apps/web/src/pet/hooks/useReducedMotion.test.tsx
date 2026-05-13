// Phase 11B — useReducedMotion hook test.
//
// Renders a tiny probe component that exposes the hook's value via
// renderToStaticMarkup. Avoids pulling @testing-library/react which
// isn't in the web dependencies.

import { describe, expect, test, beforeEach, afterEach, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { useReducedMotion } from "./useReducedMotion";

function Probe(): JSX.Element {
  const reduce = useReducedMotion();
  return <span data-testid="probe">{String(reduce)}</span>;
}

describe("useReducedMotion", () => {
  let originalMatchMedia: typeof window.matchMedia | undefined;

  beforeEach(() => {
    originalMatchMedia = (globalThis as { window?: Window }).window?.matchMedia;
  });

  afterEach(() => {
    if (originalMatchMedia && typeof window !== "undefined") {
      window.matchMedia = originalMatchMedia;
    }
  });

  test("returns true when prefers-reduced-motion matches", () => {
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: vi.fn().mockImplementation((q: string) => ({
        matches: true,
        media: q,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        onchange: null,
        dispatchEvent: vi.fn(),
      })),
    });
    const html = renderToStaticMarkup(<Probe />);
    expect(html).toContain(">true<");
  });

  test("returns false when the media query does not match", () => {
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: vi.fn().mockImplementation((q: string) => ({
        matches: false,
        media: q,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        onchange: null,
        dispatchEvent: vi.fn(),
      })),
    });
    const html = renderToStaticMarkup(<Probe />);
    expect(html).toContain(">false<");
  });
});
