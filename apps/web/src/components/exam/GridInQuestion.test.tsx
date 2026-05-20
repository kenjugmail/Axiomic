// Digital-SAT-parity — GridInQuestion only forwards SAT-grid-legal
// characters and emits the raw learner string via onChange (grading
// is server-side).

import { describe, expect, test, beforeEach, vi } from "vitest";
import * as React from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { GridInQuestion } from "./GridInQuestion";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

// React's controlled-input change events must be fired via the
// native HTMLInputElement value setter so React notices the change.
// Setting input.value directly bypasses React's tracker.
function setInputValue(input: HTMLInputElement, v: string) {
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    "value",
  )?.set;
  setter?.call(input, v);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

describe("GridInQuestion", () => {
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

  test("accepts digits / dot / slash", () => {
    const onChange = vi.fn();
    root = createRoot(container!);
    act(() => {
      root!.render(<GridInQuestion value="" onChange={onChange} />);
    });
    const input = document.querySelector(
      "[data-testid='grid-in-input']",
    ) as HTMLInputElement;
    act(() => {
      setInputValue(input, "3/4");
    });
    expect(onChange).toHaveBeenLastCalledWith("3/4");
  });

  test("ignores letters via the input filter", () => {
    const onChange = vi.fn();
    root = createRoot(container!);
    act(() => {
      root!.render(<GridInQuestion value="" onChange={onChange} />);
    });
    const input = document.querySelector(
      "[data-testid='grid-in-input']",
    ) as HTMLInputElement;
    // React's controlled-input + filter combo: the onChange handler
    // never invokes the parent's onChange when the value violates
    // the regex. Asserting !called covers that path.
    onChange.mockClear();
    act(() => {
      setInputValue(input, "abc");
    });
    expect(onChange).not.toHaveBeenCalled();
  });
});
