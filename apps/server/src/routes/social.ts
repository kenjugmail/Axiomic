import { Hono } from "hono";
import {
  getDb,
  userFollows,
  users,
  newsArticles,
  forumTopics,
  domains,
} from "@axiomic/db";
import { and, count, desc, eq, sql } from "drizzle-orm";
import { randomUUID } from "crypto";
import { requireAuth, getSessionUser } from "../middleware/auth";
import type { Env } from "../env";

export const socialRouter = new Hono<Env>();

// Toggle follow on a user. Auth required. Cannot follow self.
socialRouter.post("/users/:username/follow", requireAuth, async (c) => {
  const username = c.req.param("username")!;
  const me = c.get("user")!;
  const db = getDb();

  const target = db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.username, username))
    .get();
  if (!target) return c.json({ error: "User not found" }, 404);
  if (target.id === me.id) {
    return c.json({ error: "Cannot follow yourself" }, 400);
  }

  const existing = db
    .select({ id: userFollows.id })
    .from(userFollows)
    .where(
      and(
        eq(userFollows.followerId, me.id),
        eq(userFollows.followeeId, target.id),
      ),
    )
    .get();
  if (existing) {
    db.delete(userFollows).where(eq(userFollows.id, existing.id)).run();
    return c.json({ following: false });
  }
  db.insert(userFollows).values({
    id: randomUUID(),
    followerId: me.id,
    followeeId: target.id,
  }).run();
  return c.json({ following: true });
});

// Public stats + the requester's own follow state for a user.
socialRouter.get("/users/:username/follow-stats", async (c) => {
  const username = c.req.param("username")!;
  const me = await getSessionUser(c);
  const db = getDb();

  const target = db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.username, username))
    .get();
  if (!target) return c.json({ error: "User not found" }, 404);

  const followerCount = Number(
    db
      .select({ n: count() })
      .from(userFollows)
      .where(eq(userFollows.followeeId, target.id))
      .get()?.n ?? 0,
  );
  const followingCount = Number(
    db
      .select({ n: count() })
      .from(userFollows)
      .where(eq(userFollows.followerId, target.id))
      .get()?.n ?? 0,
  );

  let following = false;
  if (me && me.id !== target.id) {
    const row = db
      .select({ id: userFollows.id })
      .from(userFollows)
      .where(
        and(
          eq(userFollows.followerId, me.id),
          eq(userFollows.followeeId, target.id),
        ),
      )
      .get();
    following = !!row;
  }
  return c.json({ followerCount, followingCount, following });
});

// List of users the target follows / is followed by. Lightweight summary.
socialRouter.get("/users/:username/follows", async (c) => {
  const username = c.req.param("username")!;
  const db = getDb();

  const target = db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.username, username))
    .get();
  if (!target) return c.json({ error: "User not found" }, 404);

  const followers = db
    .select({
      username: users.username,
      displayName: users.displayName,
      createdAt: userFollows.createdAt,
    })
    .from(userFollows)
    .innerJoin(users, eq(userFollows.followerId, users.id))
    .where(eq(userFollows.followeeId, target.id))
    .orderBy(desc(userFollows.createdAt))
    .all();

  const following = db
    .select({
      username: users.username,
      displayName: users.displayName,
      createdAt: userFollows.createdAt,
    })
    .from(userFollows)
    .innerJoin(users, eq(userFollows.followeeId, users.id))
    .where(eq(userFollows.followerId, target.id))
    .orderBy(desc(userFollows.createdAt))
    .all();

  return c.json({ followers, following });
});

// Personalized feed: combined news articles + forum topics from
// followed users, freshest first. Empty for users who follow no one.
socialRouter.get("/me/feed", requireAuth, async (c) => {
  const me = c.get("user")!;
  const db = getDb();

  const followingIds = db
    .select({ id: userFollows.followeeId })
    .from(userFollows)
    .where(eq(userFollows.followerId, me.id))
    .all()
    .map((r) => r.id);

  if (followingIds.length === 0) {
    return c.json({ items: [] });
  }

  const news = db
    .select({
      kind: sql<string>`'news'`.as("kind"),
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
        sql`${newsArticles.authorId} in ${followingIds}`,
        eq(newsArticles.status, "published"),
      ),
    )
    .orderBy(desc(newsArticles.createdAt))
    .limit(40)
    .all();

  const topics = db
    .select({
      kind: sql<string>`'topic'`.as("kind"),
      slug: forumTopics.slug,
      title: forumTopics.title,
      body: forumTopics.body,
      postType: forumTopics.postType,
      domainSlug: domains.slug,
      domainTitle: domains.title,
      authorUsername: users.username,
      createdAt: forumTopics.createdAt,
    })
    .from(forumTopics)
    .innerJoin(users, eq(forumTopics.authorId, users.id))
    .innerJoin(domains, eq(forumTopics.domainId, domains.id))
    .where(sql`${forumTopics.authorId} in ${followingIds}`)
    .orderBy(desc(forumTopics.createdAt))
    .limit(40)
    .all();

  // Merge by createdAt desc.
  const items = [
    ...news.map((n) => ({
      kind: "news" as const,
      slug: n.slug,
      title: n.title,
      summary: n.summary,
      coverEmoji: n.coverEmoji,
      accentColor: n.accentColor,
      authorUsername: n.authorUsername,
      createdAt: n.createdAt,
    })),
    ...topics.map((t) => ({
      kind: "topic" as const,
      slug: t.slug,
      title: t.title,
      body: t.body,
      postType: t.postType,
      domainSlug: t.domainSlug,
      domainTitle: t.domainTitle,
      authorUsername: t.authorUsername,
      createdAt: t.createdAt,
    })),
  ].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

  return c.json({ items: items.slice(0, 40) });
});
