import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import {
  getDb,
  masteryPaths,
  masteryNodes,
  lessonVersions,
  lessonEditReports,
  lessonSlideEvents,
  newsArticles,
  userProgress,
  users,
  lessonProgress,
  lessonNotes,
  quizMistakes,
  flashcards,
  quizAttempts,
  petQuests,
  pets,
  signedCredentials,
} from "@axiomic/db";
import { eq, and, desc, inArray, ne, asc, sql, isNull } from "drizzle-orm";
import { randomUUID } from "crypto";
import { requireAuth, getSessionUser } from "../middleware/auth";
import { notify } from "../lib/notifications";
import { fireDetectorForUserAsync } from "../lib/misconceptionDetector";
import { recordActivityAndEvaluate } from "../lib/achievements";
import { grantXp } from "../lib/xp";
import { invalidateSearchIndex } from "../lib/searchIndex";
import { gradeQuestion } from "../lib/quizGrading";
import { flashcardFromQuestion } from "../lib/flashcardFromQuestion";
import { rankPapersForUser } from "../lib/recommend";
import {
  computeAxiomicScore,
  signAxiomicScore,
} from "../lib/compositeScore";
import { forumTopicsForNode } from "../lib/crossLinks";
import { publishToDraft } from "../lib/liveBus";
import { createProposal, isApprovalGateEnabled } from "../lib/approvals";
import { pageParams } from "../lib/pagination";
import type { Env } from "../env";

const mastery = new Hono<Env>();

const LEVEL_ORDER = ["apprentice", "practitioner", "specialist", "expert", "researcher"] as const;
type Level = typeof LEVEL_ORDER[number];

function levelIndex(level: string): number {
  const i = LEVEL_ORDER.indexOf(level as Level);
  return i === -1 ? -1 : i;
}

function isLevel(level: string): level is Level {
  return levelIndex(level) >= 0;
}

const LEVEL_TITLE: Record<Level, string> = {
  apprentice: "Apprentice",
  practitioner: "Practitioner",
  specialist: "Specialist",
  expert: "Expert",
  researcher: "Researcher",
};

// List mastery paths
mastery.get("/paths", async (c) => {
  const db = getDb();
  const paths = db.select().from(masteryPaths).all();
  return c.json({ paths });
});

// Per-user path completion summary. For each path returns the user's
// completed-node count + total. Returns empty arrays for anonymous
// viewers. Used by /discover, /paths, and the progress dashboard to
// render completion% chips on path cards without N+1 queries.
mastery.get("/paths-completion", async (c) => {
  const session = await getSessionUser(c);
  if (!session) return c.json({ completion: [] });
  const db = getDb();
  // One aggregate query: for each path, count nodes total + count
  // (node × this user's completed progress) where applicable.
  const rows = db
    .select({
      pathSlug: masteryPaths.slug,
      total: sql<number>`COUNT(${masteryNodes.id})`,
      completed: sql<number>`SUM(CASE WHEN ${userProgress.completed} = 1 AND ${userProgress.userId} = ${session.id} THEN 1 ELSE 0 END)`,
    })
    .from(masteryPaths)
    .innerJoin(masteryNodes, eq(masteryNodes.pathId, masteryPaths.id))
    .leftJoin(
      userProgress,
      and(eq(userProgress.nodeId, masteryNodes.id), eq(userProgress.userId, session.id)),
    )
    .groupBy(masteryPaths.slug)
    .all();
  return c.json({
    completion: rows.map((r) => ({
      pathSlug: r.pathSlug,
      total: Number(r.total ?? 0),
      completed: Number(r.completed ?? 0),
      fraction: Number(r.total ?? 0) > 0 ? Number(r.completed ?? 0) / Number(r.total) : 0,
    })),
  });
});

// Get mastery path with nodes and progress
mastery.get("/paths/:slug", async (c) => {
  const slug = c.req.param("slug");
  const db = getDb();
  const user = await getSessionUser(c);

  const path = db.select().from(masteryPaths).where(eq(masteryPaths.slug, slug)).get();
  if (!path) return c.json({ error: "Path not found" }, 404);

  const rawNodes = db
    .select()
    .from(masteryNodes)
    .where(eq(masteryNodes.pathId, path.id))
    .all();

  // Estimate per-node time from quiz/lesson size + page count. Cheap
  // heuristic — tunable later. Authored lessons get more weight than
  // quiz-only nodes; multi-page nodes get extra reading time.
  const estimateMinutes = (n: (typeof rawNodes)[number], pageIds: string[]): number => {
    let total = 5; // base
    if (n.lessonData) {
      try {
        const slides = JSON.parse(n.lessonData)?.slides ?? [];
        total += Math.max(8, slides.length * 2);
      } catch {
        total += 8;
      }
    }
    if (n.quizData) {
      try {
        const qs = JSON.parse(n.quizData);
        if (Array.isArray(qs)) total += qs.length * 2;
      } catch {
        total += 5;
      }
    }
    total += Math.max(0, pageIds.length - 1) * 4;
    return total;
  };

  // Defensive parse helper — a single corrupted row in pageIds /
  // prerequisiteNodeIds shouldn't 500 the whole path index. Falls
  // back to an empty array so downstream code (linkedTopics,
  // estimateMinutes, the route response) keeps working.
  const safeParseArray = (raw: string | null | undefined): string[] => {
    if (!raw) return [];
    try {
      const v = JSON.parse(raw);
      return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
    } catch {
      return [];
    }
  };

  const nodes = rawNodes.map((n) => {
    const pageIds = safeParseArray(n.pageIds);
    const prerequisiteNodeIds = safeParseArray(n.prerequisiteNodeIds);
    // Sprint 16 — surface up to 3 forum topics tagged to this node's
    // wiki pages. Lets the path overview show "Discuss" chips inline.
    const linkedTopics = forumTopicsForNode(n.id, 3);
    return {
      ...n,
      pageIds,
      prerequisiteNodeIds,
      hasLesson: !!n.lessonData,
      lessonData: undefined,
      quizData: undefined,
      estimatedMinutes: estimateMinutes(n, pageIds),
      linkedTopics,
    };
  });

  let progress: any[] = [];
  const nodeMastery: Record<string, number> = {};
  let lastVisitedNodeSlug: string | null = null;

  if (user) {
    progress = db
      .select({
        nodeId: userProgress.nodeId,
        completed: userProgress.completed,
        quizScore: userProgress.quizScore,
        completedAt: userProgress.completedAt,
      })
      .from(userProgress)
      .where(eq(userProgress.userId, user.id))
      .all();

    const progressByNode = new Map(progress.map((p) => [p.nodeId, p]));

    // Per-node mastery 0..100 = 70% quiz score + 30% lesson presence
    // (or completion). Pure quiz nodes get the full 100 for a perfect
    // quiz; nodes with no quiz data fall back to completion.
    for (const n of rawNodes) {
      const p = progressByNode.get(n.id);
      let score = 0;
      if (p?.quizScore != null) {
        score = Math.round(p.quizScore * 100);
      } else if (p?.completed) {
        score = 100;
      }
      // Lesson bonus: completing the lesson beats quiz alone.
      if (p?.completed && score < 100) score = Math.min(100, score + 30);
      nodeMastery[n.id] = score;
    }

    // Resume target: most-recently-touched lesson position OR most
    // recent completion on this path.
    const myLessonProgress = db
      .select({
        nodeId: lessonProgress.nodeId,
        updatedAt: lessonProgress.updatedAt,
      })
      .from(lessonProgress)
      .innerJoin(masteryNodes, eq(lessonProgress.nodeId, masteryNodes.id))
      .where(
        and(
          eq(lessonProgress.userId, user.id),
          eq(masteryNodes.pathId, path.id),
        ),
      )
      .orderBy(desc(lessonProgress.updatedAt))
      .limit(1)
      .get();
    if (myLessonProgress) {
      const node = rawNodes.find((n) => n.id === myLessonProgress.nodeId);
      if (node) lastVisitedNodeSlug = node.slug;
    }
    if (!lastVisitedNodeSlug) {
      const recentCompletion = progress
        .filter((p) => p.completed && p.completedAt)
        .sort((a, b) => (a.completedAt! < b.completedAt! ? 1 : -1))[0];
      if (recentCompletion) {
        const node = rawNodes.find((n) => n.id === recentCompletion.nodeId);
        if (node) lastVisitedNodeSlug = node.slug;
      }
    }
  }

  // Lock state is intentionally always-unlocked: lessons are open to
  // everyone, and the prereq list is informational only. Kept on the
  // wire for backward compatibility with clients that still read it.
  const lockState: Record<string, boolean> = {};
  for (const n of nodes) lockState[n.id] = false;

  return c.json({
    path,
    nodes,
    progress,
    nodeMastery,
    lockState,
    lastVisitedNodeSlug,
  });
});

// Mark node complete. Idempotent: re-marking an already-completed node
// is a no-op and never re-fires the level-up notification. A genuinely
// new completion that crosses a level boundary on this path triggers a
// `mastery_level_up` notification to the same user (self-notify, with
// actorId=null so the notify() self-skip doesn't drop it).
mastery.post("/progress/:nodeId/complete", requireAuth, async (c) => {
  const nodeId = c.req.param("nodeId")!;
  const user = c.get("user")!;
  const db = getDb();

  const node = db
    .select()
    .from(masteryNodes)
    .where(eq(masteryNodes.id, nodeId))
    .get();
  if (!node) return c.json({ error: "Node not found" }, 404);

  const existing = db
    .select()
    .from(userProgress)
    .where(and(eq(userProgress.userId, user.id), eq(userProgress.nodeId, nodeId)))
    .get();

  // Re-marking an already-completed node is a no-op for both DB and
  // notifications. Without this guard the notification would re-fire
  // on every click after a user crossed a level boundary.
  const wasAlreadyCompleted = !!(existing && existing.completed);

  if (existing) {
    if (!existing.completed) {
      db.update(userProgress)
        .set({ completed: true, completedAt: new Date().toISOString() })
        .where(eq(userProgress.id, existing.id))
        .run();
    }
  } else {
    db.insert(userProgress).values({
      id: randomUUID(),
      userId: user.id,
      nodeId,
      completed: true,
      completedAt: new Date().toISOString(),
    }).run();
  }

  // Level-up check: was this the first completed node at `node.level` for
  // this path? Compare highest previously-completed level vs new level.
  if (!wasAlreadyCompleted && isLevel(node.level)) {
    try {
      const path = db
        .select({ slug: masteryPaths.slug, title: masteryPaths.title })
        .from(masteryPaths)
        .where(eq(masteryPaths.id, node.pathId))
        .get();

      // All completed nodes (other than the one we just inserted) on this
      // path, with their levels. Excluding the current nodeId is essential
      // because the row we just inserted/updated would otherwise be in the
      // result set and the level transition would always look stationary.
      const otherCompleted = db
        .select({ level: masteryNodes.level })
        .from(userProgress)
        .innerJoin(masteryNodes, eq(userProgress.nodeId, masteryNodes.id))
        .where(
          and(
            eq(userProgress.userId, user.id),
            eq(userProgress.completed, true),
            eq(masteryNodes.pathId, node.pathId),
            ne(userProgress.nodeId, nodeId),
          ),
        )
        .all();

      // Highest level previously reached on this path, considering ALL
      // other completed nodes (including same-level peers). The level-up
      // fires only when the new completion strictly raises the bar — so
      // the SECOND apprentice node doesn't re-fire the apprentice
      // notification, and stepping back to a lower level is silent.
      let prevHighest = -1;
      for (const r of otherCompleted) {
        const idx = levelIndex(r.level);
        if (idx > prevHighest) prevHighest = idx;
      }

      const newIdx = levelIndex(node.level);
      if (newIdx > prevHighest && path) {
        await notify({
          recipientId: user.id,
          actorId: null,
          kind: "mastery_level_up",
          subjectType: "mastery_node",
          subjectId: nodeId,
          contextSlug: path.slug,
          preview: `You've reached ${LEVEL_TITLE[node.level as Level]} on ${path.title}.`,
        });
      }
    } catch (err) {
      console.error("level-up notification failed", err);
    }
  }

  // Activity + achievements: only fire when this is a fresh completion,
  // so re-marking an already-complete node doesn't pollute the activity
  // log or claim duplicate progress against streaks.
  let newAchievements: string[] = [];
  let petHatched: { species: string; name: string } | undefined;
  let xpAwarded = 0;
  let petLeveledUp: { newLevel: number } | undefined;
  if (!wasAlreadyCompleted) {
    newAchievements = recordActivityAndEvaluate(user.id, "node_completed");
    // S86 — XP grant for completing a mastery node. classId=null
    // since this isn't a class-scoped action; counts toward total XP
    // (which is what triggers pet hatching) but not any class
    // leaderboard.
    const xp = grantXp({
      userId: user.id,
      source: "lesson-completed",
      sourceRefId: nodeId,
    });
    if (xp.petHatched) petHatched = xp.petHatched;
    xpAwarded = xp.amount ?? 0;
    petLeveledUp = xp.petLeveledUp;
  }

  return c.json({
    ok: true,
    newAchievements,
    petHatched,
    xpAwarded,
    petLeveledUp,
  });
});

// Phase 1b — append-only attempt history (confidence + retry
// analytics). One row per recorded attempt; attemptNo is the
// 1-based ordinal for this (user, question). user_progress.quiz_
// score still overwrites; this table is the durable history that
// Phase 4 calibration reads.
const attemptSchema = z.object({
  questionId: z.string().min(1).max(80),
  slideIdx: z.number().int().min(0).max(199).optional(),
  correct: z.boolean(),
  confidence: z.number().int().min(0).max(3).optional(),
  answerJson: z.string().max(20000).optional(),
});

mastery.post(
  "/nodes/:nodeId/attempt",
  requireAuth,
  zValidator("json", attemptSchema),
  async (c) => {
    const nodeId = c.req.param("nodeId")!;
    const user = c.get("user")!;
    const { questionId, slideIdx, correct, confidence, answerJson } =
      c.req.valid("json");
    const db = getDb();
    const prior = db
      .select({ count: sql<number>`count(*)`.as("count") })
      .from(quizAttempts)
      .where(
        and(
          eq(quizAttempts.userId, user.id),
          eq(quizAttempts.questionId, questionId),
        ),
      )
      .get();
    db.insert(quizAttempts)
      .values({
        id: randomUUID(),
        userId: user.id,
        nodeId,
        questionId,
        slideIdx: slideIdx ?? null,
        attemptNo: (prior?.count ?? 0) + 1,
        correct,
        confidence: confidence ?? null,
        answerJson: answerJson ?? null,
      })
      .run();

    // Phase 2c — wire the embedded-lesson miss into the same
    // misconception pipeline the standalone /quiz uses: upsert the
    // mistakes log (so the detector, Knowledge MRI and coach context
    // see it) and, on a miss, kick the detector. Best-effort.
    const nowIso = new Date().toISOString();
    const existingMistake = db
      .select()
      .from(quizMistakes)
      .where(
        and(
          eq(quizMistakes.userId, user.id),
          eq(quizMistakes.nodeId, nodeId),
          eq(quizMistakes.questionId, questionId),
        ),
      )
      .get();
    if (!correct) {
      if (existingMistake) {
        db.update(quizMistakes)
          .set({
            occurrences: existingMistake.occurrences + 1,
            lastWrongAt: nowIso,
            resolvedAt: null,
          })
          .where(eq(quizMistakes.id, existingMistake.id))
          .run();
      } else {
        db.insert(quizMistakes)
          .values({
            id: randomUUID(),
            userId: user.id,
            nodeId,
            questionId,
            occurrences: 1,
            lastWrongAt: nowIso,
          })
          .run();
      }
      fireDetectorForUserAsync(user.id);
    } else if (existingMistake && !existingMistake.resolvedAt) {
      db.update(quizMistakes)
        .set({ resolvedAt: nowIso })
        .where(eq(quizMistakes.id, existingMistake.id))
        .run();
    }
    return c.json({ ok: true });
  },
);

// Phase 2d — "explore the frontier" card. Reuses the persona/
// interest-aware for-you ranker (rankPapersForUser, which has an
// anonymous citation+recency fallback built in) so the lesson can
// connect a concept to real current research. Best-effort: any
// failure (no embeddings/provider in this env) returns an empty
// list and the card simply doesn't render — never breaks a lesson.
// nodeId stays in the path for future concept-biasing without an
// API change.
mastery.get("/nodes/:nodeId/frontier", async (c) => {
  const user = await getSessionUser(c);
  try {
    const ranked = await rankPapersForUser(user?.id ?? null, {
      limit: 3,
      excludeOwnPapers: true,
    });
    const papers = ranked.slice(0, 3).map((r) => ({
      kind: r.paper.kind,
      slug: r.paper.slug,
      title: r.paper.title,
      snippet: r.paper.snippet,
      reason: r.reason,
      htmlUrl:
        r.paper.kind === "external_paper" ? r.paper.htmlUrl : null,
    }));
    return c.json({ papers });
  } catch (err) {
    console.error("frontier card ranking failed", err);
    return c.json({ papers: [] });
  }
});

// Phase 4 — confidence calibration. Aggregates the Phase-1b
// quiz_attempts confidence vs. correctness so the learner can see
// where they're over/under-confident ("confidently wrong" is the
// signal the misconception detector also keys on). Pure read.
mastery.get("/me/calibration", requireAuth, async (c) => {
  const user = c.get("user")!;
  const db = getDb();
  const rows = db
    .select({
      confidence: quizAttempts.confidence,
      n: sql<number>`count(*)`.as("n"),
      correct: sql<number>`sum(case when ${quizAttempts.correct} then 1 else 0 end)`.as(
        "correct",
      ),
    })
    .from(quizAttempts)
    .where(eq(quizAttempts.userId, user.id))
    .groupBy(quizAttempts.confidence)
    .all();
  const LABELS: Record<number, string> = {
    0: "Guessed",
    1: "Unsure",
    2: "Confident",
    3: "Certain",
  };
  const buckets = rows
    .filter((r) => r.confidence != null)
    .map((r) => {
      const n = Number(r.n);
      return {
        confidence: r.confidence as number,
        label: LABELS[r.confidence as number] ?? String(r.confidence),
        n,
        accuracy: n > 0 ? Number(r.correct) / n : 0,
      };
    })
    .sort((a, b) => a.confidence - b.confidence);
  return c.json({ buckets });
});

// Phase 5b — mistake-driven pet quest. The pet "wants to learn"
// the learner's most-missed concept; clearing its review (the
// source quiz_mistake getting resolved) completes the quest.
// Lazy reconcile on read (no coupling into the resolve write
// paths); auto-generates the next quest from the top unresolved
// mistake. Reuses the Phase-0 pet_quests table.
mastery.get("/me/pet-quest", requireAuth, async (c) => {
  const user = c.get("user")!;
  const db = getDb();
  const pet = db.select().from(pets).where(eq(pets.userId, user.id)).get();
  if (!pet) return c.json({ quest: null });

  const active = db
    .select()
    .from(petQuests)
    .where(and(eq(petQuests.userId, user.id), eq(petQuests.status, "active")))
    .get();

  if (active) {
    if (active.sourceQuizMistakeId) {
      const m = db
        .select()
        .from(quizMistakes)
        .where(eq(quizMistakes.id, active.sourceQuizMistakeId))
        .get();
      if (m && m.resolvedAt) {
        db.update(petQuests)
          .set({ status: "completed", completedAt: new Date().toISOString() })
          .where(eq(petQuests.id, active.id))
          .run();
        const node = db
          .select({ title: masteryNodes.title })
          .from(masteryNodes)
          .where(eq(masteryNodes.slug, active.conceptSlug))
          .get();
        return c.json({
          quest: {
            conceptTitle: node?.title ?? active.conceptSlug,
            petName: pet.name,
            justCompleted: true,
          },
        });
      }
    }
    const node = db
      .select({ title: masteryNodes.title })
      .from(masteryNodes)
      .where(eq(masteryNodes.slug, active.conceptSlug))
      .get();
    return c.json({
      quest: {
        conceptTitle: node?.title ?? active.conceptSlug,
        petName: pet.name,
        justCompleted: false,
      },
    });
  }

  const top = db
    .select()
    .from(quizMistakes)
    .where(
      and(eq(quizMistakes.userId, user.id), isNull(quizMistakes.resolvedAt)),
    )
    .orderBy(desc(quizMistakes.occurrences))
    .get();
  if (!top) return c.json({ quest: null });
  const node = db
    .select({ slug: masteryNodes.slug, title: masteryNodes.title })
    .from(masteryNodes)
    .where(eq(masteryNodes.id, top.nodeId))
    .get();
  if (!node) return c.json({ quest: null });
  db.insert(petQuests)
    .values({
      id: randomUUID(),
      userId: user.id,
      petId: pet.id,
      conceptSlug: node.slug,
      sourceQuizMistakeId: top.id,
      status: "active",
    })
    .run();
  return c.json({
    quest: {
      conceptTitle: node.title,
      petName: pet.name,
      justCompleted: false,
    },
  });
});

// Phase 6a — mint a persisted, verifiable Axiomic skill credential.
// Reuses computeAxiomicScore + signAxiomicScore (ed25519 via the
// shared signing module) and the Phase-0 signed_credentials table.
// The signed manifest re-verifies offline through the unchanged
// /api/v1/keys/verify — no new verify crypto here.
mastery.post("/me/credential", requireAuth, async (c) => {
  const user = c.get("user")!;
  const db = getDb();
  const score = await computeAxiomicScore(user.id, user.username);
  const signed = signAxiomicScore(user.id, user.username, score);
  const verifyId = randomUUID();
  db.insert(signedCredentials)
    .values({
      id: randomUUID(),
      userId: user.id,
      kind: "composite_score",
      payloadJson: JSON.stringify(signed.manifest),
      signature: signed.signature,
      verifyId,
    })
    .run();
  return c.json({ verifyId, score: score.score, signed });
});

mastery.get("/credential/:verifyId", async (c) => {
  const verifyId = c.req.param("verifyId")!;
  const db = getDb();
  const row = db
    .select()
    .from(signedCredentials)
    .where(eq(signedCredentials.verifyId, verifyId))
    .get();
  if (!row) return c.json({ error: "Not found" }, 404);
  return c.json({
    kind: row.kind,
    manifest: JSON.parse(row.payloadJson),
    signature: row.signature,
    issuedAt: row.issuedAt,
  });
});

// Per-user mastery summary across all paths.
mastery.get("/users/:username/summary", (c) => {
  const username = c.req.param("username");
  const db = getDb();

  const user = db
    .select({ id: users.id, username: users.username })
    .from(users)
    .where(eq(users.username, username))
    .get();
  if (!user) return c.json({ error: "User not found" }, 404);

  const paths = db.select().from(masteryPaths).all();

  let totalCompleted = 0;
  let highestIdx = -1;

  const pathSummaries = paths.map((path) => {
    const nodes = db
      .select({ id: masteryNodes.id, level: masteryNodes.level })
      .from(masteryNodes)
      .where(eq(masteryNodes.pathId, path.id))
      .all();

    const totalNodes = nodes.length;
    const nodeIds = nodes.map((n) => n.id);

    const completed = nodeIds.length === 0
      ? []
      : db
          .select({
            nodeId: userProgress.nodeId,
            completedAt: userProgress.completedAt,
          })
          .from(userProgress)
          .where(
            and(
              eq(userProgress.userId, user.id),
              eq(userProgress.completed, true),
              inArray(userProgress.nodeId, nodeIds),
            ),
          )
          .orderBy(desc(userProgress.completedAt))
          .all();

    const completedNodes = completed.length;
    totalCompleted += completedNodes;

    const completedSet = new Set(completed.map((c) => c.nodeId));
    let pathHighest = -1;
    // Per-level breakdown for the SkillTree visualization on the
    // profile page. Each level maps to {total, completed}; missing
    // levels are absent.
    const levels: Record<string, { total: number; completed: number }> = {};
    for (const n of nodes) {
      const cur = levels[n.level] ?? { total: 0, completed: 0 };
      cur.total += 1;
      if (completedSet.has(n.id)) cur.completed += 1;
      levels[n.level] = cur;
      if (!completedSet.has(n.id)) continue;
      const idx = levelIndex(n.level);
      if (idx > pathHighest) pathHighest = idx;
    }
    if (pathHighest > highestIdx) highestIdx = pathHighest;

    return {
      pathSlug: path.slug,
      pathTitle: path.title,
      totalNodes,
      completedNodes,
      currentLevel: pathHighest >= 0 ? LEVEL_ORDER[pathHighest] : null,
      latestCompletionAt: completed[0]?.completedAt ?? null,
      levels,
    };
  });

  return c.json({
    username: user.username,
    paths: pathSummaries,
    totalCompleted,
    highestLevel: highestIdx >= 0 ? LEVEL_ORDER[highestIdx] : null,
  });
});

// "Pick up where you left off" — for the auth'd user, return the next
// incomplete node on the most-recently-active path. Falls back to the
// first node of the first path if the user has no completions yet.
mastery.get("/next-node", requireAuth, (c) => {
  const user = c.get("user")!;
  const db = getDb();

  const paths = db.select().from(masteryPaths).orderBy(asc(masteryPaths.id)).all();
  if (paths.length === 0) return c.json({ next: null });

  // Most-recent completion per path; choose the path with the latest
  // activity. If the user has no completions yet, fall back to the first
  // path so the home card always points somewhere.
  let chosenPath = paths[0];
  let latestActivity = "";
  for (const path of paths) {
    const nodeIds = db
      .select({ id: masteryNodes.id })
      .from(masteryNodes)
      .where(eq(masteryNodes.pathId, path.id))
      .all()
      .map((n) => n.id);
    if (nodeIds.length === 0) continue;
    const last = db
      .select({ completedAt: userProgress.completedAt })
      .from(userProgress)
      .where(
        and(
          eq(userProgress.userId, user.id),
          eq(userProgress.completed, true),
          inArray(userProgress.nodeId, nodeIds),
        ),
      )
      .orderBy(desc(userProgress.completedAt))
      .limit(1)
      .get();
    if (last?.completedAt && last.completedAt > latestActivity) {
      latestActivity = last.completedAt;
      chosenPath = path;
    }
  }

  // First non-completed node, ordered by `order`. If every node is
  // complete on the chosen path, return null.
  const nodes = db
    .select()
    .from(masteryNodes)
    .where(eq(masteryNodes.pathId, chosenPath.id))
    .orderBy(asc(masteryNodes.order))
    .all();

  const completedSet = new Set(
    db
      .select({ nodeId: userProgress.nodeId })
      .from(userProgress)
      .where(and(eq(userProgress.userId, user.id), eq(userProgress.completed, true)))
      .all()
      .map((r) => r.nodeId),
  );

  const next = nodes.find((n) => !completedSet.has(n.id));
  if (!next) return c.json({ next: null });

  return c.json({
    next: {
      pathSlug: chosenPath.slug,
      pathTitle: chosenPath.title,
      nodeSlug: next.slug,
      nodeTitle: next.title,
      level: next.level,
      hasLesson: !!next.lessonData,
    },
  });
});

// Get the authored lesson for a node, if any.
mastery.get("/lesson/:nodeId", async (c) => {
  const nodeId = c.req.param("nodeId");
  const db = getDb();
  const node = db
    .select({
      lessonData: masteryNodes.lessonData,
      sourceArticleId: masteryNodes.sourceArticleId,
      prerequisiteNodeIds: masteryNodes.prerequisiteNodeIds,
      // Sprint 82 — surface node kind so LessonPage can swap renderers.
      nodeKind: masteryNodes.nodeKind,
      protocolSlug: masteryNodes.protocolSlug,
      certSlug: masteryNodes.certSlug,
      equipmentSlug: masteryNodes.equipmentSlug,
      examSlug: masteryNodes.examSlug,
    })
    .from(masteryNodes)
    .where(eq(masteryNodes.id, nodeId))
    .get();
  if (!node) return c.json({ error: "Node not found" }, 404);

  // Sprint 82 — non-lesson nodes resolve to the corresponding lab
  // surface; the renderer follows the embed link instead of rendering
  // slides. We still return prereqWikiSlugs (empty for lab nodes for
  // now) for shape symmetry with the existing client.
  if (node.nodeKind && node.nodeKind !== "lesson") {
    return c.json({
      lesson: null,
      sourceArticle: null,
      prereqWikiSlugs: [],
      nodeKind: node.nodeKind,
      protocolSlug: node.protocolSlug,
      certSlug: node.certSlug,
      equipmentSlug: node.equipmentSlug,
      examSlug: node.examSlug,
    });
  }

  // Sprint 32 — walk prerequisite mastery nodes to surface the wiki
  // slugs that gate this lesson. Lets the editor preview render a
  // PrereqXray showing which prereqs the learner has actually mastered.
  const prereqWikiSlugs: string[] = [];
  try {
    const prereqIds: string[] = JSON.parse(node.prerequisiteNodeIds);
    if (Array.isArray(prereqIds) && prereqIds.length > 0) {
      const prereqNodes = db
        .select({ pageIds: masteryNodes.pageIds })
        .from(masteryNodes)
        .where(inArray(masteryNodes.id, prereqIds))
        .all();
      const seen = new Set<string>();
      for (const p of prereqNodes) {
        try {
          const slugs = JSON.parse(p.pageIds);
          if (Array.isArray(slugs)) {
            for (const s of slugs) {
              if (typeof s === "string" && !seen.has(s)) {
                seen.add(s);
                prereqWikiSlugs.push(s);
              }
            }
          }
        } catch {}
      }
    }
  } catch {}

  // Look up the source article (if any) so the lesson page can render
  // a "Sourced from @author's article" footer without a second fetch.
  let sourceArticle:
    | { slug: string; title: string; authorUsername: string }
    | null = null;
  if (node.sourceArticleId) {
    const a = db
      .select({
        slug: newsArticles.slug,
        title: newsArticles.title,
        authorUsername: users.username,
      })
      .from(newsArticles)
      .innerJoin(users, eq(newsArticles.authorId, users.id))
      .where(eq(newsArticles.id, node.sourceArticleId))
      .get();
    if (a) sourceArticle = a;
  }

  if (!node.lessonData)
    return c.json({
      lesson: null,
      sourceArticle,
      prereqWikiSlugs,
      nodeKind: node.nodeKind ?? "lesson",
      protocolSlug: null,
      certSlug: null,
      equipmentSlug: null,
      examSlug: null,
    });
  try {
    return c.json({
      lesson: JSON.parse(node.lessonData),
      sourceArticle,
      prereqWikiSlugs,
      nodeKind: node.nodeKind ?? "lesson",
      protocolSlug: null,
      certSlug: null,
      equipmentSlug: null,
      examSlug: null,
    });
  } catch {
    return c.json({
      lesson: null,
      sourceArticle,
      prereqWikiSlugs,
      nodeKind: node.nodeKind ?? "lesson",
      protocolSlug: null,
      certSlug: null,
      equipmentSlug: null,
      examSlug: null,
    });
  }
});

// --- Lesson authoring (wiki-style open) -------------------------------
//
// Any signed-in user can edit any lesson. Every PUT writes a new
// versioned snapshot to lesson_versions, then bumps
// masteryNodes.currentLessonVersion + replaces lessonData. Mirrors how
// wiki versioning works.

// Loose validation: full discriminated-union validation for every
// question kind would balloon this file. We require slides to look
// shaped-correctly and cap counts; the client editor is the canonical
// source of well-typed lessons. Bad payloads are rejected with 400.
const slideSchema = z.union([
  z.object({
    kind: z.literal("text"),
    title: z.string().max(200).optional(),
    body: z.string().max(20000),
    viz: z.string().max(80).optional(),
    vizProps: z.record(z.unknown()).optional(),
  }),
  z.object({
    kind: z.literal("question"),
    question: z
      .object({
        id: z.string().min(1).max(80),
        kind: z.string().min(1),
        question: z.string().min(1).max(500),
      })
      .passthrough(),
    hints: z.array(z.string().max(2000)).max(6).optional(),
    workedSolution: z.string().max(20000).optional(),
    retryUntilCorrect: z.boolean().optional(),
  }),
  z.object({
    kind: z.literal("section"),
    title: z.string().min(1).max(200),
    body: z.string().max(20000).optional(),
  }),
  z.object({
    kind: z.literal("explain_back"),
    question: z
      .object({
        id: z.string().min(1).max(80),
        kind: z.literal("explain_back"),
        prompt: z.string().min(1).max(2000),
      })
      .passthrough(),
  }),
]);

const lessonBodySchema = z.object({
  slides: z.array(slideSchema).min(1).max(120),
  editMessage: z.string().max(200).optional(),
  meta: z
    .object({
      timeMinutes: z.number().int().min(1).max(600).optional(),
      difficulty: z.enum(["intro", "core", "advanced"]).optional(),
      objectives: z.array(z.string().max(300)).max(12).optional(),
      prereqs: z.array(z.string().max(120)).max(12).optional(),
    })
    .optional(),
});

// PUT /mastery/nodes/:nodeId/lesson — author or replace. With ?draft=1
// the slides land in draftLessonData (no version bump, no search-index
// refresh; learners still see the published content). Without the flag
// the edit is published and a new lesson_versions row is created.
mastery.put(
  "/nodes/:nodeId/lesson",
  requireAuth,
  zValidator("json", lessonBodySchema),
  async (c) => {
    const user = c.get("user")!;
    const nodeId = c.req.param("nodeId")!;
    const draftMode = c.req.query("draft") === "1";
    const { slides, editMessage, meta } = c.req.valid("json");
    const db = getDb();

    const node = db
      .select({
        id: masteryNodes.id,
        currentLessonVersion: masteryNodes.currentLessonVersion,
      })
      .from(masteryNodes)
      .where(eq(masteryNodes.id, nodeId))
      .get();
    if (!node) return c.json({ error: "Node not found" }, 404);

    // Reject duplicate question.id within the same lesson — we'd
    // otherwise overwrite per-slide answer state in the player.
    const seen = new Set<string>();
    for (const s of slides) {
      if (s.kind === "question") {
        const id = s.question.id;
        if (seen.has(id)) {
          return c.json(
            { error: `Duplicate question id: ${id}` },
            400,
          );
        }
        seen.add(id);
      }
    }

    const lessonData = JSON.stringify({
      slides,
      ...(meta ? { meta } : {}),
    });
    const now = new Date().toISOString();

    if (draftMode) {
      // Draft: stash the WIP without bumping the version or touching
      // the published payload. Learners keep reading the existing
      // lessonData; the editor reloads from draftLessonData.
      db.update(masteryNodes)
        .set({
          draftLessonData: lessonData,
          draftUpdatedAt: now,
          draftEditorId: user.id,
        })
        .where(eq(masteryNodes.id, nodeId))
        .run();

      // Sprint 40 — fan out the draft state to every connected
      // collaborator so peers can pull changes or merge silently
      // depending on local dirty-state.
      publishToDraft("lesson", nodeId, {
        type: "draft_update",
        kind: "lesson",
        targetId: nodeId,
        slides,
        editorUsername: user.username,
        updatedAt: now,
      });

      return c.json({
        draft: true,
        lesson: JSON.parse(lessonData),
        version: node.currentLessonVersion,
        draftUpdatedAt: now,
      });
    }

    const nextVersion = node.currentLessonVersion + 1;
    const versionId = randomUUID();

    db.insert(lessonVersions)
      .values({
        id: versionId,
        nodeId,
        version: nextVersion,
        lessonData,
        editedBy: user.id,
        editMessage: editMessage ?? null,
        createdAt: now,
      })
      .run();

    db.update(masteryNodes)
      .set({
        lessonData,
        currentLessonVersion: nextVersion,
        // Publishing clears any in-flight draft.
        draftLessonData: null,
        draftUpdatedAt: null,
        draftEditorId: null,
      })
      .where(eq(masteryNodes.id, nodeId))
      .run();

    // Record the lesson edit so authoring achievements grant.
    const newAchievements = recordActivityAndEvaluate(user.id, "lesson_edit");
    // The lesson is part of the search index; refresh so future searches
    // reflect the new content.
    invalidateSearchIndex();

    return c.json({
      draft: false,
      lesson: JSON.parse(lessonData),
      version: nextVersion,
      newAchievements,
    });
  },
);

// GET /mastery/nodes/:nodeId/lesson/draft — fetches an in-flight draft
// if one exists. Returns null when there's no draft. Auth not required
// since drafts aren't sensitive (they're collaborative wiki-style).
mastery.get("/nodes/:nodeId/lesson/draft", async (c) => {
  const nodeId = c.req.param("nodeId")!;
  const db = getDb();
  const row = db
    .select({
      draftLessonData: masteryNodes.draftLessonData,
      draftUpdatedAt: masteryNodes.draftUpdatedAt,
      draftEditorId: masteryNodes.draftEditorId,
      editorUsername: users.username,
    })
    .from(masteryNodes)
    .leftJoin(users, eq(masteryNodes.draftEditorId, users.id))
    .where(eq(masteryNodes.id, nodeId))
    .get();
  if (!row) return c.json({ error: "Node not found" }, 404);
  if (!row.draftLessonData) return c.json({ draft: null });
  try {
    return c.json({
      draft: {
        lesson: JSON.parse(row.draftLessonData),
        updatedAt: row.draftUpdatedAt,
        editorUsername: row.editorUsername,
      },
    });
  } catch {
    return c.json({ draft: null });
  }
});

// POST /mastery/nodes/:nodeId/lesson/publish-draft — promote whatever
// is in draftLessonData into a real version. Same path as the
// non-draft PUT but doesn't take a body: the draft IS the body.
//
// Sprint 52 — When CONTENT_APPROVAL_ENABLED=1, route through the
// approval gate instead of writing directly. Admin proposers
// auto-approve their own proposals (so the gate is only visible to
// non-admin authors).
mastery.post(
  "/nodes/:nodeId/lesson/publish-draft",
  requireAuth,
  async (c) => {
    const user = c.get("user")!;
    const nodeId = c.req.param("nodeId")!;
    const db = getDb();

    const node = db
      .select({
        id: masteryNodes.id,
        currentLessonVersion: masteryNodes.currentLessonVersion,
        draftLessonData: masteryNodes.draftLessonData,
      })
      .from(masteryNodes)
      .where(eq(masteryNodes.id, nodeId))
      .get();
    if (!node) return c.json({ error: "Node not found" }, 404);
    if (!node.draftLessonData) {
      return c.json({ error: "No draft to publish" }, 400);
    }

    if (isApprovalGateEnabled()) {
      const result = createProposal({
        kind: "lesson_publish",
        targetId: nodeId,
        proposerId: user.id,
        payloadJson: node.draftLessonData,
      });
      if (result.status === "pending") {
        return c.json({
          status: "pending",
          proposalId: result.id,
          message: "Submitted for review",
        });
      }
      // status === 'approved' (admin proposer auto-approved); apply
      // already happened. Refresh the node's currentLessonVersion to
      // include in the response.
      const refreshed = db
        .select({
          currentLessonVersion: masteryNodes.currentLessonVersion,
          lessonData: masteryNodes.lessonData,
        })
        .from(masteryNodes)
        .where(eq(masteryNodes.id, nodeId))
        .get();
      const newAchievements = recordActivityAndEvaluate(user.id, "lesson_edit");
      const now = new Date().toISOString();
      publishToDraft("lesson", nodeId, {
        type: "draft_published",
        kind: "lesson",
        targetId: nodeId,
        version: refreshed?.currentLessonVersion ?? 0,
        editorUsername: user.username,
        publishedAt: now,
      });
      return c.json({
        lesson: refreshed?.lessonData
          ? JSON.parse(refreshed.lessonData)
          : null,
        version: refreshed?.currentLessonVersion ?? 0,
        newAchievements,
        proposalId: result.id,
        status: "approved",
      });
    }

    const nextVersion = node.currentLessonVersion + 1;
    const versionId = randomUUID();
    const now = new Date().toISOString();

    db.insert(lessonVersions)
      .values({
        id: versionId,
        nodeId,
        version: nextVersion,
        lessonData: node.draftLessonData,
        editedBy: user.id,
        editMessage: "Published draft",
        createdAt: now,
      })
      .run();

    db.update(masteryNodes)
      .set({
        lessonData: node.draftLessonData,
        currentLessonVersion: nextVersion,
        draftLessonData: null,
        draftUpdatedAt: null,
        draftEditorId: null,
      })
      .where(eq(masteryNodes.id, nodeId))
      .run();

    const newAchievements = recordActivityAndEvaluate(user.id, "lesson_edit");
    invalidateSearchIndex();

    // Sprint 40 — broadcast that the draft has gone live so every
    // collaborator's editor reloads from the new published state.
    publishToDraft("lesson", nodeId, {
      type: "draft_published",
      kind: "lesson",
      targetId: nodeId,
      version: nextVersion,
      editorUsername: user.username,
      publishedAt: now,
    });

    return c.json({
      lesson: JSON.parse(node.draftLessonData),
      version: nextVersion,
      newAchievements,
    });
  },
);

// POST /mastery/nodes/:nodeId/lesson/report-version/:version — flag a
// problematic edit. Reports just accumulate; admin tooling for
// reviewing them is a follow-up.
const reportSchema = z.object({
  reason: z.enum(["vandalism", "spam", "accuracy", "other"]),
  message: z.string().max(500).optional(),
});
mastery.post(
  "/nodes/:nodeId/lesson/report-version/:version",
  requireAuth,
  zValidator("json", reportSchema),
  async (c) => {
    const user = c.get("user")!;
    const nodeId = c.req.param("nodeId")!;
    const version = parseInt(c.req.param("version") ?? "", 10);
    const { reason, message } = c.req.valid("json");
    if (!Number.isFinite(version) || version <= 0) {
      return c.json({ error: "Invalid version" }, 400);
    }
    const db = getDb();

    const target = db
      .select({ id: lessonVersions.id })
      .from(lessonVersions)
      .where(
        and(
          eq(lessonVersions.nodeId, nodeId),
          eq(lessonVersions.version, version),
        ),
      )
      .get();
    if (!target) return c.json({ error: "Version not found" }, 404);

    db.insert(lessonEditReports)
      .values({
        id: randomUUID(),
        nodeId,
        version,
        reporterId: user.id,
        reason,
        message: message ?? null,
        createdAt: new Date().toISOString(),
      })
      .run();

    return c.json({ ok: true });
  },
);

// GET /mastery/lesson-edits — paged feed of recent lesson_versions
// rows joined to users + nodes for the public edits feed page.
mastery.get("/lesson-edits", async (c) => {
  const db = getDb();
  const { limit, offset } = pageParams(
    c.req.query("limit"),
    c.req.query("offset"),
    { defLimit: 30, maxLimit: 50 },
  );
  const username = c.req.query("username");

  let editorFilter: string | undefined;
  if (username) {
    const u = db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.username, username))
      .get();
    if (!u) return c.json({ edits: [] });
    editorFilter = u.id;
  }

  const rows = db
    .select({
      versionId: lessonVersions.id,
      nodeId: lessonVersions.nodeId,
      version: lessonVersions.version,
      editorId: lessonVersions.editedBy,
      editorUsername: users.username,
      editMessage: lessonVersions.editMessage,
      createdAt: lessonVersions.createdAt,
      nodeSlug: masteryNodes.slug,
      nodeTitle: masteryNodes.title,
      pathSlug: masteryPaths.slug,
      currentLessonVersion: masteryNodes.currentLessonVersion,
    })
    .from(lessonVersions)
    .leftJoin(users, eq(lessonVersions.editedBy, users.id))
    .innerJoin(masteryNodes, eq(lessonVersions.nodeId, masteryNodes.id))
    .innerJoin(masteryPaths, eq(masteryNodes.pathId, masteryPaths.id))
    .where(editorFilter ? eq(lessonVersions.editedBy, editorFilter) : undefined)
    .orderBy(desc(lessonVersions.createdAt))
    .limit(limit)
    .offset(offset)
    .all();

  return c.json({ edits: rows });
});

// GET /mastery/nodes/:nodeId/lesson-versions — paged history list.
mastery.get("/nodes/:nodeId/lesson-versions", async (c) => {
  const nodeId = c.req.param("nodeId")!;
  const db = getDb();

  const exists = db
    .select({ id: masteryNodes.id })
    .from(masteryNodes)
    .where(eq(masteryNodes.id, nodeId))
    .get();
  if (!exists) return c.json({ error: "Node not found" }, 404);

  const rows = db
    .select({
      id: lessonVersions.id,
      version: lessonVersions.version,
      editorId: lessonVersions.editedBy,
      editorUsername: users.username,
      editMessage: lessonVersions.editMessage,
      createdAt: lessonVersions.createdAt,
    })
    .from(lessonVersions)
    .leftJoin(users, eq(lessonVersions.editedBy, users.id))
    .where(eq(lessonVersions.nodeId, nodeId))
    .orderBy(desc(lessonVersions.version))
    .all();

  return c.json({ versions: rows });
});

// POST /mastery/nodes/:nodeId/lesson/restore/:version — write a new
// version that copies the snapshotted lessonData. Doesn't overwrite
// history; the restore is just another forward-going version.
mastery.post(
  "/nodes/:nodeId/lesson/restore/:version",
  requireAuth,
  async (c) => {
    const user = c.get("user")!;
    const nodeId = c.req.param("nodeId")!;
    const version = parseInt(c.req.param("version") ?? "", 10);
    if (!Number.isFinite(version) || version <= 0) {
      return c.json({ error: "Invalid version" }, 400);
    }
    const db = getDb();

    const node = db
      .select({
        id: masteryNodes.id,
        currentLessonVersion: masteryNodes.currentLessonVersion,
      })
      .from(masteryNodes)
      .where(eq(masteryNodes.id, nodeId))
      .get();
    if (!node) return c.json({ error: "Node not found" }, 404);

    const target = db
      .select({ lessonData: lessonVersions.lessonData })
      .from(lessonVersions)
      .where(
        and(
          eq(lessonVersions.nodeId, nodeId),
          eq(lessonVersions.version, version),
        ),
      )
      .get();
    if (!target) return c.json({ error: "Version not found" }, 404);

    const nextVersion = node.currentLessonVersion + 1;
    const versionId = randomUUID();
    const now = new Date().toISOString();

    db.insert(lessonVersions)
      .values({
        id: versionId,
        nodeId,
        version: nextVersion,
        lessonData: target.lessonData,
        editedBy: user.id,
        editMessage: `Restore from v${version}`,
        createdAt: now,
      })
      .run();

    db.update(masteryNodes)
      .set({
        lessonData: target.lessonData,
        currentLessonVersion: nextVersion,
      })
      .where(eq(masteryNodes.id, nodeId))
      .run();

    return c.json({
      lesson: JSON.parse(target.lessonData),
      version: nextVersion,
    });
  },
);

// --- Lesson analytics -------------------------------------------------
//
// Fire-and-forget per-slide telemetry from the client (advance, answer
// reveal). The unique-index on (nodeId, userId, slideIdx, kind) makes
// repeats no-ops — we count distinct learner-touchpoints, not raw
// firings. The aggregated GET endpoint powers the analytics surface
// for authors.

const slideEventSchema = z.object({
  slideIdx: z.number().int().min(0).max(199),
  kind: z.enum(["viewed", "answered_correct", "answered_wrong"]),
});

mastery.post(
  "/nodes/:nodeId/slide-event",
  requireAuth,
  zValidator("json", slideEventSchema),
  async (c) => {
    const user = c.get("user")!;
    const nodeId = c.req.param("nodeId")!;
    const { slideIdx, kind } = c.req.valid("json");
    const db = getDb();

    // Confirm the node exists; without this a malicious client could
    // pollute the table with bogus references (FK would catch it but a
    // 400 is friendlier than 500).
    const exists = db
      .select({ id: masteryNodes.id })
      .from(masteryNodes)
      .where(eq(masteryNodes.id, nodeId))
      .get();
    if (!exists) return c.json({ error: "Node not found" }, 404);

    // INSERT OR IGNORE on the unique index makes repeats no-ops.
    db.run(sql`
      INSERT OR IGNORE INTO lesson_slide_events (id, node_id, user_id, slide_idx, kind, created_at)
      VALUES (${randomUUID()}, ${nodeId}, ${user.id}, ${slideIdx}, ${kind}, ${new Date().toISOString()})
    `);

    return c.json({ ok: true });
  },
);

mastery.get("/nodes/:nodeId/lesson-analytics", async (c) => {
  const nodeId = c.req.param("nodeId")!;
  const db = getDb();

  const node = db
    .select({ id: masteryNodes.id, lessonData: masteryNodes.lessonData })
    .from(masteryNodes)
    .where(eq(masteryNodes.id, nodeId))
    .get();
  if (!node) return c.json({ error: "Node not found" }, 404);

  // Slide count from the current lesson, so the response shape lines up
  // with what the player would render.
  let slideCount = 0;
  try {
    const parsed = node.lessonData
      ? (JSON.parse(node.lessonData) as { slides?: unknown[] })
      : null;
    slideCount = Array.isArray(parsed?.slides) ? parsed!.slides!.length : 0;
  } catch {
    slideCount = 0;
  }

  // Aggregate counts per (slideIdx, kind). One row per unique user
  // touchpoint thanks to the unique index.
  const rows = db
    .select({
      slideIdx: lessonSlideEvents.slideIdx,
      kind: lessonSlideEvents.kind,
      count: sql<number>`count(*)`.as("count"),
    })
    .from(lessonSlideEvents)
    .where(eq(lessonSlideEvents.nodeId, nodeId))
    .groupBy(lessonSlideEvents.slideIdx, lessonSlideEvents.kind)
    .all();

  const perSlide: Array<{
    slideIdx: number;
    views: number;
    answeredCorrect: number;
    answeredWrong: number;
  }> = [];
  for (let i = 0; i < slideCount; i++) {
    perSlide.push({
      slideIdx: i,
      views: 0,
      answeredCorrect: 0,
      answeredWrong: 0,
    });
  }
  for (const r of rows) {
    if (r.slideIdx >= slideCount) continue;
    const slot = perSlide[r.slideIdx];
    if (!slot) continue;
    if (r.kind === "viewed") slot.views = r.count;
    else if (r.kind === "answered_correct") slot.answeredCorrect = r.count;
    else if (r.kind === "answered_wrong") slot.answeredWrong = r.count;
  }

  // Drop-off = viewers who didn't view the next slide. Only meaningful
  // for slides 0..n-2; the final slide can't drop off.
  const slides = perSlide.map((s, i) => {
    const next = perSlide[i + 1];
    const dropOff = next ? Math.max(0, s.views - next.views) : 0;
    const incorrectRate =
      s.answeredCorrect + s.answeredWrong > 0
        ? s.answeredWrong / (s.answeredCorrect + s.answeredWrong)
        : 0;
    return { ...s, dropOff, incorrectRate };
  });

  return c.json({ slideCount, slides });
});

// Get quiz for a node
mastery.get("/quiz/:nodeId", async (c) => {
  const nodeId = c.req.param("nodeId");
  const db = getDb();

  const node = db.select().from(masteryNodes).where(eq(masteryNodes.id, nodeId)).get();
  if (!node) return c.json({ error: "Node not found" }, 404);

  // Parse canned quiz data or generate default questions
  let questions = [];
  if (node.quizData) {
    questions = JSON.parse(node.quizData);
  } else {
    questions = [
      {
        id: "q1",
        question: `What is the main concept behind ${node.title}?`,
        options: [
          "A fundamental building block of modern AI",
          "A purely theoretical concept with no practical use",
          "A deprecated technique from early computing",
          "A hardware optimization only",
        ],
        correctIndex: 0,
      },
      {
        id: "q2",
        question: `Which prerequisite is most important for understanding ${node.title}?`,
        options: [
          "Basic linear algebra",
          "Quantum computing",
          "Database design",
          "Network protocols",
        ],
        correctIndex: 0,
      },
    ];
  }

  return c.json({ questions });
});

// Submit quiz answers
const quizSubmitSchema = z.object({
  answers: z.record(z.string()),
});

// Grade one question against one answer. Dispatches on `kind`,
// defaulting to multiple_choice for back-compat with older seeded
// quiz JSON that omits the field. Returns true when the answer is
// correct.
mastery.post("/quiz/:nodeId", requireAuth, zValidator("json", quizSubmitSchema), async (c) => {
  const nodeId = c.req.param("nodeId");
  const { answers } = c.req.valid("json");
  const user = c.get("user")!;
  const db = getDb();

  const node = db.select().from(masteryNodes).where(eq(masteryNodes.id, nodeId)).get();
  if (!node) return c.json({ error: "Node not found" }, 404);

  let questions = [];
  if (node.quizData) {
    questions = JSON.parse(node.quizData);
  } else {
    questions = [
      { id: "q1", correctIndex: 0 },
      { id: "q2", correctIndex: 0 },
    ];
  }

  let correct = 0;
  // Track per-question outcomes so we can update the mistakes log
  // (and auto-create flashcards) for everything the user got wrong.
  const wrongIds: string[] = [];
  for (const q of questions) {
    const ok = gradeQuestion(q, answers[q.id]);
    if (ok) correct++;
    else if (q?.id) wrongIds.push(q.id);
  }

  const score = questions.length > 0 ? correct / questions.length : 0;

  // Mistakes log: insert or bump per question. Anything the user just
  // got right gets stamped resolvedAt so the daily challenge doesn't
  // keep biasing toward it.
  const nowIso = new Date().toISOString();
  for (const q of questions as Array<{ id: string }>) {
    if (!q?.id) continue;
    const wasWrong = wrongIds.includes(q.id);
    const existing = db
      .select()
      .from(quizMistakes)
      .where(
        and(
          eq(quizMistakes.userId, user.id),
          eq(quizMistakes.nodeId, nodeId),
          eq(quizMistakes.questionId, q.id),
        ),
      )
      .get();
    if (wasWrong) {
      if (existing) {
        db.update(quizMistakes)
          .set({
            occurrences: existing.occurrences + 1,
            lastWrongAt: nowIso,
            resolvedAt: null,
          })
          .where(eq(quizMistakes.id, existing.id))
          .run();
      } else {
        db.insert(quizMistakes).values({
          id: randomUUID(),
          userId: user.id,
          nodeId,
          questionId: q.id,
          occurrences: 1,
          lastWrongAt: nowIso,
        }).run();
      }
    } else if (existing && !existing.resolvedAt) {
      db.update(quizMistakes)
        .set({ resolvedAt: nowIso })
        .where(eq(quizMistakes.id, existing.id))
        .run();
    }
  }

  // Sprint 29 — kick off misconception detection in the background.
  // Non-blocking; failures are swallowed so a detector hiccup never
  // breaks the quiz submission response.
  if (wrongIds.length > 0) {
    fireDetectorForUserAsync(user.id);
  }

  // Auto-create flashcards for newly missed multiple-choice questions
  // (the easiest kind to flip into a Q/A card). Skipped if the user
  // already has a card for this exact question.
  try {
    const nodeRow = db
      .select({ slug: masteryNodes.slug, title: masteryNodes.title })
      .from(masteryNodes)
      .where(eq(masteryNodes.id, nodeId))
      .get();
    if (nodeRow) {
      for (const q of questions as Array<any>) {
        if (!wrongIds.includes(q?.id)) continue;
        const card = flashcardFromQuestion(q);
        if (!card || !card.front || !card.back) continue;
        const dup = db
          .select({ id: flashcards.id })
          .from(flashcards)
          .where(
            and(
              eq(flashcards.userId, user.id),
              eq(flashcards.front, card.front),
            ),
          )
          .get();
        if (!dup) {
          db.insert(flashcards).values({
            id: randomUUID(),
            userId: user.id,
            pageSlug: nodeRow.slug,
            pageTitle: nodeRow.title,
            front: card.front,
            back: card.back,
          }).run();
        }
      }
    }
  } catch (err) {
    console.error("auto-flashcard creation failed", err);
  }

  // Update progress
  const existing = db
    .select()
    .from(userProgress)
    .where(and(eq(userProgress.userId, user.id), eq(userProgress.nodeId, nodeId)))
    .get();

  if (existing) {
    db.update(userProgress)
      .set({ quizScore: score })
      .where(eq(userProgress.id, existing.id))
      .run();
  } else {
    db.insert(userProgress).values({
      id: randomUUID(),
      userId: user.id,
      nodeId,
      quizScore: score,
    }).run();
  }

  // Record activity for both the quiz attempt and (if there was a code
  // question) the coding problem specifically — code_warrior achievement
  // gates on it. Activity events fire even on partial passes so streaks
  // aren't held hostage by a hard quiz.
  const newAchievements: string[] = [];
  newAchievements.push(...recordActivityAndEvaluate(user.id, "quiz_passed"));
  // S86 — XP for passing a quiz. Idempotent on (userId, source, nodeId)
  // so re-attempts of the same quiz don't double-grant.
  grantXp({
    userId: user.id,
    source: "quiz-passed",
    sourceRefId: nodeId,
  });
  // Look for any code question that the user got fully right and credit it.
  const codeQs = (questions as any[]).filter((q) => q?.kind === "code");
  for (const cq of codeQs) {
    if (gradeQuestion(cq, answers[cq.id])) {
      newAchievements.push(...recordActivityAndEvaluate(user.id, "code_question_passed"));
      // S86 — XP for solving a code question. Idempotent on
      // (userId, source, nodeId).
      grantXp({
        userId: user.id,
        source: "code-question-passed",
        sourceRefId: nodeId,
      });
      break; // one credit per submit, regardless of how many code questions
    }
  }

  return c.json({ score, correct, total: questions.length, newAchievements });
});

// --- Lesson position (resume mid-lesson) -----------------------------

const lessonProgressSchema = z.object({
  slideIdx: z.number().int().min(0).max(200),
});

mastery.get("/lesson-progress/:nodeId", requireAuth, (c) => {
  const nodeId = c.req.param("nodeId")!;
  const user = c.get("user")!;
  const db = getDb();
  const row = db
    .select()
    .from(lessonProgress)
    .where(
      and(
        eq(lessonProgress.userId, user.id),
        eq(lessonProgress.nodeId, nodeId),
      ),
    )
    .get();
  return c.json({ slideIdx: row?.slideIdx ?? 0 });
});

mastery.put(
  "/lesson-progress/:nodeId",
  requireAuth,
  zValidator("json", lessonProgressSchema),
  (c) => {
    const nodeId = c.req.param("nodeId")!;
    const { slideIdx } = c.req.valid("json");
    const user = c.get("user")!;
    const db = getDb();
    const existing = db
      .select({ id: lessonProgress.id })
      .from(lessonProgress)
      .where(
        and(
          eq(lessonProgress.userId, user.id),
          eq(lessonProgress.nodeId, nodeId),
        ),
      )
      .get();
    if (existing) {
      db.update(lessonProgress)
        .set({ slideIdx, updatedAt: new Date().toISOString() })
        .where(eq(lessonProgress.id, existing.id))
        .run();
    } else {
      db.insert(lessonProgress).values({
        id: randomUUID(),
        userId: user.id,
        nodeId,
        slideIdx,
      }).run();
    }
    return c.json({ ok: true });
  },
);

// --- Per-node lesson notes ------------------------------------------

const lessonNotesSchema = z.object({
  body: z.string().max(20000),
});

mastery.get("/lesson-notes/:nodeId", requireAuth, (c) => {
  const nodeId = c.req.param("nodeId")!;
  const user = c.get("user")!;
  const db = getDb();
  const row = db
    .select()
    .from(lessonNotes)
    .where(
      and(
        eq(lessonNotes.userId, user.id),
        eq(lessonNotes.nodeId, nodeId),
      ),
    )
    .get();
  return c.json({ body: row?.body ?? "", updatedAt: row?.updatedAt ?? null });
});

mastery.put(
  "/lesson-notes/:nodeId",
  requireAuth,
  zValidator("json", lessonNotesSchema),
  (c) => {
    const nodeId = c.req.param("nodeId")!;
    const { body } = c.req.valid("json");
    const user = c.get("user")!;
    const db = getDb();
    const existing = db
      .select({ id: lessonNotes.id })
      .from(lessonNotes)
      .where(
        and(
          eq(lessonNotes.userId, user.id),
          eq(lessonNotes.nodeId, nodeId),
        ),
      )
      .get();
    const nowIso = new Date().toISOString();
    if (existing) {
      db.update(lessonNotes)
        .set({ body, updatedAt: nowIso })
        .where(eq(lessonNotes.id, existing.id))
        .run();
    } else {
      db.insert(lessonNotes).values({
        id: randomUUID(),
        userId: user.id,
        nodeId,
        body,
      }).run();
    }
    return c.json({ ok: true, updatedAt: nowIso });
  },
);

// --- Quiz mistakes review ------------------------------------------

mastery.get("/mistakes", requireAuth, (c) => {
  const user = c.get("user")!;
  const db = getDb();

  const rows = db
    .select({
      nodeId: quizMistakes.nodeId,
      nodeSlug: masteryNodes.slug,
      nodeTitle: masteryNodes.title,
      pathId: masteryNodes.pathId,
      questionId: quizMistakes.questionId,
      occurrences: quizMistakes.occurrences,
      lastWrongAt: quizMistakes.lastWrongAt,
      resolvedAt: quizMistakes.resolvedAt,
      quizData: masteryNodes.quizData,
    })
    .from(quizMistakes)
    .innerJoin(masteryNodes, eq(quizMistakes.nodeId, masteryNodes.id))
    .where(eq(quizMistakes.userId, user.id))
    .orderBy(desc(quizMistakes.lastWrongAt))
    .all();

  // Resolve path slug/title in bulk.
  const pathIds = Array.from(new Set(rows.map((r) => r.pathId)));
  const pathRows = pathIds.length
    ? db
        .select({ id: masteryPaths.id, slug: masteryPaths.slug, title: masteryPaths.title })
        .from(masteryPaths)
        .where(inArray(masteryPaths.id, pathIds))
        .all()
    : [];
  const pathMap = new Map(pathRows.map((p) => [p.id, p]));

  const mistakes = rows.map((r) => {
    let questionText: string | null = null;
    if (r.quizData) {
      try {
        const qs = JSON.parse(r.quizData);
        const q = Array.isArray(qs)
          ? qs.find((qq: any) => qq?.id === r.questionId)
          : null;
        if (q && typeof q.question === "string") questionText = q.question;
      } catch {
        // ignore
      }
    }
    const path = pathMap.get(r.pathId);
    return {
      nodeId: r.nodeId,
      nodeSlug: r.nodeSlug,
      nodeTitle: r.nodeTitle,
      pathSlug: path?.slug ?? null,
      pathTitle: path?.title ?? null,
      questionId: r.questionId,
      questionText,
      occurrences: r.occurrences,
      lastWrongAt: r.lastWrongAt,
      resolvedAt: r.resolvedAt,
    };
  });

  return c.json({ mistakes });
});

export { mastery };
