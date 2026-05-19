// Digital-SAT-parity graders for grid_in (Student-Produced
// Response) and multi_select questions. Both return a binary
// {isCorrect} so the runner's scoring tally + the adaptive picker
// can treat the new types as drop-in MC replacements.

function normalize(s: string): string {
  return s
    .trim()
    .replace(/\s+/g, "")
    .replace(/^\+/, "")
    .replace(/^\$/, "")
    .replace(/%$/, "")
    .replace(/\.$/, "")
    .toLowerCase();
}

// Parse a normalized numeric string. Accepts integers, decimals,
// and "p/q" fractions (returns p/q as a finite Number). Returns
// NaN for anything that doesn't parse cleanly.
function parseNumeric(s: string): number {
  if (!s) return NaN;
  if (s.includes("/")) {
    const parts = s.split("/");
    if (parts.length !== 2) return NaN;
    const num = Number(parts[0]);
    const den = Number(parts[1]);
    if (!Number.isFinite(num) || !Number.isFinite(den) || den === 0) {
      return NaN;
    }
    return num / den;
  }
  const v = Number(s);
  return Number.isFinite(v) ? v : NaN;
}

export function gradeGridIn(
  learnerAnswer: string | null | undefined,
  acceptedAnswers: string[] | null | undefined,
  tolerance: number | null | undefined,
): { isCorrect: boolean } {
  if (!learnerAnswer || !Array.isArray(acceptedAnswers) || acceptedAnswers.length === 0) {
    return { isCorrect: false };
  }
  const learner = normalize(learnerAnswer);
  if (!learner) return { isCorrect: false };

  // Pass 1: normalized string equality.
  for (const acc of acceptedAnswers) {
    if (normalize(acc) === learner) return { isCorrect: true };
  }

  // Pass 2: numeric equivalence within tolerance.
  const learnerNum = parseNumeric(learner);
  if (!Number.isFinite(learnerNum)) return { isCorrect: false };
  const tol = typeof tolerance === "number" && tolerance >= 0 ? tolerance : 0;
  for (const acc of acceptedAnswers) {
    const accNum = parseNumeric(normalize(acc));
    if (Number.isFinite(accNum) && Math.abs(learnerNum - accNum) <= tol) {
      return { isCorrect: true };
    }
  }
  return { isCorrect: false };
}

export function gradeMultiSelect(
  selectedIndexes: number[] | null | undefined,
  correctIndexes: number[] | null | undefined,
): { isCorrect: boolean } {
  if (
    !Array.isArray(selectedIndexes) ||
    !Array.isArray(correctIndexes) ||
    selectedIndexes.length === 0 ||
    correctIndexes.length === 0
  ) {
    return { isCorrect: false };
  }
  // Exact set equality. Dedupe + sort both arrays before comparing
  // so the learner's pick order doesn't matter and a stray double-
  // tap doesn't fail an otherwise-correct answer.
  const dedupe = (xs: number[]) =>
    Array.from(new Set(xs.filter((n) => Number.isFinite(n)))).sort(
      (a, b) => a - b,
    );
  const a = dedupe(selectedIndexes);
  const b = dedupe(correctIndexes);
  if (a.length !== b.length) return { isCorrect: false };
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return { isCorrect: false };
  }
  return { isCorrect: true };
}
