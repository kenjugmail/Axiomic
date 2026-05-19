// Digital-SAT-parity — MultiSelectQuestion caps picks at
// `correctCount` and emits sorted dedup'd index arrays via
// onChange.

import { describe, expect, test, beforeEach, vi } from "vitest";
import * as React from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { MultiSelectQuestion } from "./MultiSelectQuestion";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const options = [
  { label: "A", text: "Alpha" },
  { label: "B", text: "Beta" },
  { label: "C", text: "Gamma" },
  { label: "D", text: "Delta" },
];

describe("MultiSelectQuestion", () => {
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

  test("picking emits sorted indexes", () => {
    const onChange = vi.fn();
    root = createRoot(container!);
    act(() => {
      root!.render(
        <MultiSelectQuestion
          options={options}
          selectedIndexes={[]}
          correctCount={2}
          onChange={onChange}
        />,
      );
    });
    const buttons = container!.querySelectorAll("button");
    act(() => {
      (buttons[2] as HTMLButtonElement).click();
    });
    expect(onChange).toHaveBeenLastCalledWith([2]);
  });

  test("disables further picks once at cap", () => {
    const onChange = vi.fn();
    root = createRoot(container!);
    act(() => {
      root!.render(
        <MultiSelectQuestion
          options={options}
          selectedIndexes={[0, 1]}
          correctCount={2}
          onChange={onChange}
        />,
      );
    });
    const buttons = Array.from(
      container!.querySelectorAll<HTMLButtonElement>("button"),
    );
    // First two are picked, latter two should be disabled (at-cap).
    expect(buttons[0]!.disabled).toBe(false); // can still unpick
    expect(buttons[1]!.disabled).toBe(false);
    expect(buttons[2]!.disabled).toBe(true);
    expect(buttons[3]!.disabled).toBe(true);
  });

  test("unpicking an existing option works at cap", () => {
    const onChange = vi.fn();
    root = createRoot(container!);
    act(() => {
      root!.render(
        <MultiSelectQuestion
          options={options}
          selectedIndexes={[0, 1]}
          correctCount={2}
          onChange={onChange}
        />,
      );
    });
    const buttons = container!.querySelectorAll("button");
    act(() => {
      (buttons[0] as HTMLButtonElement).click();
    });
    expect(onChange).toHaveBeenLastCalledWith([1]);
  });
});
