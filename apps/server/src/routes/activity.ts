import { Hono } from "hono";
import { and, desc, eq, inArray } from "drizzle-orm";
import {
  getDb,
  users,
  userProgress,
  masteryNodes,
  masteryPaths,
  forumTopics,
  forumPosts,
  comments,
  wikiPages,
  flashcards,
  userAchievements,
} from "@axiomic/db";
import type { Env } from "../env";

export const activityRouter = new Hono<Env>();

// Public per-user "recent activity" feed. The `activity_events` table
// only carries (kind, day) for streak/heatmap aggregation, so we synth
// the human-readable feed from the source-of-truth tables and merge by
// timestamp.
activityRouter.get("/users/:username", (c) => {
  const username = c.req.param("username");
  const limit = Math.min(parseInt(c.req.query("limit") ?? "5", 10) || 5, 20);
  const db = getDb();

  const user = db
    .select({ id: users.id, username: users.username })
    .from(users)
    .where(eq(users.username, username))
    .get();
  if (!user) return c.json({ error: "User not found" }, 404);

  type Event = {
    kind: string;
    title: string;
    href: string;
    occurredAt: string;
  };
  const events: Event[] = [];

  // Completed mastery nodes
  const completions = db
    .select({
      nodeTitle: masteryNodes.title,
      pathSlug: masteryPaths.slug,
      completedAt: userProgress.completedAt,
    })
    .from(userProgress)
    .innerJoin(masteryNodes, eq(userProgress.nodeId, masteryNodes.id))
    .innerJoin(masteryPaths, eq(masteryNodes.pathId, masteryPaths.id))
    .where(
      and(
        eq(userProgress.userId, user.id),
        eq(userProgress.completed, true),
      ),
    )
    .orderBy(desc(userProgress.completedAt))
    .limit(limit)
    .all();
  for (const r of completions) {
    if (!r.completedAt) continue;
    events.push({
      kind: "node_completed",
      title: `Completed ${r.nodeTitle}`,
      href: `/paths/${r.pathSlug}`,
      occurredAt: r.completedAt,
    });
  }

  // Forum topics started
  const topics = db
    .select({
      title: forumTopics.title,
      slug: forumTopics.slug,
      createdAt: forumTopics.createdAt,
    })
    .from(forumTopics)
    .where(eq(forumTopics.authorId, user.id))
    .orderBy(desc(forumTopics.createdAt))
    .limit(limit)
    .all();
  for (const t of topics) {
    events.push({
      kind: "topic_started",
      title: `Started topic "${t.title}"`,
      href: `/forum/t/${t.slug}`,
      occurredAt: t.createdAt,
    });
  }

  // Forum replies (posts authored, joined to topic for slug + title)
  const posts = db
    .select({
      topicTitle: forumTopics.title,
      topicSlug: forumTopics.slug,
      createdAt: forumPosts.createdAt,
    })
    .from(forumPosts)
    .innerJoin(forumTopics, eq(forumPosts.topicId, forumTopics.id))
    .where(eq(forumPosts.authorId, user.id))
    .orderBy(desc(forumPosts.createdAt))
    .limit(limit)
    .all();
  for (const p of posts) {
    events.push({
      kind: "post_replied",
      title: `Replied in "${p.topicTitle}"`,
      href: `/forum/t/${p.topicSlug}`,
      occurredAt: p.createdAt,
    });
  }

  // Wiki comments
  const wikiComments = db
    .select({
      pageTitle: wikiPages.title,
      pageSlug: wikiPages.slug,
      createdAt: comments.createdAt,
    })
    .from(comments)
    .innerJoin(wikiPages, eq(comments.pageId, wikiPages.id))
    .where(eq(comments.userId, user.id))
    .orderBy(desc(comments.createdAt))
    .limit(limit)
    .all();
  for (const co of wikiComments) {
    events.push({
      kind: "wiki_commented",
      title: `Commented on ${co.pageTitle}`,
      href: `/wiki/${co.pageSlug}`,
      occurredAt: co.createdAt,
    });
  }

  // Saved flashcards
  const cards = db
    .select({
      pageTitle: flashcards.pageTitle,
      pageSlug: flashcards.pageSlug,
      createdAt: flashcards.createdAt,
    })
    .from(flashcards)
    .where(eq(flashcards.userId, user.id))
    .orderBy(desc(flashcards.createdAt))
    .limit(limit)
    .all();
  for (const fc of cards) {
    events.push({
      kind: "flashcard_saved",
      title: `Saved card from ${fc.pageTitle}`,
      href: `/wiki/${fc.pageSlug}`,
      occurredAt: fc.createdAt,
    });
  }

  // Achievements earned
  const earned = db
    .select({
      slug: userAchievements.slug,
      awardedAt: userAchievements.awardedAt,
    })
    .from(userAchievements)
    .where(eq(userAchievements.userId, user.id))
    .orderBy(desc(userAchievements.awardedAt))
    .limit(limit)
    .all();
  for (const e of earned) {
    events.push({
      kind: "achievement_earned",
      title: `Earned achievement "${e.slug}"`,
      href: `/profile/${user.username}`,
      occurredAt: e.awardedAt,
    });
  }

  events.sort((a, b) => (a.occurredAt < b.occurredAt ? 1 : -1));
  return c.json({ events: events.slice(0, limit) });
});
