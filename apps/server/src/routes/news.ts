import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import {
  getDb,
  newsArticles,
  newsEditProposals,
  newsReactions,
  users,
} from "@axiomic/db";
import { and, count, desc, eq, sql } from "drizzle-orm";
import { randomUUID } from "crypto";
import { requireAuth, getSessionUser } from "../middleware/auth";
import { notify } from "../lib/notifications";
import { invalidateSearchIndex } from "../lib/searchIndex";
import type { Env } from "../env";

export const newsRouter = new Hono<Env>();

const ACCENT_COLORS = ["indigo", "emerald", "rose", "amber", "sky", "violet"] as const;
const REACTION_KINDS = ["thumbs", "lightbulb", "mind_blown"] as const;
type ReactionKind = (typeof REACTION_KINDS)[number];

// ~225 wpm — middle of the typical 200-250 range for online prose.
function readingMinutes(body: string): number {
  const words = body.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 225));
}

// Truncate a 140-char preview from arbitrary markdown, dropping the
// directives and fences that don't render inside a notification.
function previewFrom(text: string, max = 140): string {
  const stripped = text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`\n]*`/g, " ")
    .replace(/::viz\[[^\]]+\]/g, " ")
    .replace(/[#*_>~]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (stripped.length <= max) return stripped;
  return stripped.slice(0, max - 1) + "…";
}

async function reactionRollup(
  db: ReturnType<typeof getDb>,
  articleIds: string[],
): Promise<Map<string, Record<ReactionKind, number>>> {
  const blank = (): Record<ReactionKind, number> => ({
    thumbs: 0,
    lightbulb: 0,
    mind_blown: 0,
  });
  const out = new Map<string, Record<ReactionKind, number>>();
  for (const id of articleIds) out.set(id, blank());
  if (articleIds.length === 0) return out;
  const rows = db
    .select({
      articleId: newsReactions.articleId,
      kind: newsReactions.kind,
      n: count(),
    })
    .from(newsReactions)
    .where(sql`${newsReactions.articleId} in ${articleIds}`)
    .groupBy(newsReactions.articleId, newsReactions.kind)
    .all();
  for (const r of rows) {
    const bucket = out.get(r.articleId);
    if (bucket && (REACTION_KINDS as readonly string[]).includes(r.kind)) {
      bucket[r.kind as ReactionKind] = Number(r.n);
    }
  }
  return out;
}

newsRouter.get("/", async (c) => {
  const db = getDb();
  const rows = db
    .select({
      id: newsArticles.id,
      slug: newsArticles.slug,
      title: newsArticles.title,
      summary: newsArticles.summary,
      body: newsArticles.body,
      coverEmoji: newsArticles.coverEmoji,
      accentColor: newsArticles.accentColor,
      authorId: newsArticles.authorId,
      authorUsername: users.username,
      authorDisplayName: users.displayName,
      lastEditorId: newsArticles.lastEditorId,
      createdAt: newsArticles.createdAt,
      updatedAt: newsArticles.updatedAt,
    })
    .from(newsArticles)
    .innerJoin(users, eq(newsArticles.authorId, users.id))
    .orderBy(desc(newsArticles.createdAt))
    .all();

  // Resolve last-editor usernames in one extra query (only when needed).
  const editorIds = Array.from(
    new Set(rows.map((r) => r.lastEditorId).filter((x): x is string => !!x)),
  );
  const editorRows = editorIds.length
    ? db
        .select({ id: users.id, username: users.username })
        .from(users)
        .where(sql`${users.id} in ${editorIds}`)
        .all()
    : [];
  const editorMap = new Map(editorRows.map((u) => [u.id, u.username]));
  const reactions = await reactionRollup(
    db,
    rows.map((r) => r.id),
  );

  return c.json({
    articles: rows.map((r) => ({
      id: r.id,
      slug: r.slug,
      title: r.title,
      summary: r.summary,
      coverEmoji: r.coverEmoji,
      accentColor: r.accentColor,
      authorId: r.authorId,
      authorUsername: r.authorUsername,
      authorDisplayName: r.authorDisplayName,
      lastEditorUsername: r.lastEditorId
        ? editorMap.get(r.lastEditorId) ?? null
        : null,
      readingMinutes: readingMinutes(r.body),
      reactionCounts: reactions.get(r.id) ?? {
        thumbs: 0,
        lightbulb: 0,
        mind_blown: 0,
      },
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    })),
  });
});

newsRouter.get("/:slug", async (c) => {
  const slug = c.req.param("slug")!;
  const db = getDb();
  const session = await getSessionUser(c);

  const row = db
    .select({
      id: newsArticles.id,
      slug: newsArticles.slug,
      title: newsArticles.title,
      summary: newsArticles.summary,
      body: newsArticles.body,
      coverEmoji: newsArticles.coverEmoji,
      accentColor: newsArticles.accentColor,
      authorId: newsArticles.authorId,
      authorUsername: users.username,
      authorDisplayName: users.displayName,
      lastEditorId: newsArticles.lastEditorId,
      createdAt: newsArticles.createdAt,
      updatedAt: newsArticles.updatedAt,
    })
    .from(newsArticles)
    .innerJoin(users, eq(newsArticles.authorId, users.id))
    .where(eq(newsArticles.slug, slug))
    .get();
  if (!row) return c.json({ error: "Article not found" }, 404);

  const editor = row.lastEditorId
    ? db
        .select({ username: users.username })
        .from(users)
        .where(eq(users.id, row.lastEditorId))
        .get()
    : null;

  const reactions = await reactionRollup(db, [row.id]);
  const reactionCounts = reactions.get(row.id) ?? {
    thumbs: 0,
    lightbulb: 0,
    mind_blown: 0,
  };

  let myReactions: Record<ReactionKind, boolean> | null = null;
  if (session) {
    const mine = db
      .select({ kind: newsReactions.kind })
      .from(newsReactions)
      .where(
        and(
          eq(newsReactions.articleId, row.id),
          eq(newsReactions.userId, session.id),
        ),
      )
      .all();
    myReactions = { thumbs: false, lightbulb: false, mind_blown: false };
    for (const r of mine) {
      if ((REACTION_KINDS as readonly string[]).includes(r.kind)) {
        myReactions[r.kind as ReactionKind] = true;
      }
    }
  }

  const pendingProposalCount = Number(
    db
      .select({ n: count() })
      .from(newsEditProposals)
      .where(
        and(
          eq(newsEditProposals.articleId, row.id),
          eq(newsEditProposals.status, "pending"),
        ),
      )
      .get()?.n ?? 0,
  );

  const isAuthor = !!session && session.id === row.authorId;

  return c.json({
    article: {
      id: row.id,
      slug: row.slug,
      title: row.title,
      summary: row.summary,
      body: row.body,
      coverEmoji: row.coverEmoji,
      accentColor: row.accentColor,
      authorId: row.authorId,
      authorUsername: row.authorUsername,
      authorDisplayName: row.authorDisplayName,
      lastEditorUsername: editor?.username ?? null,
      readingMinutes: readingMinutes(row.body),
      reactionCounts,
      myReactions,
      pendingProposalCount,
      isAuthor,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    },
  });
});

const slugSchema = z
  .string()
  .min(1)
  .max(120)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "slug must be kebab-case");

const createSchema = z.object({
  slug: slugSchema,
  title: z.string().min(1).max(200),
  summary: z.string().max(500).default(""),
  body: z.string().min(1),
  coverEmoji: z.string().max(8).optional(),
  accentColor: z.enum(ACCENT_COLORS).optional(),
});

newsRouter.post("/", requireAuth, zValidator("json", createSchema), async (c) => {
  const body = c.req.valid("json");
  const user = c.get("user")!;
  const db = getDb();

  const dup = db
    .select({ id: newsArticles.id })
    .from(newsArticles)
    .where(eq(newsArticles.slug, body.slug))
    .get();
  if (dup) return c.json({ error: "An article with this slug already exists" }, 409);

  const id = randomUUID();
  db.insert(newsArticles).values({
    id,
    slug: body.slug,
    title: body.title,
    summary: body.summary ?? "",
    body: body.body,
    coverEmoji: body.coverEmoji || "📰",
    accentColor: body.accentColor || "indigo",
    authorId: user.id,
  }).run();

  invalidateSearchIndex();

  const created = db.select().from(newsArticles).where(eq(newsArticles.id, id)).get();
  return c.json({ article: created }, 201);
});

const updateSchema = z.object({
  title: z.string().min(1).max(200),
  summary: z.string().max(500),
  body: z.string().min(1),
  coverEmoji: z.string().max(8).optional(),
  accentColor: z.enum(ACCENT_COLORS).optional(),
});

newsRouter.put("/:slug", requireAuth, zValidator("json", updateSchema), async (c) => {
  const slug = c.req.param("slug")!;
  const data = c.req.valid("json");
  const user = c.get("user")!;
  const db = getDb();

  const article = db
    .select()
    .from(newsArticles)
    .where(eq(newsArticles.slug, slug))
    .get();
  if (!article) return c.json({ error: "Article not found" }, 404);

  // Direct edits only by the original author. Everyone else uses the
  // proposal flow (POST /:slug/proposals).
  if (article.authorId !== user.id) {
    return c.json({ error: "Only the author can edit this article directly. Submit a proposal instead." }, 403);
  }

  db.update(newsArticles)
    .set({
      title: data.title,
      summary: data.summary,
      body: data.body,
      coverEmoji: data.coverEmoji ?? article.coverEmoji,
      accentColor: data.accentColor ?? article.accentColor,
      lastEditorId: user.id,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(newsArticles.id, article.id))
    .run();

  invalidateSearchIndex();

  const updated = db.select().from(newsArticles).where(eq(newsArticles.id, article.id)).get();
  return c.json({ article: updated });
});

// --- Proposals ---

const proposalSchema = z.object({
  proposedTitle: z.string().min(1).max(200),
  proposedSummary: z.string().max(500),
  proposedBody: z.string().min(1),
  message: z.string().max(2000).optional(),
});

newsRouter.post(
  "/:slug/proposals",
  requireAuth,
  zValidator("json", proposalSchema),
  async (c) => {
    const slug = c.req.param("slug")!;
    const data = c.req.valid("json");
    const user = c.get("user")!;
    const db = getDb();

    const article = db
      .select()
      .from(newsArticles)
      .where(eq(newsArticles.slug, slug))
      .get();
    if (!article) return c.json({ error: "Article not found" }, 404);

    // The author edits directly via PUT /:slug — proposals are for
    // anyone else. Reject early to keep the moderation queue tidy.
    if (article.authorId === user.id) {
      return c.json({ error: "You're the author — edit directly instead." }, 400);
    }

    const id = randomUUID();
    db.insert(newsEditProposals).values({
      id,
      articleId: article.id,
      proposerId: user.id,
      proposedTitle: data.proposedTitle,
      proposedSummary: data.proposedSummary,
      proposedBody: data.proposedBody,
      message: data.message ?? null,
      status: "pending",
    }).run();

    await notify({
      recipientId: article.authorId,
      actorId: user.id,
      kind: "news_edit_proposed",
      subjectType: "news_proposal",
      subjectId: id,
      contextSlug: article.slug,
      preview: previewFrom(data.message ?? `Proposed: "${data.proposedTitle}"`),
    });

    return c.json({ proposalId: id }, 201);
  },
);

// Author lists pending + recent proposals on their article.
newsRouter.get("/:slug/proposals", requireAuth, async (c) => {
  const slug = c.req.param("slug")!;
  const user = c.get("user")!;
  const db = getDb();

  const article = db
    .select()
    .from(newsArticles)
    .where(eq(newsArticles.slug, slug))
    .get();
  if (!article) return c.json({ error: "Article not found" }, 404);
  if (article.authorId !== user.id) {
    return c.json({ error: "Only the author can view proposals." }, 403);
  }

  const rows = db
    .select({
      id: newsEditProposals.id,
      articleId: newsEditProposals.articleId,
      proposerId: newsEditProposals.proposerId,
      proposerUsername: users.username,
      proposedTitle: newsEditProposals.proposedTitle,
      proposedSummary: newsEditProposals.proposedSummary,
      proposedBody: newsEditProposals.proposedBody,
      message: newsEditProposals.message,
      status: newsEditProposals.status,
      reviewerId: newsEditProposals.reviewerId,
      reviewedAt: newsEditProposals.reviewedAt,
      reviewMessage: newsEditProposals.reviewMessage,
      createdAt: newsEditProposals.createdAt,
    })
    .from(newsEditProposals)
    .innerJoin(users, eq(newsEditProposals.proposerId, users.id))
    .where(eq(newsEditProposals.articleId, article.id))
    .orderBy(desc(newsEditProposals.createdAt))
    .all();

  return c.json({
    proposals: rows.map((r) => ({
      ...r,
      articleSlug: article.slug,
      articleTitle: article.title,
      reviewerUsername: null,
    })),
  });
});

const reviewSchema = z.object({
  reviewMessage: z.string().max(1000).optional(),
});

async function reviewProposal(
  db: ReturnType<typeof getDb>,
  slug: string,
  proposalId: string,
  reviewer: { id: string; username: string },
  reviewMessage: string | undefined,
  action: "approve" | "reject",
): Promise<Response | { ok: true }> {
  const article = db
    .select()
    .from(newsArticles)
    .where(eq(newsArticles.slug, slug))
    .get();
  if (!article) {
    return new Response(JSON.stringify({ error: "Article not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }
  if (article.authorId !== reviewer.id) {
    return new Response(
      JSON.stringify({ error: "Only the author can review proposals." }),
      { status: 403, headers: { "Content-Type": "application/json" } },
    );
  }

  const proposal = db
    .select()
    .from(newsEditProposals)
    .where(eq(newsEditProposals.id, proposalId))
    .get();
  if (!proposal || proposal.articleId !== article.id) {
    return new Response(
      JSON.stringify({ error: "Proposal not found" }),
      { status: 404, headers: { "Content-Type": "application/json" } },
    );
  }
  if (proposal.status !== "pending") {
    return new Response(
      JSON.stringify({ error: `Proposal already ${proposal.status}.` }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const nowIso = new Date().toISOString();
  if (action === "approve") {
    db.update(newsArticles)
      .set({
        title: proposal.proposedTitle,
        summary: proposal.proposedSummary,
        body: proposal.proposedBody,
        lastEditorId: proposal.proposerId,
        updatedAt: nowIso,
      })
      .where(eq(newsArticles.id, article.id))
      .run();
    invalidateSearchIndex();
  }

  db.update(newsEditProposals)
    .set({
      status: action === "approve" ? "approved" : "rejected",
      reviewerId: reviewer.id,
      reviewedAt: nowIso,
      reviewMessage: reviewMessage ?? null,
    })
    .where(eq(newsEditProposals.id, proposal.id))
    .run();

  await notify({
    recipientId: proposal.proposerId,
    actorId: reviewer.id,
    kind: action === "approve" ? "news_edit_approved" : "news_edit_rejected",
    subjectType: "news_proposal",
    subjectId: proposal.id,
    contextSlug: article.slug,
    preview:
      reviewMessage?.trim()
        ? previewFrom(reviewMessage)
        : action === "approve"
          ? `Your edit to "${article.title}" is live.`
          : `Your edit to "${article.title}" wasn't accepted.`,
  });

  return { ok: true };
}

newsRouter.post(
  "/:slug/proposals/:id/approve",
  requireAuth,
  zValidator("json", reviewSchema),
  async (c) => {
    const result = await reviewProposal(
      getDb(),
      c.req.param("slug")!,
      c.req.param("id")!,
      c.get("user")!,
      c.req.valid("json").reviewMessage,
      "approve",
    );
    if (result instanceof Response) return result;
    return c.json(result);
  },
);

newsRouter.post(
  "/:slug/proposals/:id/reject",
  requireAuth,
  zValidator("json", reviewSchema),
  async (c) => {
    const result = await reviewProposal(
      getDb(),
      c.req.param("slug")!,
      c.req.param("id")!,
      c.get("user")!,
      c.req.valid("json").reviewMessage,
      "reject",
    );
    if (result instanceof Response) return result;
    return c.json(result);
  },
);

// --- Reactions ---

const reactionSchema = z.object({
  kind: z.enum(REACTION_KINDS),
});

// Toggle: if the (article, user, kind) row exists, delete it; else
// insert. Returns the new state of all three reaction kinds for the
// caller plus the new aggregate counts so the UI can update without a
// second round-trip.
newsRouter.post(
  "/:slug/reactions",
  requireAuth,
  zValidator("json", reactionSchema),
  async (c) => {
    const slug = c.req.param("slug")!;
    const { kind } = c.req.valid("json");
    const user = c.get("user")!;
    const db = getDb();

    const article = db
      .select({ id: newsArticles.id })
      .from(newsArticles)
      .where(eq(newsArticles.slug, slug))
      .get();
    if (!article) return c.json({ error: "Article not found" }, 404);

    const existing = db
      .select({ id: newsReactions.id })
      .from(newsReactions)
      .where(
        and(
          eq(newsReactions.articleId, article.id),
          eq(newsReactions.userId, user.id),
          eq(newsReactions.kind, kind),
        ),
      )
      .get();
    if (existing) {
      db.delete(newsReactions).where(eq(newsReactions.id, existing.id)).run();
    } else {
      db.insert(newsReactions).values({
        id: randomUUID(),
        articleId: article.id,
        userId: user.id,
        kind,
      }).run();
    }

    const counts = await reactionRollup(db, [article.id]);
    const myRows = db
      .select({ kind: newsReactions.kind })
      .from(newsReactions)
      .where(
        and(
          eq(newsReactions.articleId, article.id),
          eq(newsReactions.userId, user.id),
        ),
      )
      .all();
    const mine: Record<ReactionKind, boolean> = {
      thumbs: false,
      lightbulb: false,
      mind_blown: false,
    };
    for (const r of myRows) {
      if ((REACTION_KINDS as readonly string[]).includes(r.kind)) {
        mine[r.kind as ReactionKind] = true;
      }
    }

    return c.json({
      reactionCounts: counts.get(article.id) ?? {
        thumbs: 0,
        lightbulb: 0,
        mind_blown: 0,
      },
      myReactions: mine,
    });
  },
);
