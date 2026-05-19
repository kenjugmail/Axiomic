// Digital-SAT-parity — DesmosCalculator surfaces "Calculator
// unavailable" when the Vite env var is missing instead of
// crashing the runner.

import { describe, expect, test, beforeEach, afterEach, vi } from "vitest";
import * as React from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { DesmosCalculator } from "./DesmosCalculator";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

describe("DesmosCalculator", () => {
  let root: Root | null = null;
  let container: HTMLDivElement | null = null;
  let originalKey: string | undefined;

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
    originalKey = (import.meta.env as Record<string, string | undefined>)
      .VITE_DESMOS_API_KEY;
  });

  afterEach(() => {
    // Restore the key value (Vite freezes the env object so we
    // mutate via cast; safe inside the test sandbox).
    const env = import.meta.env as Record<string, string | undefined>;
    if (originalKey === undefined) {
      delete env.VITE_DESMOS_API_KEY;
    } else {
      env.VITE_DESMOS_API_KEY = originalKey;
    }
  });

  test("renders 'Calculator unavailable' when VITE_DESMOS_API_KEY is unset", () => {
    const env = import.meta.env as Record<string, string | undefined>;
    delete env.VITE_DESMOS_API_KEY;
    root = createRoot(container!);
    act(() => {
      root!.render(
        <DesmosCalculator open onClose={vi.fn()} initialState={null} />,
      );
    });
    const unavailable = document.querySelector(
      "[data-testid='desmos-unavailable']",
    );
    expect(unavailable).not.toBeNull();
    expect(unavailable!.textContent).toContain("Calculator unavailable");
  });

  test("renders nothing when closed", () => {
    root = createRoot(container!);
    act(() => {
      root!.render(
        <DesmosCalculator open={false} onClose={vi.fn()} initialState={null} />,
      );
    });
    expect(document.querySelector("[data-testid='desmos-panel']")).toBeNull();
  });
});
