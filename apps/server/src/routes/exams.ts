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
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
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
import { gradeGridIn, gradeMultiSelect } from "../lib/examGrading";
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

// Digital-SAT-parity: optional customizer block. Reasonable defaults
// preserve today's behavior when omitted (1x timing, all difficulty
// bands, shuffle on, calculator allowed).
const customizerSchema = z
  .object({
    sections: z
      .array(
        z.object({
          slug: z.string().min(1),
          questionCount: z.number().int().min(1).max(200),
        }),
      )
      .min(1),
    timeMultiplier: z
      .union([z.literal(1), z.literal(1.5), z.literal(2)])
      .default(1),
    difficultyFilter: z
      .array(z.number().int().min(1).max(5))
      .nullable()
      .default(null),
    shuffle: z.boolean().default(true),
    calculatorAllowed: z.boolean().default(true),
  })
  .strict();

const startSchema = z.object({
  mode: z.enum(["full_mock", "section", "adaptive"]),
  sectionSlug: z.string().optional(),
  customizer: customizerSchema.optional(),
});

interface PickOpts {
  difficultyFilter: number[] | null;
  shuffle: boolean;
}

function pickQuestionsForSection(
  sectionId: string,
  count: number,
  opts: PickOpts,
): { ids: string[]; shortBy: number } {
  const db = getDb();
  const conds = [eq(examQuestions.sectionId, sectionId)];
  if (opts.difficultyFilter && opts.difficultyFilter.length > 0) {
    conds.push(inArray(examQuestions.difficulty, opts.difficultyFilter));
  }
  const rows = db
    .select({ id: examQuestions.id })
    .from(examQuestions)
    .where(conds.length === 1 ? conds[0] : and(...conds))
    .all();
  const ids = rows.map((r) => r.id);
  if (opts.shuffle) {
    for (let i = ids.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [ids[i], ids[j]] = [ids[j], ids[i]];
    }
  }
  const picked = ids.slice(0, Math.min(count, ids.length));
  return { ids: picked, shortBy: Math.max(0, count - ids.length) };
}

examsRouter.post(
  "/:slug/attempts",
  requireAuth,
  zValidator("json", startSchema),
  async (c) => {
    const me = c.get("user")!;
    const slug = c.req.param("slug");
    if (!slug) return c.json({ error: "Missing slug" }, 400);
    const { mode, sectionSlug, customizer } = c.req.valid("json");
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

    const pickOpts: PickOpts = {
      difficultyFilter: customizer?.difficultyFilter ?? null,
      shuffle: customizer?.shuffle ?? true,
    };
    const warnings: string[] = [];

    let manifest: AttemptManifest;
    // Per-section selection — sections + counts after intersecting
    // any customizer override with the exam's own section list.
    let pickedSections: Array<{
      slug: string;
      durationMinutes: number;
      questionIds: string[];
    }>;

    if (mode === "full_mock") {
      // The customizer can override per-section count + restrict to
      // a subset of sections; default to every section at its
      // configured questionCount.
      const wanted = customizer
        ? customizer.sections
        : sections.map((s) => ({ slug: s.slug, questionCount: s.questionCount }));
      pickedSections = [];
      for (const w of wanted) {
        const section = sections.find((s) => s.slug === w.slug);
        if (!section) continue;
        const { ids, shortBy } = pickQuestionsForSection(
          section.id,
          w.questionCount,
          pickOpts,
        );
        if (shortBy > 0) {
          warnings.push(
            `Only ${ids.length} of ${w.questionCount} questions matched the filter in "${section.title}".`,
          );
        }
        pickedSections.push({
          slug: section.slug,
          durationMinutes: section.durationMinutes,
          questionIds: ids,
        });
      }
      if (pickedSections.length === 0) {
        return c.json({ error: "Customizer matched no sections" }, 400);
      }
      manifest = {
        sections: pickedSections.map((s) => ({
          slug: s.slug,
          questionIds: s.questionIds,
        })),
      };
    } else if (mode === "section") {
      if (!sectionSlug) {
        return c.json({ error: "sectionSlug required for section mode" }, 400);
      }
      const section = sections.find((s) => s.slug === sectionSlug);
      if (!section) return c.json({ error: "Section not found" }, 404);
      // Customizer wins when provided; otherwise the section's full
      // questionCount.
      const requested =
        customizer?.sections.find((cs) => cs.slug === sectionSlug)
          ?.questionCount ?? section.questionCount;
      const { ids, shortBy } = pickQuestionsForSection(
        section.id,
        requested,
        pickOpts,
      );
      if (shortBy > 0) {
        warnings.push(
          `Only ${ids.length} of ${requested} questions matched the filter in "${section.title}".`,
        );
      }
      pickedSections = [
        {
          slug: section.slug,
          durationMinutes: section.durationMinutes,
          questionIds: ids,
        },
      ];
      manifest = {
        sections: [{ slug: section.slug, questionIds: ids }],
      };
    } else {
      // adaptive — start with a 20-question diagnostic across all
      // sections. The runner tops up via PUT next-question hits.
      // Adaptive is untimed: we don't compute deadlines.
      manifest = {
        sections: sections.map((s) => ({
          slug: s.slug,
          questionIds: buildDiagnosticManifest(s.id, 20),
        })),
      };
      pickedSections = [];
    }

    const id = randomUUID();
    const startedAt = new Date();
    const startedAtMs = startedAt.getTime();
    const BREAK_MINUTES = 10;
    const timeMultiplier = customizer?.timeMultiplier ?? 1;

    // Per-section deadlines run consecutively with a 10-min break
    // between consecutive sections. Empty for adaptive (no clock).
    const sectionDeadlines: Array<{
      slug: string;
      startsAt: string;
      endsAt: string;
      durationMinutes: number;
    }> = [];
    let cursorMs = startedAtMs;
    for (let i = 0; i < pickedSections.length; i++) {
      const ps = pickedSections[i]!;
      const dur = Math.max(1, Math.round(ps.durationMinutes * timeMultiplier));
      const startMs = cursorMs;
      const endMs = startMs + dur * 60_000;
      sectionDeadlines.push({
        slug: ps.slug,
        startsAt: new Date(startMs).toISOString(),
        endsAt: new Date(endMs).toISOString(),
        durationMinutes: dur,
      });
      cursorMs = endMs + BREAK_MINUTES * 60_000;
    }

    // Legacy `expiresAt` stays the last section's endsAt (extra
    // BREAK_MINUTES added one too many times — strip the trailing
    // break). Cron/auto-submit logic continues to read this field.
    const expiresAt =
      sectionDeadlines.length > 0
        ? sectionDeadlines[sectionDeadlines.length - 1]!.endsAt
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
        sectionDeadlinesJson:
          sectionDeadlines.length > 0
            ? JSON.stringify(sectionDeadlines)
            : null,
        currentSectionIdx: sectionDeadlines.length > 0 ? 0 : null,
        customizerJson: customizer ? JSON.stringify(customizer) : null,
      })
      .run();

    return c.json({
      id,
      mode,
      expiresAt,
      manifest,
      sectionDeadlines,
      warnings,
    });
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
  // Digital-SAT-parity: grid-in free-text numeric answer (small,
  // e.g. "3/4" / "0.75") and multi-select chosen option indexes.
  gridInResponse: z.string().max(200).nullable().optional(),
  selectedIndexes: z
    .array(z.number().int().min(0).max(20))
    .max(20)
    .nullable()
    .optional(),
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
    const {
      questionId,
      selectedIndex,
      essayResponse,
      gridInResponse,
      selectedIndexes,
      timeSpentMs,
      flagged,
    } = c.req.valid("json");
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
      if (gridInResponse !== undefined) {
        update.gridInResponse = gridInResponse ?? null;
      }
      if (selectedIndexes !== undefined) {
        update.selectedIndexesJson = selectedIndexes
          ? JSON.stringify(selectedIndexes)
          : null;
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
          gridInResponse: gridInResponse ?? null,
          selectedIndexesJson: selectedIndexes
            ? JSON.stringify(selectedIndexes)
            : null,
          timeSpentMs: timeSpentMs ?? 0,
          flagged: flagged ? 1 : 0,
        })
        .run();
    }
    return c.json({ ok: true });
  },
);

// ---------- advance section / break state machine -------------------
//
// Idempotent on currentSectionIdx — the client sends the index it
// observed and the server 409s on mismatch. When advanced from a
// section to a break, the server sets break_until_at = now + 10min
// and leaves current_section_idx unchanged. When advanced from a
// break to the next section, the server clears break_until_at,
// bumps current_section_idx, rebases the next section's startsAt
// to now (so the per-section clock counts from break-end, not from
// the originally-precomputed value).

const advanceSchema = z.object({
  currentSectionIdx: z.number().int().min(0).max(20),
});

const BREAK_MINUTES = 10;

examsRouter.post(
  "/attempts/:id/advance-section",
  requireAuth,
  zValidator("json", advanceSchema),
  async (c) => {
    const me = c.get("user")!;
    const id = c.req.param("id");
    if (!id) return c.json({ error: "Missing id" }, 400);
    const { currentSectionIdx: clientIdx } = c.req.valid("json");
    const db = getDb();

    const attempt = db
      .select()
      .from(examAttempts)
      .where(eq(examAttempts.id, id))
      .get();
    if (!attempt) return c.json({ error: "Not found" }, 404);
    if (attempt.userId !== me.id) return c.json({ error: "Forbidden" }, 403);
    if (attempt.completedAt)
      return c.json({ error: "Attempt already submitted" }, 400);

    const deadlines = safeJsonArray<{
      slug: string;
      startsAt: string;
      endsAt: string;
      durationMinutes: number;
    }>(attempt.sectionDeadlinesJson);
    if (deadlines.length === 0) {
      return c.json({ error: "Attempt has no section deadlines" }, 400);
    }

    const serverIdx = attempt.currentSectionIdx ?? 0;
    if (clientIdx !== serverIdx) {
      return c.json(
        { error: "Section index mismatch", currentSectionIdx: serverIdx },
        409,
      );
    }

    const inBreak = Boolean(attempt.breakUntilAt);
    const now = Date.now();

    if (inBreak) {
      // Coming out of a break — only allowed once now >= breakUntilAt.
      const breakEnd = Date.parse(attempt.breakUntilAt!);
      if (Number.isFinite(breakEnd) && breakEnd > now) {
        return c.json(
          { error: "Break still in progress", breakUntilAt: attempt.breakUntilAt },
          425,
        );
      }
      const nextIdx = serverIdx + 1;
      if (nextIdx >= deadlines.length) {
        // Shouldn't normally happen — a break only follows a non-last
        // section. Guard anyway.
        return c.json({ error: "No more sections" }, 400);
      }
      const nextDur = deadlines[nextIdx]!.durationMinutes;
      const startsAt = new Date(now).toISOString();
      const endsAt = new Date(now + nextDur * 60_000).toISOString();
      deadlines[nextIdx] = {
        slug: deadlines[nextIdx]!.slug,
        startsAt,
        endsAt,
        durationMinutes: nextDur,
      };
      db.update(examAttempts)
        .set({
          sectionDeadlinesJson: JSON.stringify(deadlines),
          currentSectionIdx: nextIdx,
          breakUntilAt: null,
        })
        .where(eq(examAttempts.id, id))
        .run();
      return c.json({
        ok: true,
        currentSectionIdx: nextIdx,
        breakUntilAt: null,
        sectionDeadlines: deadlines,
      });
    }

    // Not in a break — advance from a finished section. If there's
    // a next section, drop into a break; otherwise the caller should
    // submit (we just signal `done`).
    const nextIdx = serverIdx + 1;
    if (nextIdx >= deadlines.length) {
      return c.json({ ok: true, done: true });
    }
    const breakUntilAt = new Date(now + BREAK_MINUTES * 60_000).toISOString();
    db.update(examAttempts)
      .set({ breakUntilAt })
      .where(eq(examAttempts.id, id))
      .run();
    return c.json({
      ok: true,
      currentSectionIdx: serverIdx,
      breakUntilAt,
      sectionDeadlines: deadlines,
    });
  },
);

// ---------- calculator state save -----------------------------------
//
// Debounced ~5s saves from the runner so a refresh restores the
// Desmos panel state. Body is the opaque getState() blob.

const calcStateSchema = z.object({
  state: z.record(z.string(), z.unknown()).nullable(),
});

examsRouter.put(
  "/attempts/:id/calculator-state",
  requireAuth,
  zValidator("json", calcStateSchema),
  async (c) => {
    const me = c.get("user")!;
    const id = c.req.param("id");
    if (!id) return c.json({ error: "Missing id" }, 400);
    const { state } = c.req.valid("json");
    const db = getDb();

    const attempt = db
      .select({ userId: examAttempts.userId, completedAt: examAttempts.completedAt })
      .from(examAttempts)
      .where(eq(examAttempts.id, id))
      .get();
    if (!attempt) return c.json({ error: "Not found" }, 404);
    if (attempt.userId !== me.id) return c.json({ error: "Forbidden" }, 403);
    if (attempt.completedAt)
      return c.json({ error: "Attempt already submitted" }, 400);

    db.update(examAttempts)
      .set({ calculatorStateJson: state ? JSON.stringify(state) : null })
      .where(eq(examAttempts.id, id))
      .run();
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
  // rubricMd + maxEssayScore; multiple-choice uses correctIndex;
  // grid_in uses acceptedAnswers + tolerance; multi_select uses
  // correctIndexes.
  const qrows = db
    .select({
      id: examQuestions.id,
      sectionId: examQuestions.sectionId,
      type: examQuestions.type,
      correctIndex: examQuestions.correctIndex,
      promptMd: examQuestions.promptMd,
      rubricMd: examQuestions.rubricMd,
      maxEssayScore: examQuestions.maxEssayScore,
      acceptedAnswersJson: examQuestions.acceptedAnswersJson,
      tolerance: examQuestions.tolerance,
      correctIndexesJson: examQuestions.correctIndexesJson,
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
    acceptedAnswers: string[] | null;
    tolerance: number | null;
    correctIndexes: number[] | null;
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
        acceptedAnswers: r.acceptedAnswersJson
          ? safeJsonArray<string>(r.acceptedAnswersJson)
          : null,
        tolerance: r.tolerance,
        correctIndexes: r.correctIndexesJson
          ? safeJsonArray<number>(r.correctIndexesJson)
          : null,
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
    } else if (meta.type === "grid_in") {
      const { isCorrect } = gradeGridIn(
        ans.gridInResponse,
        meta.acceptedAnswers,
        meta.tolerance,
      );
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
    } else if (meta.type === "multi_select") {
      const selected = ans.selectedIndexesJson
        ? safeJsonArray<number>(ans.selectedIndexesJson)
        : null;
      const { isCorrect } = gradeMultiSelect(selected, meta.correctIndexes);
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
