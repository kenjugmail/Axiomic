import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import {
  getDb,
  newsArticles,
  newsBookmarks,
  newsComments,
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

function parseTags(json: string): string[] {
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? v.filter((s) => typeof s === "string") : [];
  } catch {
    return [];
  }
}

newsRouter.get("/", async (c) => {
  const db = getDb();
  const tag = c.req.query("tag");
  const baseQuery = db
    .select({
      id: newsArticles.id,
      slug: newsArticles.slug,
      title: newsArticles.title,
      summary: newsArticles.summary,
      body: newsArticles.body,
      coverEmoji: newsArticles.coverEmoji,
      accentColor: newsArticles.accentColor,
      tags: newsArticles.tags,
      authorId: newsArticles.authorId,
      authorUsername: users.username,
      authorDisplayName: users.displayName,
      lastEditorId: newsArticles.lastEditorId,
      createdAt: newsArticles.createdAt,
      updatedAt: newsArticles.updatedAt,
    })
    .from(newsArticles)
    .innerJoin(users, eq(newsArticles.authorId, users.id))
    .where(eq(newsArticles.status, "published"))
    .orderBy(desc(newsArticles.createdAt));
  // Tag filter is applied in JS — SQLite JSON1 isn't always present
  // and the article count is small. Acceptable until the table grows.
  let rows = baseQuery.all();
  if (tag) {
    const t = tag.toLowerCase();
    rows = rows.filter((r) => parseTags(r.tags).includes(t));
  }

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
      tags: parseTags(r.tags),
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

// Tags catalog: every distinct tag used on a published article, with a
// count, ordered by frequency. Used by the index filter chips.
// Registered before /:slug so the literal path wins the radix match.
newsRouter.get("/tags", async (c) => {
  const db = getDb();
  const rows = db
    .select({ tags: newsArticles.tags })
    .from(newsArticles)
    .where(eq(newsArticles.status, "published"))
    .all();
  const counts = new Map<string, number>();
  for (const r of rows) {
    for (const t of parseTags(r.tags)) {
      counts.set(t, (counts.get(t) ?? 0) + 1);
    }
  }
  const tags = Array.from(counts.entries())
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
  return c.json({ tags });
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
      status: newsArticles.status,
      tags: newsArticles.tags,
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

  // Drafts are private: only the author can fetch them. Strangers see
  // a 404 so the slug isn't even revealed.
  if (row.status === "draft" && (!session || session.id !== row.authorId)) {
    return c.json({ error: "Article not found" }, 404);
  }

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

  let myBookmark = false;
  if (session) {
    const bookmark = db
      .select({ id: newsBookmarks.id })
      .from(newsBookmarks)
      .where(
        and(
          eq(newsBookmarks.articleId, row.id),
          eq(newsBookmarks.userId, session.id),
        ),
      )
      .get();
    myBookmark = !!bookmark;
  }

  return c.json({
    article: {
      id: row.id,
      slug: row.slug,
      title: row.title,
      summary: row.summary,
      body: row.body,
      coverEmoji: row.coverEmoji,
      accentColor: row.accentColor,
      status: row.status,
      tags: parseTags(row.tags),
      authorId: row.authorId,
      authorUsername: row.authorUsername,
      authorDisplayName: row.authorDisplayName,
      lastEditorUsername: editor?.username ?? null,
      readingMinutes: readingMinutes(row.body),
      reactionCounts,
      myReactions,
      pendingProposalCount,
      isAuthor,
      myBookmark,
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

// Tag input is normalized to lowercase kebab-case and capped at 8
// per article. Empty or malformed entries are dropped silently.
const tagSchema = z
  .array(z.string().min(1).max(40))
  .max(8)
  .optional();

function normalizeTags(input: string[] | undefined): string[] {
  if (!input) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of input) {
    const t = raw
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40);
    if (t && !seen.has(t)) {
      seen.add(t);
      out.push(t);
    }
  }
  return out.slice(0, 8);
}

const createSchema = z.object({
  slug: slugSchema,
  title: z.string().min(1).max(200),
  summary: z.string().max(500).default(""),
  body: z.string().min(1),
  coverEmoji: z.string().max(8).optional(),
  accentColor: z.enum(ACCENT_COLORS).optional(),
  status: z.enum(["draft", "published"]).optional(),
  tags: tagSchema,
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
    status: body.status || "published",
    tags: JSON.stringify(normalizeTags(body.tags)),
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
  status: z.enum(["draft", "published"]).optional(),
  tags: tagSchema,
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
      status: data.status ?? article.status,
      tags: data.tags !== undefined
        ? JSON.stringify(normalizeTags(data.tags))
        : article.tags,
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

// --- Comments ---

newsRouter.get("/:slug/comments", async (c) => {
  const slug = c.req.param("slug")!;
  const db = getDb();

  const article = db
    .select({ id: newsArticles.id })
    .from(newsArticles)
    .where(eq(newsArticles.slug, slug))
    .get();
  if (!article) return c.json({ error: "Article not found" }, 404);

  const rows = db
    .select({
      id: newsComments.id,
      articleId: newsComments.articleId,
      parentId: newsComments.parentId,
      userId: newsComments.userId,
      username: users.username,
      displayName: users.displayName,
      content: newsComments.content,
      editedAt: newsComments.editedAt,
      createdAt: newsComments.createdAt,
    })
    .from(newsComments)
    .innerJoin(users, eq(newsComments.userId, users.id))
    .where(eq(newsComments.articleId, article.id))
    .orderBy(desc(newsComments.createdAt))
    .all();

  // Build a tree. Root comments first; children attached recursively.
  const childMap = new Map<string, typeof rows>();
  for (const r of rows) {
    if (r.parentId) {
      const list = childMap.get(r.parentId) ?? [];
      list.push(r);
      childMap.set(r.parentId, list);
    }
  }
  const buildTree = (n: (typeof rows)[number]): any => ({
    ...n,
    children: (childMap.get(n.id) ?? []).map(buildTree),
  });
  const roots = rows.filter((r) => !r.parentId).map(buildTree);

  return c.json({ comments: roots });
});

const newCommentSchema = z.object({
  content: z.string().min(1).max(5000),
  parentId: z.string().optional(),
});

newsRouter.post(
  "/:slug/comments",
  requireAuth,
  zValidator("json", newCommentSchema),
  async (c) => {
    const slug = c.req.param("slug")!;
    const { content, parentId } = c.req.valid("json");
    const user = c.get("user")!;
    const db = getDb();

    const article = db
      .select({ id: newsArticles.id, authorId: newsArticles.authorId })
      .from(newsArticles)
      .where(eq(newsArticles.slug, slug))
      .get();
    if (!article) return c.json({ error: "Article not found" }, 404);

    // If replying, validate the parent belongs to this article so we
    // don't accidentally allow cross-article reply chains.
    let parentAuthorId: string | null = null;
    if (parentId) {
      const parent = db
        .select({
          id: newsComments.id,
          articleId: newsComments.articleId,
          userId: newsComments.userId,
        })
        .from(newsComments)
        .where(eq(newsComments.id, parentId))
        .get();
      if (!parent || parent.articleId !== article.id) {
        return c.json({ error: "Parent comment not found" }, 400);
      }
      parentAuthorId = parent.userId;
    }

    const id = randomUUID();
    db.insert(newsComments).values({
      id,
      articleId: article.id,
      parentId: parentId ?? null,
      userId: user.id,
      content,
    }).run();

    // Fire reply / mention notifications. Reuse the existing kinds so
    // the bell + page render uniformly. contextSlug carries the
    // article slug so the deep-link helper can construct
    // /news/{slug}#comment-{id}.
    if (parentAuthorId) {
      await notify({
        recipientId: parentAuthorId,
        actorId: user.id,
        kind: "comment_reply",
        subjectType: "news_comment",
        subjectId: id,
        contextSlug: slug,
        preview: previewFrom(content),
      });
    } else if (article.authorId !== user.id) {
      // Top-level comment on someone else's article — notify the author.
      await notify({
        recipientId: article.authorId,
        actorId: user.id,
        kind: "comment_reply",
        subjectType: "news_comment",
        subjectId: id,
        contextSlug: slug,
        preview: previewFrom(content),
      });
    }

    return c.json({ commentId: id }, 201);
  },
);

const editCommentSchema = z.object({
  content: z.string().min(1).max(5000),
});

newsRouter.put(
  "/comments/:id",
  requireAuth,
  zValidator("json", editCommentSchema),
  async (c) => {
    const id = c.req.param("id")!;
    const { content } = c.req.valid("json");
    const user = c.get("user")!;
    const db = getDb();

    const existing = db
      .select()
      .from(newsComments)
      .where(eq(newsComments.id, id))
      .get();
    if (!existing) return c.json({ error: "Comment not found" }, 404);
    if (existing.userId !== user.id) {
      return c.json({ error: "Only the author can edit this comment." }, 403);
    }

    db.update(newsComments)
      .set({ content, editedAt: new Date().toISOString() })
      .where(eq(newsComments.id, id))
      .run();

    return c.json({ ok: true });
  },
);

// --- Bookmarks ---

newsRouter.post("/:slug/bookmark", requireAuth, async (c) => {
  const slug = c.req.param("slug")!;
  const user = c.get("user")!;
  const db = getDb();

  const article = db
    .select({ id: newsArticles.id })
    .from(newsArticles)
    .where(eq(newsArticles.slug, slug))
    .get();
  if (!article) return c.json({ error: "Article not found" }, 404);

  const existing = db
    .select({ id: newsBookmarks.id })
    .from(newsBookmarks)
    .where(
      and(
        eq(newsBookmarks.userId, user.id),
        eq(newsBookmarks.articleId, article.id),
      ),
    )
    .get();
  if (existing) {
    db.delete(newsBookmarks).where(eq(newsBookmarks.id, existing.id)).run();
    return c.json({ bookmarked: false });
  }
  db.insert(newsBookmarks).values({
    id: randomUUID(),
    userId: user.id,
    articleId: article.id,
  }).run();
  return c.json({ bookmarked: true });
});

// User's drafts — published-status filter inverted. Drafts are private
// to their author so the route is auth-gated and scoped to user.id.
newsRouter.get("/me/drafts", requireAuth, async (c) => {
  const user = c.get("user")!;
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
      tags: newsArticles.tags,
      authorId: newsArticles.authorId,
      authorUsername: users.username,
      authorDisplayName: users.displayName,
      lastEditorId: newsArticles.lastEditorId,
      createdAt: newsArticles.createdAt,
      updatedAt: newsArticles.updatedAt,
    })
    .from(newsArticles)
    .innerJoin(users, eq(newsArticles.authorId, users.id))
    .where(
      and(
        eq(newsArticles.authorId, user.id),
        eq(newsArticles.status, "draft"),
      ),
    )
    .orderBy(desc(newsArticles.updatedAt))
    .all();

  const reactions = await reactionRollup(db, rows.map((r) => r.id));

  return c.json({
    articles: rows.map((r) => ({
      id: r.id,
      slug: r.slug,
      title: r.title,
      summary: r.summary,
      coverEmoji: r.coverEmoji,
      accentColor: r.accentColor,
      tags: parseTags(r.tags),
      authorId: r.authorId,
      authorUsername: r.authorUsername,
      authorDisplayName: r.authorDisplayName,
      lastEditorUsername: null,
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

// User's bookmarked articles, freshest-bookmarked first. Returns the
// same summary shape used by GET /news so the bookmarks page can
// reuse the list cards.
newsRouter.get("/me/bookmarks", requireAuth, async (c) => {
  const user = c.get("user")!;
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
      bookmarkedAt: newsBookmarks.createdAt,
      createdAt: newsArticles.createdAt,
      updatedAt: newsArticles.updatedAt,
    })
    .from(newsBookmarks)
    .innerJoin(newsArticles, eq(newsBookmarks.articleId, newsArticles.id))
    .innerJoin(users, eq(newsArticles.authorId, users.id))
    .where(eq(newsBookmarks.userId, user.id))
    .orderBy(desc(newsBookmarks.createdAt))
    .all();

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
      lastEditorUsername: null,
      readingMinutes: readingMinutes(r.body),
      reactionCounts: reactions.get(r.id) ?? {
        thumbs: 0,
        lightbulb: 0,
        mind_blown: 0,
      },
      bookmarkedAt: r.bookmarkedAt,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    })),
  });
});

// --- Related articles ---

// Cheap "related" v1: prioritize same author, then most-recent others.
// No semantic similarity — that lives in the search index and is its
// own bundle. Limit 4 so the rail fits comfortably on the article page.
newsRouter.get("/:slug/related", async (c) => {
  const slug = c.req.param("slug")!;
  const db = getDb();

  const article = db
    .select({ id: newsArticles.id, authorId: newsArticles.authorId })
    .from(newsArticles)
    .where(eq(newsArticles.slug, slug))
    .get();
  if (!article) return c.json({ articles: [] });

  const sameAuthor = db
    .select({
      id: newsArticles.id,
      slug: newsArticles.slug,
      title: newsArticles.title,
      summary: newsArticles.summary,
      coverEmoji: newsArticles.coverEmoji,
      accentColor: newsArticles.accentColor,
      authorUsername: users.username,
      createdAt: newsArticles.createdAt,
    })
    .from(newsArticles)
    .innerJoin(users, eq(newsArticles.authorId, users.id))
    .where(
      and(
        eq(newsArticles.authorId, article.authorId),
        eq(newsArticles.status, "published"),
        sql`${newsArticles.id} <> ${article.id}`,
      ),
    )
    .orderBy(desc(newsArticles.createdAt))
    .limit(4)
    .all();

  const pool = sameAuthor;
  if (pool.length < 4) {
    const fillerNeeded = 4 - pool.length;
    const usedIds = new Set([article.id, ...pool.map((p) => p.id)]);
    const recent = db
      .select({
        id: newsArticles.id,
        slug: newsArticles.slug,
        title: newsArticles.title,
        summary: newsArticles.summary,
        coverEmoji: newsArticles.coverEmoji,
        accentColor: newsArticles.accentColor,
        authorUsername: users.username,
        createdAt: newsArticles.createdAt,
      })
      .from(newsArticles)
      .innerJoin(users, eq(newsArticles.authorId, users.id))
      .where(eq(newsArticles.status, "published"))
      .orderBy(desc(newsArticles.createdAt))
      .limit(fillerNeeded + usedIds.size)
      .all();
    for (const r of recent) {
      if (pool.length >= 4) break;
      if (!usedIds.has(r.id)) {
        pool.push(r);
        usedIds.add(r.id);
      }
    }
  }

  return c.json({ articles: pool });
});
