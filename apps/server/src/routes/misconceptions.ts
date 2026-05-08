// Sprint 38 — Misconception marketplace router.
//
// Public read; auth-required write. Submission creates a new proposal
// scoped by (conceptSlug, key). Voting upserts a per-user row, then
// recomputes voteScore on the parent submission. When voteScore
// crosses PROMOTION_THRESHOLD on an open proposal the row promotes
// into misconception_catalog and flips status='merged'. Existing
// catalog entries with the same (conceptSlug, key) block submission
// outright.

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { randomUUID } from "crypto";
import {
  getDb,
  misconceptionCatalog,
  misconceptionSubmissionVotes,
  misconceptionSubmissions,
  users,
  wikiPages,
} from "@axiomic/db";
import { requireAuth, getSessionUser } from "../middleware/auth";
import type { Env } from "../env";

export const misconceptionsRouter = new Hono<Env>();

// Net votes a submission needs before it auto-promotes into the
// catalog. Tunable; chosen for the v1 community size.
const PROMOTION_THRESHOLD = 5;

const KEY_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const submitSchema = z.object({
  conceptSlug: z.string().min(1).max(120).regex(KEY_RE),
  key: z.string().min(3).max(120).regex(KEY_RE),
  label: z.string().min(8).max(200),
  description: z.string().min(40).max(4000),
  probeQuestions: z.array(z.string().min(8).max(400)).min(1).max(5).optional(),
  correctionPromptTemplate: z.string().max(4000).optional(),
});

const voteSchema = z.object({
  value: z.union([z.literal(1), z.literal(-1), z.literal(0)]),
});

const listSortSchema = z.object({
  sort: z.enum(["votes", "recent", "decided"]).optional().default("votes"),
  status: z.enum(["open", "approved", "rejected", "merged", "all"]).optional().default("open"),
  limit: z
    .string()
    .optional()
    .transform((v) => Math.min(50, Math.max(1, parseInt(v ?? "20", 10) || 20))),
});

// GET /misconceptions — paginated marketplace list.
misconceptionsRouter.get(
  "/",
  zValidator("query", listSortSchema),
  async (c) => {
    const { sort, status, limit } = c.req.valid("query");
    const db = getDb();
    const session = await getSessionUser(c);

    const orderBy =
      sort === "recent"
        ? desc(misconceptionSubmissions.createdAt)
        : sort === "decided"
          ? desc(misconceptionSubmissions.decidedAt)
          : desc(misconceptionSubmissions.voteScore);

    const baseQuery = db
      .select({
        id: misconceptionSubmissions.id,
        conceptSlug: misconceptionSubmissions.conceptSlug,
        key: misconceptionSubmissions.key,
        label: misconceptionSubmissions.label,
        description: misconceptionSubmissions.description,
        status: misconceptionSubmissions.status,
        voteScore: misconceptionSubmissions.voteScore,
        catalogId: misconceptionSubmissions.catalogId,
        proposerId: misconceptionSubmissions.proposerId,
        proposerUsername: users.username,
        createdAt: misconceptionSubmissions.createdAt,
        decidedAt: misconceptionSubmissions.decidedAt,
      })
      .from(misconceptionSubmissions)
      .innerJoin(users, eq(misconceptionSubmissions.proposerId, users.id));

    const rows =
      status === "all"
        ? await baseQuery.orderBy(orderBy).limit(limit).all()
        : await baseQuery
            .where(eq(misconceptionSubmissions.status, status))
            .orderBy(orderBy)
            .limit(limit)
            .all();

    // Wiki titles for nicer rendering — single round-trip.
    const slugs = [...new Set(rows.map((r) => r.conceptSlug))];
    const wikis = slugs.length
      ? db
          .select({ slug: wikiPages.slug, title: wikiPages.title })
          .from(wikiPages)
          .where(sql`slug IN ${slugs}`)
          .all()
      : [];
    const titleBySlug = new Map(wikis.map((w) => [w.slug, w.title]));

    // My-vote for each submission so the UI can render the active
    // chevron without a per-row request.
    let myVotes = new Map<string, number>();
    if (session && rows.length > 0) {
      const ids = rows.map((r) => r.id);
      const voteRows = db
        .select({
          submissionId: misconceptionSubmissionVotes.submissionId,
          value: misconceptionSubmissionVotes.value,
        })
        .from(misconceptionSubmissionVotes)
        .where(
          and(
            eq(misconceptionSubmissionVotes.userId, session.id),
            sql`${misconceptionSubmissionVotes.submissionId} IN ${ids}`,
          ),
        )
        .all();
      myVotes = new Map(voteRows.map((v) => [v.submissionId, v.value]));
    }

    return c.json({
      submissions: rows.map((r) => ({
        id: r.id,
        conceptSlug: r.conceptSlug,
        conceptTitle: titleBySlug.get(r.conceptSlug) ?? null,
        key: r.key,
        label: r.label,
        descriptionPreview:
          r.description.length > 200
            ? r.description.slice(0, 197) + "…"
            : r.description,
        status: r.status,
        voteScore: r.voteScore,
        proposerUsername: r.proposerUsername,
        myVote: myVotes.get(r.id) ?? 0,
        catalogId: r.catalogId,
        createdAt: r.createdAt,
        decidedAt: r.decidedAt,
      })),
      promotionThreshold: PROMOTION_THRESHOLD,
    });
  },
);

// GET /misconceptions/:id — full detail.
misconceptionsRouter.get("/:id", async (c) => {
  const id = c.req.param("id");
  const db = getDb();
  const session = await getSessionUser(c);

  const row = db
    .select({
      id: misconceptionSubmissions.id,
      conceptSlug: misconceptionSubmissions.conceptSlug,
      key: misconceptionSubmissions.key,
      label: misconceptionSubmissions.label,
      description: misconceptionSubmissions.description,
      probeQuestionsJson: misconceptionSubmissions.probeQuestionsJson,
      correctionPromptTemplate:
        misconceptionSubmissions.correctionPromptTemplate,
      status: misconceptionSubmissions.status,
      voteScore: misconceptionSubmissions.voteScore,
      catalogId: misconceptionSubmissions.catalogId,
      proposerId: misconceptionSubmissions.proposerId,
      proposerUsername: users.username,
      createdAt: misconceptionSubmissions.createdAt,
      decidedAt: misconceptionSubmissions.decidedAt,
    })
    .from(misconceptionSubmissions)
    .innerJoin(users, eq(misconceptionSubmissions.proposerId, users.id))
    .where(eq(misconceptionSubmissions.id, id))
    .get();
  if (!row) return c.json({ error: "Submission not found" }, 404);

  let probes: string[] = [];
  try {
    const parsed = JSON.parse(row.probeQuestionsJson);
    if (Array.isArray(parsed)) {
      probes = parsed.filter((s): s is string => typeof s === "string");
    }
  } catch {
    // ignore
  }

  let myVote = 0;
  if (session) {
    const v = db
      .select({ value: misconceptionSubmissionVotes.value })
      .from(misconceptionSubmissionVotes)
      .where(
        and(
          eq(misconceptionSubmissionVotes.submissionId, row.id),
          eq(misconceptionSubmissionVotes.userId, session.id),
        ),
      )
      .get();
    myVote = v?.value ?? 0;
  }

  return c.json({
    submission: {
      id: row.id,
      conceptSlug: row.conceptSlug,
      key: row.key,
      label: row.label,
      description: row.description,
      probeQuestions: probes,
      correctionPromptTemplate: row.correctionPromptTemplate,
      status: row.status,
      voteScore: row.voteScore,
      catalogId: row.catalogId,
      proposerUsername: row.proposerUsername,
      myVote,
      createdAt: row.createdAt,
      decidedAt: row.decidedAt,
    },
    promotionThreshold: PROMOTION_THRESHOLD,
  });
});

// POST /misconceptions — propose a new entry.
misconceptionsRouter.post(
  "/",
  requireAuth,
  zValidator("json", submitSchema),
  async (c) => {
    const user = c.get("user")!;
    const data = c.req.valid("json");
    const db = getDb();

    // Reject if (conceptSlug, key) already exists in the catalog.
    const existingCatalog = db
      .select({ id: misconceptionCatalog.id })
      .from(misconceptionCatalog)
      .where(
        and(
          eq(misconceptionCatalog.conceptSlug, data.conceptSlug),
          eq(misconceptionCatalog.key, data.key),
        ),
      )
      .get();
    if (existingCatalog) {
      return c.json({ error: "An entry with this key already exists in the catalog" }, 409);
    }
    const existingSubmission = db
      .select({ id: misconceptionSubmissions.id })
      .from(misconceptionSubmissions)
      .where(
        and(
          eq(misconceptionSubmissions.conceptSlug, data.conceptSlug),
          eq(misconceptionSubmissions.key, data.key),
        ),
      )
      .get();
    if (existingSubmission) {
      return c.json({ error: "A submission with this key is already open" }, 409);
    }

    const id = randomUUID();
    db.insert(misconceptionSubmissions).values({
      id,
      proposerId: user.id,
      conceptSlug: data.conceptSlug,
      key: data.key,
      label: data.label,
      description: data.description,
      probeQuestionsJson: JSON.stringify(data.probeQuestions ?? []),
      correctionPromptTemplate: data.correctionPromptTemplate ?? "",
    }).run();

    // Auto +1 from the proposer so threshold-promotion math starts
    // at +1, not 0.
    db.insert(misconceptionSubmissionVotes).values({
      id: randomUUID(),
      submissionId: id,
      userId: user.id,
      value: 1,
    }).run();
    db.update(misconceptionSubmissions)
      .set({ voteScore: 1, updatedAt: new Date().toISOString() })
      .where(eq(misconceptionSubmissions.id, id))
      .run();

    return c.json({ id, voteScore: 1 }, 201);
  },
);

// POST /misconceptions/:id/vote — set or clear the caller's vote.
misconceptionsRouter.post(
  "/:id/vote",
  requireAuth,
  zValidator("json", voteSchema),
  async (c) => {
    const user = c.get("user")!;
    const id = c.req.param("id");
    const { value } = c.req.valid("json");
    const db = getDb();

    const submission = db
      .select()
      .from(misconceptionSubmissions)
      .where(eq(misconceptionSubmissions.id, id))
      .get();
    if (!submission) return c.json({ error: "Submission not found" }, 404);
    if (submission.status !== "open") {
      return c.json(
        { error: "This submission is no longer open for voting" },
        400,
      );
    }

    const existing = db
      .select({ id: misconceptionSubmissionVotes.id })
      .from(misconceptionSubmissionVotes)
      .where(
        and(
          eq(misconceptionSubmissionVotes.submissionId, id),
          eq(misconceptionSubmissionVotes.userId, user.id),
        ),
      )
      .get();

    if (value === 0) {
      if (existing) {
        db.delete(misconceptionSubmissionVotes)
          .where(eq(misconceptionSubmissionVotes.id, existing.id))
          .run();
      }
    } else if (existing) {
      db.update(misconceptionSubmissionVotes)
        .set({ value })
        .where(eq(misconceptionSubmissionVotes.id, existing.id))
        .run();
    } else {
      db.insert(misconceptionSubmissionVotes)
        .values({
          id: randomUUID(),
          submissionId: id,
          userId: user.id,
          value,
        })
        .run();
    }

    // Re-aggregate score in one query.
    const sumRow = db
      .select({
        score: sql<number>`COALESCE(SUM(${misconceptionSubmissionVotes.value}), 0)`,
      })
      .from(misconceptionSubmissionVotes)
      .where(eq(misconceptionSubmissionVotes.submissionId, id))
      .get();
    const newScore = Number(sumRow?.score ?? 0);

    let promotedCatalogId: string | null = null;
    if (newScore >= PROMOTION_THRESHOLD) {
      // Promote to catalog if not already.
      const catalogRow = db
        .select({ id: misconceptionCatalog.id })
        .from(misconceptionCatalog)
        .where(
          and(
            eq(misconceptionCatalog.conceptSlug, submission.conceptSlug),
            eq(misconceptionCatalog.key, submission.key),
          ),
        )
        .get();
      if (catalogRow) {
        promotedCatalogId = catalogRow.id;
      } else {
        promotedCatalogId = randomUUID();
        db.insert(misconceptionCatalog).values({
          id: promotedCatalogId,
          conceptSlug: submission.conceptSlug,
          key: submission.key,
          label: submission.label,
          description: submission.description,
          probeQuestionsJson: submission.probeQuestionsJson,
          correctionPromptTemplate: submission.correctionPromptTemplate,
        }).run();
      }
      db.update(misconceptionSubmissions)
        .set({
          voteScore: newScore,
          status: "merged",
          catalogId: promotedCatalogId,
          decidedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        })
        .where(eq(misconceptionSubmissions.id, id))
        .run();
    } else {
      db.update(misconceptionSubmissions)
        .set({
          voteScore: newScore,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(misconceptionSubmissions.id, id))
        .run();
    }

    return c.json({
      voteScore: newScore,
      myVote: value,
      promoted: !!promotedCatalogId,
      catalogId: promotedCatalogId,
      threshold: PROMOTION_THRESHOLD,
    });
  },
);

// Suppress unused-import warnings while we keep these helpers in scope
// for future filter additions.
void asc;
