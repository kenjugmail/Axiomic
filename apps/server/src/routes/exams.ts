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
import { and, asc, desc, eq, sql } from "drizzle-orm";
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
import { gradeEssay } from "../lib/essayGrader";
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

// Server-side question shape. Caller decides whether to expose
// per-variant answer-key fields (only completed attempts get them).
// The wire type lives in @axiomic/types as ExamQuestionPayload (a
// discriminated union); this internal type is the eager projection
// before we strip answer fields for in-flight attempts.
interface QuestionPayload {
  id: string;
  sectionId: string;
  sectionSlug: string;
  ordinal: number;
  type: "multiple_choice" | "essay" | "grid_in" | "multi_select";
  difficulty: number;
  promptMd: string;
  passageMd: string | null;
  options: Array<{ label: string; text: string }>;
  topicTags: string[];
  rubricMd: string | null;
  maxEssayScore: number | null;
  correctIndex: number | null;
  // Digital-SAT-parity additions.
  acceptedAnswers: string[] | null;
  tolerance: number | null;
  correctIndexes: number[] | null;
  imageUrl: string | null;
  meta: Record<string, unknown> | null;
}

function loadQuestions(ids: string[]): Map<string, QuestionPayload> {
  if (ids.length === 0) return new Map();
  const db = getDb();
  const rows = db
    .select({
      id: examQuestions.id,
      sectionId: examQuestions.sectionId,
      type: examQuestions.type,
      difficulty: examQuestions.difficulty,
      promptMd: examQuestions.promptMd,
      passageMd: examQuestions.passageMd,
      optionsJson: examQuestions.optionsJson,
      rubricMd: examQuestions.rubricMd,
      maxEssayScore: examQuestions.maxEssayScore,
      topicTagsJson: examQuestions.topicTagsJson,
      correctIndex: examQuestions.correctIndex,
      acceptedAnswersJson: examQuestions.acceptedAnswersJson,
      tolerance: examQuestions.tolerance,
      correctIndexesJson: examQuestions.correctIndexesJson,
      imageUrl: examQuestions.imageUrl,
      metaJson: examQuestions.metaJson,
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
  const VALID_TYPES = new Set([
    "multiple_choice",
    "essay",
    "grid_in",
    "multi_select",
  ]);
  for (const r of rows) {
    if (!wanted.has(r.id)) continue;
    const qType = (
      VALID_TYPES.has(r.type) ? r.type : "multiple_choice"
    ) as QuestionPayload["type"];
    out.set(r.id, {
      id: r.id,
      sectionId: r.sectionId,
      sectionSlug: slugById.get(r.sectionId) ?? "",
      ordinal: 0, // filled by the caller relative to manifest order
      type: qType,
      difficulty: r.difficulty,
      promptMd: r.promptMd,
      passageMd: r.passageMd ?? null,
      options: safeJsonArray<{ label: string; text: string }>(r.optionsJson),
      topicTags: safeJsonArray<string>(r.topicTagsJson),
      rubricMd: r.rubricMd,
      maxEssayScore: r.maxEssayScore,
      // Essay rows store 0 for correctIndex but it's meaningless there.
      correctIndex: qType === "essay" ? null : r.correctIndex,
      acceptedAnswers:
        qType === "grid_in"
          ? safeJsonArray<string>(r.acceptedAnswersJson)
          : null,
      tolerance: qType === "grid_in" ? r.tolerance : null,
      correctIndexes:
        qType === "multi_select"
          ? safeJsonArray<number>(r.correctIndexesJson)
          : null,
      imageUrl: r.imageUrl ?? null,
      meta: r.metaJson
        ? safeJsonObject<Record<string, unknown> | null>(r.metaJson, null)
        : null,
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

  // Phase 16A — only expose the answer key after the attempt is
  // completed, so the in-progress fetch can't be inspected to cheat.
  const completed = attempt.completedAt != null;

  // Digital-SAT-parity: per-section deadlines + customizer state.
  // Legacy attempts (sectionDeadlinesJson IS NULL) synthesize a
  // single virtual deadline from expiresAt so the wire shape is
  // uniform and the runner can drive both paths from one code
  // branch.
  const storedDeadlines = safeJsonArray<{
    slug: string;
    startsAt: string;
    endsAt: string;
    durationMinutes: number;
  }>(attempt.sectionDeadlinesJson);
  let sectionDeadlines = storedDeadlines;
  if (sectionDeadlines.length === 0 && attempt.expiresAt) {
    // Single virtual deadline covering the whole attempt.
    sectionDeadlines = [
      {
        slug: manifest.sections[0]?.slug ?? "",
        startsAt: attempt.startedAt,
        endsAt: attempt.expiresAt,
        durationMinutes: Math.max(
          0,
          Math.round(
            (Date.parse(attempt.expiresAt) - Date.parse(attempt.startedAt)) /
              60000,
          ),
        ),
      },
    ];
  }
  const customizer = attempt.customizerJson
    ? safeJsonObject<Record<string, unknown> | null>(
        attempt.customizerJson,
        null,
      )
    : null;
  const calculatorAllowed =
    customizer && typeof customizer === "object"
      ? Boolean((customizer as { calculatorAllowed?: unknown }).calculatorAllowed)
      : false;
  const calculatorState = attempt.calculatorStateJson
    ? safeJsonObject<Record<string, unknown> | null>(
        attempt.calculatorStateJson,
        null,
      )
    : null;

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
      questions: s.questionIds
        .map((qid, ordinal) => {
          const q = questions.get(qid);
          if (!q) return null;
          // Strip per-variant answer keys mid-attempt. For
          // multi_select we expose the count (not the indexes) so
          // the runner can gate further picks once the learner has
          // chosen that many.
          const correctCount = q.correctIndexes?.length ?? 0;
          return {
            ...q,
            ordinal,
            correctIndex: completed ? q.correctIndex : null,
            acceptedAnswers: completed ? q.acceptedAnswers : null,
            correctIndexes: completed ? q.correctIndexes : null,
            correctCount: q.type === "multi_select" ? correctCount : undefined,
          };
        })
        .filter((x) => x !== null),
    })),
    answers: answers.map((a) => ({
      questionId: a.questionId,
      selectedIndex: a.selectedIndex,
      essayResponse: a.essayResponse,
      essayScore: a.essayScore,
      essayFeedbackMd: a.essayFeedbackMd,
      gridInResponse: a.gridInResponse,
      selectedIndexes: a.selectedIndexesJson
        ? safeJsonArray<number>(a.selectedIndexesJson)
        : null,
      flagged: a.flagged === 1,
      timeSpentMs: a.timeSpentMs,
      isCorrect: completed && a.isCorrect != null ? a.isCorrect === 1 : null,
    })),
    sectionDeadlines,
    currentSectionIdx: attempt.currentSectionIdx ?? 0,
    breakUntilAt: attempt.breakUntilAt,
    calculatorAllowed,
    calculatorState,
    customizer,
    warnings: [] as string[],
  });
});

// ---------- record one answer ----------------------------------------

const answerSchema = z.object({
  questionId: z.string().min(8),
  selectedIndex: z.number().int().min(0).max(20).nullable().optional(),
  // Sprint 75 — free-text response for essay questions. Capped at
  // ~50KB which is roughly 8000 words; that's more than any GRE
  // AW prompt would expect.
  essayResponse: z.string().max(50_000).nullable().optional(),
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
    const { questionId, selectedIndex, essayResponse, timeSpentMs, flagged } =
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
      const update: Record<string, unknown> = {
        timeSpentMs:
          timeSpentMs != null
            ? Math.max(existing.timeSpentMs, timeSpentMs)
            : existing.timeSpentMs,
        updatedAt: new Date().toISOString(),
      };
      if (selectedIndex !== undefined) {
        update.selectedIndex = selectedIndex ?? null;
      }
      if (essayResponse !== undefined) {
        update.essayResponse = essayResponse ?? null;
      }
      // Only touch the flagged column when the patch supplied it —
      // otherwise patching `selectedIndex` on a flagged question would
      // silently clear the flag.
      if (flagged !== undefined) {
        update.flagged = flagged ? 1 : 0;
      }
      db.update(examAttemptAnswers)
        .set(update)
        .where(eq(examAttemptAnswers.id, existing.id))
        .run();
    } else {
      db.insert(examAttemptAnswers)
        .values({
          id: randomUUID(),
          attemptId: id,
          questionId,
          selectedIndex: selectedIndex ?? null,
          essayResponse: essayResponse ?? null,
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

    // Pull answered history for the heuristic. Filter to
    // multiple-choice rows only — essay answers can't be live-graded
    // here, and feeding them in would skew the running-accuracy
    // window (essay rows have selectedIndex=null, which the picker
    // would read as "skipped").
    const answers = db
      .select({
        questionId: examAttemptAnswers.questionId,
        selectedIndex: examAttemptAnswers.selectedIndex,
        isCorrect: examAttemptAnswers.isCorrect,
        type: examQuestions.type,
        difficulty: examQuestions.difficulty,
        correctIndex: examQuestions.correctIndex,
      })
      .from(examAttemptAnswers)
      .innerJoin(
        examQuestions,
        eq(examAttemptAnswers.questionId, examQuestions.id),
      )
      .where(eq(examAttemptAnswers.attemptId, id))
      .all();

    const answered = answers
      .filter((a) => a.type === "multiple_choice")
      .map((a) => ({
        questionId: a.questionId,
        difficulty: a.difficulty,
        isCorrect:
          a.selectedIndex == null
            ? null
            : a.selectedIndex === a.correctIndex,
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

  // Phase 19C — atomic claim. Two concurrent submits (spam-click,
  // dual tabs, retry-on-flaky-network) used to both pass a stale
  // `select then check completedAt` guard and both run the
  // expensive essay grader. Replace with a conditional UPDATE that
  // only succeeds while completedAt IS NULL; the loser sees 0
  // changes and gets "Already submitted" without doing any work.
  const claim = db
    .update(examAttempts)
    .set({ completedAt: new Date().toISOString() })
    .where(
      and(
        eq(examAttempts.id, id),
        eq(examAttempts.userId, me.id),
        sql`${examAttempts.completedAt} IS NULL`,
      ),
    )
    .run();
  const claimedRows =
    (claim as unknown as { changes?: number }).changes ?? 0;

  const attempt = db
    .select()
    .from(examAttempts)
    .where(eq(examAttempts.id, id))
    .get();
  if (!attempt) return c.json({ error: "Not found" }, 404);
  if (attempt.userId !== me.id) return c.json({ error: "Forbidden" }, 403);
  if (claimedRows === 0) {
    // The atomic claim missed: either an earlier submit already
    // landed (concurrent caller) or the attempt was never in a
    // submittable state. Both surface as "Already submitted".
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

  // Resolve question metadata for grading. Essay questions use
  // rubricMd + maxEssayScore; multiple-choice uses correctIndex.
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
  interface QuestionMeta {
    type: string;
    correctIndex: number;
    sectionId: string;
    promptMd: string;
    rubricMd: string | null;
    maxEssayScore: number | null;
  }
  const metaById = new Map<string, QuestionMeta>();
  const wanted = new Set(allIds);
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

  // Section raw-score tally. For multiple-choice rows raw = correct
  // count; for essay rows raw = sum of awarded essay scores. We
  // track the multiple-choice correct count separately so the score
  // report can distinguish "questions correct" from "raw points"
  // without UI confusion on essay-bearing exams.
  const rawBySection = new Map<string, number>();
  for (const sec of manifest.sections) rawBySection.set(sec.slug, 0);
  let mcCorrectCount = 0;

  for (const ans of answers) {
    const meta = metaById.get(ans.questionId);
    if (!meta) continue;
    const slug = sectionSlugById.get(meta.sectionId);
    if (meta.type === "essay") {
      const rubric = meta.rubricMd ?? "";
      const maxScore = meta.maxEssayScore ?? 6;
      const grade = await gradeEssay({
        promptMd: meta.promptMd,
        rubricMd: rubric,
        maxScore,
        essayResponse: ans.essayResponse ?? "",
      });
      db.update(examAttemptAnswers)
        .set({
          essayScore: grade.score,
          essayFeedbackMd: grade.feedbackMd,
          // isCorrect for essays = "passed at least half the rubric".
          // Used only by analytics; raw-score arithmetic uses the
          // numeric `essayScore` directly.
          isCorrect: grade.score >= Math.ceil(maxScore / 2) ? 1 : 0,
        })
        .where(eq(examAttemptAnswers.id, ans.id))
        .run();
      if (slug) rawBySection.set(slug, (rawBySection.get(slug) ?? 0) + grade.score);
    } else {
      const isCorrect =
        ans.selectedIndex !== null && ans.selectedIndex === meta.correctIndex;
      db.update(examAttemptAnswers)
        .set({ isCorrect: isCorrect ? 1 : 0 })
        .where(eq(examAttemptAnswers.id, ans.id))
        .run();
      if (isCorrect) {
        mcCorrectCount++;
        if (slug) {
          rawBySection.set(slug, (rawBySection.get(slug) ?? 0) + 1);
        }
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
    .where(eq(examAttempts.id, id))
    .run();

  return c.json({
    attemptId: id,
    rawTotal: result.rawTotal,
    // Number of multiple-choice questions answered correctly. The
    // UI uses this for the "X questions correct" line so essay-bearing
    // exams (GRE Analytical Writing) don't display "6 questions
    // correct" when the 6 came from a single essay's rubric score.
    mcCorrectCount,
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
