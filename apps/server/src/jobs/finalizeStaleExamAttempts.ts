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
          sectionId: examQuestions.sectionId,
          type: examQuestions.type,
          correctIndex: examQuestions.correctIndex,
          promptMd: examQuestions.promptMd,
          rubricMd: examQuestions.rubricMd,
          maxEssayScore: examQuestions.maxEssayScore,
        })
        .from(examQuestions)
        .all();
      const wanted = new Set(allIds);
      interface QMeta {
        type: string;
        correctIndex: number;
        sectionId: string;
        promptMd: string;
        rubricMd: string | null;
        maxEssayScore: number | null;
      }
      const metaById = new Map<string, QMeta>();
      for (const r of qrows) {
        if (wanted.has(r.id))
          metaById.set(r.id, {
            type: r.type ?? "multiple_choice",
            correctIndex: r.correctIndex,
            sectionId: r.sectionId,
            promptMd: r.promptMd,
            rubricMd: r.rubricMd,
            maxEssayScore: r.maxEssayScore,
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
        const meta = metaById.get(ans.questionId);
        if (!meta) continue;
        const slug = slugById.get(meta.sectionId);
        if (meta.type === "essay") {
          // Auto-submit grades essays the same as the synchronous
          // submit path; just imported lazily to keep the cron
          // module self-contained.
          const { gradeEssay } = await import("../lib/essayGrader");
          const maxScore = meta.maxEssayScore ?? 6;
          const grade = await gradeEssay({
            promptMd: meta.promptMd,
            rubricMd: meta.rubricMd ?? "",
            maxScore,
            essayResponse: ans.essayResponse ?? "",
          });
          db.update(examAttemptAnswers)
            .set({
              essayScore: grade.score,
              essayFeedbackMd: grade.feedbackMd,
              isCorrect: grade.score >= Math.ceil(maxScore / 2) ? 1 : 0,
            })
            .where(eq(examAttemptAnswers.id, ans.id))
            .run();
          if (slug)
            rawBySection.set(slug, (rawBySection.get(slug) ?? 0) + grade.score);
        } else {
          const isCorrect =
            ans.selectedIndex !== null &&
            ans.selectedIndex === meta.correctIndex;
          db.update(examAttemptAnswers)
            .set({ isCorrect: isCorrect ? 1 : 0 })
            .where(eq(examAttemptAnswers.id, ans.id))
            .run();
          if (isCorrect && slug) {
            rawBySection.set(slug, (rawBySection.get(slug) ?? 0) + 1);
          }
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
