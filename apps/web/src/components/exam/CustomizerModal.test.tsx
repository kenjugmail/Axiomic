// Digital-SAT-parity — CustomizerModal validation + payload shape.
// jsdom env. Mounts the modal, drives inputs via act(), asserts
// that the Start button is disabled when no sections are enabled
// and that a normal start emits the expected customizer payload.

import { describe, expect, test, beforeEach, vi } from "vitest";
import * as React from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react-dom/test-utils";
import type { ExamAttemptCustomizer, ExamDetail } from "@axiomic/types";
import { CustomizerModal } from "./CustomizerModal";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const exam: ExamDetail = {
  slug: "sat",
  title: "SAT",
  shortName: "SAT",
  pathSlug: "sat-prep",
  totalDurationMinutes: 134,
  description: "Two sections",
  sections: [
    {
      slug: "reading-writing",
      title: "Reading & Writing",
      ordinal: 1,
      durationMinutes: 64,
      questionCount: 54,
    },
    {
      slug: "math",
      title: "Math",
      ordinal: 2,
      durationMinutes: 70,
      questionCount: 44,
    },
  ],
  scoring: { sections: {}, overall: { min: 400, max: 1600 } } as ExamDetail["scoring"],
};

describe("CustomizerModal", () => {
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

  test("emits a defaults customizer matching today's attempt shape", () => {
    const onStart = vi.fn();
    root = createRoot(container!);
    act(() => {
      root!.render(
        <CustomizerModal
          open
          exam={exam}
          onClose={() => {}}
          onStart={onStart}
        />,
      );
    });

    const startBtn = document.querySelector(
      "[data-testid='customizer-start']",
    ) as HTMLButtonElement | null;
    expect(startBtn).not.toBeNull();
    expect(startBtn!.disabled).toBe(false);
    act(() => {
      startBtn!.click();
    });
    expect(onStart).toHaveBeenCalledTimes(1);
    const payload = onStart.mock.calls[0]![0] as ExamAttemptCustomizer;
    expect(payload.sections).toEqual([
      { slug: "reading-writing", questionCount: 54 },
      { slug: "math", questionCount: 44 },
    ]);
    expect(payload.timeMultiplier).toBe(1);
    expect(payload.difficultyFilter).toBeNull();
    expect(payload.shuffle).toBe(true);
    expect(payload.calculatorAllowed).toBe(true);
  });

  test("disables Start when every section checkbox is unticked", () => {
    const onStart = vi.fn();
    root = createRoot(container!);
    act(() => {
      root!.render(
        <CustomizerModal
          open
          exam={exam}
          onClose={() => {}}
          onStart={onStart}
        />,
      );
    });

    const checkboxes = Array.from(
      document.querySelectorAll<HTMLInputElement>(
        "input[type='checkbox'][id^='sec-']",
      ),
    );
    expect(checkboxes.length).toBe(2);
    for (const cb of checkboxes) {
      act(() => {
        cb.click();
      });
    }

    const startBtn = document.querySelector(
      "[data-testid='customizer-start']",
    ) as HTMLButtonElement;
    expect(startBtn.disabled).toBe(true);
    // Validation hint surfaces.
    const err = document.querySelector("[data-testid='customizer-error']");
    expect(err).not.toBeNull();
  });

  test("section pre-seed restricts to one enabled row", () => {
    const onStart = vi.fn();
    root = createRoot(container!);
    act(() => {
      root!.render(
        <CustomizerModal
          open
          exam={exam}
          initialSections={[{ slug: "math", questionCount: 20 }]}
          onClose={() => {}}
          onStart={onStart}
        />,
      );
    });

    // Only `math` should be ticked; reading-writing should be unticked.
    const rw = document.getElementById("sec-reading-writing") as HTMLInputElement;
    const math = document.getElementById("sec-math") as HTMLInputElement;
    expect(rw.checked).toBe(false);
    expect(math.checked).toBe(true);

    const startBtn = document.querySelector(
      "[data-testid='customizer-start']",
    ) as HTMLButtonElement;
    expect(startBtn.disabled).toBe(false);
    act(() => {
      startBtn.click();
    });
    expect(onStart).toHaveBeenCalledTimes(1);
    const payload = onStart.mock.calls[0]![0] as ExamAttemptCustomizer;
    expect(payload.sections).toEqual([{ slug: "math", questionCount: 20 }]);
  });
});
