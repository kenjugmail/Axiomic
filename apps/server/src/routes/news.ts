import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import {
  getDb,
  masteryNodes,
  masteryPaths,
  newsArticles,
  newsBookmarks,
  newsComments,
  newsEditProposals,
  newsReactions,
  userFollows,
  users,
} from "@axiomic/db";
import { and, count, desc, eq, max, sql } from "drizzle-orm";
import { randomUUID } from "crypto";
import { requireAuth, getSessionUser } from "../middleware/auth";
import { notify, notifyMentions } from "../lib/notifications";
import { invalidateSearchIndex } from "../lib/searchIndex";
import { publishToArticle } from "../lib/liveBus";
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

function parseReferences(json: string): Array<{ label: string; text: string; url?: string }> {
  try {
    const v = JSON.parse(json);
    if (!Array.isArray(v)) return [];
    return v
      .filter(
        (r): r is { label?: string; text?: string; url?: string } =>
          !!r && typeof (r as any).text === "string",
      )
      .map((r, i) => ({
        label: typeof r.label === "string" ? r.label : String(i + 1),
        text: r.text!,
        url: typeof r.url === "string" ? r.url : undefined,
      }));
  } catch {
    return [];
  }
}

function parseCoauthors(json: string): string[] {
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
  // style=research surfaces articles that have used the research-paper
  // pipeline — i.e., they have an abstract or at least one reference.
  // Other styles can be added later if needed.
  const style = c.req.query("style");
  const baseQuery = db
    .select({
      id: newsArticles.id,
      slug: newsArticles.slug,
      title: newsArticles.title,
      summary: newsArticles.summary,
      body: newsArticles.body,
      abstract: newsArticles.abstract,
      referencesJson: newsArticles.referencesJson,
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
  // Filters applied in JS — SQLite JSON1 isn't always present and the
  // article count is small. Acceptable until the table grows.
  let rows = baseQuery.all();
  if (tag) {
    const t = tag.toLowerCase();
    rows = rows.filter((r) => parseTags(r.tags).includes(t));
  }
  if (style === "research") {
    rows = rows.filter(
      (r) =>
        r.abstract.trim().length > 0 ||
        parseReferences(r.referencesJson).length > 0,
    );
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
      abstract: newsArticles.abstract,
      referencesJson: newsArticles.referencesJson,
      coauthorsJson: newsArticles.coauthorsJson,
      coverEmoji: newsArticles.coverEmoji,
      accentColor: newsArticles.accentColor,
      status: newsArticles.status,
      tags: newsArticles.tags,
      authorId: newsArticles.authorId,
      authorUsername: users.username,
      authorDisplayName: users.displayName,
      lastEditorId: newsArticles.lastEditorId,
      derivedLessonNodeId: newsArticles.derivedLessonNodeId,
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

  // If a lesson has been derived, look up its path + node slugs so the
  // client can build a deep link without a second round-trip.
  let derivedLesson:
    | { nodeId: string; nodeSlug: string; pathSlug: string }
    | null = null;
  if (row.derivedLessonNodeId) {
    const linked = db
      .select({
        nodeId: masteryNodes.id,
        nodeSlug: masteryNodes.slug,
        pathSlug: masteryPaths.slug,
      })
      .from(masteryNodes)
      .innerJoin(masteryPaths, eq(masteryNodes.pathId, masteryPaths.id))
      .where(eq(masteryNodes.id, row.derivedLessonNodeId))
      .get();
    if (linked) {
      derivedLesson = {
        nodeId: linked.nodeId,
        nodeSlug: linked.nodeSlug,
        pathSlug: linked.pathSlug,
      };
    }
  }

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
      abstract: row.abstract,
      references: parseReferences(row.referencesJson),
      coauthors: parseCoauthors(row.coauthorsJson),
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
      derivedLesson,
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

const referenceSchema = z.object({
  text: z.string().min(1).max(500),
  url: z.string().url().optional(),
});

// Renumber labels 1..N. Storage normalizes — the API guarantees the
// labels rendered to the reader are sequential, even if the editor
// drops or reorders entries.
function normalizeReferences(input: unknown): Array<{ label: string; text: string; url?: string }> {
  if (!Array.isArray(input)) return [];
  return input
    .filter(
      (r): r is { text: string; url?: string } =>
        !!r && typeof (r as any).text === "string",
    )
    .slice(0, 50)
    .map((r, i) => ({
      label: String(i + 1),
      text: (r as any).text.slice(0, 500),
      url: typeof (r as any).url === "string" ? (r as any).url : undefined,
    }));
}

// Coauthor input: array of usernames. Validated against the users
// table at write time; unknown usernames are dropped silently.
async function normalizeCoauthors(input: unknown, db: ReturnType<typeof getDb>): Promise<string[]> {
  if (!Array.isArray(input)) return [];
  const requested = Array.from(
    new Set(
      input
        .filter((s): s is string => typeof s === "string")
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean),
    ),
  ).slice(0, 8);
  if (requested.length === 0) return [];
  const found = db
    .select({ username: users.username })
    .from(users)
    .where(sql`${users.username} in ${requested}`)
    .all()
    .map((u) => u.username);
  return found;
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
  abstract: z.string().max(4000).optional(),
  references: z.array(referenceSchema).optional(),
  coauthors: z.array(z.string()).optional(),
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
  const status = body.status || "published";
  const coauthors = await normalizeCoauthors(body.coauthors, db);
  db.insert(newsArticles).values({
    id,
    slug: body.slug,
    title: body.title,
    summary: body.summary ?? "",
    body: body.body,
    abstract: body.abstract ?? "",
    referencesJson: JSON.stringify(normalizeReferences(body.references)),
    coauthorsJson: JSON.stringify(coauthors),
    coverEmoji: body.coverEmoji || "📰",
    accentColor: body.accentColor || "indigo",
    status,
    tags: JSON.stringify(normalizeTags(body.tags)),
    authorId: user.id,
  }).run();

  invalidateSearchIndex();

  // Fan out to followers when publishing immediately. Drafts don't notify.
  if (status === "published") {
    await fanOutNewsPublished(db, id, body.slug, body.title, user.id);
  }

  const created = db.select().from(newsArticles).where(eq(newsArticles.id, id)).get();
  return c.json({ article: created }, 201);
});

// Notify every follower of `authorId` that the named article was just
// published. Best-effort; errors are swallowed so a flaky notify call
// doesn't fail the publish.
async function fanOutNewsPublished(
  db: ReturnType<typeof getDb>,
  articleId: string,
  slug: string,
  title: string,
  authorId: string,
): Promise<void> {
  try {
    const followers = db
      .select({ id: userFollows.followerId })
      .from(userFollows)
      .where(eq(userFollows.followeeId, authorId))
      .all();
    for (const f of followers) {
      await notify({
        recipientId: f.id,
        actorId: authorId,
        kind: "news_published",
        subjectType: "news_article",
        subjectId: articleId,
        contextSlug: slug,
        preview: previewFrom(`Published "${title}"`),
      });
    }
  } catch (err) {
    console.error("follower fanout (news) failed", err);
  }
}

const updateSchema = z.object({
  title: z.string().min(1).max(200),
  summary: z.string().max(500),
  body: z.string().min(1),
  coverEmoji: z.string().max(8).optional(),
  accentColor: z.enum(ACCENT_COLORS).optional(),
  status: z.enum(["draft", "published"]).optional(),
  tags: tagSchema,
  abstract: z.string().max(4000).optional(),
  references: z.array(referenceSchema).optional(),
  coauthors: z.array(z.string()).optional(),
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

  const newCoauthors =
    data.coauthors !== undefined
      ? JSON.stringify(await normalizeCoauthors(data.coauthors, db))
      : article.coauthorsJson;

  db.update(newsArticles)
    .set({
      title: data.title,
      summary: data.summary,
      body: data.body,
      abstract: data.abstract ?? article.abstract,
      referencesJson:
        data.references !== undefined
          ? JSON.stringify(normalizeReferences(data.references))
          : article.referencesJson,
      coauthorsJson: newCoauthors,
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

  // Draft → published transition fans out to followers, exactly once
  // per transition. Re-publishing an already-published article is silent.
  const wasDraft = article.status === "draft";
  const isNowPublished = (data.status ?? article.status) === "published";
  if (wasDraft && isNowPublished) {
    await fanOutNewsPublished(db, article.id, article.slug, data.title, user.id);
  }

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

    const reactionCounts = counts.get(article.id) ?? {
      thumbs: 0,
      lightbulb: 0,
      mind_blown: 0,
    };

    // Live broadcast: anyone currently subscribed to this article
    // gets the new counts in real time, no polling.
    publishToArticle(slug, {
      kind: "reaction_update",
      articleSlug: slug,
      reactionCounts,
    });

    return c.json({ reactionCounts, myReactions: mine });
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

    // Fire mention notifications first so we can avoid double-notifying
    // a user who is *also* the parent / article author.
    const mentioned = await notifyMentions({
      body: content,
      actorId: user.id,
      subjectType: "news_comment",
      subjectId: id,
      contextSlug: slug,
      preview: previewFrom(content),
    });

    // Fire reply / mention notifications. Reuse the existing kinds so
    // the bell + page render uniformly. contextSlug carries the
    // article slug so the deep-link helper can construct
    // /news/{slug}#comment-{id}.
    if (parentAuthorId && !mentioned.has(parentAuthorId)) {
      await notify({
        recipientId: parentAuthorId,
        actorId: user.id,
        kind: "comment_reply",
        subjectType: "news_comment",
        subjectId: id,
        contextSlug: slug,
        preview: previewFrom(content),
      });
    } else if (
      !parentAuthorId &&
      article.authorId !== user.id &&
      !mentioned.has(article.authorId)
    ) {
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

// --- Paper → Lesson pipeline ----------------------------------------
//
// Authors / coauthors can convert a published article into a Brilliant-
// style lesson. Slides are generated by /ai/lesson/from-article (streaming),
// reviewed in the dialog, then submitted here. The endpoint creates a
// dedicated "from-articles" mastery path on first use, then a mastery_node
// under it whose lessonData carries the slides. Both ends get cross-linked
// so the article view shows a "📚 Lesson available" badge and the lesson
// page shows a "Sourced from @author's article" footer.

const FROM_ARTICLES_PATH_SLUG = "from-articles";

const lessonSlideSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("text"),
    title: z.string().optional(),
    body: z.string().min(1),
    viz: z.string().nullable().optional(),
  }),
  z.object({
    kind: z.literal("question"),
    question: z.object({
      id: z.string().min(1),
      kind: z.literal("multiple_choice"),
      question: z.string().min(1),
      options: z.array(z.string().min(1)).length(4),
      correctIndex: z.number().int().min(0).max(3),
      explanation: z.string().optional(),
    }),
  }),
]);

const deriveLessonSchema = z.object({
  slides: z.array(lessonSlideSchema).min(2).max(20),
});

newsRouter.post(
  "/:slug/derive-lesson",
  requireAuth,
  zValidator("json", deriveLessonSchema),
  async (c) => {
    const slug = c.req.param("slug")!;
    const user = c.get("user")!;
    const { slides } = c.req.valid("json");
    const db = getDb();

    const article = db
      .select({
        id: newsArticles.id,
        title: newsArticles.title,
        summary: newsArticles.summary,
        status: newsArticles.status,
        authorId: newsArticles.authorId,
        coauthorsJson: newsArticles.coauthorsJson,
        derivedLessonNodeId: newsArticles.derivedLessonNodeId,
      })
      .from(newsArticles)
      .where(eq(newsArticles.slug, slug))
      .get();
    if (!article) return c.json({ error: "Article not found" }, 404);
    if (article.status !== "published") {
      return c.json({ error: "Publish the article first." }, 400);
    }

    // Author + coauthors only. Coauthors are stored as a JSON array of
    // usernames; we resolve the caller's username to compare.
    const isAuthor = article.authorId === user.id;
    const coauthors = parseCoauthors(article.coauthorsJson);
    const isCoauthor = coauthors.includes(user.username);
    if (!isAuthor && !isCoauthor) {
      return c.json({ error: "Only the author or coauthors can derive a lesson." }, 403);
    }

    // Reject duplicate question ids — same constraint the lesson PUT
    // endpoint enforces, so the player's per-slide answer state stays
    // sane.
    const seenIds = new Set<string>();
    for (const s of slides) {
      if (s.kind === "question") {
        if (seenIds.has(s.question.id)) {
          return c.json({ error: `Duplicate question id: ${s.question.id}` }, 400);
        }
        seenIds.add(s.question.id);
      }
    }

    // If a lesson is already linked, update its slides in place rather
    // than create another node — the dialog shouldn't multiply lessons.
    if (article.derivedLessonNodeId) {
      const existing = db
        .select({
          id: masteryNodes.id,
          slug: masteryNodes.slug,
          pathId: masteryNodes.pathId,
          currentLessonVersion: masteryNodes.currentLessonVersion,
        })
        .from(masteryNodes)
        .where(eq(masteryNodes.id, article.derivedLessonNodeId))
        .get();
      if (existing) {
        const lessonData = JSON.stringify({ slides });
        db.update(masteryNodes)
          .set({
            lessonData,
            currentLessonVersion: existing.currentLessonVersion + 1,
            // Clear any in-flight draft — the new published payload
            // supersedes it.
            draftLessonData: null,
            draftUpdatedAt: null,
            draftEditorId: null,
          })
          .where(eq(masteryNodes.id, existing.id))
          .run();
        const path = db
          .select({ slug: masteryPaths.slug })
          .from(masteryPaths)
          .where(eq(masteryPaths.id, existing.pathId))
          .get();
        return c.json({
          nodeId: existing.id,
          nodeSlug: existing.slug,
          pathSlug: path?.slug ?? FROM_ARTICLES_PATH_SLUG,
        });
      }
      // Stale link (node was deleted) — fall through and create a fresh
      // one, which will overwrite the dangling pointer below.
    }

    // Get-or-create the "from-articles" path. The first paper-derived
    // lesson on a fresh deploy creates this implicitly.
    let path = db
      .select({ id: masteryPaths.id })
      .from(masteryPaths)
      .where(eq(masteryPaths.slug, FROM_ARTICLES_PATH_SLUG))
      .get();
    if (!path) {
      const pathId = randomUUID();
      db.insert(masteryPaths)
        .values({
          id: pathId,
          slug: FROM_ARTICLES_PATH_SLUG,
          title: "From articles",
          description:
            "Lessons derived from published research articles by their authors.",
        })
        .run();
      path = { id: pathId };
    }

    // Pick a slug under that path — fall back to suffixing if collision.
    const baseSlug = slug.slice(0, 100);
    let nodeSlug = baseSlug;
    for (let attempt = 2; attempt < 50; attempt++) {
      const collision = db
        .select({ id: masteryNodes.id })
        .from(masteryNodes)
        .where(
          and(
            eq(masteryNodes.pathId, path.id),
            eq(masteryNodes.slug, nodeSlug),
          ),
        )
        .get();
      if (!collision) break;
      nodeSlug = `${baseSlug}-${attempt}`;
    }

    // Append after the existing nodes in the path. Order doesn't drive
    // navigation here (paper-derived lessons don't form a curriculum),
    // but keeping it monotonic makes the listing stable.
    const nextOrder = Number(
      db
        .select({ m: max(masteryNodes.order) })
        .from(masteryNodes)
        .where(eq(masteryNodes.pathId, path.id))
        .get()?.m ?? 0,
    );

    const nodeId = randomUUID();
    const lessonData = JSON.stringify({ slides });
    db.insert(masteryNodes)
      .values({
        id: nodeId,
        pathId: path.id,
        slug: nodeSlug,
        title: article.title,
        description:
          article.summary ||
          `Lesson derived from the article "${article.title}".`,
        order: nextOrder + 1,
        // Sensible default; the author can revise via the lesson editor.
        level: "practitioner",
        pageIds: "[]",
        prerequisiteNodeIds: "[]",
        lessonData,
        currentLessonVersion: 1,
        sourceArticleId: article.id,
      })
      .run();

    db.update(newsArticles)
      .set({ derivedLessonNodeId: nodeId })
      .where(eq(newsArticles.id, article.id))
      .run();

    return c.json({ nodeId, nodeSlug, pathSlug: FROM_ARTICLES_PATH_SLUG });
  },
);
