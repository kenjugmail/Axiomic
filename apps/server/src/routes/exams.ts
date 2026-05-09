// Sprint 73 — Exam mastery framework routes.
//
//   GET  /exams                          list available exams
//   GET  /exams/:slug                    detail (sections, durations,
//                                         scoring overview)
//   POST /exams/:slug/attempts           start a new attempt
//                                         body: { mode: full_mock | section
//                                                       | adaptive,
//                                                 sectionSlug? }
//   GET  /exams/attempts/:id             current state (manifest +
//                                         answers + remaining time)
//   PUT  /exams/attempts/:id/answer      record one answer (idempotent
//                                         on (attemptId, questionId))
//   POST /exams/attempts/:id/submit      finalize + score
//   GET  /exams/:slug/history            authenticated user's past
//                                         attempts at this exam
//
// Auth: all attempt-related endpoints require authentication; the
// list + detail are public.

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { randomUUID } from "crypto";
import { and, asc, desc, eq } from "drizzle-orm";
import {
  examAttempts,
  examAttemptAnswers,
  examQuestions,
  examSections,
  exams,
  getDb,
} from "@axiomic/db";
import {
  buildDiagnosticManifest,
  pickNextAdaptiveQuestion,
} from "../lib/examAdaptive";
import { scoreExam, type ExamScoringConfig } from "../lib/examScoring";
import { requireAuth } from "../middleware/auth";
import type { Env } from "../env";

export const examsRouter = new Hono<Env>();

// ---------- helpers ---------------------------------------------------

function safeJsonObject<T>(s: string | null | undefined, fallback: T): T {
  if (!s) return fallback;
  try {
    const v = JSON.parse(s);
    if (v && typeof v === "object") return v as T;
  } catch {}
  return fallback;
}

function safeJsonArray<T>(s: string | null | undefined): T[] {
  if (!s) return [];
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? (v as T[]) : [];
  } catch {
    return [];
  }
}

interface ManifestSection {
  slug: string;
  questionIds: string[];
}
interface AttemptManifest {
  sections: ManifestSection[];
}

interface QuestionPayload {
  id: string;
  sectionId: string;
  sectionSlug: string;
  ordinal: number;
  difficulty: number;
  promptMd: string;
  options: Array<{ label: string; text: string }>;
  topicTags: string[];
}

function loadQuestions(ids: string[]): Map<string, QuestionPayload> {
  if (ids.length === 0) return new Map();
  const db = getDb();
  const rows = db
    .select({
      id: examQuestions.id,
      sectionId: examQuestions.sectionId,
      difficulty: examQuestions.difficulty,
      promptMd: examQuestions.promptMd,
      optionsJson: examQuestions.optionsJson,
      topicTagsJson: examQuestions.topicTagsJson,
    })
    .from(examQuestions)
    .all();
  const wanted = new Set(ids);
  // Look up section slugs in one go.
  const sectionRows = db
    .select({ id: examSections.id, slug: examSections.slug })
    .from(examSections)
    .all();
  const slugById = new Map(sectionRows.map((r) => [r.id, r.slug]));

  const out = new Map<string, QuestionPayload>();
  for (const r of rows) {
    if (!wanted.has(r.id)) continue;
    out.set(r.id, {
      id: r.id,
      sectionId: r.sectionId,
      sectionSlug: slugById.get(r.sectionId) ?? "",
      ordinal: 0, // filled by the caller relative to manifest order
      difficulty: r.difficulty,
      promptMd: r.promptMd,
      options: safeJsonArray<{ label: string; text: string }>(r.optionsJson),
      topicTags: safeJsonArray<string>(r.topicTagsJson),
    });
  }
  return out;
}

// ---------- list + detail ---------------------------------------------

examsRouter.get("/", async (c) => {
  const db = getDb();
  const rows = db.select().from(exams).orderBy(asc(exams.shortName)).all();
  return c.json({
    items: rows.map((r) => ({
      slug: r.slug,
      title: r.title,
      shortName: r.shortName,
      pathSlug: r.pathSlug,
      totalDurationMinutes: r.totalDurationMinutes,
      description: r.description,
    })),
  });
});

examsRouter.get("/:slug", async (c) => {
  const slug = c.req.param("slug");
  if (!slug) return c.json({ error: "Missing slug" }, 400);
  const db = getDb();
  const exam = db.select().from(exams).where(eq(exams.slug, slug)).get();
  if (!exam) return c.json({ error: "Not found" }, 404);
  const sections = db
    .select()
    .from(examSections)
    .where(eq(examSections.examId, exam.id))
    .orderBy(asc(examSections.ordinal))
    .all();
  const scoring = safeJsonObject<ExamScoringConfig>(exam.scoringJson, {});
  return c.json({
    exam: {
      slug: exam.slug,
      title: exam.title,
      shortName: exam.shortName,
      pathSlug: exam.pathSlug,
      totalDurationMinutes: exam.totalDurationMinutes,
      description: exam.description,
      sections: sections.map((s) => ({
        slug: s.slug,
        title: s.title,
        ordinal: s.ordinal,
        durationMinutes: s.durationMinutes,
        questionCount: s.questionCount,
      })),
      scoring,
    },
  });
});

// ---------- start attempt --------------------------------------------

const startSchema = z.object({
  mode: z.enum(["full_mock", "section", "adaptive"]),
  sectionSlug: z.string().optional(),
});

function pickRandomQuestionsForSection(
  sectionId: string,
  count: number,
): string[] {
  const db = getDb();
  const rows = db
    .select({ id: examQuestions.id })
    .from(examQuestions)
    .where(eq(examQuestions.sectionId, sectionId))
    .all();
  // Fisher-Yates shuffle then take `count` so the runner sees a
  // fresh order each attempt.
  const ids = rows.map((r) => r.id);
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  return ids.slice(0, Math.min(count, ids.length));
}

examsRouter.post(
  "/:slug/attempts",
  requireAuth,
  zValidator("json", startSchema),
  async (c) => {
    const me = c.get("user")!;
    const slug = c.req.param("slug");
    if (!slug) return c.json({ error: "Missing slug" }, 400);
    const { mode, sectionSlug } = c.req.valid("json");
    const db = getDb();

    const exam = db.select().from(exams).where(eq(exams.slug, slug)).get();
    if (!exam) return c.json({ error: "Exam not found" }, 404);

    const sections = db
      .select()
      .from(examSections)
      .where(eq(examSections.examId, exam.id))
      .orderBy(asc(examSections.ordinal))
      .all();
    if (sections.length === 0) {
      return c.json({ error: "Exam has no sections" }, 400);
    }

    let manifest: AttemptManifest;
    let totalDurationMinutes = exam.totalDurationMinutes;

    if (mode === "full_mock") {
      manifest = {
        sections: sections.map((s) => ({
          slug: s.slug,
          questionIds: pickRandomQuestionsForSection(s.id, s.questionCount),
        })),
      };
    } else if (mode === "section") {
      if (!sectionSlug) {
        return c.json({ error: "sectionSlug required for section mode" }, 400);
      }
      const section = sections.find((s) => s.slug === sectionSlug);
      if (!section)
        return c.json({ error: "Section not found" }, 404);
      manifest = {
        sections: [
          {
            slug: section.slug,
            questionIds: pickRandomQuestionsForSection(
              section.id,
              section.questionCount,
            ),
          },
        ],
      };
      totalDurationMinutes = section.durationMinutes;
    } else {
      // adaptive — start with a 20-question diagnostic across all
      // sections. The runner tops up via PUT next-question hits.
      manifest = {
        sections: sections.map((s) => ({
          slug: s.slug,
          questionIds: buildDiagnosticManifest(s.id, 20),
        })),
      };
      // Adaptive is untimed by default — no expiry written.
      totalDurationMinutes = 0;
    }

    const id = randomUUID();
    const startedAt = new Date();
    const expiresAt =
      totalDurationMinutes > 0
        ? new Date(
            startedAt.getTime() + totalDurationMinutes * 60_000,
          ).toISOString()
        : null;

    db.insert(examAttempts)
      .values({
        id,
        userId: me.id,
        examId: exam.id,
        mode,
        sectionSlug: mode === "section" ? sectionSlug : null,
        startedAt: startedAt.toISOString(),
        expiresAt,
        answersJson: JSON.stringify(manifest),
      })
      .run();

    return c.json({ id, mode, expiresAt, manifest });
  },
);

// ---------- attempt state --------------------------------------------

examsRouter.get("/attempts/:id", requireAuth, async (c) => {
  const me = c.get("user")!;
  const id = c.req.param("id");
  if (!id) return c.json({ error: "Missing id" }, 400);
  const db = getDb();
  const attempt = db
    .select()
    .from(examAttempts)
    .where(eq(examAttempts.id, id))
    .get();
  if (!attempt) return c.json({ error: "Not found" }, 404);
  if (attempt.userId !== me.id) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const manifest = safeJsonObject<AttemptManifest>(attempt.answersJson, {
    sections: [],
  });
  const allQuestionIds = manifest.sections.flatMap((s) => s.questionIds);
  const questions = loadQuestions(allQuestionIds);

  const answers = db
    .select()
    .from(examAttemptAnswers)
    .where(eq(examAttemptAnswers.attemptId, id))
    .all();

  return c.json({
    id: attempt.id,
    mode: attempt.mode,
    sectionSlug: attempt.sectionSlug,
    startedAt: attempt.startedAt,
    expiresAt: attempt.expiresAt,
    completedAt: attempt.completedAt,
    scoreScaled: attempt.scoreScaled,
    sections: manifest.sections.map((s) => ({
      slug: s.slug,
      questions: s.questionIds.map((qid, ordinal) => {
        const q = questions.get(qid);
        return q ? { ...q, ordinal } : null;
      }).filter((x) => x !== null),
    })),
    answers: answers.map((a) => ({
      questionId: a.questionId,
      selectedIndex: a.selectedIndex,
      flagged: a.flagged === 1,
      timeSpentMs: a.timeSpentMs,
    })),
  });
});

// ---------- record one answer ----------------------------------------

const answerSchema = z.object({
  questionId: z.string().min(8),
  selectedIndex: z.number().int().min(0).max(20).nullable(),
  timeSpentMs: z.number().int().min(0).max(3600_000).optional(),
  flagged: z.boolean().optional(),
});

examsRouter.put(
  "/attempts/:id/answer",
  requireAuth,
  zValidator("json", answerSchema),
  async (c) => {
    const me = c.get("user")!;
    const id = c.req.param("id");
    if (!id) return c.json({ error: "Missing id" }, 400);
    const { questionId, selectedIndex, timeSpentMs, flagged } =
      c.req.valid("json");
    const db = getDb();

    const attempt = db
      .select()
      .from(examAttempts)
      .where(eq(examAttempts.id, id))
      .get();
    if (!attempt) return c.json({ error: "Not found" }, 404);
    if (attempt.userId !== me.id) return c.json({ error: "Forbidden" }, 403);
    if (attempt.completedAt) {
      return c.json({ error: "Attempt already submitted" }, 400);
    }

    // Refuse new answers after the expiry. The auto-submit cron
    // would handle this on its next tick, but a synchronous reject
    // gives the client a clear error.
    if (attempt.expiresAt) {
      const exp = Date.parse(attempt.expiresAt);
      if (Number.isFinite(exp) && exp < Date.now()) {
        return c.json({ error: "Time expired" }, 410);
      }
    }

    // Idempotent on (attemptId, questionId).
    const existing = db
      .select({
        id: examAttemptAnswers.id,
        timeSpentMs: examAttemptAnswers.timeSpentMs,
      })
      .from(examAttemptAnswers)
      .where(
        and(
          eq(examAttemptAnswers.attemptId, id),
          eq(examAttemptAnswers.questionId, questionId),
        ),
      )
      .get();

    if (existing) {
      db.update(examAttemptAnswers)
        .set({
          selectedIndex: selectedIndex ?? null,
          timeSpentMs:
            timeSpentMs != null
              ? Math.max(existing.timeSpentMs, timeSpentMs)
              : existing.timeSpentMs,
          flagged: flagged ? 1 : 0,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(examAttemptAnswers.id, existing.id))
        .run();
    } else {
      db.insert(examAttemptAnswers)
        .values({
          id: randomUUID(),
          attemptId: id,
          questionId,
          selectedIndex: selectedIndex ?? null,
          timeSpentMs: timeSpentMs ?? 0,
          flagged: flagged ? 1 : 0,
        })
        .run();
    }
    return c.json({ ok: true });
  },
);

// ---------- next adaptive question -----------------------------------

examsRouter.post(
  "/attempts/:id/next-adaptive",
  requireAuth,
  async (c) => {
    const me = c.get("user")!;
    const id = c.req.param("id");
    if (!id) return c.json({ error: "Missing id" }, 400);
    const db = getDb();

    const attempt = db
      .select()
      .from(examAttempts)
      .where(eq(examAttempts.id, id))
      .get();
    if (!attempt) return c.json({ error: "Not found" }, 404);
    if (attempt.userId !== me.id) return c.json({ error: "Forbidden" }, 403);
    if (attempt.mode !== "adaptive") {
      return c.json({ error: "Only adaptive attempts support this endpoint" }, 400);
    }

    const manifest = safeJsonObject<AttemptManifest>(attempt.answersJson, {
      sections: [],
    });
    const askedIds = new Set(manifest.sections.flatMap((s) => s.questionIds));

    // Use the first section's question bank for the sequel pick.
    // A future revision can rotate sections.
    const sections = db
      .select({ id: examSections.id, slug: examSections.slug })
      .from(examSections)
      .where(eq(examSections.examId, attempt.examId))
      .orderBy(asc(examSections.ordinal))
      .all();
    if (sections.length === 0)
      return c.json({ error: "Exam has no sections" }, 400);
    const section = sections[0];

    // Pull answered history for the heuristic.
    const answers = db
      .select({
        questionId: examAttemptAnswers.questionId,
        selectedIndex: examAttemptAnswers.selectedIndex,
        isCorrect: examAttemptAnswers.isCorrect,
        difficulty: examQuestions.difficulty,
      })
      .from(examAttemptAnswers)
      .innerJoin(
        examQuestions,
        eq(examAttemptAnswers.questionId, examQuestions.id),
      )
      .where(eq(examAttemptAnswers.attemptId, id))
      .all();

    // Resolve isCorrect on-the-fly when missing — adaptive needs
    // the live signal, but answers are scored only at submit.
    const correctMap = (() => {
      const ids = answers.map((a) => a.questionId);
      if (ids.length === 0) return new Map<string, number>();
      const rows = db
        .select({
          id: examQuestions.id,
          correctIndex: examQuestions.correctIndex,
        })
        .from(examQuestions)
        .all();
      const m = new Map<string, number>();
      const wanted = new Set(ids);
      for (const r of rows) if (wanted.has(r.id)) m.set(r.id, r.correctIndex);
      return m;
    })();

    const answered = answers.map((a) => ({
      questionId: a.questionId,
      difficulty: a.difficulty,
      isCorrect:
        a.selectedIndex == null
          ? null
          : a.selectedIndex === correctMap.get(a.questionId),
    }));

    const pick = pickNextAdaptiveQuestion({
      sectionId: section.id,
      answered,
      excludedQuestionIds: [...askedIds],
    });

    if (!pick.questionId) {
      return c.json({ done: true });
    }

    // Append to the manifest so the runner can render the next q.
    manifest.sections[0] = {
      slug: section.slug,
      questionIds: [
        ...(manifest.sections[0]?.questionIds ?? []),
        pick.questionId,
      ],
    };
    db.update(examAttempts)
      .set({ answersJson: JSON.stringify(manifest) })
      .where(eq(examAttempts.id, id))
      .run();

    const q = loadQuestions([pick.questionId]).get(pick.questionId);
    return c.json({ question: q ?? null, difficulty: pick.difficulty });
  },
);

// ---------- submit + score -------------------------------------------

examsRouter.post("/attempts/:id/submit", requireAuth, async (c) => {
  const me = c.get("user")!;
  const id = c.req.param("id");
  if (!id) return c.json({ error: "Missing id" }, 400);
  const db = getDb();

  const attempt = db
    .select()
    .from(examAttempts)
    .where(eq(examAttempts.id, id))
    .get();
  if (!attempt) return c.json({ error: "Not found" }, 404);
  if (attempt.userId !== me.id) return c.json({ error: "Forbidden" }, 403);
  if (attempt.completedAt) {
    return c.json({ error: "Already submitted" }, 400);
  }

  const exam = db
    .select()
    .from(exams)
    .where(eq(exams.id, attempt.examId))
    .get();
  if (!exam) return c.json({ error: "Exam not found" }, 500);

  const manifest = safeJsonObject<AttemptManifest>(attempt.answersJson, {
    sections: [],
  });
  const allIds = manifest.sections.flatMap((s) => s.questionIds);

  // Resolve correct-index for every question + grade answers.
  const qrows = db
    .select({
      id: examQuestions.id,
      correctIndex: examQuestions.correctIndex,
      sectionId: examQuestions.sectionId,
    })
    .from(examQuestions)
    .all();
  const correctById = new Map<
    string,
    { correctIndex: number; sectionId: string }
  >();
  const wanted = new Set(allIds);
  for (const r of qrows) {
    if (wanted.has(r.id))
      correctById.set(r.id, {
        correctIndex: r.correctIndex,
        sectionId: r.sectionId,
      });
  }

  const sectionsRows = db
    .select({ id: examSections.id, slug: examSections.slug })
    .from(examSections)
    .where(eq(examSections.examId, attempt.examId))
    .all();
  const sectionSlugById = new Map(sectionsRows.map((r) => [r.id, r.slug]));

  const answers = db
    .select()
    .from(examAttemptAnswers)
    .where(eq(examAttemptAnswers.attemptId, id))
    .all();

  // Update each answer row's isCorrect for the post-mortem report.
  // Section raw-score tally:
  const rawBySection = new Map<string, number>();
  for (const sec of manifest.sections) rawBySection.set(sec.slug, 0);

  for (const ans of answers) {
    const correct = correctById.get(ans.questionId);
    if (!correct) continue;
    const isCorrect =
      ans.selectedIndex !== null && ans.selectedIndex === correct.correctIndex;
    db.update(examAttemptAnswers)
      .set({ isCorrect: isCorrect ? 1 : 0 })
      .where(eq(examAttemptAnswers.id, ans.id))
      .run();
    if (isCorrect) {
      const slug = sectionSlugById.get(correct.sectionId);
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
    .where(eq(examAttempts.id, id))
    .run();

  return c.json({
    attemptId: id,
    rawTotal: result.rawTotal,
    scaledTotal: result.scaledTotal,
    percentileTotal: result.percentileTotal,
    sections: result.sections,
  });
});

// ---------- per-user history -----------------------------------------

examsRouter.get("/:slug/history", requireAuth, async (c) => {
  const me = c.get("user")!;
  const slug = c.req.param("slug");
  if (!slug) return c.json({ error: "Missing slug" }, 400);
  const db = getDb();
  const exam = db.select().from(exams).where(eq(exams.slug, slug)).get();
  if (!exam) return c.json({ error: "Not found" }, 404);
  const rows = db
    .select()
    .from(examAttempts)
    .where(
      and(eq(examAttempts.userId, me.id), eq(examAttempts.examId, exam.id)),
    )
    .orderBy(desc(examAttempts.startedAt))
    .limit(50)
    .all();
  return c.json({
    items: rows.map((r) => ({
      id: r.id,
      mode: r.mode,
      sectionSlug: r.sectionSlug,
      startedAt: r.startedAt,
      completedAt: r.completedAt,
      scoreScaled: r.scoreScaled,
      scorePercentile: r.scorePercentile,
      sectionScores: safeJsonObject<unknown>(r.sectionScoresJson ?? "{}", {}),
    })),
  });
});
