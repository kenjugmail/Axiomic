// Sprint 80 — Shared quiz grader.
//
// Extracted from mastery.ts so safety-cert quizzes (Sprint 80) and
// future quiz surfaces can reuse the exact same grading semantics
// without diverging. The question shape is the JSON stored in
// `masteryNodes.quizData` and `safetyCertifications.quizDataJson`:
// a flat array of questions with a `kind` discriminator, an `id`,
// and per-kind correctness metadata.

export function gradeQuestion(q: any, answer: string | undefined): boolean {
  const kind = q?.kind ?? "multiple_choice";
  switch (kind) {
    case "multiple_choice":
      return answer !== undefined && answer === String(q.correctIndex);
    case "slider": {
      if (answer === undefined) return false;
      const v = parseFloat(answer);
      if (isNaN(v)) return false;
      return v >= q.target.min && v <= q.target.max;
    }
    case "drag_classify": {
      if (answer === undefined) return false;
      let map: Record<string, string>;
      try {
        const parsed = JSON.parse(answer);
        if (!parsed || typeof parsed !== "object") return false;
        map = parsed;
      } catch {
        return false;
      }
      for (const item of q.items as Array<{ id: string; bin: string }>) {
        if (map[item.id] !== item.bin) return false;
      }
      return true;
    }
    case "code": {
      if (answer === undefined) return false;
      try {
        const parsed = JSON.parse(answer);
        if (!parsed || typeof parsed !== "object") return false;
        const total = q.tests?.length ?? 0;
        return (
          typeof parsed.passed === "number" &&
          typeof parsed.total === "number" &&
          parsed.passed === total &&
          parsed.total === total
        );
      } catch {
        return false;
      }
    }
    case "puzzle_drag_build": {
      if (answer === undefined) return false;
      let map: Record<string, string>;
      try {
        const parsed = JSON.parse(answer);
        if (!parsed || typeof parsed !== "object") return false;
        map = parsed;
      } catch {
        return false;
      }
      const componentsById = new Map<string, { type: string }>();
      for (const c of q.components as Array<{ id: string; type: string }>) {
        componentsById.set(c.id, c);
      }
      for (const slot of q.slots as Array<{ id: string; accepts: string }>) {
        const placed = map[slot.id];
        if (!placed) return false;
        const comp = componentsById.get(placed);
        if (!comp || comp.type !== slot.accepts) return false;
      }
      return true;
    }
    case "math_expression": {
      if (answer === undefined) return false;
      const norm = (s: string) => s.replace(/\s+/g, "").toLowerCase();
      const a = norm(answer);
      const accepted = (q.acceptedAnswers as unknown[]).filter(
        (s): s is string => typeof s === "string",
      );
      return accepted.some((acc) => norm(acc) === a);
    }
    case "sortable": {
      if (answer === undefined) return false;
      let order: string[];
      try {
        const parsed = JSON.parse(answer);
        if (!Array.isArray(parsed)) return false;
        order = parsed.filter((s): s is string => typeof s === "string");
      } catch {
        return false;
      }
      const correct = (q.items as Array<{ id: string }>).map((it) => it.id);
      if (order.length !== correct.length) return false;
      return order.every((id, i) => id === correct[i]);
    }
    case "code_completion": {
      if (answer === undefined) return false;
      let map: Record<string, string>;
      try {
        const parsed = JSON.parse(answer);
        if (!parsed || typeof parsed !== "object") return false;
        map = parsed;
      } catch {
        return false;
      }
      const norm = (s: string) => s.trim();
      for (const blank of q.blanks as Array<{
        id: string;
        acceptedAnswers: string[];
      }>) {
        const userAns = map[blank.id];
        if (typeof userAns !== "string") return false;
        const u = norm(userAns);
        const ok = blank.acceptedAnswers.some((acc) => norm(acc) === u);
        if (!ok) return false;
      }
      return true;
    }
    case "free_response":
    case "scenario":
    case "ml_sandbox": {
      if (answer === undefined) return false;
      try {
        const r = JSON.parse(answer);
        return !!r && typeof r === "object" && r.graded === true && r.correct === true;
      } catch {
        return false;
      }
    }
    case "guided_derivation": {
      if (answer === undefined) return false;
      try {
        const r = JSON.parse(answer);
        return (
          !!r && typeof r === "object" && r.completed === true && r.correct === true
        );
      } catch {
        return false;
      }
    }
    default:
      return false;
  }
}
