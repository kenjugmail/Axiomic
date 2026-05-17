// Polish P2 — grader correctness + client/server mirror guard.
//
// The build's core invariant is that every QuizQuestion kind is
// graded identically by the server (gradeQuestion here) and the
// client (scoreLocally in apps/web/src/pages/LessonPage.tsx). This
// test (1) exercises gradeQuestion per kind with correct / wrong /
// blank fixtures, and (2) statically asserts every kind in the
// canonical list appears as a `case` in BOTH grader sources, so
// adding a kind to one but not the other fails CI server-side.

import { describe, test, expect } from "bun:test";
import { readFileSync } from "fs";
import path from "path";
import { gradeQuestion } from "./quizGrading";

// Canonical kind list — must match the QuizQuestion union in
// packages/types/src/index.ts. Adding a kind there means adding it
// here, which forces the mirror assertions below to be satisfied.
const ALL_KINDS = [
  "multiple_choice",
  "slider",
  "drag_classify",
  "code",
  "puzzle_drag_build",
  "math_expression",
  "sortable",
  "code_completion",
  "free_response",
  "scenario",
  "guided_derivation",
  "ml_sandbox",
] as const;

const j = (o: unknown) => JSON.stringify(o);

const FIXTURES: Record<
  string,
  { q: any; correct: string; wrong: string }
> = {
  multiple_choice: {
    q: { kind: "multiple_choice", correctIndex: 1 },
    correct: "1",
    wrong: "0",
  },
  slider: {
    q: { kind: "slider", target: { min: 1, max: 3 }, default: 2 },
    correct: "2",
    wrong: "9",
  },
  drag_classify: {
    q: { kind: "drag_classify", items: [{ id: "a", bin: "x" }] },
    correct: j({ a: "x" }),
    wrong: j({ a: "y" }),
  },
  code: {
    q: { kind: "code", tests: [1, 2] },
    correct: j({ passed: 2, total: 2 }),
    wrong: j({ passed: 1, total: 2 }),
  },
  puzzle_drag_build: {
    q: {
      kind: "puzzle_drag_build",
      components: [{ id: "c", type: "t" }],
      slots: [{ id: "s", accepts: "t" }],
    },
    correct: j({ s: "c" }),
    wrong: j({ s: "" }),
  },
  math_expression: {
    q: { kind: "math_expression", acceptedAnswers: ["2x"] },
    correct: "2x",
    wrong: "3",
  },
  sortable: {
    q: { kind: "sortable", items: [{ id: "a" }, { id: "b" }] },
    correct: j(["a", "b"]),
    wrong: j(["b", "a"]),
  },
  code_completion: {
    q: {
      kind: "code_completion",
      blanks: [{ id: "b1", acceptedAnswers: ["x"] }],
    },
    correct: j({ b1: "x" }),
    wrong: j({ b1: "y" }),
  },
  free_response: {
    q: { kind: "free_response" },
    correct: j({ graded: true, correct: true }),
    wrong: j({ graded: true, correct: false }),
  },
  scenario: {
    q: { kind: "scenario" },
    correct: j({ graded: true, correct: true }),
    wrong: j({ graded: true, correct: false }),
  },
  ml_sandbox: {
    q: { kind: "ml_sandbox" },
    correct: j({ graded: true, correct: true }),
    wrong: j({ graded: true, correct: false }),
  },
  guided_derivation: {
    q: { kind: "guided_derivation" },
    correct: j({ completed: true, correct: true }),
    wrong: j({ completed: true, correct: false }),
  },
};

describe("gradeQuestion — per-kind correctness", () => {
  for (const kind of ALL_KINDS) {
    test(`${kind}: correct → true, wrong → false, blank → false`, () => {
      const f = FIXTURES[kind];
      expect(f).toBeDefined();
      expect(gradeQuestion(f.q, f.correct)).toBe(true);
      expect(gradeQuestion(f.q, f.wrong)).toBe(false);
      expect(gradeQuestion(f.q, undefined)).toBe(false);
    });
  }

  test("unknown kind → false (safe default)", () => {
    expect(gradeQuestion({ kind: "totally_made_up" }, "anything")).toBe(
      false,
    );
  });
});

describe("client/server grader mirror invariant", () => {
  const serverSrc = readFileSync(
    path.resolve(import.meta.dir, "./quizGrading.ts"),
    "utf8",
  );
  const clientSrc = readFileSync(
    path.resolve(
      import.meta.dir,
      "../../../web/src/pages/LessonPage.tsx",
    ),
    "utf8",
  );

  for (const kind of ALL_KINDS) {
    test(`${kind} is a case in BOTH gradeQuestion and scoreLocally`, () => {
      expect(serverSrc.includes(`case "${kind}"`)).toBe(true);
      expect(clientSrc.includes(`case "${kind}"`)).toBe(true);
    });
  }

  test("canonical list has the expected 12 kinds", () => {
    expect(ALL_KINDS.length).toBe(12);
    expect(new Set(ALL_KINDS).size).toBe(12);
  });
});
