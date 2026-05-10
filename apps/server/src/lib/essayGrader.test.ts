// Sprint 75 — essayGrader tests.
//
// The MockProvider used in tests doesn't return JSON-shaped output,
// so the grader exercises its heuristic fallback path. We assert on
// the heuristic's structural invariants: empty essays score 0,
// short essays score below max, long essays score within range,
// score is always 0..maxScore.

import { describe, test, expect } from "bun:test";
import { gradeEssay } from "./essayGrader";

const RUBRIC = `Score on a 0-6 scale across these criteria:
1. Position clarity
2. Reasoning + evidence
3. Examples and counterexamples
4. Mechanics and organization`;

describe("essayGrader (Sprint 75)", () => {
  test("empty response scores 0", async () => {
    const r = await gradeEssay({
      promptMd: "Discuss something important.",
      rubricMd: RUBRIC,
      maxScore: 6,
      essayResponse: "",
    });
    expect(r.score).toBe(0);
    expect(typeof r.feedbackMd).toBe("string");
    expect(r.feedbackMd.length).toBeGreaterThan(0);
  });

  test("short response scores below maximum", async () => {
    const r = await gradeEssay({
      promptMd: "Discuss the merits of public libraries.",
      rubricMd: RUBRIC,
      maxScore: 6,
      essayResponse: "I think libraries are good.",
    });
    expect(r.score).toBeGreaterThanOrEqual(0);
    expect(r.score).toBeLessThan(6);
  });

  test("score is always within 0..maxScore", async () => {
    const r = await gradeEssay({
      promptMd: "Why are libraries important?",
      rubricMd: RUBRIC,
      maxScore: 6,
      essayResponse: "Libraries provide reasoning, position, examples, mechanics, and organization. ".repeat(20),
    });
    expect(r.score).toBeGreaterThanOrEqual(0);
    expect(r.score).toBeLessThanOrEqual(6);
  });

  test("graded-by tag is present", async () => {
    const r = await gradeEssay({
      promptMd: "x",
      rubricMd: "score 0-6 on quality",
      maxScore: 6,
      essayResponse: "ok",
    });
    expect(typeof r.gradedBy).toBe("string");
    expect(r.gradedBy.length).toBeGreaterThan(0);
  });

  test("respects custom max score", async () => {
    const r = await gradeEssay({
      promptMd: "x",
      rubricMd: "score 0-12",
      maxScore: 12,
      essayResponse:
        "This is a substantial response with score, clarity, position, evidence, mechanics, organization, reasoning, and examples discussed at length. " +
        "More content covering each rubric category in depth, providing concrete cases and counterexamples. ".repeat(5),
    });
    expect(r.score).toBeGreaterThanOrEqual(0);
    expect(r.score).toBeLessThanOrEqual(12);
  });
});
