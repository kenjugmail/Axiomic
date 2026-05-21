// Unit tests for the shared lesson-quality rubric. This module is the
// single source of truth behind both `bun run audit:lessons` and the
// /admin/lesson-quality dashboard, so its scoring + flagging must be
// pinned.

import { describe, test, expect } from "bun:test";
import {
  scoreLessonContent,
  countNameDrops,
  wordCount,
} from "./lessonQuality";

// A lesson that clears every threshold: 3 text slides, dense bodies,
// 5 distinct question subkinds, a viz embed. 25 distinct capitalized
// names (>20 cap) + enough filler that total words clear the 800 cap.
function richLesson() {
  const NAMES = [
    "Lister", "Halsted", "Pasteur", "Koch", "Morton", "Warren", "Simpson",
    "Semmelweis", "Chamberland", "Gawande", "Kocher", "McBurney", "Langer",
    "Treves", "Carrel", "Murray", "Barnard", "Starzl", "Shumway", "Calne",
    "Reed", "Bernstein", "Codd", "Chen", "Kimball",
  ];
  const body =
    NAMES.join(" ") + " " + Array.from({ length: 250 }, () => "filler").join(" ");
  return {
    slides: [
      { kind: "text", viz: "kinship-diagram", body },
      { kind: "text", body },
      { kind: "text", body },
      { kind: "question", question: { kind: "multiple_choice" } },
      { kind: "question", question: { kind: "guided_derivation" } },
      { kind: "question", question: { kind: "scenario" } },
      { kind: "question", question: { kind: "math_expression" } },
      { kind: "question", question: { kind: "explain_back" } },
    ],
  };
}

describe("scoreLessonContent", () => {
  test("a rich lesson scores 100 with no flags", () => {
    const s = scoreLessonContent(richLesson());
    expect(s.composite).toBe(100);
    expect(s.flags).toEqual([]);
    expect(s.textSlideCount).toBe(3);
    expect(s.questionSubkindCount).toBe(5);
    expect(s.hasViz).toBe(true);
  });

  test("a thin lesson raises the expected flags in order", () => {
    const s = scoreLessonContent({
      slides: [
        { kind: "text", body: "Only a few short words here." },
        { kind: "question", question: { kind: "multiple_choice" } },
      ],
    });
    expect(s.flags).toEqual([
      "LOW_SLIDE_COUNT",
      "LOW_TEXT_SLIDE_COUNT",
      "LOW_QUESTION_VARIETY",
      "LOW_BODY_WORDS",
      "LOW_NAME_DROPS",
      "NO_VIZ",
    ]);
    expect(s.composite).toBeLessThan(40);
    expect(s.hasViz).toBe(false);
  });

  test("an empty lesson is composite 0 with all content flags", () => {
    const s = scoreLessonContent({});
    expect(s.composite).toBe(0);
    expect(s.slideCount).toBe(0);
    expect(s.flags).toContain("NO_VIZ");
    expect(s.flags).toContain("LOW_BODY_WORDS");
  });

  test("question subkinds are de-duplicated", () => {
    const s = scoreLessonContent({
      slides: [
        { kind: "question", question: { kind: "multiple_choice" } },
        { kind: "question", question: { kind: "multiple_choice" } },
        { kind: "question", question: { kind: "scenario" } },
      ],
    });
    expect(s.questionSubkindCount).toBe(2);
  });

  test("composite is monotonic in body length", () => {
    const short = scoreLessonContent({
      slides: [{ kind: "text", body: "Word ".repeat(50) }],
    });
    const long = scoreLessonContent({
      slides: [{ kind: "text", body: "Word ".repeat(400) }],
    });
    expect(long.composite).toBeGreaterThan(short.composite);
  });
});

describe("countNameDrops", () => {
  test("counts unique capitalized tokens, not repeats", () => {
    expect(countNameDrops("Lister and Halsted and Lister again")).toBe(2);
  });

  test("ignores sentence-initial capitals", () => {
    // "The" follows a period+space, so it is excluded; "Pasteur" counts.
    expect(countNameDrops("A fact. The work of Pasteur mattered.")).toBe(1);
  });

  test("empty string is zero", () => {
    expect(countNameDrops("")).toBe(0);
  });
});

describe("wordCount", () => {
  test("counts whitespace-separated tokens", () => {
    expect(wordCount("one two three")).toBe(3);
  });
  test("collapses runs of whitespace and trims", () => {
    expect(wordCount("  a   b \n c ")).toBe(3);
  });
});
