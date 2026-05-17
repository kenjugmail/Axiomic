// Phase 2 — derive a spaced-repetition Q/A card from any quiz
// question kind the learner just missed. Returns null when the
// kind can't produce a meaningful standalone card (caller skips).
// Extracted + generalized from the multiple_choice-only inline
// logic that used to live in the /quiz route.

interface Card {
  front: string;
  back: string;
}

export function flashcardFromQuestion(q: any): Card | null {
  if (!q || typeof q !== "object") return null;
  const kind = q.kind ?? "multiple_choice";
  const question = String(q.question ?? "").trim();
  if (!question) return null;
  const front = question.slice(0, 500);
  const explanation =
    typeof q.explanation === "string" ? q.explanation.trim() : "";
  const withExpl = (core: string) =>
    (explanation ? `${core}\n\n${explanation}` : core).slice(0, 2000);

  switch (kind) {
    case "multiple_choice": {
      if (!Array.isArray(q.options) || typeof q.correctIndex !== "number")
        return null;
      const opt = String(q.options[q.correctIndex] ?? "").trim();
      return opt ? { front, back: withExpl(opt) } : null;
    }
    case "math_expression": {
      const acc = Array.isArray(q.acceptedAnswers)
        ? q.acceptedAnswers.filter((s: unknown) => typeof s === "string")
        : [];
      if (acc.length === 0)
        return explanation
          ? { front, back: explanation.slice(0, 2000) }
          : null;
      return { front, back: withExpl(acc[0]) };
    }
    case "free_response":
    case "scenario": {
      const sample =
        typeof q.sampleAnswer === "string" ? q.sampleAnswer.trim() : "";
      const core = sample || explanation;
      return core ? { front, back: core.slice(0, 2000) } : null;
    }
    default: {
      // sortable / drag_classify / puzzle_drag_build / slider /
      // code / code_completion / guided_derivation: no clean
      // single-answer flatten — fall back to the explanation as
      // the recall cue when the author provided one.
      return explanation ? { front, back: explanation.slice(0, 2000) } : null;
    }
  }
}
