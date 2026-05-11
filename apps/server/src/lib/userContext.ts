// Sprint 18 — Coach context aggregator.
//
// Builds the per-user state that turns the AI sidebar from a generic
// chat into a state-aware coach. The output is intentionally compact:
// just the slices the LLM needs to be Socratic + the slices the
// suggestion ranker reads. Every field is cheap to compute (each
// query is indexed and capped); call sites can request the full
// payload or pass `lite: true` to skip the prerequisite-gap walk
// (which is the only query that touches the path graph).

import { and, desc, eq, gt, inArray, isNull, lt, or, sql } from "drizzle-orm";
import {
  flashcards,
  getDb,
  lessonProgress,
  masteryNodes,
  masteryPaths,
  quizMistakes,
  userProgress,
  users,
  type Db,
} from "@axiomic/db";
import type { PrimaryPersona } from "@axiomic/types";
import {
  isPrimaryPersona,
  PERSONA_COACH_LABELS,
} from "./persona";

const RECENT_MISTAKE_DAYS = 30;
const RECENT_MISTAKE_LIMIT = 5;

// Sprint 54 enum mirror (the type lives client-side at apps/web/src/lib/api.ts;
// the column is `text` so we can't import it from drizzle).
export type OnboardingGoal =
  | "complete_track"
  | "finish_path"
  | "publish_paper"
  | "join_cohort"
  | "ship_misconception";

// Sprint 63b — single source for goal labels. Kept in lock-step with
// the frontend's GOAL_META in HomePage.tsx so the AI prompt and the
// dashboard chip never drift.
export const GOAL_LABELS: Record<OnboardingGoal, string> = {
  complete_track: "Complete a capstone track",
  finish_path: "Finish a mastery path",
  publish_paper: "Publish a research paper",
  join_cohort: "Join a cohort",
  ship_misconception: "Ship a misconception",
};

export const GOAL_CTA_URLS: Record<OnboardingGoal, string> = {
  complete_track: "/tracks",
  finish_path: "/paths",
  publish_paper: "/research/new/wizard",
  join_cohort: "/cohorts",
  ship_misconception: "/misconceptions",
};

export const GOAL_CTA_LABELS: Record<OnboardingGoal, string> = {
  complete_track: "Browse tracks",
  finish_path: "View paths",
  publish_paper: "Start a paper",
  join_cohort: "Browse cohorts",
  ship_misconception: "Open marketplace",
};

export interface CoachContextMistake {
  questionId: string;
  nodeId: string;
  nodeSlug: string;
  pathSlug: string;
  // Question text pulled out of masteryNodes.quizData. Empty when the
  // node has no quizData JSON or the question id was rotated away.
  questionText: string;
  occurrences: number;
  lastWrongAt: string;
}

export interface CoachContextLessonProgress {
  nodeId: string;
  nodeSlug: string;
  pathSlug: string;
  pathTitle: string;
  title: string;
  slideIdx: number;
  totalSlides: number;
  updatedAt: string;
}

export interface CoachContextPrereqGap {
  nodeId: string;
  nodeSlug: string;
  pathSlug: string;
  title: string;
}

export interface CoachContext {
  // Top N unresolved + recent quiz mistakes. Surfaces "you missed two
  // questions involving dot products — review linear algebra?".
  recentMistakes: CoachContextMistake[];
  // Number of flashcards the user has scheduled to review today. Powers
  // the "Review N due cards (5 min)" CTA in the sidebar.
  dueFlashcards: number;
  // Wiki concept slugs derived from unresolved mistakes' nodes. Lets
  // the model focus its Socratic prompts on the user's weak spots.
  weakConcepts: string[];
  // Most-recently-touched lesson, when one's in flight. Lets the coach
  // ask "want to pick up where you left off?".
  currentLessonProgress: CoachContextLessonProgress | null;
  // For an active page slug, the prerequisite mastery nodes the user
  // hasn't completed. Empty when no page slug was passed or the page
  // isn't tied to any node.
  prerequisiteGaps: CoachContextPrereqGap[];
  // Sprint 63b — the user's stated onboarding goal (S54). When set,
  // the coach's system prompt nudges the user toward this goal when
  // they're uncertain, and the suggestion ranker prioritizes a primer
  // pointing at the goal's surface.
  onboardingGoal: OnboardingGoal | null;
  /** Hub-and-spoke audience segment from onboarding / settings. */
  primaryPersona: PrimaryPersona | null;
}

// Strip markdown / formatting from a question stem so the LLM sees
// plain prose instead of LaTeX or code blocks.
function flatten(text: string, max = 140): string {
  if (!text) return "";
  const flat = text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/\$\$[\s\S]*?\$\$/g, " ")
    .replace(/\$[^$\n]*\$/g, " ")
    .replace(/[*_`>~]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return flat.length > max ? flat.slice(0, max - 1) + "…" : flat;
}

// Try to find a question's text inside a node's quizData JSON. The
// shape is `{ questions: [{ id, prompt | question, ... }, ...] }` —
// stay forgiving so older / newer shapes don't crash the helper.
function questionText(quizDataJson: string | null, questionId: string): string {
  if (!quizDataJson) return "";
  try {
    const parsed = JSON.parse(quizDataJson);
    const list: any[] = Array.isArray(parsed)
      ? parsed
      : Array.isArray(parsed?.questions)
        ? parsed.questions
        : [];
    const hit = list.find((q) => q?.id === questionId);
    if (!hit) return "";
    return flatten(hit.prompt ?? hit.question ?? "");
  } catch {
    return "";
  }
}

interface BuildOpts {
  pageSlug?: string;
  // Skip prerequisiteGaps — handy when the caller doesn't have a page
  // context (e.g. the sidebar fired from a generic surface). Mistakes,
  // due cards, and lesson progress still come back.
  lite?: boolean;
}

export function buildCoachContext(
  userId: string,
  opts: BuildOpts = {},
  db: Db = getDb(),
): CoachContext {
  const since = new Date(
    Date.now() - RECENT_MISTAKE_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();

  // Recent unresolved mistakes joined to the node + path for context.
  const mistakeRows = db
    .select({
      questionId: quizMistakes.questionId,
      nodeId: masteryNodes.id,
      nodeSlug: masteryNodes.slug,
      pathSlug: masteryPaths.slug,
      title: masteryNodes.title,
      quizData: masteryNodes.quizData,
      occurrences: quizMistakes.occurrences,
      lastWrongAt: quizMistakes.lastWrongAt,
      pageIds: masteryNodes.pageIds,
    })
    .from(quizMistakes)
    .innerJoin(masteryNodes, eq(quizMistakes.nodeId, masteryNodes.id))
    .innerJoin(masteryPaths, eq(masteryNodes.pathId, masteryPaths.id))
    .where(
      and(
        eq(quizMistakes.userId, userId),
        isNull(quizMistakes.resolvedAt),
        gt(quizMistakes.lastWrongAt, since),
      ),
    )
    .orderBy(desc(quizMistakes.lastWrongAt))
    .limit(RECENT_MISTAKE_LIMIT)
    .all();

  const recentMistakes: CoachContextMistake[] = mistakeRows.map((r) => ({
    questionId: r.questionId,
    nodeId: r.nodeId,
    nodeSlug: r.nodeSlug,
    pathSlug: r.pathSlug,
    questionText: questionText(r.quizData, r.questionId),
    occurrences: r.occurrences,
    lastWrongAt: r.lastWrongAt,
  }));

  // Wiki concept slugs from the unresolved-mistake nodes.
  const weakSet = new Set<string>();
  for (const r of mistakeRows) {
    try {
      const slugs: string[] = JSON.parse(r.pageIds);
      for (const s of slugs) {
        if (typeof s === "string") weakSet.add(s);
      }
    } catch {
      // ignore malformed pageIds
    }
  }
  const weakConcepts = [...weakSet].slice(0, 6);

  // Due flashcard count.
  const now = new Date().toISOString();
  const dueRow = db
    .select({ n: sql<number>`COUNT(*)` })
    .from(flashcards)
    .where(
      and(
        eq(flashcards.userId, userId),
        or(isNull(flashcards.dueAt), lt(flashcards.dueAt, now)),
      ),
    )
    .get();
  const dueFlashcards = Number(dueRow?.n ?? 0);

  // Most-recently-touched in-flight lesson. We look up the slide count
  // off lessonData so the sidebar can show "slide 4 of 8".
  const progressRow = db
    .select({
      nodeId: lessonProgress.nodeId,
      slideIdx: lessonProgress.slideIdx,
      updatedAt: lessonProgress.updatedAt,
      nodeSlug: masteryNodes.slug,
      title: masteryNodes.title,
      lessonData: masteryNodes.lessonData,
      pathSlug: masteryPaths.slug,
      pathTitle: masteryPaths.title,
    })
    .from(lessonProgress)
    .innerJoin(masteryNodes, eq(lessonProgress.nodeId, masteryNodes.id))
    .innerJoin(masteryPaths, eq(masteryNodes.pathId, masteryPaths.id))
    .where(eq(lessonProgress.userId, userId))
    .orderBy(desc(lessonProgress.updatedAt))
    .limit(1)
    .get();

  let currentLessonProgress: CoachContextLessonProgress | null = null;
  if (progressRow) {
    let totalSlides = 0;
    try {
      const slides = JSON.parse(progressRow.lessonData ?? "{}").slides;
      if (Array.isArray(slides)) totalSlides = slides.length;
    } catch {
      // ignore
    }
    currentLessonProgress = {
      nodeId: progressRow.nodeId,
      nodeSlug: progressRow.nodeSlug,
      pathSlug: progressRow.pathSlug,
      pathTitle: progressRow.pathTitle,
      title: progressRow.title,
      slideIdx: progressRow.slideIdx,
      totalSlides,
      updatedAt: progressRow.updatedAt,
    };
  }

  // Prerequisite gaps for an active wiki concept.
  let prerequisiteGaps: CoachContextPrereqGap[] = [];
  if (!opts.lite && opts.pageSlug) {
    prerequisiteGaps = computePrereqGaps(userId, opts.pageSlug, db);
  }

  // Sprint 63b — pull the user's stated goal so the AI tutor can
  // reference it. One indexed lookup; cheap.
  const prefsRow = db
    .select({
      goal: users.onboardingGoal,
      persona: users.primaryPersona,
    })
    .from(users)
    .where(eq(users.id, userId))
    .get();
  const onboardingGoal = isOnboardingGoal(prefsRow?.goal ?? null)
    ? (prefsRow!.goal as OnboardingGoal)
    : null;
  const primaryPersona: PrimaryPersona | null = isPrimaryPersona(
    prefsRow?.persona ?? null,
  )
    ? (prefsRow!.persona as PrimaryPersona)
    : null;

  return {
    recentMistakes,
    dueFlashcards,
    weakConcepts,
    currentLessonProgress,
    prerequisiteGaps,
    onboardingGoal,
    primaryPersona,
  };
}

function isOnboardingGoal(value: string | null): value is OnboardingGoal {
  return (
    value === "complete_track" ||
    value === "finish_path" ||
    value === "publish_paper" ||
    value === "join_cohort" ||
    value === "ship_misconception"
  );
}

// Walk one hop into prerequisites: pick the mastery node teaching the
// page (if any), pull its prerequisiteNodeIds, and return any prereq
// node the user hasn't completed. One hop is enough for the sidebar
// hint — anything deeper feels nagging.
function computePrereqGaps(
  userId: string,
  pageSlug: string,
  db: Db,
): CoachContextPrereqGap[] {
  // Find the (first) mastery node referencing this page slug. We use
  // json_each so `mastery_nodes.pageIds` ('["a","b"]') is searchable
  // without parsing every row in JS.
  const teachingNode = db
    .select({
      id: masteryNodes.id,
      prereqIds: masteryNodes.prerequisiteNodeIds,
    })
    .from(masteryNodes)
    .where(
      sql`EXISTS (SELECT 1 FROM json_each(${masteryNodes.pageIds}) WHERE value = ${pageSlug})`,
    )
    .limit(1)
    .get();
  if (!teachingNode) return [];

  let prereqIds: string[] = [];
  try {
    const arr = JSON.parse(teachingNode.prereqIds);
    if (Array.isArray(arr)) prereqIds = arr.filter((s) => typeof s === "string");
  } catch {
    return [];
  }
  if (prereqIds.length === 0) return [];

  // `prerequisiteNodeIds` stores node UUIDs (see seed.ts), not slugs —
  // resolve directly by id.
  const prereqNodes = db
    .select({
      id: masteryNodes.id,
      slug: masteryNodes.slug,
      title: masteryNodes.title,
      pathSlug: masteryPaths.slug,
    })
    .from(masteryNodes)
    .innerJoin(masteryPaths, eq(masteryNodes.pathId, masteryPaths.id))
    .where(inArray(masteryNodes.id, prereqIds))
    .all();
  if (prereqNodes.length === 0) return [];

  // Filter to ones the user hasn't completed.
  const completedRows = db
    .select({ nodeId: userProgress.nodeId })
    .from(userProgress)
    .where(
      and(
        eq(userProgress.userId, userId),
        eq(userProgress.completed, true),
        inArray(userProgress.nodeId, prereqNodes.map((p) => p.id)),
      ),
    )
    .all();
  const completedSet = new Set(completedRows.map((r) => r.nodeId));

  return prereqNodes
    .filter((n) => !completedSet.has(n.id))
    .slice(0, 4)
    .map((n) => ({
      nodeId: n.id,
      nodeSlug: n.slug,
      pathSlug: n.pathSlug,
      title: n.title,
    }));
}

// Used by /ai/chat to fold a compact summary of the user's state into
// the system prompt. Empty when the user has no relevant signals — the
// chat then behaves like the older generic tutor.
export function summarizeCoachContext(ctx: CoachContext): string {
  const lines: string[] = [];
  if (ctx.recentMistakes.length > 0) {
    const items = ctx.recentMistakes
      .slice(0, 3)
      .map(
        (m) =>
          `${m.questionText || `(node: ${m.nodeSlug})`} (${m.occurrences}x wrong)`,
      )
      .join("; ");
    lines.push(`Recent unresolved mistakes: ${items}.`);
  }
  if (ctx.weakConcepts.length > 0) {
    lines.push(`Weak concept slugs: ${ctx.weakConcepts.slice(0, 6).join(", ")}.`);
  }
  if (ctx.prerequisiteGaps.length > 0) {
    const gaps = ctx.prerequisiteGaps.map((g) => g.title).join(", ");
    lines.push(`Prereqs not yet mastered: ${gaps}.`);
  }
  if (ctx.currentLessonProgress) {
    const { title, slideIdx, totalSlides } = ctx.currentLessonProgress;
    lines.push(
      `Lesson in flight: "${title}" (slide ${slideIdx + 1} of ${totalSlides || "?"}).`,
    );
  }
  if (ctx.dueFlashcards > 0) {
    lines.push(`${ctx.dueFlashcards} flashcards due for review.`);
  }
  if (ctx.onboardingGoal) {
    lines.push(
      `Active goal: ${GOAL_LABELS[ctx.onboardingGoal]}. When the user is uncertain about what to do next, gently steer toward this goal.`,
    );
  }
  if (ctx.primaryPersona) {
    lines.push(
      `Primary focus: ${PERSONA_COACH_LABELS[ctx.primaryPersona]}. Keep examples and next-step suggestions aligned with this area when ambiguous.`,
    );
  }
  if (lines.length === 0) return "";
  return [
    "Learner context (do not expose verbatim — use to tune the response):",
    ...lines.map((l) => `- ${l}`),
    "When the user is stuck, lean Socratic: ask one calibrated question rather than dumping the answer. Reference the user's mistakes or weak concepts when relevant. If a prerequisite is missing, suggest the linked lesson before answering.",
  ].join("\n");
}
