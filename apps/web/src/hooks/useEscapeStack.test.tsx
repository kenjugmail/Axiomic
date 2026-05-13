// Phase 13C — Escape-stack hook test.
//
// jsdom env. Uses react-dom/client + act() to actually mount
// components, exercise useEffect cleanup, and assert that only
// the top-of-stack handler fires on Escape.

import { describe, expect, test, beforeEach, vi } from "vitest";
import * as React from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react-dom/test-utils";
import {
  useEscapeStack,
  __getEscapeStackSize,
  __resetEscapeStack,
} from "./useEscapeStack";

// Silence "not configured to support act" warnings — vitest+jsdom
// is sufficient to exercise the hook's effect/cleanup lifecycle.
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

function Probe({ onEsc, open }: { onEsc: () => void; open: boolean }) {
  useEscapeStack(open, onEsc);
  return null;
}

function pressEscape(): void {
  act(() => {
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
  });
}

describe("useEscapeStack — Phase 13C", () => {
  let root: Root | null = null;
  let container: HTMLDivElement | null = null;

  beforeEach(() => {
    __resetEscapeStack();
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

  test("no handlers registered → Escape is a no-op", () => {
    expect(__getEscapeStackSize()).toBe(0);
    pressEscape();
    expect(__getEscapeStackSize()).toBe(0);
  });

  test("single registered handler fires on Escape", () => {
    const onEsc = vi.fn();
    root = createRoot(container!);
    act(() => {
      root!.render(<Probe onEsc={onEsc} open />);
    });
    expect(__getEscapeStackSize()).toBe(1);
    pressEscape();
    expect(onEsc).toHaveBeenCalledTimes(1);
  });

  test("two handlers — only the top fires per press", () => {
    const outerEsc = vi.fn();
    const innerEsc = vi.fn();
    root = createRoot(container!);
    act(() => {
      root!.render(
        <>
          <Probe onEsc={outerEsc} open />
          <Probe onEsc={innerEsc} open />
        </>,
      );
    });
    expect(__getEscapeStackSize()).toBe(2);
    pressEscape();
    expect(innerEsc).toHaveBeenCalledTimes(1);
    expect(outerEsc).toHaveBeenCalledTimes(0);
  });

  test("popping the top reveals the next handler", () => {
    const outerEsc = vi.fn();
    const innerEsc = vi.fn();
    root = createRoot(container!);
    act(() => {
      root!.render(
        <>
          <Probe onEsc={outerEsc} open />
          <Probe onEsc={innerEsc} open />
        </>,
      );
    });
    // Close the inner (open=false).
    act(() => {
      root!.render(
        <>
          <Probe onEsc={outerEsc} open />
          <Probe onEsc={innerEsc} open={false} />
        </>,
      );
    });
    expect(__getEscapeStackSize()).toBe(1);
    pressEscape();
    expect(outerEsc).toHaveBeenCalledTimes(1);
    expect(innerEsc).toHaveBeenCalledTimes(0);
  });
});
