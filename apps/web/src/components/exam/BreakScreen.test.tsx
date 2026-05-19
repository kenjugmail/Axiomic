// Digital-SAT-parity — BreakScreen renders a countdown and the CTA
// flips from "Skip break" to "Begin next section" when the break
// timer hits zero.

import { describe, expect, test, beforeEach, vi } from "vitest";
import * as React from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { BreakScreen } from "./BreakScreen";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

describe("BreakScreen", () => {
  let root: Root | null = null;
  let container: HTMLDivElement | null = null;

  beforeEach(() => {
    if (root) {
      act(() => root!.unmount());
      root = null;
    }
    if (container && container.parentNode) {
      container.parentNode.removeChild(container);
    }
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  test("shows countdown and 'Skip break' while time remains", () => {
    const breakUntilAt = new Date(Date.now() + 60_000).toISOString();
    const onAdvance = vi.fn();
    root = createRoot(container!);
    act(() => {
      root!.render(
        <BreakScreen
          breakUntilAt={breakUntilAt}
          nextSectionTitle="math"
          onAdvance={onAdvance}
        />,
      );
    });
    const cta = document.querySelector(
      "[data-testid='break-skip-or-begin']",
    ) as HTMLButtonElement;
    expect(cta.textContent).toBe("Skip break");
    const countdown = document.querySelector(
      "[data-testid='break-countdown']",
    );
    // Should display ~1:00 or 0:59 depending on tick timing.
    expect(countdown?.textContent).toMatch(/^(1:00|0:5\d)$/);
  });

  test("flips to 'Begin next section' once break is over", () => {
    const breakUntilAt = new Date(Date.now() - 1000).toISOString();
    const onAdvance = vi.fn();
    root = createRoot(container!);
    act(() => {
      root!.render(
        <BreakScreen
          breakUntilAt={breakUntilAt}
          nextSectionTitle="math"
          onAdvance={onAdvance}
        />,
      );
    });
    const cta = document.querySelector(
      "[data-testid='break-skip-or-begin']",
    ) as HTMLButtonElement;
    expect(cta.textContent).toBe("Begin next section");
    act(() => {
      cta.click();
    });
    expect(onAdvance).toHaveBeenCalledTimes(1);
  });
});
