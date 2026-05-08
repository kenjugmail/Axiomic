// Sprint 29-31 — /me/* routes for current-user oriented surfaces.
//
// Currently houses:
//   - GET /me/weak-concepts          — Sprint 29 misconception diagnoses
//   - POST /me/weak-concepts/:id/dismiss
//   - POST /me/weak-concepts/refresh — runs the detector on demand
//   - GET /me/prereq-status          — Sprint 31 PrereqXray data

import { Hono } from "hono";
import { and, desc, eq, inArray } from "drizzle-orm";
import {
  contentProposals,
  cohortInvitations,
  getDb,
  masteryNodes,
  misconceptionCatalog,
  misconceptionDiagnoses,
  userProgress,
  wikiPages,
} from "@axiomic/db";
import { requireAuth } from "../middleware/auth";
import { runDetectorForUser } from "../lib/misconceptionDetector";
import { buildKnowledgeMri } from "../lib/knowledgeMri";
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
        .select({ slug: wikiPages.slug, title: wikiPages.title })
        .from(wikiPages)
        .where(inArray(wikiPages.slug, slugs))
        .all()
    : [];
  const titleBySlug = new Map(wikis.map((w) => [w.slug, w.title]));

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
  return c.json(mri);
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
