import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { getDb, wikiPages, pageVersions } from "@axiomic/db";
import { eq, like, or, desc } from "drizzle-orm";
import { randomUUID } from "crypto";
import { getSessionUser, requireAuth } from "../middleware/auth";

const wiki = new Hono();

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

  return c.json({
    page,
    content: contentMap[tier] || contentMap.intro,
    allContent: contentMap,
    versions,
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

  const updated = db.select().from(wikiPages).where(eq(wikiPages.id, page.id)).get();
  return c.json({ page: updated });
});

export { wiki };
