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
import { and, desc, eq } from "drizzle-orm";
import {
  capstoneEnrollments,
  capstoneTracks,
  capstones,
  contentProposals,
  getDb,
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
