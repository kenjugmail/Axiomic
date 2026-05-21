// Sprint 50 — Admin operations.
//
// v1 surface for operators to inspect + manually trigger backend
// jobs. Sprint 52 promotes this to a real role-gated router using
// `requireAdmin`, which checks `users.role === 'admin'`. The
// BOOTSTRAP_ADMIN_USERNAME env var seeds the first admin on cold
// start.

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, desc, eq, sql } from "drizzle-orm";
import {
  authorClaimRequests,
  capstoneEnrollments,
  capstoneTracks,
  capstones,
  contentProposals,
  externalPapers,
  getDb,
  jobLeases,
  jobRuns,
  masteryNodes,
  masteryPaths,
  newsArticles,
  researchPapers,
  users,
  wikiPages,
} from "@axiomic/db";
import { requireAdmin } from "../middleware/requireAdmin";
import {
  getLastBuildStats,
  getSearchIndex,
  invalidateSearchIndex,
} from "../lib/searchIndex";
import { approveProposal, rejectProposal } from "../lib/approvals";
import { getCounters, getRecentErrors } from "../lib/errorSampler";
import { rateLimits } from "./ai";
import {
  getProcessId,
  listRegisteredJobs,
  runJobNow,
} from "../lib/jobs";
import {
  approveClaimRequest,
  rejectClaimRequest,
} from "../lib/authorClaim";
import { scoreLessonContent, type ScorableLesson } from "../lib/lessonQuality";
import type { Env } from "../env";

export const adminRouter = new Hono<Env>();

adminRouter.get("/search-stats", requireAdmin, async (c) => {
  return c.json({
    lastBuild: getLastBuildStats(),
  });
});

adminRouter.post("/reindex", requireAdmin, async (c) => {
  invalidateSearchIndex();
  const t0 = performance.now();
  const items = await getSearchIndex();
  const durationMs = Math.round(performance.now() - t0);
  return c.json({
    rebuilt: true,
    durationMs,
    itemCount: items.length,
  });
});

// Sprint 53 — Error sampler. Surfaces the most-recent N entries the
// logger has seen plus per-kind totals. Memory-only; resets on restart.
adminRouter.get("/error-stats", requireAdmin, async (c) => {
  const limitParam = c.req.query("limit");
  const limit = limitParam ? Math.min(200, Math.max(1, Number(limitParam) || 50)) : 50;
  return c.json({
    counters: getCounters(),
    recent: getRecentErrors(limit),
  });
});

// Sprint 64d — rate-limit dashboard. Returns the in-memory rateLimits
// map as a snapshot, sorted by rejection count descending. Lets ops
// see who's hammering the AI endpoints without grep'ing logs.
adminRouter.get("/rate-limits", requireAdmin, async (c) => {
  const now = Date.now();
  const entries: Array<{
    key: string;
    count: number;
    rejected: number;
    resetInMs: number;
  }> = [];
  for (const [key, v] of rateLimits.entries()) {
    entries.push({
      key,
      count: v.count,
      rejected: v.rejected ?? 0,
      resetInMs: Math.max(0, v.resetAt - now),
    });
  }
  entries.sort((a, b) => b.rejected - a.rejected);
  return c.json({ entries: entries.slice(0, 50) });
});

// Lesson quality dashboard. Scores every lesson-kind node against the
// same rubric as `bun run audit:lessons` (shared scoreLessonContent),
// reading lessonData straight from the DB. Sorted worst-first so the
// most-improvable lessons surface at the top; each row deep-links into
// the lesson editor on the client.
adminRouter.get("/lesson-quality", requireAdmin, async (c) => {
  const db = getDb();
  const rows = db
    .select({
      nodeSlug: masteryNodes.slug,
      title: masteryNodes.title,
      level: masteryNodes.level,
      lessonData: masteryNodes.lessonData,
      pathSlug: masteryPaths.slug,
      pathTitle: masteryPaths.title,
    })
    .from(masteryNodes)
    .innerJoin(masteryPaths, eq(masteryNodes.pathId, masteryPaths.id))
    .where(eq(masteryNodes.nodeKind, "lesson"))
    .all();

  const lessons = rows.map((r) => {
    const base = {
      nodeSlug: r.nodeSlug,
      pathSlug: r.pathSlug,
      pathTitle: r.pathTitle,
      title: r.title,
      level: r.level,
    };
    if (!r.lessonData) {
      return {
        ...base,
        slideCount: 0,
        textSlideCount: 0,
        questionSubkindCount: 0,
        totalBodyWords: 0,
        nameDropCount: 0,
        hasViz: false,
        composite: 0,
        flags: ["NO_LESSON_DATA"],
      };
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(r.lessonData);
    } catch {
      return {
        ...base,
        slideCount: 0,
        textSlideCount: 0,
        questionSubkindCount: 0,
        totalBodyWords: 0,
        nameDropCount: 0,
        hasViz: false,
        composite: 0,
        flags: ["INVALID_JSON"],
      };
    }
    return { ...base, ...scoreLessonContent(parsed as ScorableLesson) };
  });

  lessons.sort((a, b) => a.composite - b.composite);

  // Summary stats over lessons that actually have content.
  const scored = lessons.filter((l) => !l.flags.includes("NO_LESSON_DATA"));
  const n = scored.length;
  const sortedComposites = scored
    .map((l) => l.composite)
    .sort((a, b) => a - b);
  const avg = n
    ? Math.round(sortedComposites.reduce((s, x) => s + x, 0) / n)
    : 0;
  const median = n ? sortedComposites[Math.floor(n / 2)] : 0;
  const flaggedCount = scored.filter((l) => l.flags.length > 0).length;

  return c.json({
    lessons,
    summary: {
      total: lessons.length,
      scored: n,
      missing: lessons.length - n,
      avg,
      median,
      flaggedCount,
    },
  });
});

// --- Sprint 52: Content proposal queue ------------------------------

adminRouter.get("/proposals", requireAdmin, async (c) => {
  const status = c.req.query("status") ?? "pending";
  const kind = c.req.query("kind");
  const db = getDb();

  const baseRows = db
    .select()
    .from(contentProposals)
    .where(
      kind
        ? and(
            eq(contentProposals.status, status),
            eq(contentProposals.kind, kind),
          )
        : eq(contentProposals.status, status),
    )
    .orderBy(desc(contentProposals.createdAt))
    .limit(100)
    .all();

  if (baseRows.length === 0) return c.json({ proposals: [] });

  // Resolve target titles where possible to make the queue scannable.
  const proposerIds = Array.from(new Set(baseRows.map((p) => p.proposerId)));
  const proposers =
    proposerIds.length === 0
      ? []
      : db
          .select({ id: users.id, username: users.username })
          .from(users)
          .all()
          .filter((u) => proposerIds.includes(u.id));
  const proposerById = new Map(proposers.map((p) => [p.id, p.username]));

  const out: Array<{
    id: string;
    kind: string;
    targetId: string | null;
    targetLabel: string | null;
    proposerId: string;
    proposerUsername: string | null;
    status: string;
    createdAt: string;
  }> = [];
  for (const p of baseRows) {
    let targetLabel: string | null = null;
    if (p.kind === "lesson_publish" && p.targetId) {
      const node = db
        .select({ title: masteryNodes.title })
        .from(masteryNodes)
        .where(eq(masteryNodes.id, p.targetId))
        .get();
      targetLabel = node?.title ?? null;
    } else if (
      (p.kind === "news_edit" || p.kind === "news_publish") &&
      p.targetId
    ) {
      const article = db
        .select({ title: newsArticles.title })
        .from(newsArticles)
        .where(eq(newsArticles.id, p.targetId))
        .get();
      targetLabel = article?.title ?? null;
    } else if (p.kind === "wiki_edit" && p.targetId) {
      const page = db
        .select({ title: wikiPages.title })
        .from(wikiPages)
        .where(eq(wikiPages.id, p.targetId))
        .get();
      targetLabel = page?.title ?? null;
    } else if (p.kind === "news_publish" && !p.targetId) {
      try {
        const data = JSON.parse(p.payloadJson);
        targetLabel = data?.title ?? null;
      } catch {
        targetLabel = null;
      }
    }
    out.push({
      id: p.id,
      kind: p.kind,
      targetId: p.targetId,
      targetLabel,
      proposerId: p.proposerId,
      proposerUsername: proposerById.get(p.proposerId) ?? null,
      status: p.status,
      createdAt: p.createdAt,
    });
  }

  return c.json({ proposals: out });
});

adminRouter.get("/proposals/:id", requireAdmin, async (c) => {
  const id = c.req.param("id");
  if (!id) return c.json({ error: "Invalid id" }, 400);
  const db = getDb();
  const p = db
    .select()
    .from(contentProposals)
    .where(eq(contentProposals.id, id))
    .get();
  if (!p) return c.json({ error: "Not found" }, 404);

  let payload: unknown = null;
  try {
    payload = JSON.parse(p.payloadJson);
  } catch {
    payload = p.payloadJson;
  }
  let priorSnapshot: unknown = null;
  if (p.priorSnapshotJson) {
    try {
      priorSnapshot = JSON.parse(p.priorSnapshotJson);
    } catch {
      priorSnapshot = p.priorSnapshotJson;
    }
  }
  const proposer = db
    .select({ username: users.username })
    .from(users)
    .where(eq(users.id, p.proposerId))
    .get();
  const reviewer = p.reviewerId
    ? db
        .select({ username: users.username })
        .from(users)
        .where(eq(users.id, p.reviewerId))
        .get()
    : null;

  return c.json({
    proposal: {
      id: p.id,
      kind: p.kind,
      targetId: p.targetId,
      proposerId: p.proposerId,
      proposerUsername: proposer?.username ?? null,
      reviewerId: p.reviewerId,
      reviewerUsername: reviewer?.username ?? null,
      reviewNote: p.reviewNote,
      status: p.status,
      createdAt: p.createdAt,
      decidedAt: p.decidedAt,
      payload,
      priorSnapshot,
    },
  });
});

const decisionSchema = z.object({
  note: z.string().max(2000).optional(),
});

adminRouter.post(
  "/proposals/:id/approve",
  requireAdmin,
  zValidator("json", decisionSchema),
  async (c) => {
    const me = c.get("user")!;
    const id = c.req.param("id");
    if (!id) return c.json({ error: "Invalid id" }, 400);
    const { note } = c.req.valid("json");
    const result = approveProposal(id, me.id, note);
    if (!result.ok) return c.json({ error: result.error }, 400);
    return c.json({ ok: true });
  },
);

adminRouter.post(
  "/proposals/:id/reject",
  requireAdmin,
  zValidator("json", decisionSchema),
  async (c) => {
    const me = c.get("user")!;
    const id = c.req.param("id");
    if (!id) return c.json({ error: "Invalid id" }, 400);
    const { note } = c.req.valid("json");
    const result = rejectProposal(id, me.id, note);
    if (!result.ok) return c.json({ error: result.error }, 400);
    return c.json({ ok: true });
  },
);

// --- Sprint 54: DOI minting -----------------------------------------
//
// v1 mints synthetic identifiers in the test prefix (10.5555). Real
// Crossref integration replaces this body without changing the
// surface — same response shape; just the wire to the DOI registrar.

const mintDoiSchema = z.object({
  kind: z.enum(["research", "capstone", "track", "artifact"]),
  id: z.string().min(1),
});

function mintSyntheticDoi(kind: string, slug: string): string {
  const hash = Buffer.from(slug)
    .toString("hex")
    .slice(0, 8)
    .padEnd(8, "0");
  return `10.5555/axiomic.${kind}.${hash}`;
}

adminRouter.post(
  "/mint-doi",
  requireAdmin,
  zValidator("json", mintDoiSchema),
  async (c) => {
    const { kind, id } = c.req.valid("json");
    const db = getDb();
    let doi: string | null = null;
    let displaySlug = "";

    if (kind === "research") {
      const row = db
        .select()
        .from(researchPapers)
        .where(eq(researchPapers.id, id))
        .get();
      if (!row) return c.json({ error: "Paper not found" }, 404);
      if (row.doi) return c.json({ doi: row.doi, alreadyMinted: true });
      displaySlug = row.slug;
      doi = mintSyntheticDoi("research", row.slug);
      db.update(researchPapers)
        .set({ doi })
        .where(eq(researchPapers.id, id))
        .run();
    } else if (kind === "capstone") {
      const row = db
        .select()
        .from(capstones)
        .where(eq(capstones.id, id))
        .get();
      if (!row) return c.json({ error: "Capstone not found" }, 404);
      if (row.doi) return c.json({ doi: row.doi, alreadyMinted: true });
      displaySlug = row.slug;
      doi = mintSyntheticDoi("capstone", row.slug);
      db.update(capstones).set({ doi }).where(eq(capstones.id, id)).run();
    } else if (kind === "track") {
      const row = db
        .select()
        .from(capstoneTracks)
        .where(eq(capstoneTracks.id, id))
        .get();
      if (!row) return c.json({ error: "Track not found" }, 404);
      if (row.doi) return c.json({ doi: row.doi, alreadyMinted: true });
      displaySlug = row.slug;
      doi = mintSyntheticDoi("track", row.slug);
      db.update(capstoneTracks)
        .set({ doi })
        .where(eq(capstoneTracks.id, id))
        .run();
    } else if (kind === "artifact") {
      // id here is the artifactPageSlug.
      const row = db
        .select()
        .from(capstoneEnrollments)
        .where(eq(capstoneEnrollments.artifactPageSlug, id))
        .get();
      if (!row) return c.json({ error: "Artifact not found" }, 404);
      if (!row.completedAt) {
        return c.json({ error: "Artifact has no completion to cite" }, 400);
      }
      if (row.doi) return c.json({ doi: row.doi, alreadyMinted: true });
      displaySlug = row.artifactPageSlug ?? id;
      doi = mintSyntheticDoi("artifact", displaySlug);
      db.update(capstoneEnrollments)
        .set({ doi })
        .where(eq(capstoneEnrollments.id, row.id))
        .run();
    }

    return c.json({ doi, kind, displaySlug, alreadyMinted: false });
  },
);

// Sprint 69 — Admin job control panel.
//
//   GET  /admin/jobs              list registered jobs + lease state +
//                                  last run telemetry
//   POST /admin/jobs/:name/run    run a job synchronously, ignoring
//                                  the lease (admin override)
//
// Both endpoints are admin-only — running a job costs CPU + may hit
// external services, and the lease state is sensitive operational
// data we don't want to expose publicly.

adminRouter.get("/jobs", requireAdmin, async (c) => {
  const db = getDb();
  const registered = listRegisteredJobs();
  const leases = db.select().from(jobLeases).all();
  const leasesByName = new Map(leases.map((l) => [l.jobName, l]));

  const externalCounts = db
    .select({
      source: externalPapers.source,
      count: sql<number>`count(*)`,
    })
    .from(externalPapers)
    .groupBy(externalPapers.source)
    .all();

  const recentRunsByName = new Map<string, typeof leases[number][]>();
  for (const job of registered) {
    const rows = db
      .select()
      .from(jobRuns)
      .where(eq(jobRuns.jobName, job.name))
      .orderBy(desc(jobRuns.startedAt))
      .limit(5)
      .all();
    recentRunsByName.set(job.name, rows as never);
  }

  return c.json({
    processId: getProcessId(),
    nowIso: new Date().toISOString(),
    jobs: registered.map((j) => {
      const lease = leasesByName.get(j.name);
      return {
        name: j.name,
        intervalMs: j.intervalMs,
        lease: lease
          ? {
              holder: lease.leaseHolder,
              expiresAt: lease.leaseExpiresAt,
              ownedByThisProcess: lease.leaseHolder === getProcessId(),
              lastRunAt: lease.lastRunAt,
              lastStatus: lease.lastStatus,
              lastErrorMessage: lease.lastErrorMessage,
              lastDurationMs: lease.lastDurationMs,
            }
          : null,
        recentRuns: recentRunsByName.get(j.name) ?? [],
      };
    }),
    externalPaperCounts: externalCounts,
  });
});

// Sprint 72 — Admin review queue for manual author claims.
adminRouter.get("/author-claims", requireAdmin, async (c) => {
  const db = getDb();
  const url = new URL(c.req.url);
  const status = url.searchParams.get("status") ?? "pending";
  const rows = db
    .select({
      claim: authorClaimRequests,
      claimantUsername: users.username,
      paperTitle: externalPapers.title,
      paperSource: externalPapers.source,
      paperAuthorsJson: externalPapers.authorsJson,
    })
    .from(authorClaimRequests)
    .innerJoin(users, eq(authorClaimRequests.userId, users.id))
    .innerJoin(
      externalPapers,
      eq(authorClaimRequests.externalPaperId, externalPapers.id),
    )
    .where(eq(authorClaimRequests.status, status))
    .orderBy(desc(authorClaimRequests.createdAt))
    .limit(100)
    .all();
  return c.json({ items: rows });
});

const claimDecisionSchema = z.object({
  reviewNote: z.string().max(1000).optional(),
});

adminRouter.post(
  "/author-claims/:id/approve",
  requireAdmin,
  zValidator("json", claimDecisionSchema),
  async (c) => {
    const reviewer = c.get("user")!;
    const id = c.req.param("id");
    if (!id) return c.json({ error: "Missing id" }, 400);
    const result = approveClaimRequest(id, {
      reviewerId: reviewer.id,
      reviewNote: c.req.valid("json").reviewNote,
    });
    if (!result.ok) return c.json({ error: result.error }, 400);
    return c.json({ ok: true, authorshipId: result.authorshipId });
  },
);

adminRouter.post(
  "/author-claims/:id/reject",
  requireAdmin,
  zValidator("json", claimDecisionSchema),
  async (c) => {
    const reviewer = c.get("user")!;
    const id = c.req.param("id");
    if (!id) return c.json({ error: "Missing id" }, 400);
    const result = rejectClaimRequest(id, {
      reviewerId: reviewer.id,
      reviewNote: c.req.valid("json").reviewNote,
    });
    if (!result.ok) return c.json({ error: result.error }, 400);
    return c.json({ ok: true });
  },
);

adminRouter.post("/jobs/:name/run", requireAdmin, async (c) => {
  const name = c.req.param("name");
  if (!name) return c.json({ error: "Missing job name" }, 400);
  try {
    const result = await runJobNow(name);
    return c.json({ ok: true, result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return c.json({ ok: false, error: message }, 500);
  }
});
