import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import {
  getDb,
  domains,
  forumTopics,
  forumPosts,
  forumPostEdits,
  forumVotes,
  forumReactions,
  forumBookmarks,
  forumPolls,
  forumPollOptions,
  forumPollVotes,
  userFollows,
  users,
  wikiPages,
} from "@axiomic/db";
import { count, desc, eq, and, sql, inArray, asc } from "drizzle-orm";
import { randomUUID } from "crypto";
import { getAIProvider } from "@axiomic/ai";
import { requireAuth, getSessionUser } from "../middleware/auth";
import { notify, notifyMentions, toPreview } from "../lib/notifications";
import { invalidateSearchIndex } from "../lib/searchIndex";
import { nodesForWikiSlug } from "../lib/crossLinks";
import { recordActivityAndEvaluate } from "../lib/achievements";
import { checkRateLimit, rateLimitIdentity } from "../lib/rateLimit";
import type { Env } from "../env";

const forum = new Hono<Env>();

const POST_TYPES = [
  "claim",
  "question",
  "derivation",
  "critique",
  "synthesis",
  "prediction",
  "poll",
] as const;

const REACTION_KINDS = ["thumbs", "lightbulb", "mind_blown"] as const;
type ReactionKind = (typeof REACTION_KINDS)[number];

async function forumReactionRollup(
  db: ReturnType<typeof getDb>,
  topicIds: string[],
): Promise<Map<string, Record<ReactionKind, number>>> {
  const blank = (): Record<ReactionKind, number> => ({
    thumbs: 0,
    lightbulb: 0,
    mind_blown: 0,
  });
  const out = new Map<string, Record<ReactionKind, number>>();
  for (const id of topicIds) out.set(id, blank());
  if (topicIds.length === 0) return out;
  const rows = db
    .select({
      topicId: forumReactions.topicId,
      kind: forumReactions.kind,
      n: count(),
    })
    .from(forumReactions)
    .where(sql`${forumReactions.topicId} in ${topicIds}`)
    .groupBy(forumReactions.topicId, forumReactions.kind)
    .all();
  for (const r of rows) {
    const bucket = out.get(r.topicId);
    if (bucket && (REACTION_KINDS as readonly string[]).includes(r.kind)) {
      bucket[r.kind as ReactionKind] = Number(r.n);
    }
  }
  return out;
}

const SLUG_RANDOM_LEN = 6;

function slugify(title: string): string {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
  const suffix = Math.random().toString(36).slice(2, 2 + SLUG_RANDOM_LEN);
  return base ? `${base}-${suffix}` : suffix;
}

function voteScores(
  subjectType: "topic" | "post",
  subjectIds: string[]
): Map<string, number> {
  if (subjectIds.length === 0) return new Map();
  const db = getDb();
  const rows = db
    .select({
      subjectId: forumVotes.subjectId,
      total: sql<number>`sum(${forumVotes.value})`.as("total"),
    })
    .from(forumVotes)
    .where(
      and(
        eq(forumVotes.subjectType, subjectType),
        inArray(forumVotes.subjectId, subjectIds)
      )
    )
    .groupBy(forumVotes.subjectId)
    .all();
  return new Map(rows.map((r) => [r.subjectId, r.total || 0]));
}

function userVotesFor(
  userId: string | null,
  subjectType: "topic" | "post",
  subjectIds: string[]
): Map<string, number> {
  if (!userId || subjectIds.length === 0) return new Map();
  const db = getDb();
  const rows = db
    .select({ subjectId: forumVotes.subjectId, value: forumVotes.value })
    .from(forumVotes)
    .where(
      and(
        eq(forumVotes.userId, userId),
        eq(forumVotes.subjectType, subjectType),
        inArray(forumVotes.subjectId, subjectIds)
      )
    )
    .all();
  return new Map(rows.map((r) => [r.subjectId, r.value]));
}

// --- Domains ------------------------------------------------------------

forum.get("/domains", (c) => {
  const db = getDb();
  const list = db.select().from(domains).orderBy(domains.title).all();
  return c.json({ domains: list });
});

// --- Topic listing ------------------------------------------------------

forum.get("/topics", async (c) => {
  const db = getDb();
  const currentUser = await getSessionUser(c);

  const domainSlug = c.req.query("domain");
  const postType = c.req.query("postType");
  const wikiPageId = c.req.query("wikiPageId");
  const sort = c.req.query("sort") || "active";
  const limit = Math.min(parseInt(c.req.query("limit") || "50"), 100);
  const offset = parseInt(c.req.query("offset") || "0");

  const conditions = [];

  if (domainSlug) {
    const dom = db.select().from(domains).where(eq(domains.slug, domainSlug)).get();
    if (!dom) return c.json({ topics: [] });
    conditions.push(eq(forumTopics.domainId, dom.id));
  }
  if (postType) conditions.push(eq(forumTopics.postType, postType));
  if (wikiPageId) conditions.push(eq(forumTopics.wikiPageId, wikiPageId));

  const whereExpr = conditions.length > 0 ? and(...conditions) : undefined;

  const rows = db
    .select({
      id: forumTopics.id,
      slug: forumTopics.slug,
      title: forumTopics.title,
      postType: forumTopics.postType,
      domainId: forumTopics.domainId,
      domainSlug: domains.slug,
      domainTitle: domains.title,
      authorId: forumTopics.authorId,
      authorUsername: users.username,
      wikiPageId: forumTopics.wikiPageId,
      createdAt: forumTopics.createdAt,
      updatedAt: forumTopics.updatedAt,
    })
    .from(forumTopics)
    .innerJoin(domains, eq(forumTopics.domainId, domains.id))
    .innerJoin(users, eq(forumTopics.authorId, users.id))
    .where(whereExpr)
    .all();

  const topicIds = rows.map((r) => r.id);
  const scores = voteScores("topic", topicIds);
  const userVotes = userVotesFor(currentUser?.id || null, "topic", topicIds);

  // Post counts and last activity per topic.
  const postStats = topicIds.length === 0 ? [] : db
    .select({
      topicId: forumPosts.topicId,
      count: sql<number>`count(*)`.as("count"),
      lastAt: sql<string>`max(${forumPosts.createdAt})`.as("lastAt"),
    })
    .from(forumPosts)
    .where(inArray(forumPosts.topicId, topicIds))
    .groupBy(forumPosts.topicId)
    .all();
  const statsMap = new Map(postStats.map((s) => [s.topicId, s]));

  // Wiki page lookup for anchored topics.
  const wikiIds = rows
    .map((r) => r.wikiPageId)
    .filter((id): id is string => !!id);
  const wikiMap = new Map<string, { slug: string; title: string }>();
  if (wikiIds.length > 0) {
    const wikis = db
      .select({ id: wikiPages.id, slug: wikiPages.slug, title: wikiPages.title })
      .from(wikiPages)
      .where(inArray(wikiPages.id, wikiIds))
      .all();
    for (const w of wikis) wikiMap.set(w.id, { slug: w.slug, title: w.title });
  }

  const enriched = rows.map((r) => {
    const stat = statsMap.get(r.id);
    const wiki = r.wikiPageId ? wikiMap.get(r.wikiPageId) : undefined;
    return {
      ...r,
      score: scores.get(r.id) ?? 0,
      userVote: userVotes.get(r.id) ?? 0,
      postCount: stat?.count ?? 0,
      lastActivityAt: stat?.lastAt ?? r.updatedAt,
      wikiPageSlug: wiki?.slug ?? null,
      wikiPageTitle: wiki?.title ?? null,
    };
  });

  enriched.sort((a, b) => {
    if (sort === "top") return b.score - a.score;
    if (sort === "new") {
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    }
    // active: most recent post or, if none, most recent topic update
    return (
      new Date(b.lastActivityAt).getTime() -
      new Date(a.lastActivityAt).getTime()
    );
  });

  return c.json({ topics: enriched.slice(offset, offset + limit) });
});

// --- Topic detail -------------------------------------------------------

forum.get("/topics/:slug", async (c) => {
  const db = getDb();
  const slug = c.req.param("slug");
  const currentUser = await getSessionUser(c);

  const topicRow = db
    .select({
      id: forumTopics.id,
      slug: forumTopics.slug,
      title: forumTopics.title,
      body: forumTopics.body,
      postType: forumTopics.postType,
      domainId: forumTopics.domainId,
      domainSlug: domains.slug,
      domainTitle: domains.title,
      authorId: forumTopics.authorId,
      authorUsername: users.username,
      wikiPageId: forumTopics.wikiPageId,
      createdAt: forumTopics.createdAt,
      updatedAt: forumTopics.updatedAt,
    })
    .from(forumTopics)
    .innerJoin(domains, eq(forumTopics.domainId, domains.id))
    .innerJoin(users, eq(forumTopics.authorId, users.id))
    .where(eq(forumTopics.slug, slug))
    .get();

  if (!topicRow) return c.json({ error: "Topic not found" }, 404);

  const postRows = db
    .select({
      id: forumPosts.id,
      topicId: forumPosts.topicId,
      parentId: forumPosts.parentId,
      authorId: forumPosts.authorId,
      authorUsername: users.username,
      body: forumPosts.body,
      editedAt: forumPosts.editedAt,
      createdAt: forumPosts.createdAt,
    })
    .from(forumPosts)
    .innerJoin(users, eq(forumPosts.authorId, users.id))
    .where(eq(forumPosts.topicId, topicRow.id))
    .all();

  const postIds = postRows.map((p) => p.id);
  const postScores = voteScores("post", postIds);
  const postUserVotes = userVotesFor(currentUser?.id || null, "post", postIds);
  const topicScores = voteScores("topic", [topicRow.id]);
  const topicUserVotes = userVotesFor(
    currentUser?.id || null,
    "topic",
    [topicRow.id]
  );

  const enrichedPosts = postRows.map((p) => ({
    ...p,
    score: postScores.get(p.id) ?? 0,
    userVote: postUserVotes.get(p.id) ?? 0,
  }));

  enrichedPosts.sort((a, b) => {
    if (a.score !== b.score) return b.score - a.score;
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  });

  type EP = (typeof enrichedPosts)[number];
  const childMap = new Map<string, EP[]>();
  for (const p of enrichedPosts) {
    if (p.parentId) {
      const arr = childMap.get(p.parentId) || [];
      arr.push(p);
      childMap.set(p.parentId, arr);
    }
  }
  function buildTree(p: EP): EP & { children: ReturnType<typeof buildTree>[] } {
    return { ...p, children: (childMap.get(p.id) || []).map(buildTree) };
  }
  const rootPosts = enrichedPosts.filter((p) => !p.parentId).map(buildTree);

  let wikiPageSlug: string | null = null;
  let wikiPageTitle: string | null = null;
  let linkedNodes: ReturnType<typeof nodesForWikiSlug> = [];
  if (topicRow.wikiPageId) {
    const w = db
      .select({ slug: wikiPages.slug, title: wikiPages.title })
      .from(wikiPages)
      .where(eq(wikiPages.id, topicRow.wikiPageId))
      .get();
    if (w) {
      wikiPageSlug = w.slug;
      wikiPageTitle = w.title;
      // Sprint 16 — show "Practice this" cards next to the topic so a
      // reader who's missing prerequisites can drop into the lesson.
      linkedNodes = nodesForWikiSlug(w.slug);
    }
  }

  const lastActivityAt =
    enrichedPosts.length > 0
      ? enrichedPosts.reduce(
          (acc, p) => (p.createdAt > acc ? p.createdAt : acc),
          topicRow.updatedAt
        )
      : topicRow.updatedAt;

  // Reactions + my-reactions + my-bookmark.
  const reactionRollup = await forumReactionRollup(db, [topicRow.id]);
  const reactionCounts = reactionRollup.get(topicRow.id) ?? {
    thumbs: 0,
    lightbulb: 0,
    mind_blown: 0,
  };
  let myReactions: Record<ReactionKind, boolean> | null = null;
  let myBookmark = false;
  if (currentUser) {
    const mine = db
      .select({ kind: forumReactions.kind })
      .from(forumReactions)
      .where(
        and(
          eq(forumReactions.topicId, topicRow.id),
          eq(forumReactions.userId, currentUser.id),
        ),
      )
      .all();
    myReactions = { thumbs: false, lightbulb: false, mind_blown: false };
    for (const r of mine) {
      if ((REACTION_KINDS as readonly string[]).includes(r.kind)) {
        myReactions[r.kind as ReactionKind] = true;
      }
    }
    const bm = db
      .select({ id: forumBookmarks.id })
      .from(forumBookmarks)
      .where(
        and(
          eq(forumBookmarks.topicId, topicRow.id),
          eq(forumBookmarks.userId, currentUser.id),
        ),
      )
      .get();
    myBookmark = !!bm;
  }

  // Poll, if this topic carries one.
  let poll: any = null;
  if (topicRow.postType === "poll") {
    const pollRow = db
      .select()
      .from(forumPolls)
      .where(eq(forumPolls.topicId, topicRow.id))
      .get();
    if (pollRow) {
      const optionRows = db
        .select()
        .from(forumPollOptions)
        .where(eq(forumPollOptions.pollId, pollRow.id))
        .orderBy(asc(forumPollOptions.order))
        .all();
      const tallies = db
        .select({ optionId: forumPollVotes.optionId, n: count() })
        .from(forumPollVotes)
        .where(eq(forumPollVotes.pollId, pollRow.id))
        .groupBy(forumPollVotes.optionId)
        .all();
      const tallyMap = new Map(tallies.map((t) => [t.optionId, Number(t.n)]));
      let myOptionId: string | null = null;
      if (currentUser) {
        const myVote = db
          .select({ optionId: forumPollVotes.optionId })
          .from(forumPollVotes)
          .where(
            and(
              eq(forumPollVotes.pollId, pollRow.id),
              eq(forumPollVotes.userId, currentUser.id),
            ),
          )
          .get();
        myOptionId = myVote?.optionId ?? null;
      }
      const totalVotes = Array.from(tallyMap.values()).reduce(
        (a, b) => a + b,
        0,
      );
      poll = {
        id: pollRow.id,
        question: pollRow.question,
        totalVotes,
        myOptionId,
        options: optionRows.map((o) => ({
          id: o.id,
          label: o.label,
          order: o.order,
          count: tallyMap.get(o.id) ?? 0,
        })),
      };
    }
  }

  return c.json({
    topic: {
      ...topicRow,
      score: topicScores.get(topicRow.id) ?? 0,
      userVote: topicUserVotes.get(topicRow.id) ?? 0,
      postCount: enrichedPosts.length,
      lastActivityAt,
      wikiPageSlug,
      wikiPageTitle,
      linkedNodes,
      posts: rootPosts,
      reactionCounts,
      myReactions,
      myBookmark,
      poll,
    },
  });
});

// --- Create topic -------------------------------------------------------

const pollOptionSchema = z.object({ label: z.string().min(1).max(200) });

const createTopicSchema = z.object({
  title: z.string().min(3).max(200),
  body: z.string().min(1).max(20000),
  postType: z.enum(POST_TYPES),
  domainSlug: z.string(),
  wikiPageId: z.string().optional().nullable(),
  // Required when postType === "poll". Min 2, max 8 options.
  poll: z
    .object({
      question: z.string().min(3).max(200),
      options: z.array(pollOptionSchema).min(2).max(8),
    })
    .optional(),
});

// Sprint 36 — Argument map endpoint.
//
// Returns the topic + every post in the thread as a node list with
// parentId edges. Drives the /forum/graph?slug= visualization. We
// keep the payload tight: id, parentId, author username, body snippet,
// reply count, score (sum of votes), createdAt. Up to 200 posts per
// topic to bound the client SVG size.
forum.get("/graph", async (c) => {
  const slug = c.req.query("slug");
  if (!slug) return c.json({ error: "slug is required" }, 400);
  const db = getDb();

  const topic = db
    .select({
      id: forumTopics.id,
      slug: forumTopics.slug,
      title: forumTopics.title,
      body: forumTopics.body,
      postType: forumTopics.postType,
      authorId: forumTopics.authorId,
      authorUsername: users.username,
      domainSlug: domains.slug,
      createdAt: forumTopics.createdAt,
    })
    .from(forumTopics)
    .innerJoin(users, eq(forumTopics.authorId, users.id))
    .innerJoin(domains, eq(forumTopics.domainId, domains.id))
    .where(eq(forumTopics.slug, slug))
    .get();
  if (!topic) return c.json({ error: "Topic not found" }, 404);

  const posts = db
    .select({
      id: forumPosts.id,
      parentId: forumPosts.parentId,
      authorId: forumPosts.authorId,
      authorUsername: users.username,
      body: forumPosts.body,
      createdAt: forumPosts.createdAt,
    })
    .from(forumPosts)
    .innerJoin(users, eq(forumPosts.authorId, users.id))
    .where(eq(forumPosts.topicId, topic.id))
    .orderBy(asc(forumPosts.createdAt))
    .limit(200)
    .all();

  // Compute child counts so the renderer can size nodes by reply weight.
  const childCount = new Map<string, number>();
  for (const p of posts) {
    if (!p.parentId) continue;
    childCount.set(p.parentId, (childCount.get(p.parentId) ?? 0) + 1);
  }

  // Vote scores per post — single GROUP BY rather than N+1.
  const scoreRows = db
    .select({
      subjectId: forumVotes.subjectId,
      score: sql<number>`COALESCE(SUM(${forumVotes.value}), 0)`,
    })
    .from(forumVotes)
    .where(
      and(
        eq(forumVotes.subjectType, "post"),
        inArray(
          forumVotes.subjectId,
          posts.map((p) => p.id),
        ),
      ),
    )
    .groupBy(forumVotes.subjectId)
    .all();
  const scoreById = new Map(
    scoreRows.map((r) => [r.subjectId, Number(r.score)]),
  );

  function snippet(s: string, max = 140): string {
    const flat = s
      .replace(/```[\s\S]*?```/g, " ")
      .replace(/`[^`\n]*`/g, " ")
      .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
      .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
      .replace(/\s+/g, " ")
      .trim();
    return flat.length > max ? flat.slice(0, max - 1) + "…" : flat;
  }

  return c.json({
    topic: {
      id: topic.id,
      slug: topic.slug,
      title: topic.title,
      postType: topic.postType,
      authorUsername: topic.authorUsername,
      domainSlug: topic.domainSlug,
      createdAt: topic.createdAt,
      bodySnippet: snippet(topic.body),
    },
    posts: posts.map((p) => ({
      id: p.id,
      parentId: p.parentId,
      authorUsername: p.authorUsername,
      bodySnippet: snippet(p.body),
      replyCount: childCount.get(p.id) ?? 0,
      score: scoreById.get(p.id) ?? 0,
      createdAt: p.createdAt,
    })),
  });
});

forum.post("/topics", requireAuth, zValidator("json", createTopicSchema), async (c) => {
  const { title, body, postType, domainSlug, wikiPageId, poll } = c.req.valid("json");
  const user = c.get("user")!;
  const db = getDb();

  const dom = db.select().from(domains).where(eq(domains.slug, domainSlug)).get();
  if (!dom) return c.json({ error: "Unknown domain" }, 400);

  if (postType === "poll" && !poll) {
    return c.json({ error: "poll required for postType=poll" }, 400);
  }

  if (wikiPageId) {
    const exists = db
      .select({ id: wikiPages.id })
      .from(wikiPages)
      .where(eq(wikiPages.id, wikiPageId))
      .get();
    if (!exists) return c.json({ error: "Unknown wikiPageId" }, 400);
  }

  const id = randomUUID();
  let slug = slugify(title);
  // Defensive: if slug collides, regenerate.
  for (let i = 0; i < 5; i++) {
    const clash = db
      .select({ id: forumTopics.id })
      .from(forumTopics)
      .where(eq(forumTopics.slug, slug))
      .get();
    if (!clash) break;
    slug = slugify(title);
  }

  db.insert(forumTopics).values({
    id,
    slug,
    title,
    body,
    postType,
    domainId: dom.id,
    authorId: user.id,
    wikiPageId: wikiPageId || null,
  }).run();

  // Persist the poll alongside, if present.
  if (postType === "poll" && poll) {
    const pollId = randomUUID();
    db.insert(forumPolls).values({
      id: pollId,
      topicId: id,
      question: poll.question,
    }).run();
    for (let i = 0; i < poll.options.length; i++) {
      db.insert(forumPollOptions).values({
        id: randomUUID(),
        pollId,
        label: poll.options[i].label,
        order: i,
      }).run();
    }
  }

  // Notify followers of the author about the new topic.
  try {
    const followers = db
      .select({ id: userFollows.followerId })
      .from(userFollows)
      .where(eq(userFollows.followeeId, user.id))
      .all();
    for (const f of followers) {
      await notify({
        recipientId: f.id,
        actorId: user.id,
        kind: "forum_topic_posted",
        subjectType: "topic",
        subjectId: id,
        contextSlug: slug,
        preview: toPreview(body || title),
      });
    }
  } catch (err) {
    console.error("follower fanout (topic) failed", err);
  }

  // New topic enters the search corpus.
  invalidateSearchIndex();

  // Activity + achievement evaluation. Best-effort, swallowed errors.
  try {
    recordActivityAndEvaluate(user.id, "forum_topic_created");
  } catch (err) {
    console.error("forum activity recording failed", err);
  }

  // Best-effort mention notifications. The topic has no parent so only
  // mentions fire. Awaited (not fire-and-forget) so the response observes
  // a consistent state and tests don't race.
  try {
    await notifyMentions({
      body: `${title}\n${body}`,
      actorId: user.id,
      subjectType: "topic",
      subjectId: id,
      contextSlug: slug,
      preview: toPreview(body || title),
    });
  } catch (err) {
    console.error("topic notifications failed", err);
  }

  return c.json(
    {
      topic: {
        id,
        slug,
        title,
        postType,
        domainId: dom.id,
        domainSlug: dom.slug,
        domainTitle: dom.title,
        authorId: user.id,
        authorUsername: user.username,
        wikiPageId: wikiPageId || null,
        wikiPageSlug: null,
        wikiPageTitle: null,
        score: 0,
        userVote: 0,
        postCount: 0,
        lastActivityAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    },
    201
  );
});

// --- Create reply -------------------------------------------------------

const createPostSchema = z.object({
  body: z.string().min(1).max(20000),
  parentId: z.string().optional(),
});

forum.post(
  "/topics/:slug/posts",
  requireAuth,
  zValidator("json", createPostSchema),
  async (c) => {
    const { body, parentId } = c.req.valid("json");
    const user = c.get("user")!;
    const db = getDb();

    const topic = db
      .select()
      .from(forumTopics)
      .where(eq(forumTopics.slug, c.req.param("slug")))
      .get();
    if (!topic) return c.json({ error: "Topic not found" }, 404);

    if (parentId) {
      const parent = db
        .select({ id: forumPosts.id, topicId: forumPosts.topicId })
        .from(forumPosts)
        .where(eq(forumPosts.id, parentId))
        .get();
      if (!parent || parent.topicId !== topic.id) {
        return c.json({ error: "Invalid parentId" }, 400);
      }
    }

    const id = randomUUID();
    db.insert(forumPosts).values({
      id,
      topicId: topic.id,
      parentId: parentId || null,
      authorId: user.id,
      body,
    }).run();

    db.update(forumTopics)
      .set({ updatedAt: new Date().toISOString() })
      .where(eq(forumTopics.id, topic.id))
      .run();

    // Mentions take precedence over reply notifications: a recipient who
    // is both @-mentioned and the parent author receives only the mention.
    try {
      const preview = toPreview(body);
      const mentioned = await notifyMentions({
        body,
        actorId: user.id,
        subjectType: "post",
        subjectId: id,
        contextSlug: topic.slug,
        preview,
      });

      let replyRecipientId: string | null = null;
      let replyKind: "topic_reply" | "post_reply" = "topic_reply";
      if (parentId) {
        const parent = db
          .select({ authorId: forumPosts.authorId })
          .from(forumPosts)
          .where(eq(forumPosts.id, parentId))
          .get();
        replyRecipientId = parent?.authorId ?? null;
        replyKind = "post_reply";
      } else {
        replyRecipientId = topic.authorId;
        replyKind = "topic_reply";
      }
      if (
        replyRecipientId &&
        replyRecipientId !== user.id &&
        !mentioned.has(replyRecipientId)
      ) {
        await notify({
          recipientId: replyRecipientId,
          actorId: user.id,
          kind: replyKind,
          subjectType: "post",
          subjectId: id,
          contextSlug: topic.slug,
          preview,
        });
      }
    } catch (err) {
      console.error("post notifications failed", err);
    }

    return c.json(
      {
        post: {
          id,
          topicId: topic.id,
          parentId: parentId || null,
          authorId: user.id,
          authorUsername: user.username,
          body,
          score: 0,
          userVote: 0,
          editedAt: null,
          createdAt: new Date().toISOString(),
          children: [],
        },
      },
      201
    );
  }
);

// --- Edit post ----------------------------------------------------------

const editPostSchema = z.object({ body: z.string().min(1).max(20000) });

forum.put("/posts/:id", requireAuth, zValidator("json", editPostSchema), async (c) => {
  const { body } = c.req.valid("json");
  const user = c.get("user")!;
  const db = getDb();
  const id = c.req.param("id");

  const post = db.select().from(forumPosts).where(eq(forumPosts.id, id)).get();
  if (!post) return c.json({ error: "Post not found" }, 404);
  if (post.authorId !== user.id) {
    return c.json({ error: "Not your post" }, 403);
  }

  db.insert(forumPostEdits).values({
    id: randomUUID(),
    postId: id,
    previousBody: post.body,
  }).run();

  const now = new Date().toISOString();
  db.update(forumPosts)
    .set({ body, editedAt: now })
    .where(eq(forumPosts.id, id))
    .run();

  return c.json({ post: { ...post, body, editedAt: now } });
});

// --- Voting -------------------------------------------------------------

const voteSchema = z.object({ value: z.union([z.literal(1), z.literal(-1)]) });

async function toggleVote(
  subjectType: "topic" | "post",
  subjectId: string,
  userId: string,
  value: 1 | -1
) {
  const db = getDb();
  const existing = db
    .select()
    .from(forumVotes)
    .where(
      and(
        eq(forumVotes.subjectType, subjectType),
        eq(forumVotes.subjectId, subjectId),
        eq(forumVotes.userId, userId)
      )
    )
    .get();

  if (existing) {
    if (existing.value === value) {
      db.delete(forumVotes).where(eq(forumVotes.id, existing.id)).run();
    } else {
      db.update(forumVotes)
        .set({ value })
        .where(eq(forumVotes.id, existing.id))
        .run();
    }
  } else {
    db.insert(forumVotes).values({
      id: randomUUID(),
      subjectType,
      subjectId,
      userId,
      value,
    }).run();
  }
}

forum.post(
  "/topics/:slug/vote",
  requireAuth,
  zValidator("json", voteSchema),
  async (c) => {
    const { value } = c.req.valid("json");
    const user = c.get("user")!;
    const db = getDb();
    const topic = db
      .select({ id: forumTopics.id })
      .from(forumTopics)
      .where(eq(forumTopics.slug, c.req.param("slug")))
      .get();
    if (!topic) return c.json({ error: "Topic not found" }, 404);
    await toggleVote("topic", topic.id, user.id, value);
    return c.json({ ok: true });
  }
);

forum.post(
  "/posts/:id/vote",
  requireAuth,
  zValidator("json", voteSchema),
  async (c) => {
    const { value } = c.req.valid("json");
    const user = c.get("user")!;
    const db = getDb();
    const id = c.req.param("id");
    const exists = db
      .select({ id: forumPosts.id })
      .from(forumPosts)
      .where(eq(forumPosts.id, id))
      .get();
    if (!exists) return c.json({ error: "Post not found" }, 404);
    await toggleVote("post", id, user.id, value);
    return c.json({ ok: true });
  }
);

// --- Reputation ---------------------------------------------------------

forum.get("/users/:username/reputation", (c) => {
  const db = getDb();
  const user = db
    .select({ id: users.id, username: users.username })
    .from(users)
    .where(eq(users.username, c.req.param("username")))
    .get();
  if (!user) return c.json({ error: "User not found" }, 404);

  // All topics the user authored, with their domain.
  const userTopics = db
    .select({
      id: forumTopics.id,
      domainId: forumTopics.domainId,
      domainSlug: domains.slug,
      domainTitle: domains.title,
    })
    .from(forumTopics)
    .innerJoin(domains, eq(forumTopics.domainId, domains.id))
    .where(eq(forumTopics.authorId, user.id))
    .all();

  // All posts the user authored, with the domain of their parent topic.
  const userPosts = db
    .select({
      id: forumPosts.id,
      domainId: forumTopics.domainId,
      domainSlug: domains.slug,
      domainTitle: domains.title,
    })
    .from(forumPosts)
    .innerJoin(forumTopics, eq(forumPosts.topicId, forumTopics.id))
    .innerJoin(domains, eq(forumTopics.domainId, domains.id))
    .where(eq(forumPosts.authorId, user.id))
    .all();

  const topicIds = userTopics.map((t) => t.id);
  const postIds = userPosts.map((p) => p.id);
  const topicScores = voteScores("topic", topicIds);
  const postScoresMap = voteScores("post", postIds);

  // Aggregate by domain.
  type Agg = {
    domainSlug: string;
    domainTitle: string;
    score: number;
    topicCount: number;
    postCount: number;
  };
  const byDomain = new Map<string, Agg>();
  function ensure(slug: string, title: string): Agg {
    let a = byDomain.get(slug);
    if (!a) {
      a = { domainSlug: slug, domainTitle: title, score: 0, topicCount: 0, postCount: 0 };
      byDomain.set(slug, a);
    }
    return a;
  }
  for (const t of userTopics) {
    const a = ensure(t.domainSlug, t.domainTitle);
    a.topicCount++;
    a.score += topicScores.get(t.id) ?? 0;
  }
  for (const p of userPosts) {
    const a = ensure(p.domainSlug, p.domainTitle);
    a.postCount++;
    a.score += postScoresMap.get(p.id) ?? 0;
  }

  const list = [...byDomain.values()].sort((a, b) => b.score - a.score);
  const total = list.reduce((s, d) => s + d.score, 0);
  return c.json({ username: user.username, total, domains: list });
});

// --- AI thread summarizer (SSE) -----------------------------------------

forum.post("/topics/:slug/summarize", async (c) => {
  // The summarizer hits the AI provider — gate it behind the same
  // rate limiter as the rest of /ai/* so an unauth'd caller can't
  // burn inference cost in a tight loop. Auth'd users get a per-user
  // bucket; anonymous gets a per-IP+UA bucket.
  const user = await getSessionUser(c);
  const key = rateLimitIdentity(c, user?.id);
  if (!checkRateLimit(`forum-summarize:${key}`, 5, 60_000)) {
    return c.json({ error: "Rate limited. Try again in a minute." }, 429);
  }

  const db = getDb();
  const topic = db
    .select({
      id: forumTopics.id,
      title: forumTopics.title,
      body: forumTopics.body,
      postType: forumTopics.postType,
    })
    .from(forumTopics)
    .where(eq(forumTopics.slug, c.req.param("slug")))
    .get();
  if (!topic) return c.json({ error: "Topic not found" }, 404);

  const posts = db
    .select({
      author: users.username,
      body: forumPosts.body,
      createdAt: forumPosts.createdAt,
    })
    .from(forumPosts)
    .innerJoin(users, eq(forumPosts.authorId, users.id))
    .where(eq(forumPosts.topicId, topic.id))
    .orderBy(forumPosts.createdAt)
    .all();

  const provider = getAIProvider();

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const send = (token: string) => {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ token })}\n\n`)
        );
      };
      try {
        if (provider.summarizeThread) {
          await provider.summarizeThread({
            topicTitle: topic.title,
            topicBody: topic.body,
            postType: topic.postType,
            posts: posts.map((p) => ({ author: p.author, body: p.body })),
            onToken: send,
          });
        } else {
          // Deterministic fallback.
          const lines = [
            `Thread "${topic.title}" — ${posts.length} replies.`,
            "",
            ...posts.slice(0, 6).map(
              (p) => `- ${p.author}: ${p.body.split("\n")[0].slice(0, 160)}`
            ),
          ];
          for (const ch of lines.join("\n")) send(ch);
        }
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      } catch {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ error: "summary failed" })}\n\n`)
        );
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
});

// --- Reactions, bookmarks, poll voting -------------------------------

const reactionSchema = z.object({ kind: z.enum(REACTION_KINDS) });

forum.post(
  "/topics/:slug/reactions",
  requireAuth,
  zValidator("json", reactionSchema),
  async (c) => {
    const slug = c.req.param("slug")!;
    const { kind } = c.req.valid("json");
    const user = c.get("user")!;
    const db = getDb();

    const topic = db
      .select({ id: forumTopics.id })
      .from(forumTopics)
      .where(eq(forumTopics.slug, slug))
      .get();
    if (!topic) return c.json({ error: "Topic not found" }, 404);

    const existing = db
      .select({ id: forumReactions.id })
      .from(forumReactions)
      .where(
        and(
          eq(forumReactions.topicId, topic.id),
          eq(forumReactions.userId, user.id),
          eq(forumReactions.kind, kind),
        ),
      )
      .get();
    if (existing) {
      db.delete(forumReactions).where(eq(forumReactions.id, existing.id)).run();
    } else {
      db.insert(forumReactions).values({
        id: randomUUID(),
        topicId: topic.id,
        userId: user.id,
        kind,
      }).run();
    }

    const counts = await forumReactionRollup(db, [topic.id]);
    const myRows = db
      .select({ kind: forumReactions.kind })
      .from(forumReactions)
      .where(
        and(
          eq(forumReactions.topicId, topic.id),
          eq(forumReactions.userId, user.id),
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
      reactionCounts: counts.get(topic.id) ?? {
        thumbs: 0,
        lightbulb: 0,
        mind_blown: 0,
      },
      myReactions: mine,
    });
  },
);

forum.post("/topics/:slug/bookmark", requireAuth, async (c) => {
  const slug = c.req.param("slug")!;
  const user = c.get("user")!;
  const db = getDb();

  const topic = db
    .select({ id: forumTopics.id })
    .from(forumTopics)
    .where(eq(forumTopics.slug, slug))
    .get();
  if (!topic) return c.json({ error: "Topic not found" }, 404);

  const existing = db
    .select({ id: forumBookmarks.id })
    .from(forumBookmarks)
    .where(
      and(
        eq(forumBookmarks.userId, user.id),
        eq(forumBookmarks.topicId, topic.id),
      ),
    )
    .get();
  if (existing) {
    db.delete(forumBookmarks).where(eq(forumBookmarks.id, existing.id)).run();
    return c.json({ bookmarked: false });
  }
  db.insert(forumBookmarks).values({
    id: randomUUID(),
    userId: user.id,
    topicId: topic.id,
  }).run();
  return c.json({ bookmarked: true });
});

forum.get("/me/bookmarks", requireAuth, async (c) => {
  const user = c.get("user")!;
  const db = getDb();

  const rows = db
    .select({
      id: forumTopics.id,
      slug: forumTopics.slug,
      title: forumTopics.title,
      postType: forumTopics.postType,
      domainSlug: domains.slug,
      domainTitle: domains.title,
      authorUsername: users.username,
      bookmarkedAt: forumBookmarks.createdAt,
      createdAt: forumTopics.createdAt,
      updatedAt: forumTopics.updatedAt,
    })
    .from(forumBookmarks)
    .innerJoin(forumTopics, eq(forumBookmarks.topicId, forumTopics.id))
    .innerJoin(domains, eq(forumTopics.domainId, domains.id))
    .innerJoin(users, eq(forumTopics.authorId, users.id))
    .where(eq(forumBookmarks.userId, user.id))
    .orderBy(desc(forumBookmarks.createdAt))
    .all();

  return c.json({ topics: rows });
});

const pollVoteSchema = z.object({ optionId: z.string() });

forum.post(
  "/polls/:pollId/vote",
  requireAuth,
  zValidator("json", pollVoteSchema),
  async (c) => {
    const pollId = c.req.param("pollId")!;
    const { optionId } = c.req.valid("json");
    const user = c.get("user")!;
    const db = getDb();

    const poll = db
      .select({ id: forumPolls.id })
      .from(forumPolls)
      .where(eq(forumPolls.id, pollId))
      .get();
    if (!poll) return c.json({ error: "Poll not found" }, 404);

    const option = db
      .select({ id: forumPollOptions.id, pollId: forumPollOptions.pollId })
      .from(forumPollOptions)
      .where(eq(forumPollOptions.id, optionId))
      .get();
    if (!option || option.pollId !== poll.id) {
      return c.json({ error: "Option does not belong to this poll" }, 400);
    }

    const existing = db
      .select({ id: forumPollVotes.id })
      .from(forumPollVotes)
      .where(
        and(
          eq(forumPollVotes.pollId, poll.id),
          eq(forumPollVotes.userId, user.id),
        ),
      )
      .get();
    if (existing) {
      db.update(forumPollVotes)
        .set({ optionId, createdAt: new Date().toISOString() })
        .where(eq(forumPollVotes.id, existing.id))
        .run();
    } else {
      db.insert(forumPollVotes).values({
        id: randomUUID(),
        pollId: poll.id,
        optionId,
        userId: user.id,
      }).run();
    }

    const tallies = db
      .select({ optionId: forumPollVotes.optionId, n: count() })
      .from(forumPollVotes)
      .where(eq(forumPollVotes.pollId, poll.id))
      .groupBy(forumPollVotes.optionId)
      .all();
    const tallyMap = new Map(tallies.map((t) => [t.optionId, Number(t.n)]));
    const optionRows = db
      .select()
      .from(forumPollOptions)
      .where(eq(forumPollOptions.pollId, poll.id))
      .orderBy(asc(forumPollOptions.order))
      .all();
    const totalVotes = Array.from(tallyMap.values()).reduce(
      (a, b) => a + b,
      0,
    );

    return c.json({
      poll: {
        id: poll.id,
        myOptionId: optionId,
        totalVotes,
        options: optionRows.map((o) => ({
          id: o.id,
          label: o.label,
          order: o.order,
          count: tallyMap.get(o.id) ?? 0,
        })),
      },
    });
  },
);

export { forum };
