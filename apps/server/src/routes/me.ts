// Sprint 29-31 — /me/* routes for current-user oriented surfaces.
//
// Currently houses:
//   - GET /me/weak-concepts          — Sprint 29 misconception diagnoses
//   - POST /me/weak-concepts/:id/dismiss
//   - POST /me/weak-concepts/refresh — runs the detector on demand
//   - GET /me/prereq-status          — Sprint 31 PrereqXray data

import { Hono } from "hono";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import {
  capstoneEnrollments,
  capstoneSubmissions,
  capstoneTrackCompletions,
  capstoneTracks,
  classes,
  classEnrollments,
  comments,
  contentProposals,
  cohortInvitations,
  emailVerificationTokens,
  flashcards,
  forumPosts,
  getDb,
  masteryNodes,
  masteryPaths,
  misconceptionCatalog,
  misconceptionDiagnoses,
  notifications,
  petCosmetics,
  petInventory,
  pets,
  sessions,
  users,
  userProgress,
  wikiPages,
  xpGrants,
} from "@axiomic/db";
import { randomBytes } from "crypto";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import {
  currentSessionId,
  destroySession,
  requireAuth,
} from "../middleware/auth";
import { checkRateLimit } from "../lib/rateLimit";
import { env } from "../lib/envConfig";
import { sendEmail } from "../lib/email";
import { runDetectorForUser } from "../lib/misconceptionDetector";
import { buildKnowledgeMri } from "../lib/knowledgeMri";
import { recordMasterySnapshot, buildReadiness } from "../lib/readiness";
import { currentStreak } from "../lib/achievements";
import { totalXpForUser } from "../lib/xp";
import { gradeEssay } from "../lib/essayGrader";
import { resolveMisconceptionIfProven } from "../lib/tutorResolution";
import { buildGoalPath } from "../lib/goalPlanner";
import { analyzeSkillGap } from "../lib/skillGap";
import { getRole } from "../lib/roles";
import { createEndorsement, revokeEndorsement } from "../lib/endorsements";
import type { Env } from "../env";

export const meRouter = new Hono<Env>();

// Sprint 52 — A signed-in author's own content proposals (pending +
// recently decided) so the lesson / news / wiki editors can render an
// "Awaiting review" banner.
meRouter.get("/proposals", requireAuth, async (c) => {
  const user = c.get("user")!;
  const db = getDb();
  const rows = db
    .select()
    .from(contentProposals)
    .where(eq(contentProposals.proposerId, user.id))
    .orderBy(desc(contentProposals.createdAt))
    .limit(50)
    .all();
  return c.json({
    proposals: rows.map((p) => ({
      id: p.id,
      kind: p.kind,
      targetId: p.targetId,
      status: p.status,
      reviewNote: p.reviewNote,
      createdAt: p.createdAt,
      decidedAt: p.decidedAt,
    })),
  });
});

// Sprint 54 — capstone-track completions for the caller. Powers the
// "Tracks earned" card on the home dashboard + the profile portfolio.
meRouter.get("/track-completions", requireAuth, async (c) => {
  const user = c.get("user")!;
  const db = getDb();
  const rows = db
    .select({
      id: capstoneTrackCompletions.id,
      trackId: capstoneTrackCompletions.trackId,
      artifactPageSlug: capstoneTrackCompletions.artifactPageSlug,
      completedAt: capstoneTrackCompletions.completedAt,
      trackSlug: capstoneTracks.slug,
      trackTitle: capstoneTracks.title,
      coverEmoji: capstoneTracks.coverEmoji,
      accentColor: capstoneTracks.accentColor,
    })
    .from(capstoneTrackCompletions)
    .innerJoin(
      capstoneTracks,
      eq(capstoneTrackCompletions.trackId, capstoneTracks.id),
    )
    .where(eq(capstoneTrackCompletions.userId, user.id))
    .orderBy(desc(capstoneTrackCompletions.completedAt))
    .all();
  return c.json({ completions: rows });
});

// Sprint 52 — Pending invitations matching the caller's email so the
// home page can surface a "You've been invited to cohort X" banner.
meRouter.get("/cohort-invitations", requireAuth, async (c) => {
  const user = c.get("user")!;
  const db = getDb();
  const rows = db
    .select()
    .from(cohortInvitations)
    .where(
      and(
        eq(cohortInvitations.email, user.email.toLowerCase()),
        eq(cohortInvitations.status, "pending"),
      ),
    )
    .orderBy(desc(cohortInvitations.createdAt))
    .limit(20)
    .all();
  return c.json({
    invitations: rows.map((r) => ({
      id: r.id,
      cohortId: r.cohortId,
      token: r.token,
      message: r.message,
      createdAt: r.createdAt,
    })),
  });
});

meRouter.get("/weak-concepts", requireAuth, async (c) => {
  const user = c.get("user")!;
  const db = getDb();

  const rows = db
    .select({
      id: misconceptionDiagnoses.id,
      conceptSlug: misconceptionDiagnoses.conceptSlug,
      misconceptionKey: misconceptionDiagnoses.misconceptionKey,
      label: misconceptionDiagnoses.label,
      evidenceJson: misconceptionDiagnoses.evidenceJson,
      confidence: misconceptionDiagnoses.confidence,
      status: misconceptionDiagnoses.status,
      firstSeenAt: misconceptionDiagnoses.firstSeenAt,
      lastSeenAt: misconceptionDiagnoses.lastSeenAt,
    })
    .from(misconceptionDiagnoses)
    .where(
      and(
        eq(misconceptionDiagnoses.userId, user.id),
      ),
    )
    .orderBy(desc(misconceptionDiagnoses.confidence))
    .all();

  // Filter dismissed rows out of the default UI.
  const visible = rows.filter((r) => r.status !== "dismissed");
  if (visible.length === 0) return c.json({ diagnoses: [] });

  // Bundle catalog descriptions + wiki page titles.
  const keys = [...new Set(visible.map((r) => r.misconceptionKey))];
  const catalogRows = db
    .select()
    .from(misconceptionCatalog)
    .where(inArray(misconceptionCatalog.key, keys))
    .all();
  const catalogByKey = new Map(catalogRows.map((c) => [c.key, c]));

  const slugs = [...new Set(visible.map((r) => r.conceptSlug))];
  const wikis = slugs.length
    ? db
        .select({ id: wikiPages.id, slug: wikiPages.slug, title: wikiPages.title })
        .from(wikiPages)
        .where(inArray(wikiPages.slug, slugs))
        .all()
    : [];
  const titleBySlug = new Map(wikis.map((w) => [w.slug, w.title]));
  const pageIdBySlug = new Map(wikis.map((w) => [w.slug, w.id]));

  // Phase 16B — gather data needed for `nextSteps` hints. One bulk
  // query per data source so we stay flat regardless of diagnosis
  // count. Mastery nodes is a small table (≤ a few hundred rows),
  // and the JSON-array pageIds parse happens once.
  const cardSlugs = new Set(
    db
      .select({ pageSlug: flashcards.pageSlug })
      .from(flashcards)
      .where(
        and(
          eq(flashcards.userId, user.id),
          inArray(flashcards.pageSlug, slugs),
        ),
      )
      .all()
      .map((r) => r.pageSlug),
  );

  const allNodes = db
    .select({
      slug: masteryNodes.slug,
      pathId: masteryNodes.pathId,
      pageIds: masteryNodes.pageIds,
      quizData: masteryNodes.quizData,
    })
    .from(masteryNodes)
    .all();
  const pathSlugById = new Map(
    db
      .select({ id: masteryPaths.id, slug: masteryPaths.slug })
      .from(masteryPaths)
      .all()
      .map((p) => [p.id, p.slug]),
  );
  // Build a pageId → { pathSlug, nodeSlug } index for nodes that
  // actually carry a quiz. First match wins — most concepts only
  // appear under one node anyway.
  const quizNodeByPageId = new Map<string, { pathSlug: string; nodeSlug: string }>();
  for (const n of allNodes) {
    if (!n.quizData) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(n.pageIds);
    } catch {
      continue;
    }
    if (!Array.isArray(parsed)) continue;
    const pathSlug = pathSlugById.get(n.pathId);
    if (!pathSlug) continue;
    for (const pid of parsed) {
      if (typeof pid !== "string") continue;
      if (!quizNodeByPageId.has(pid)) {
        quizNodeByPageId.set(pid, { pathSlug, nodeSlug: n.slug });
      }
    }
  }

  return c.json({
    diagnoses: visible.map((r) => {
      let evidence: Array<{ kind: string; refId: string; snippet: string }> = [];
      try {
        const parsed = JSON.parse(r.evidenceJson);
        if (Array.isArray(parsed)) evidence = parsed;
      } catch {
        // ignore
      }
      const cat = catalogByKey.get(r.misconceptionKey);
      const wikiSlug = titleBySlug.has(r.conceptSlug) ? r.conceptSlug : null;
      const pageId = pageIdBySlug.get(r.conceptSlug);
      const quizPath = pageId ? quizNodeByPageId.get(pageId) ?? null : null;
      return {
        id: r.id,
        conceptSlug: r.conceptSlug,
        conceptTitle: titleBySlug.get(r.conceptSlug) ?? null,
        misconceptionKey: r.misconceptionKey,
        label: r.label,
        description: cat?.description ?? "",
        evidence,
        confidence: r.confidence,
        status: r.status,
        firstSeenAt: r.firstSeenAt,
        lastSeenAt: r.lastSeenAt,
        nextSteps: {
          wikiSlug,
          quizPath,
          hasFlashcards: cardSlugs.has(r.conceptSlug),
        },
      };
    }),
  });
});

// Sprint 33 — Knowledge MRI. Returns a concept-level diagnostic
// snapshot composing user_progress + misconception_diagnoses +
// quiz_mistakes + flashcard_reviews + mastery_paths/nodes. Pure
// aggregator; no new schema.
meRouter.get("/knowledge-mri", requireAuth, async (c) => {
  const user = c.get("user")!;
  const mri = await buildKnowledgeMri(user.id);
  // Phase 28E — capture a daily longitudinal snapshot at zero
  // extra user cost. Idempotent per UTC day; best-effort so a
  // snapshot failure can't break the MRI read.
  try {
    recordMasterySnapshot(user.id, mri);
  } catch {
    // swallow — diagnostics shouldn't 500 on a snapshot write
  }
  return c.json(mri);
});

// Phase 28E — readiness projection + dated study plan derived
// from accumulated mastery snapshots + active weakness diagnoses.
meRouter.get("/readiness", requireAuth, async (c) => {
  const user = c.get("user")!;
  return c.json(buildReadiness(user.id));
});

// Phase 31B / 32C — prerequisite-ordered path from the user's
// current mastery state to a target credential (capstone/track/
// exam) or an explicit skill set (kind=skills, slug=a,b,c).
meRouter.get("/goal-path", requireAuth, async (c) => {
  const user = c.get("user")!;
  const kind = c.req.query("kind");
  const slug = (c.req.query("slug") ?? "").trim();
  if (
    (kind !== "capstone" &&
      kind !== "track" &&
      kind !== "exam" &&
      kind !== "skills") ||
    !slug
  ) {
    return c.json(
      { error: "kind (capstone|track|exam|skills) + slug required" },
      400,
    );
  }
  return c.json(buildGoalPath(user.id, { kind, slug }));
});

// Phase 32C — signed-proof skill-gap vs. a target role or an
// ad-hoc skill list, plus a dependency-ordered path over the gap.
meRouter.get("/skill-gap", requireAuth, async (c) => {
  const user = c.get("user")!;
  const roleSlug = (c.req.query("role") ?? "").trim();
  const skillsParam = (c.req.query("skills") ?? "").trim();
  let target: string[] = [];
  let role: { slug: string; title: string; descriptionMd: string } | null =
    null;
  if (roleSlug) {
    const r = getRole(roleSlug);
    if (!r) return c.json({ error: "Unknown role" }, 404);
    role = {
      slug: r.slug,
      title: r.title,
      descriptionMd: r.descriptionMd,
    };
    target = r.requiredSkillSlugs;
  } else if (skillsParam) {
    target = skillsParam.split(",");
  } else {
    return c.json({ error: "role or skills query required" }, 400);
  }
  const gap = analyzeSkillGap(user.id, target);
  // Actionable: order only the actual gap (weak ∪ missing).
  const gapSlugs = [
    ...gap.weak.map((w) => w.slug),
    ...gap.missing.map((m) => m.slug),
  ];
  const path =
    gapSlugs.length > 0
      ? buildGoalPath(user.id, { kind: "skills", slug: gapSlugs.join(",") })
      : null;
  return c.json({ role, gap, path });
});

// Phase 33C — endorse a peer for a skill. The weight is derived
// server-side from the caller's OWN proven competency — clients
// can't inflate it. No self-endorsement; rate-limited.
meRouter.post(
  "/endorsements",
  requireAuth,
  zValidator(
    "json",
    z.object({
      username: z.string().min(1),
      skillSlug: z.string().min(1).max(120),
      skillTitle: z.string().max(200).optional().default(""),
      note: z.string().max(280).optional().default(""),
    }),
  ),
  (c) => {
    const me = c.get("user")!;
    if (
      env.NODE_ENV !== "test" &&
      !checkRateLimit(`endorse:${me.id}`, 20, 60_000)
    ) {
      return c.json({ error: "Rate limited. Slow down." }, 429);
    }
    const { username, skillSlug, skillTitle, note } = c.req.valid("json");
    const endorsee = getDb()
      .select({ id: users.id })
      .from(users)
      .where(eq(users.username, username))
      .get();
    if (!endorsee) return c.json({ error: "User not found" }, 404);
    if (endorsee.id === me.id) {
      return c.json({ error: "You can't endorse yourself." }, 400);
    }
    const r = createEndorsement(
      me.id,
      endorsee.id,
      skillSlug.trim().toLowerCase(),
      skillTitle || skillSlug,
      note,
    );
    if (!r.ok) {
      return c.json(
        { error: "You've already endorsed this user for this skill." },
        409,
      );
    }
    return c.json(
      { ok: true, id: r.value.id, weight: r.value.weight },
      201,
    );
  },
);

meRouter.delete("/endorsements/:id", requireAuth, (c) => {
  const me = c.get("user")!;
  const ok = revokeEndorsement(c.req.param("id")!, me.id);
  if (!ok) return c.json({ error: "Not found" }, 404);
  return c.json({ ok: true });
});

meRouter.post("/weak-concepts/refresh", requireAuth, async (c) => {
  const user = c.get("user")!;
  const upserts = await runDetectorForUser(user.id);
  return c.json({ upserts });
});

meRouter.post("/weak-concepts/:id/dismiss", requireAuth, async (c) => {
  const user = c.get("user")!;
  const id = c.req.param("id")!;
  const db = getDb();

  const existing = db
    .select({ id: misconceptionDiagnoses.id, userId: misconceptionDiagnoses.userId })
    .from(misconceptionDiagnoses)
    .where(eq(misconceptionDiagnoses.id, id))
    .get();
  if (!existing || existing.userId !== user.id) {
    return c.json({ error: "Diagnosis not found" }, 404);
  }

  db.update(misconceptionDiagnoses)
    .set({ status: "dismissed" })
    .where(eq(misconceptionDiagnoses.id, id))
    .run();
  return c.json({ ok: true });
});

// Phase 31A — prove a misconception is resolved. The user answers
// a misconception-probing drill; we AI-grade it server-side and,
// on a passing score, flip the diagnosis status→'resolved'
// (closing the active→coached→resolved loop). Idempotent.
meRouter.post(
  "/weak-concepts/:id/prove",
  requireAuth,
  zValidator("json", z.object({ answer: z.string().min(1).max(4000) })),
  async (c) => {
    const user = c.get("user")!;
    const id = c.req.param("id")!;
    if (
      env.NODE_ENV !== "test" &&
      !checkRateLimit(`tutor-prove:${user.id}`, 10, 60_000)
    ) {
      return c.json({ error: "Rate limited. Slow down." }, 429);
    }
    const db = getDb();
    const diag = db
      .select()
      .from(misconceptionDiagnoses)
      .where(eq(misconceptionDiagnoses.id, id))
      .get();
    if (!diag || diag.userId !== user.id) {
      return c.json({ error: "Diagnosis not found" }, 404);
    }
    if (diag.status === "resolved" || diag.status === "dismissed") {
      return c.json({
        resolved: false,
        alreadyResolved: true,
        score: null,
        feedbackMd: `Already ${diag.status}.`,
        reason: `already ${diag.status}`,
      });
    }
    const { answer } = c.req.valid("json");
    const cat = db
      .select({
        description: misconceptionCatalog.description,
        probeQuestionsJson: misconceptionCatalog.probeQuestionsJson,
        correctionPromptTemplate:
          misconceptionCatalog.correctionPromptTemplate,
      })
      .from(misconceptionCatalog)
      .where(eq(misconceptionCatalog.key, diag.misconceptionKey))
      .get();
    let probe = `Explain ${diag.conceptSlug} correctly, directly addressing this misconception: ${diag.label}`;
    try {
      const qs = JSON.parse(cat?.probeQuestionsJson ?? "[]");
      if (Array.isArray(qs) && typeof qs[0] === "string" && qs[0]) {
        probe = qs[0];
      }
    } catch {
      // keep the fallback probe
    }
    const rubricMd = [
      `The answer must demonstrate the learner no longer holds this misconception: "${diag.label}".`,
      cat?.description ? `Context: ${cat.description}` : "",
      cat?.correctionPromptTemplate
        ? `A correct understanding looks like: ${cat.correctionPromptTemplate}`
        : "",
      "Score 100 only if the answer is correct AND explicitly avoids the misconception; score low if it repeats the misconception.",
    ]
      .filter(Boolean)
      .join("\n");

    let score = 0;
    let feedbackMd = "";
    try {
      const g = await gradeEssay({
        promptMd: probe,
        rubricMd,
        maxScore: 100,
        essayResponse: answer,
        signal: AbortSignal.timeout(20_000),
      });
      score = g.score;
      feedbackMd = g.feedbackMd;
    } catch {
      return c.json(
        { error: "Grading is busy — try again in a moment." },
        503,
      );
    }
    const r = resolveMisconceptionIfProven(user.id, id, {
      kind: "essay",
      score: score / 100,
    });
    return c.json({
      resolved: r.resolved,
      alreadyResolved: false,
      score,
      feedbackMd,
      reason: r.reason,
    });
  },
);

// Sprint 31 — Prereq X-ray. Takes a comma-separated wikiSlugs query
// and returns mastery status per slug. Mastered = user has positive
// progress on a node referencing the slug; in_progress = node visited
// but score below the mastery threshold; untouched otherwise.
meRouter.get("/prereq-status", requireAuth, async (c) => {
  const user = c.get("user")!;
  const slugsParam = c.req.query("wikiSlugs") ?? "";
  const slugs = slugsParam
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (slugs.length === 0) return c.json({ entries: [] });
  const db = getDb();

  // Resolve slug → node ids.
  const allNodes = db.select().from(masteryNodes).all();
  type SlugMatch = {
    nodeId: string;
    nodeSlug: string;
    pathSlug: string;
  };
  const matchesBySlug = new Map<string, SlugMatch[]>();
  for (const n of allNodes) {
    let pageIds: string[] = [];
    try {
      const parsed = JSON.parse(n.pageIds);
      if (Array.isArray(parsed)) {
        pageIds = parsed.filter((s): s is string => typeof s === "string");
      }
    } catch {
      // ignore
    }
    for (const slug of pageIds) {
      if (!slugs.includes(slug)) continue;
      const list = matchesBySlug.get(slug) ?? [];
      list.push({
        nodeId: n.id,
        nodeSlug: n.slug,
        pathSlug: n.pathId,
      });
      matchesBySlug.set(slug, list);
    }
  }

  const wikis = db
    .select({ slug: wikiPages.slug, title: wikiPages.title })
    .from(wikiPages)
    .where(inArray(wikiPages.slug, slugs))
    .all();
  const titleBySlug = new Map(wikis.map((w) => [w.slug, w.title]));

  // Pull user_progress for all matched nodes in one query.
  const allNodeIds = [...matchesBySlug.values()].flat().map((m) => m.nodeId);
  const progressRows = allNodeIds.length
    ? db
        .select()
        .from(userProgress)
        .where(
          and(
            eq(userProgress.userId, user.id),
            inArray(userProgress.nodeId, allNodeIds),
          ),
        )
        .all()
    : [];
  const progressByNode = new Map(progressRows.map((p) => [p.nodeId, p]));

  return c.json({
    entries: slugs.map((slug) => {
      const matches = matchesBySlug.get(slug) ?? [];
      // Mastered: any node referencing the slug has score >= 0.7.
      // In-progress: any visited; untouched otherwise.
      let status: "mastered" | "in_progress" | "untouched" = "untouched";
      let pickedNode: SlugMatch | undefined;
      for (const m of matches) {
        const p = progressByNode.get(m.nodeId);
        if (!p) continue;
        if (p.quizScore && p.quizScore >= 0.7) {
          status = "mastered";
          pickedNode = m;
          break;
        }
        if (status === "untouched") {
          status = "in_progress";
          pickedNode = m;
        }
      }
      return {
        conceptSlug: slug,
        conceptTitle: titleBySlug.get(slug) ?? null,
        status,
        nodeId: pickedNode?.nodeId,
        nodeSlug: pickedNode?.nodeSlug,
        pathSlug: pickedNode?.pathSlug,
      };
    }),
  });
});

// =================================================================
// S94 — Student progress dashboard.
// =================================================================
//
// Mirror of the S93 instructor dashboard, scoped to the current
// user. Aggregates the user's XP timeline, source breakdown, class
// standings, cosmetic-collection progress, streak, and competition
// wins into one payload so the dashboard renders in a single
// round-trip.
//
// All reads are class-scoped or user-scoped; nothing here exposes
// other users' data.

const PROGRESS_DAY_WINDOW = 30;

meRouter.get("/progress", requireAuth, async (c) => {
  const me = c.get("user")!;
  const db = getDb();

  // 1. xpByDay — all XP (class + non-class) per UTC day, last 30 days.
  // strftime normalizes both ISO and SQLite-format timestamps.
  const xpRows = db
    .select({
      day: sql<string>`strftime('%Y-%m-%d', ${xpGrants.awardedAt})`.as("day"),
      totalXp: sql<number>`coalesce(sum(${xpGrants.amount}), 0)`,
    })
    .from(xpGrants)
    .where(
      and(
        eq(xpGrants.userId, me.id),
        sql`datetime(${xpGrants.awardedAt}) >= datetime('now', '-${sql.raw(String(PROGRESS_DAY_WINDOW))} days')`,
      ),
    )
    .groupBy(sql`strftime('%Y-%m-%d', ${xpGrants.awardedAt})`)
    .all();
  const xpByDayMap = new Map(xpRows.map((r) => [r.day, r]));
  const xpByDay: { day: string; totalXp: number }[] = [];
  const today = new Date();
  for (let i = PROGRESS_DAY_WINDOW - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() - i);
    const key = d.toISOString().slice(0, 10);
    const row = xpByDayMap.get(key);
    xpByDay.push({ day: key, totalXp: Number(row?.totalXp ?? 0) });
  }

  // 2. xpBySource — lifetime breakdown. Useful for "where does my
  // XP come from" — a heavy reader vs. a homework grinder vs. a
  // streak warrior all earn equivalent XP via different paths.
  const sourceRows = db
    .select({
      source: xpGrants.source,
      totalXp: sql<number>`coalesce(sum(${xpGrants.amount}), 0)`,
      count: sql<number>`count(*)`,
    })
    .from(xpGrants)
    .where(eq(xpGrants.userId, me.id))
    .groupBy(xpGrants.source)
    .orderBy(desc(sql`coalesce(sum(${xpGrants.amount}), 0)`))
    .all();
  const xpBySource = sourceRows.map((r) => ({
    source: r.source,
    totalXp: Number(r.totalXp),
    count: Number(r.count),
  }));

  // 3. classStandings — for each class I'm enrolled in, my XP +
  // rank + roster size.
  //
  // S-audit fix — was 3 queries per enrolled class (myXp,
  // aboveMeCount, memberCount) which scaled O(N classes) and made
  // /me/progress slow for power users. Now: two batched queries
  // total. One pulls every (classId, userId, total XP) row across
  // my classes; we group in JS to derive my XP and rank per class.
  // The other pulls enrollment counts per class.
  const enrollments = db
    .select({
      classId: classEnrollments.classId,
      classSlug: classes.slug,
      classTitle: classes.title,
    })
    .from(classEnrollments)
    .innerJoin(classes, eq(classes.id, classEnrollments.classId))
    .where(eq(classEnrollments.userId, me.id))
    .all();

  const classIds = enrollments.map((e) => e.classId);
  const allTotals = classIds.length
    ? db
        .select({
          classId: xpGrants.classId,
          userId: xpGrants.userId,
          total: sql<number>`coalesce(sum(${xpGrants.amount}), 0)`,
        })
        .from(xpGrants)
        .where(inArray(xpGrants.classId, classIds))
        .groupBy(xpGrants.classId, xpGrants.userId)
        .all()
    : [];
  // Group totals by classId so we can compute my rank locally.
  const totalsByClass = new Map<string, Array<{ userId: string; total: number }>>();
  for (const r of allTotals) {
    if (r.classId == null) continue; // shouldn't happen given the where clause
    const arr = totalsByClass.get(r.classId) ?? [];
    arr.push({ userId: r.userId, total: Number(r.total) });
    totalsByClass.set(r.classId, arr);
  }

  const memberRows = classIds.length
    ? db
        .select({
          classId: classEnrollments.classId,
          n: sql<number>`count(*)`,
        })
        .from(classEnrollments)
        .where(inArray(classEnrollments.classId, classIds))
        .groupBy(classEnrollments.classId)
        .all()
    : [];
  const memberCountByClass = new Map(memberRows.map((r) => [r.classId, Number(r.n)]));

  const classStandings = enrollments.map((e) => {
    const totals = totalsByClass.get(e.classId) ?? [];
    const me_total = totals.find((t) => t.userId === me.id)?.total ?? 0;
    const myRank = 1 + totals.filter((t) => t.total > me_total).length;
    return {
      classSlug: e.classSlug,
      classTitle: e.classTitle,
      myXp: me_total,
      myRank,
      totalMembers: memberCountByClass.get(e.classId) ?? 0,
    };
  });

  // 4. cosmeticProgress — owned vs. total catalog size. NOT just
  // shop-purchasable: includes grant-only + competition-prize
  // cosmetics so the "100% collection" goal is real.
  const totalCosmeticsRow = db
    .select({ n: sql<number>`count(*)` })
    .from(petCosmetics)
    .get();
  const totalCosmetics = Number(totalCosmeticsRow?.n ?? 0);
  const ownedRows = db
    .select({ slug: petInventory.cosmeticSlug })
    .from(petInventory)
    .where(eq(petInventory.userId, me.id))
    .all();
  const ownedSlugs = ownedRows.map((r) => r.slug);

  // 5. streak — the activity-events streak that powers the S87
  // streak-day-bonus. Surfaces here so the user sees what they're
  // protecting.
  const streak = currentStreak(db, me.id);

  // 6. competitionWins — count of competition_won notifications.
  // Cheap audit using the existing notifications feed; no new table.
  const winsRow = db
    .select({ n: sql<number>`count(*)` })
    .from(notifications)
    .where(
      and(
        eq(notifications.userId, me.id),
        eq(notifications.kind, "competition_won"),
      ),
    )
    .get();
  const competitionWins = Number(winsRow?.n ?? 0);

  return c.json({
    lifetimeXp: totalXpForUser(me.id),
    streak,
    competitionWins,
    xpByDay,
    xpBySource,
    classStandings,
    cosmeticProgress: {
      ownedCount: ownedSlugs.length,
      totalCosmetics,
      ownedSlugs,
    },
    windowDays: PROGRESS_DAY_WINDOW,
  });
});

// =================================================================
// S108 — Beta-readiness: account deletion + data export.
// =================================================================

// DELETE /me — soft-delete the caller's account.
//
// Soft delete: set deletedAt, scrub display fields, rotate the
// session cookie. The 30-day sweeper job (lib/userCleanupJob.ts)
// hard-deletes the row + cascades content removal.
// Account-takeover prevention: require password re-entry in the body.
meRouter.delete("/", requireAuth, async (c) => {
  const me = c.get("user")!;
  const body = (await c.req.json().catch(() => ({}))) as { password?: string };
  if (!body.password) {
    return c.json({ error: "Password required to confirm deletion" }, 400);
  }
  const db = getDb();
  const row = db.select({ passwordHash: users.passwordHash }).from(users).where(eq(users.id, me.id)).get();
  if (!row) return c.json({ error: "User not found" }, 404);
  const ok = await Bun.password.verify(body.password, row.passwordHash, "bcrypt");
  if (!ok) return c.json({ error: "Password incorrect" }, 401);

  const now = new Date().toISOString();
  db.update(users)
    .set({
      deletedAt: now,
      displayName: "[deleted]",
      bio: "",
      // Scrubbing email + username on soft-delete would break their
      // own join-back-with-recovery flow. Wait for the 30-day sweeper
      // to cascade-delete the row.
    })
    .where(eq(users.id, me.id))
    .run();

  await destroySession(c);
  return c.json({ ok: true, scheduledHardDeleteAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() });
});

// GET /me/export — JSON dump of everything user-scoped. Used by the
// Settings "Export my data" button. Returned as a single JSON
// document (Bun's Hono will set Content-Length); for users with very
// large histories this could be large but typical sizes are < 1 MB.
meRouter.get("/export", requireAuth, async (c) => {
  const me = c.get("user")!;
  // S109 — rate-limit /me/export to 5/hour/user. The response can be
  // a few MB for power users; an unrate-limited GET is a small DOS
  // amplifier. Skipped in NODE_ENV=test.
  if (env.NODE_ENV !== "test") {
    if (!checkRateLimit(`export:u:${me.id}`, 5, 60 * 60_000)) {
      return c.json({ error: "Too many export requests. Try again later." }, 429);
    }
  }
  const db = getDb();

  const profile = db
    .select({
      id: users.id,
      username: users.username,
      email: users.email,
      displayName: users.displayName,
      bio: users.bio,
      role: users.role,
      orcid: users.orcid,
      scholarUrl: users.scholarUrl,
      blueskyHandle: users.blueskyHandle,
      institution: users.institution,
      createdAt: users.createdAt,
      emailVerifiedAt: users.emailVerifiedAt,
    })
    .from(users)
    .where(eq(users.id, me.id))
    .get();

  const myComments = db.select().from(comments).where(eq(comments.userId, me.id)).all();
  const myForumPosts = db.select().from(forumPosts).where(eq(forumPosts.authorId, me.id)).all();
  const myCapstones = db.select().from(capstoneEnrollments).where(eq(capstoneEnrollments.userId, me.id)).all();
  const submissionRows = myCapstones.length
    ? db
        .select()
        .from(capstoneSubmissions)
        .where(inArray(capstoneSubmissions.enrollmentId, myCapstones.map((e) => e.id)))
        .all()
    : [];
  const myXp = db.select().from(xpGrants).where(eq(xpGrants.userId, me.id)).all();
  const myClasses = db
    .select({
      classId: classEnrollments.classId,
      slug: classes.slug,
      title: classes.title,
      role: classEnrollments.role,
      joinedAt: classEnrollments.joinedAt,
    })
    .from(classEnrollments)
    .innerJoin(classes, eq(classes.id, classEnrollments.classId))
    .where(eq(classEnrollments.userId, me.id))
    .all();
  const myPets = db.select().from(pets).where(eq(pets.userId, me.id)).all();
  const myCosmetics = db.select().from(petInventory).where(eq(petInventory.userId, me.id)).all();

  return c.json({
    exportedAt: new Date().toISOString(),
    profile,
    comments: myComments,
    forumPosts: myForumPosts,
    capstoneEnrollments: myCapstones,
    capstoneSubmissions: submissionRows,
    xpGrants: myXp,
    classes: myClasses,
    pets: myPets,
    cosmeticsOwned: myCosmetics,
  });
});

// =================================================================
// S109 — Account hygiene: email change + session list/revoke.
// =================================================================

// POST /me/email-change — start the email change flow. Requires the
// caller's current password (so a stolen session cookie can't
// redirect the verify email to an attacker-controlled inbox).
// Mints a verification token bound to the NEW address, stores the
// requested address in users.pendingEmail.
meRouter.post(
  "/email-change",
  requireAuth,
  zValidator(
    "json",
    z.object({
      newEmail: z.string().email(),
      currentPassword: z.string(),
    }),
  ),
  async (c) => {
    const me = c.get("user")!;
    const { newEmail, currentPassword } = c.req.valid("json");
    const db = getDb();
    const row = db
      .select({ passwordHash: users.passwordHash })
      .from(users)
      .where(eq(users.id, me.id))
      .get();
    if (!row) return c.json({ error: "User not found" }, 404);
    const ok = await Bun.password.verify(currentPassword, row.passwordHash, "bcrypt");
    if (!ok) return c.json({ error: "Current password is incorrect" }, 401);

    // Reject if the new address is already in use by another account.
    const taken = db.select({ id: users.id }).from(users).where(eq(users.email, newEmail)).get();
    if (taken && taken.id !== me.id) {
      return c.json({ error: "That email is already in use" }, 409);
    }

    db.update(users).set({ pendingEmail: newEmail }).where(eq(users.id, me.id)).run();

    // Mint a token tied to this user and dispatch the verify email
    // to the NEW address. The verify route checks pendingEmail
    // matches at consume time so an attacker can't intercept a
    // stale verify link and bind it to a third address.
    db.delete(emailVerificationTokens)
      .where(eq(emailVerificationTokens.userId, me.id))
      .run();
    const token = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    db.insert(emailVerificationTokens).values({
      token,
      userId: me.id,
      expiresAt,
    }).run();

    // Build the verify URL the same way auth.ts does.
    const origin =
      c.req.header("origin") ??
      (c.req.header("host") ? `https://${c.req.header("host")}` : "https://axiomic.app");
    const verifyUrl = `${origin.replace(/\/$/, "")}/verify-email-change?token=${token}`;
    sendEmail({
      to: newEmail,
      subject: "Confirm your new Axiomic email",
      html:
        `<p>Click the link below to confirm <strong>${newEmail}</strong> as your new login email.</p>` +
        `<p><a href="${verifyUrl}">${verifyUrl}</a></p>` +
        `<p>This link expires in 24 hours. If you didn't request this change, ignore the email.</p>`,
      text: `Click the link below to confirm ${newEmail} as your new login email.\n\n${verifyUrl}\n\nThis link expires in 24 hours.`,
    }).catch(() => {
      // best-effort; user can re-request
    });

    return c.json({ ok: true, pendingEmail: newEmail });
  },
);

// GET /me/sessions — list active sessions for the caller. The
// current session is flagged so the UI can disable its revoke button.
meRouter.get("/sessions", requireAuth, async (c) => {
  const me = c.get("user")!;
  const db = getDb();
  const cur = currentSessionId(c);
  const rows = db
    .select({
      id: sessions.id,
      createdAt: sessions.createdAt,
      expiresAt: sessions.expiresAt,
      userAgent: sessions.userAgent,
      ip: sessions.ip,
    })
    .from(sessions)
    .where(eq(sessions.userId, me.id))
    .all();
  return c.json({
    sessions: rows.map((r) => ({ ...r, current: r.id === cur })),
  });
});

// DELETE /me/sessions/:id — revoke another device. Refuses to revoke
// the calling session (use /auth/logout for that).
meRouter.delete("/sessions/:id", requireAuth, async (c) => {
  const me = c.get("user")!;
  const id = c.req.param("id")!;
  const cur = currentSessionId(c);
  if (cur === id) {
    return c.json(
      { error: "Use /auth/logout to sign out the current device." },
      400,
    );
  }
  const db = getDb();
  const row = db
    .select({ userId: sessions.userId })
    .from(sessions)
    .where(eq(sessions.id, id))
    .get();
  if (!row) return c.json({ error: "Session not found" }, 404);
  if (row.userId !== me.id) return c.json({ error: "Not your session" }, 403);
  db.delete(sessions).where(eq(sessions.id, id)).run();
  return c.json({ ok: true });
});
