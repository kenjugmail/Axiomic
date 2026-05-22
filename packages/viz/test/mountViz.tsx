// DOM mount harness for viz *interaction* tests (the SSR smoke tests
// in components.test.tsx stay in the default node env and use
// renderViz.ts instead). Mirrors the web app's component-test pattern
// — createRoot + act + jsdom, no @testing-library; see
// apps/web/src/components/exam/MultiSelectQuestion.test.tsx.

import { createRoot, type Root } from "react-dom/client";
import { act, type ReactElement } from "react";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

export interface VizHarness {
  container: HTMLElement;
  /** Current rendered HTML of the mounted tree. */
  html(): string;
  /** All currently-rendered <button> elements. */
  buttons(): HTMLButtonElement[];
  /** Find a <button> by exact trimmed text; throws (listing what it saw) if absent. */
  button(text: string): HTMLButtonElement;
  /** Click an element inside act() so React flushes the resulting render. */
  click(el: Element): void;
  /** Unmount + detach (runs effect cleanup, clearing any timers the component set). */
  unmount(): void;
}

export function mountViz(node: ReactElement): VizHarness {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root: Root = createRoot(container);
  act(() => {
    root.render(node);
  });
  const find = (text: string) =>
    Array.from(container.querySelectorAll("button")).find(
      (b) => (b.textContent ?? "").trim() === text,
    ) as HTMLButtonElement | undefined;
  return {
    container,
    html: () => container.innerHTML,
    buttons: () =>
      Array.from(container.querySelectorAll("button")) as HTMLButtonElement[],
    button(text) {
      const match = find(text);
      if (!match) {
        const seen = Array.from(container.querySelectorAll("button"))
          .map((b) => JSON.stringify((b.textContent ?? "").trim()))
          .join(", ");
        throw new Error(`No <button> with text "${text}". Saw: [${seen}]`);
      }
      return match;
    },
    click(el) {
      act(() => {
        (el as HTMLElement).click();
      });
    },
    unmount() {
      act(() => root.unmount());
      container.remove();
    },
  };
}

/** A control button carries this class when it is the active selection. */
export function isSelected(el: Element): boolean {
  return /\bbg-primary\b/.test(el.className);
}
