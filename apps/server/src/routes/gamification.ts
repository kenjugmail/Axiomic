import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import {
  getDb,
  users,
  userAchievements,
  activityEvents,
  userProgress,
  masteryNodes,
  masteryPaths,
  dailyChallenges,
  dailyChallengeAttempts,
} from "@axiomic/db";
import { and, count, desc, eq, sql } from "drizzle-orm";
import { randomUUID } from "crypto";
import { requireAuth, getSessionUser } from "../middleware/auth";
import { currentStreak, recordActivity } from "../lib/achievements";
import { grantXp, type GrantXpResult } from "../lib/xp";
import type { Env } from "../env";

export const gamificationRouter = new Hono<Env>();

// Points formula. Activities are cheap (1 pt), achievements heavy
// (10 pts), and node completions in the middle (3 pts). The scheme
// is intentionally simple and tunable.
function pointsFor(achievements: number, activities: number, completions: number): number {
  return achievements * 10 + completions * 3 + activities * 1;
}

// Global leaderboard. Top 50 + the requester's slot if outside the top.
gamificationRouter.get("/leaderboard", async (c) => {
  const db = getDb();
  const me = await getSessionUser(c);

  // Aggregate counts per user. We do three small queries and merge in
  // JS — clearer than a single triple-join and the table sizes are
  // small enough.
  const userRows = db
    .select({ id: users.id, username: users.username, displayName: users.displayName })
    .from(users)
    .all();

  const achievementRows = db
    .select({ userId: userAchievements.userId, n: count() })
    .from(userAchievements)
    .groupBy(userAchievements.userId)
    .all();
  const achievementMap = new Map(achievementRows.map((r) => [r.userId, Number(r.n)]));

  const activityRows = db
    .select({ userId: activityEvents.userId, n: count() })
    .from(activityEvents)
    .groupBy(activityEvents.userId)
    .all();
  const activityMap = new Map(activityRows.map((r) => [r.userId, Number(r.n)]));

  const completionRows = db
    .select({ userId: userProgress.userId, n: count() })
    .from(userProgress)
    .where(eq(userProgress.completed, true))
    .groupBy(userProgress.userId)
    .all();
  const completionMap = new Map(completionRows.map((r) => [r.userId, Number(r.n)]));

  type Row = {
    id: string;
    username: string;
    displayName: string | null;
    achievements: number;
    activities: number;
    completions: number;
    totalPoints: number;
  };
  const rows: Row[] = userRows.map((u) => {
    const achievements = achievementMap.get(u.id) ?? 0;
    const activities = activityMap.get(u.id) ?? 0;
    const completions = completionMap.get(u.id) ?? 0;
    return {
      id: u.id,
      username: u.username,
      displayName: u.displayName,
      achievements,
      activities,
      completions,
      totalPoints: pointsFor(achievements, activities, completions),
    };
  });
  rows.sort((a, b) => b.totalPoints - a.totalPoints || a.username.localeCompare(b.username));

  const TOP = 50;
  const topRanked = rows.slice(0, TOP).map((r, i) => ({
    rank: i + 1,
    username: r.username,
    displayName: r.displayName,
    totalPoints: r.totalPoints,
    achievements: r.achievements,
    streak: currentStreak(db, r.id),
  }));

  let mePayload: (typeof topRanked)[number] | null = null;
  if (me) {
    const idx = rows.findIndex((r) => r.id === me.id);
    if (idx >= 0) {
      const r = rows[idx];
      mePayload = {
        rank: idx + 1,
        username: r.username,
        displayName: r.displayName,
        totalPoints: r.totalPoints,
        achievements: r.achievements,
        streak: currentStreak(db, r.id),
      };
    }
  }

  return c.json({ entries: topRanked, me: mePayload });
});

// --- Daily challenge ---

// Pick the deterministic node + question for a given day. We hash the
// day key into the seeded-quiz pool so every user sees the same
// question.
function dayKey(d: Date = new Date()): string {
  return d.toISOString().slice(0, 10);
}

function hashStringToInt(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

interface ChallengeQuestion {
  challenge: typeof dailyChallenges.$inferSelect;
  nodeTitle: string;
  question: any;
}

function pickOrCreateChallenge(today: string): ChallengeQuestion | null {
  const db = getDb();
  // Already chosen?
  const existing = db
    .select()
    .from(dailyChallenges)
    .where(eq(dailyChallenges.day, today))
    .get();

  if (existing) {
    const node = db
      .select()
      .from(masteryNodes)
      .where(eq(masteryNodes.slug, existing.nodeSlug))
      .get();
    if (!node || !node.quizData) return null;
    let questions: any[] = [];
    try {
      questions = JSON.parse(node.quizData);
    } catch {
      return null;
    }
    const q = questions.find((qq) => qq.id === existing.questionId);
    if (!q) return null;
    // Surface only the displayable bits — strip the answer.
    const stripped = stripAnswer(q);
    return { challenge: existing, nodeTitle: node.title, question: stripped };
  }

  // Pick a fresh challenge: deterministic from `today`.
  const candidateNodes = db
    .select({
      slug: masteryNodes.slug,
      title: masteryNodes.title,
      quizData: masteryNodes.quizData,
    })
    .from(masteryNodes)
    .all();
  // Filter to nodes with multiple-choice questions only — the daily
  // surface is best as a single quick MC, not a slider or code.
  type Cand = { slug: string; title: string; question: any };
  const flat: Cand[] = [];
  for (const n of candidateNodes) {
    if (!n.quizData) continue;
    let qs: any[] = [];
    try {
      qs = JSON.parse(n.quizData);
    } catch {
      continue;
    }
    for (const q of qs) {
      const kind = q.kind ?? "multiple_choice";
      if (kind !== "multiple_choice") continue;
      flat.push({ slug: n.slug, title: n.title, question: q });
    }
  }
  if (flat.length === 0) return null;
  const idx = hashStringToInt(today) % flat.length;
  const pick = flat[idx];

  const id = randomUUID();
  db.insert(dailyChallenges).values({
    id,
    day: today,
    nodeSlug: pick.slug,
    questionId: pick.question.id,
  }).run();
  const challenge = db.select().from(dailyChallenges).where(eq(dailyChallenges.id, id)).get();
  if (!challenge) return null;
  return {
    challenge,
    nodeTitle: pick.title,
    question: stripAnswer(pick.question),
  };
}

// Drop the answer key from the question payload before sending to
// the client. Keeps the daily-challenge flow honest.
function stripAnswer(q: any): any {
  const out = { ...q };
  delete out.correctIndex;
  delete out.explanation;
  return out;
}

// Returns the consecutive count of distinct days the user has
// answered the daily challenge correctly, ending today (or yesterday
// if today's hasn't been done yet).
function dailyStreak(userId: string): number {
  const db = getDb();
  const rows = db
    .select({
      day: dailyChallenges.day,
      correct: dailyChallengeAttempts.correct,
    })
    .from(dailyChallengeAttempts)
    .innerJoin(dailyChallenges, eq(dailyChallengeAttempts.challengeId, dailyChallenges.id))
    .where(eq(dailyChallengeAttempts.userId, userId))
    .all();
  const correctDays = new Set(
    rows.filter((r) => r.correct).map((r) => r.day),
  );
  // Walk backward from today; allow today missing and start from yesterday.
  const cursor = new Date();
  let streak = 0;
  // If today not done, start the walk from yesterday so a fresh user
  // still has a chance to maintain a streak by answering before
  // midnight UTC.
  if (!correctDays.has(dayKey(cursor))) {
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  while (correctDays.has(dayKey(cursor))) {
    streak++;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return streak;
}

gamificationRouter.get("/daily-challenge", async (c) => {
  const today = dayKey();
  const me = await getSessionUser(c);
  const picked = pickOrCreateChallenge(today);
  if (!picked) return c.json({ error: "No challenges available — seed quizzes first." }, 503);

  const db = getDb();
  const attemptCounts = db
    .select({
      correct: sql<number>`SUM(CASE WHEN ${dailyChallengeAttempts.correct} = 1 THEN 1 ELSE 0 END)`.as("correct"),
      total: count(),
    })
    .from(dailyChallengeAttempts)
    .where(eq(dailyChallengeAttempts.challengeId, picked.challenge.id))
    .get();
  const attempted = Number(attemptCounts?.total ?? 0);
  const correct = Number(attemptCounts?.correct ?? 0);
  const correctRate = attempted > 0 ? correct / attempted : 0;

  let myAnswer: { answer: string; correct: boolean } | null = null;
  let streak = 0;
  if (me) {
    const att = db
      .select({
        answer: dailyChallengeAttempts.answer,
        correct: dailyChallengeAttempts.correct,
      })
      .from(dailyChallengeAttempts)
      .where(
        and(
          eq(dailyChallengeAttempts.challengeId, picked.challenge.id),
          eq(dailyChallengeAttempts.userId, me.id),
        ),
      )
      .get();
    if (att) myAnswer = { answer: att.answer, correct: !!att.correct };
    streak = dailyStreak(me.id);
  }

  return c.json({
    challengeId: picked.challenge.id,
    day: picked.challenge.day,
    nodeSlug: picked.challenge.nodeSlug,
    nodeTitle: picked.nodeTitle,
    question: { raw: picked.question },
    myAnswer,
    stats: { attempted, correct, correctRate },
    streak,
  });
});

const submitSchema = z.object({ answer: z.string() });

gamificationRouter.post(
  "/daily-challenge/submit",
  requireAuth,
  zValidator("json", submitSchema),
  async (c) => {
    const me = c.get("user")!;
    const { answer } = c.req.valid("json");
    const db = getDb();
    const today = dayKey();
    const picked = pickOrCreateChallenge(today);
    if (!picked) return c.json({ error: "No challenge today." }, 503);

    // Reload the full question (with answer) from the source quiz.
    const node = db
      .select({ quizData: masteryNodes.quizData })
      .from(masteryNodes)
      .where(eq(masteryNodes.slug, picked.challenge.nodeSlug))
      .get();
    let qs: any[] = [];
    try {
      qs = JSON.parse(node?.quizData ?? "[]");
    } catch {
      qs = [];
    }
    const q = qs.find((qq) => qq.id === picked.challenge.questionId);
    if (!q) return c.json({ error: "Challenge question missing." }, 500);

    const correct = answer === String(q.correctIndex);

    // Insert-or-update so re-submits with the same answer are idempotent.
    const existing = db
      .select({ id: dailyChallengeAttempts.id })
      .from(dailyChallengeAttempts)
      .where(
        and(
          eq(dailyChallengeAttempts.challengeId, picked.challenge.id),
          eq(dailyChallengeAttempts.userId, me.id),
        ),
      )
      .get();
    // S91 — fire XP grant + activity record on the FIRST correct
    // attempt only. Idempotency on grantXp's unique
    // (userId, source, sourceRefId) means a re-attempt the same day
    // is a no-op even if the route is called twice. recordActivity
    // is also tagged by today's date so it doesn't double-count.
    let xpResult: GrantXpResult | null = null;
    if (!existing) {
      db.insert(dailyChallengeAttempts).values({
        id: randomUUID(),
        challengeId: picked.challenge.id,
        userId: me.id,
        correct,
        answer,
      }).run();
      if (correct) {
        recordActivity(me.id, "daily_challenge");
        xpResult = grantXp({
          userId: me.id,
          source: "daily-challenge-correct",
          sourceRefId: picked.challenge.id,
        });
      }
    }

    const attemptCounts = db
      .select({
        correct: sql<number>`SUM(CASE WHEN ${dailyChallengeAttempts.correct} = 1 THEN 1 ELSE 0 END)`.as("correct"),
        total: count(),
      })
      .from(dailyChallengeAttempts)
      .where(eq(dailyChallengeAttempts.challengeId, picked.challenge.id))
      .get();
    const attempted = Number(attemptCounts?.total ?? 0);
    const totalCorrect = Number(attemptCounts?.correct ?? 0);

    return c.json({
      correct,
      stats: {
        attempted,
        correct: totalCorrect,
        correctRate: attempted > 0 ? totalCorrect / attempted : 0,
      },
      streak: dailyStreak(me.id),
      // S91 — XP awarded for the first correct attempt today.
      // 0 when wrong or already-attempted (idempotency suppressed
      // the duplicate grant). petHatched + petLeveledUp let the
      // client celebrate the milestone right on the daily-challenge
      // page rather than waiting for the next page load.
      xpAwarded: xpResult?.amount ?? 0,
      petHatched: xpResult?.petHatched ?? null,
      petLeveledUp: xpResult?.petLeveledUp ?? null,
    });
  },
);

// --- Path-completion certificate ---

gamificationRouter.get(
  "/paths/:slug/certificate/:username",
  async (c) => {
    const slug = c.req.param("slug")!;
    const username = c.req.param("username")!;
    const db = getDb();

    const path = db
      .select()
      .from(masteryPaths)
      .where(eq(masteryPaths.slug, slug))
      .get();
    if (!path) return c.json({ error: "Path not found" }, 404);

    const user = db
      .select({ id: users.id, username: users.username, displayName: users.displayName })
      .from(users)
      .where(eq(users.username, username))
      .get();
    if (!user) return c.json({ error: "User not found" }, 404);

    const nodeRows = db
      .select({ id: masteryNodes.id })
      .from(masteryNodes)
      .where(eq(masteryNodes.pathId, path.id))
      .all();
    const nodeIds = nodeRows.map((n) => n.id);
    if (nodeIds.length === 0) return c.json({ error: "Path has no nodes" }, 400);

    const completions = db
      .select({
        nodeId: userProgress.nodeId,
        completedAt: userProgress.completedAt,
      })
      .from(userProgress)
      .where(
        and(
          eq(userProgress.userId, user.id),
          eq(userProgress.completed, true),
          sql`${userProgress.nodeId} in ${nodeIds}`,
        ),
      )
      .orderBy(desc(userProgress.completedAt))
      .all();

    if (completions.length < nodeIds.length) {
      return c.json(
        { error: "Path not yet complete", completed: completions.length, total: nodeIds.length },
        409,
      );
    }

    const achievementRow = db
      .select({ n: count() })
      .from(userAchievements)
      .where(eq(userAchievements.userId, user.id))
      .get();

    // Accent color per path slug — picks a palette entry deterministically.
    const PALETTES: Record<string, string> = {
      "ml-engineer": "indigo",
      "ai-researcher": "violet",
      mathematician: "emerald",
      physicist: "rose",
    };

    return c.json({
      pathSlug: path.slug,
      pathTitle: path.title,
      username: user.username,
      displayName: user.displayName,
      completedAt: completions[0]?.completedAt ?? new Date().toISOString(),
      totalNodes: nodeIds.length,
      achievements: Number(achievementRow?.n ?? 0),
      accentColor: PALETTES[path.slug] ?? "indigo",
    });
  },
);
