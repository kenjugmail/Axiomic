import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { getDb, wikiPages, pageVersions, forumTopics, domains, users, forumPosts, forumVotes } from "@axiomic/db";
import { eq, like, or, desc, sql, count } from "drizzle-orm";
import { randomUUID } from "crypto";
import { requireAuth } from "../middleware/auth";
import { invalidateSearchIndex } from "../lib/searchIndex";
import type { Env } from "../env";

const wiki = new Hono<Env>();

// List all wiki pages
wiki.get("/", async (c) => {
  const db = getDb();
  const category = c.req.query("category");
  const search = c.req.query("search");

  let query = db.select().from(wikiPages);

  if (category) {
    query = query.where(eq(wikiPages.category, category)) as any;
  }

  if (search) {
    query = query.where(
      or(
        like(wikiPages.title, `%${search}%`),
        like(wikiPages.slug, `%${search}%`)
      )
    ) as any;
  }

  const pages = query.all();
  return c.json({ pages });
});

// Search pages
wiki.get("/search", async (c) => {
  const q = c.req.query("q") || "";
  const db = getDb();

  if (!q.trim()) {
    return c.json({ results: [] });
  }

  const results = db
    .select()
    .from(wikiPages)
    .where(
      or(
        like(wikiPages.title, `%${q}%`),
        like(wikiPages.slug, `%${q}%`),
        like(wikiPages.category, `%${q}%`)
      )
    )
    .all();

  return c.json({ results });
});

// Get page categories
wiki.get("/categories", async (c) => {
  const db = getDb();
  const pages = db.select({ category: wikiPages.category }).from(wikiPages).all();
  const categories = [...new Set(pages.map((p) => p.category))].sort();
  return c.json({ categories });
});

// Get single page
wiki.get("/:slug", async (c) => {
  const slug = c.req.param("slug");
  const tier = c.req.query("tier") || "intro";
  const db = getDb();

  const page = db.select().from(wikiPages).where(eq(wikiPages.slug, slug)).get();
  if (!page) {
    return c.json({ error: "Page not found" }, 404);
  }

  // Get current version content
  const version = db
    .select()
    .from(pageVersions)
    .where(eq(pageVersions.pageId, page.id))
    .orderBy(desc(pageVersions.version))
    .get();

  if (!version) {
    return c.json({ error: "No content version found" }, 404);
  }

  const contentMap: Record<string, string> = {
    intro: version.contentIntro,
    undergrad: version.contentUndergrad,
    grad: version.contentGrad,
  };

  // Get version history
  const versions = db
    .select({
      id: pageVersions.id,
      version: pageVersions.version,
      editedBy: pageVersions.editedBy,
      editMessage: pageVersions.editMessage,
      createdAt: pageVersions.createdAt,
    })
    .from(pageVersions)
    .where(eq(pageVersions.pageId, page.id))
    .orderBy(desc(pageVersions.version))
    .all();

  // Discussions anchored to this page. Light shape — title, postType,
  // score from forumVotes (sum of values where subject_type='topic'),
  // post count, last activity. Mirrors the listing pattern but scoped.
  const linkedRows = db
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
      createdAt: forumTopics.createdAt,
      updatedAt: forumTopics.updatedAt,
    })
    .from(forumTopics)
    .innerJoin(domains, eq(forumTopics.domainId, domains.id))
    .innerJoin(users, eq(forumTopics.authorId, users.id))
    .where(eq(forumTopics.wikiPageId, page.id))
    .orderBy(desc(forumTopics.updatedAt))
    .all();

  const linkedTopics = linkedRows.map((row) => {
    const scoreRow = db
      .select({ s: sql<number>`COALESCE(SUM(${forumVotes.value}), 0)` })
      .from(forumVotes)
      .where(
        sql`${forumVotes.subjectType} = 'topic' AND ${forumVotes.subjectId} = ${row.id}`,
      )
      .get();
    const postCountRow = db
      .select({ n: count() })
      .from(forumPosts)
      .where(eq(forumPosts.topicId, row.id))
      .get();
    return {
      id: row.id,
      slug: row.slug,
      title: row.title,
      postType: row.postType,
      domainId: row.domainId,
      domainSlug: row.domainSlug,
      domainTitle: row.domainTitle,
      authorId: row.authorId,
      authorUsername: row.authorUsername,
      wikiPageId: page.id,
      wikiPageSlug: page.slug,
      wikiPageTitle: page.title,
      score: Number(scoreRow?.s ?? 0),
      userVote: 0,
      postCount: Number(postCountRow?.n ?? 0),
      lastActivityAt: row.updatedAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  });

  return c.json({
    page,
    content: contentMap[tier] || contentMap.intro,
    allContent: contentMap,
    versions,
    linkedTopics,
  });
});

// Update/create page version
const updateSchema = z.object({
  contentIntro: z.string(),
  contentUndergrad: z.string(),
  contentGrad: z.string(),
  editMessage: z.string().optional(),
});

wiki.put("/:slug", requireAuth, zValidator("json", updateSchema), async (c) => {
  const slug = c.req.param("slug");
  const { contentIntro, contentUndergrad, contentGrad, editMessage } = c.req.valid("json");
  const user = c.get("user")!;
  const db = getDb();

  const page = db.select().from(wikiPages).where(eq(wikiPages.slug, slug)).get();
  if (!page) {
    return c.json({ error: "Page not found" }, 404);
  }

  const newVersion = page.currentVersion + 1;
  const versionId = randomUUID();

  db.insert(pageVersions).values({
    id: versionId,
    pageId: page.id,
    version: newVersion,
    contentIntro,
    contentUndergrad,
    contentGrad,
    editedBy: user.id,
    editMessage: editMessage || `Edit by ${user.username}`,
  }).run();

  db.update(wikiPages)
    .set({ currentVersion: newVersion, updatedAt: new Date().toISOString() })
    .where(eq(wikiPages.id, page.id))
    .run();

  // Page content changed; drop the search index so the next query rebuilds.
  invalidateSearchIndex();

  const updated = db.select().from(wikiPages).where(eq(wikiPages.id, page.id)).get();
  return c.json({ page: updated });
});

export { wiki };
