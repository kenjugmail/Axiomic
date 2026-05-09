// Sprint 73 — Auto-submit timed exam attempts whose deadlines have
// passed. The runtime returns 410 to a client that tries to record
// an answer past the expiry, so this is the cleanup path that
// finalizes the score for those attempts.
//
// Runs every 5 minutes — fast enough that an unattended attempt
// surfaces its score promptly + cheap because the index on
// expiresAt narrows to in-flight rows.

import { and, isNotNull, isNull, lt } from "drizzle-orm";
import { examAttempts, examAttemptAnswers, examQuestions, examSections, exams, getDb } from "@axiomic/db";
import { eq } from "drizzle-orm";
import { scoreExam, type ExamScoringConfig } from "../lib/examScoring";
import type { JobDefinition } from "../lib/jobs";

interface AttemptManifest {
  sections: Array<{ slug: string; questionIds: string[] }>;
}

function safeJsonObject<T>(s: string | null | undefined, fallback: T): T {
  if (!s) return fallback;
  try {
    const v = JSON.parse(s);
    if (v && typeof v === "object") return v as T;
  } catch {}
  return fallback;
}

export const finalizeStaleExamAttemptsJob: JobDefinition = {
  name: "finalize_stale_exam_attempts",
  intervalMs: 5 * 60_000, // 5 min
  async run() {
    const db = getDb();
    const now = new Date().toISOString();
    const stale = db
      .select()
      .from(examAttempts)
      .where(
        and(
          isNull(examAttempts.completedAt),
          isNotNull(examAttempts.expiresAt),
          lt(examAttempts.expiresAt, now),
        ),
      )
      .all();

    let finalized = 0;
    for (const attempt of stale) {
      const exam = db
        .select()
        .from(exams)
        .where(eq(exams.id, attempt.examId))
        .get();
      if (!exam) continue;
      const manifest = safeJsonObject<AttemptManifest>(attempt.answersJson, {
        sections: [],
      });
      const allIds = manifest.sections.flatMap((s) => s.questionIds);
      const qrows = db
        .select({
          id: examQuestions.id,
          correctIndex: examQuestions.correctIndex,
          sectionId: examQuestions.sectionId,
        })
        .from(examQuestions)
        .all();
      const wanted = new Set(allIds);
      const correctById = new Map<
        string,
        { correctIndex: number; sectionId: string }
      >();
      for (const r of qrows) {
        if (wanted.has(r.id))
          correctById.set(r.id, {
            correctIndex: r.correctIndex,
            sectionId: r.sectionId,
          });
      }
      const sectionRows = db
        .select({ id: examSections.id, slug: examSections.slug })
        .from(examSections)
        .where(eq(examSections.examId, attempt.examId))
        .all();
      const slugById = new Map(sectionRows.map((r) => [r.id, r.slug]));

      const answers = db
        .select()
        .from(examAttemptAnswers)
        .where(eq(examAttemptAnswers.attemptId, attempt.id))
        .all();
      const rawBySection = new Map<string, number>();
      for (const sec of manifest.sections) rawBySection.set(sec.slug, 0);
      for (const ans of answers) {
        const correct = correctById.get(ans.questionId);
        if (!correct) continue;
        const isCorrect =
          ans.selectedIndex !== null &&
          ans.selectedIndex === correct.correctIndex;
        db.update(examAttemptAnswers)
          .set({ isCorrect: isCorrect ? 1 : 0 })
          .where(eq(examAttemptAnswers.id, ans.id))
          .run();
        if (isCorrect) {
          const slug = slugById.get(correct.sectionId);
          if (slug) rawBySection.set(slug, (rawBySection.get(slug) ?? 0) + 1);
        }
      }

      const scoring = safeJsonObject<ExamScoringConfig>(exam.scoringJson, {});
      const result = scoreExam(
        [...rawBySection.entries()].map(([sectionSlug, raw]) => ({
          sectionSlug,
          raw,
        })),
        scoring,
      );

      db.update(examAttempts)
        .set({
          completedAt: new Date().toISOString(),
          scoreRaw: result.rawTotal,
          scoreScaled: result.scaledTotal,
          scorePercentile: result.percentileTotal,
          sectionScoresJson: JSON.stringify(result.sections),
        })
        .where(eq(examAttempts.id, attempt.id))
        .run();
      finalized++;
    }

    return { itemsProcessed: finalized };
  },
};
