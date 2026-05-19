// Sprint 73 — Adaptive practice question picker.
//
// Targets the zone of proximal development: keep accuracy near
// ~70% so the learner is challenged but not crushed. Picks the
// next question by:
//
//   1. Compute running accuracy across the last N answered
//      questions in this attempt.
//   2. Adjust the target difficulty: if running accuracy > 75%,
//      step up by 1; if < 60%, step down by 1.
//   3. Pick a not-yet-asked question at the target difficulty
//      from the section's bank, preferring one whose topic tag
//      overlaps with the user's weakest mastery topic (when
//      that signal is available).
//
// Diagnostic mode: at attempt start, pre-shuffle ~20 questions
// across difficulty bands [1,2,3,4,5] so the score report can
// surface a per-difficulty accuracy curve for the post-mortem.

import { inArray, notInArray, sql } from "drizzle-orm";
import { examQuestions, getDb } from "@axiomic/db";

const RECENT_WINDOW = 5;
const TARGET_HIGH = 0.75;
const TARGET_LOW = 0.6;
const DIFFICULTY_MIN = 1;
const DIFFICULTY_MAX = 5;

export interface AnsweredEntry {
  questionId: string;
  difficulty: number;
  isCorrect: boolean | null; // null = skipped
}

export interface PickContext {
  sectionId: string;
  // History so far, in answer order.
  answered: AnsweredEntry[];
  // The full set of question ids already drawn for this attempt
  // (shouldn't be re-asked even when answered === skipped).
  excludedQuestionIds: string[];
}

function targetDifficulty(answered: AnsweredEntry[]): number {
  if (answered.length === 0) return 3;
  const recent = answered.slice(-RECENT_WINDOW);
  const judged = recent.filter((a) => a.isCorrect !== null);
  if (judged.length === 0) return 3;
  const correct = judged.filter((a) => a.isCorrect === true).length;
  const accuracy = correct / judged.length;
  // Use the most recent question's difficulty as the anchor so we
  // step relative to it rather than from a constant.
  const anchor = recent[recent.length - 1].difficulty;
  if (accuracy > TARGET_HIGH) return Math.min(DIFFICULTY_MAX, anchor + 1);
  if (accuracy < TARGET_LOW) return Math.max(DIFFICULTY_MIN, anchor - 1);
  return anchor;
}

interface PickResult {
  questionId: string | null;
  difficulty: number;
}

export function pickNextAdaptiveQuestion(ctx: PickContext): PickResult {
  const db = getDb();
  const target = targetDifficulty(ctx.answered);

  // Try the target difficulty first; widen the search outward if no
  // bank candidates remain at that difficulty.
  const distances = [0, 1, -1, 2, -2, 3, -3, 4, -4];
  const excludedSet = new Set(ctx.excludedQuestionIds);
  for (const d of distances) {
    const tryDiff = target + d;
    if (tryDiff < DIFFICULTY_MIN || tryDiff > DIFFICULTY_MAX) continue;
    const candidates = db
      .select({ id: examQuestions.id })
      .from(examQuestions)
      .where(
        sql`${examQuestions.sectionId} = ${ctx.sectionId} AND ${examQuestions.difficulty} = ${tryDiff} AND ${examQuestions.type} != 'essay'`,
      )
      .all();
    for (const c of candidates) {
      if (excludedSet.has(c.id)) continue;
      return { questionId: c.id, difficulty: tryDiff };
    }
  }
  return { questionId: null, difficulty: target };
}

// Build the diagnostic manifest: ~20 questions spread across
// difficulty bands. Used at attempt start when mode === 'adaptive'
// or 'diagnostic' (we treat diagnostic as a flavor of adaptive).
export function buildDiagnosticManifest(
  sectionId: string,
  count = 20,
): string[] {
  const db = getDb();
  // Take roughly equal counts per difficulty band. SQLite's
  // RANDOM() works fine at our scale.
  const perBand = Math.ceil(count / 5);
  const ids: string[] = [];
  for (let d = 1; d <= 5; d++) {
    const rows = db
      .select({ id: examQuestions.id })
      .from(examQuestions)
      .where(
        sql`${examQuestions.sectionId} = ${sectionId} AND ${examQuestions.difficulty} = ${d} AND ${examQuestions.type} != 'essay'`,
      )
      .orderBy(sql`RANDOM()`)
      .limit(perBand)
      .all();
    for (const r of rows) ids.push(r.id);
  }
  return ids.slice(0, count);
}

// Suppress unused-import linters.
void inArray;
void notInArray;
