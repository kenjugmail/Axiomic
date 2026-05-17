// Phase 2 — flashcardFromQuestion tests. Locks the "save-to-SRS on
// miss, extended to all kinds" behaviour: MC/math/free-response
// flatten to a real Q/A; other kinds fall back to the explanation
// or are skipped; bad input returns null.

import { describe, test, expect } from "bun:test";
import { flashcardFromQuestion } from "./flashcardFromQuestion";

describe("flashcardFromQuestion (Phase 2)", () => {
  test("multiple_choice → correct option + explanation", () => {
    const c = flashcardFromQuestion({
      kind: "multiple_choice",
      question: "2 + 2 = ?",
      options: ["3", "4", "5"],
      correctIndex: 1,
      explanation: "Basic addition.",
    });
    expect(c).not.toBeNull();
    expect(c!.front).toBe("2 + 2 = ?");
    expect(c!.back).toContain("4");
    expect(c!.back).toContain("Basic addition.");
  });

  test("math_expression → first accepted answer", () => {
    const c = flashcardFromQuestion({
      kind: "math_expression",
      question: "Derivative of x^2?",
      acceptedAnswers: ["2x", "2*x"],
    });
    expect(c!.back).toContain("2x");
  });

  test("free_response → sampleAnswer wins over explanation", () => {
    const c = flashcardFromQuestion({
      kind: "free_response",
      question: "Why is unitarity required?",
      sampleAnswer: "It preserves total probability.",
      explanation: "longer note",
    });
    expect(c!.back).toBe("It preserves total probability.");
  });

  test("scenario with neither sample nor explanation → null", () => {
    expect(
      flashcardFromQuestion({ kind: "scenario", question: "Diagnose." }),
    ).toBeNull();
  });

  test("non-flattenable kind falls back to explanation", () => {
    const c = flashcardFromQuestion({
      kind: "sortable",
      question: "Order these steps",
      explanation: "The correct order is A, B, C.",
    });
    expect(c!.back).toBe("The correct order is A, B, C.");
  });

  test("non-flattenable kind without explanation → null", () => {
    expect(
      flashcardFromQuestion({ kind: "code", question: "Implement it" }),
    ).toBeNull();
  });

  test("missing question or bad input → null", () => {
    expect(flashcardFromQuestion(null)).toBeNull();
    expect(flashcardFromQuestion({ kind: "multiple_choice" })).toBeNull();
  });
});
