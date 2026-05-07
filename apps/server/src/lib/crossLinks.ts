// Cross-link query helpers for the flywheel-visibility surface.
// Each helper resolves "what other content references X?" for a given
// surface, so the wiki / mastery / news pages can render related-rails
// without round-tripping to the client. The lookups deliberately use
// SQL's json_each + LIKE rather than full-text search to keep the
// helpers dependency-free; results are capped at 5 per call.

import { and, desc, eq, inArray, like, ne, or, sql } from "drizzle-orm";
import {
  getDb,
  forumTopics,
  masteryNodes,
  masteryPaths,
  newsArticles,
  users,
  type Db,
} from "@axiomic/db";

const DEFAULT_CAP = 5;

export interface LinkedNode {
  nodeId: string;
  nodeSlug: string;
  pathSlug: string;
  pathTitle: string;
  title: string;
  level: string;
  hasLesson: boolean;
}

export interface LinkedArticle {
  id: string;
  slug: string;
  title: string;
  summary: string;
  authorUsername: string;
  coverEmoji: string;
  accentColor: string;
}

export interface LinkedWikiPage {
  slug: string;
  title: string;
}

export interface LinkedTopicLite {
  id: string;
  slug: string;
  title: string;
  postType: string;
  authorUsername: string;
  postCount: number;
  lastActivityAt: string;
}

// Difficulty ranking used to surface the easier lesson first inside
// the Concept Card "Practice this" CTA. A novice landing on the
// `attention` page should see the apprentice/practitioner-level
// `attention-intro` lesson, not the specialist `transformer-deep-dive`.
const LEVEL_RANK: Record<string, number> = {
  apprentice: 1,
  practitioner: 2,
  specialist: 3,
  expert: 4,
  researcher: 5,
};

// Mastery nodes whose `pageIds` JSON array contains the given wiki
// slug. We use json_each to expand each node's pageIds and match the
// slug exactly — survives whitespace / order differences. Results are
// ordered easiest-first so the Concept Card's "Practice this" CTA
// surfaces the most beginner-friendly lesson teaching this concept.
export function nodesForWikiSlug(
  slug: string,
  cap = DEFAULT_CAP,
  db: Db = getDb(),
): LinkedNode[] {
  const rows = db
    .select({
      nodeId: masteryNodes.id,
      nodeSlug: masteryNodes.slug,
      pathSlug: masteryPaths.slug,
      pathTitle: masteryPaths.title,
      title: masteryNodes.title,
      level: masteryNodes.level,
      lessonData: masteryNodes.lessonData,
      order: masteryNodes.order,
    })
    .from(masteryNodes)
    .innerJoin(masteryPaths, eq(masteryNodes.pathId, masteryPaths.id))
    .where(
      sql`EXISTS (SELECT 1 FROM json_each(${masteryNodes.pageIds}) WHERE value = ${slug})`,
    )
    .all();

  // Rank in JS — SQLite can't ORDER BY a CASE-mapped level cheaply
  // without a separate column, and the result set is tiny (a single
  // wiki slug rarely backs more than ~5 nodes).
  rows.sort((a, b) => {
    const la = LEVEL_RANK[a.level] ?? 99;
    const lb = LEVEL_RANK[b.level] ?? 99;
    if (la !== lb) return la - lb;
    if (a.pathSlug !== b.pathSlug) return a.pathSlug < b.pathSlug ? -1 : 1;
    return (a.order ?? 0) - (b.order ?? 0);
  });

  return rows.slice(0, cap).map((r) => ({
    nodeId: r.nodeId,
    nodeSlug: r.nodeSlug,
    pathSlug: r.pathSlug,
    pathTitle: r.pathTitle,
    title: r.title,
    level: r.level,
    hasLesson: !!r.lessonData,
  }));
}

// News articles whose body mentions the given wiki slug as a
// `[[slug]]` concept link or `/wiki/{slug}` URL. Cheap LIKE filter;
// good enough for the rails. Falls back to empty when slug is short
// enough to false-match (we still show the result — author can curate
// later if noise emerges).
export function articlesForWikiSlug(
  slug: string,
  cap = DEFAULT_CAP,
  db: Db = getDb(),
): LinkedArticle[] {
  const conceptToken = `%[[${slug}]%`;
  const urlToken = `%/wiki/${slug}%`;
  const rows = db
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
        eq(newsArticles.status, "published"),
        or(
          like(newsArticles.body, conceptToken),
          like(newsArticles.body, urlToken),
        ),
      ),
    )
    .orderBy(desc(newsArticles.createdAt))
    .limit(cap)
    .all();
  return rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    title: r.title,
    summary: r.summary,
    authorUsername: r.authorUsername,
    coverEmoji: r.coverEmoji,
    accentColor: r.accentColor,
  }));
}

// Forum topics tagged to ANY of the wiki pages backing the given
// mastery node. We expand the node's pageIds into wiki page IDs first
// (slug → id lookup) then match topics against those IDs.
export function forumTopicsForNode(
  nodeId: string,
  cap = DEFAULT_CAP,
  db: Db = getDb(),
): LinkedTopicLite[] {
  const node = db
    .select({ pageIds: masteryNodes.pageIds })
    .from(masteryNodes)
    .where(eq(masteryNodes.id, nodeId))
    .get();
  if (!node) return [];

  let slugs: string[];
  try {
    const parsed = JSON.parse(node.pageIds);
    if (!Array.isArray(parsed)) return [];
    slugs = parsed.filter((s) => typeof s === "string");
  } catch {
    return [];
  }
  if (slugs.length === 0) return [];

  // Resolve slugs → wiki page IDs.
  const pageIdRows = db
    .select({ id: sql<string>`id`, slug: sql<string>`slug` })
    .from(sql`wiki_pages`)
    .where(inArray(sql`slug`, slugs))
    .all();
  const pageIds = pageIdRows.map((r) => r.id);
  if (pageIds.length === 0) return [];

  const rows = db
    .select({
      id: forumTopics.id,
      slug: forumTopics.slug,
      title: forumTopics.title,
      postType: forumTopics.postType,
      authorUsername: users.username,
      updatedAt: forumTopics.updatedAt,
    })
    .from(forumTopics)
    .innerJoin(users, eq(forumTopics.authorId, users.id))
    .where(inArray(forumTopics.wikiPageId, pageIds))
    .orderBy(desc(forumTopics.updatedAt))
    .limit(cap)
    .all();

  return rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    title: r.title,
    postType: r.postType,
    authorUsername: r.authorUsername,
    postCount: 0, // cheap omission for the rail; full counts live in /forum
    lastActivityAt: r.updatedAt,
  }));
}

// Wiki pages mentioned in an article body (top N by mention count).
// Mirrors articlesForWikiSlug but in the reverse direction.
export function wikiPagesForArticle(
  articleId: string,
  cap = DEFAULT_CAP,
  db: Db = getDb(),
): LinkedWikiPage[] {
  const article = db
    .select({ body: newsArticles.body })
    .from(newsArticles)
    .where(eq(newsArticles.id, articleId))
    .get();
  if (!article) return [];

  // Pull wiki slugs that appear as `[[slug]]` or `/wiki/slug` in the
  // body. Cheaper than scanning all wiki pages: regex over the body
  // here, then only fetch the matched slugs.
  const conceptHits = new Map<string, number>();
  const conceptRe = /\[\[([a-z0-9][a-z0-9-]+)(?:\|[^\]]+)?\]\]/g;
  const urlRe = /\/wiki\/([a-z0-9][a-z0-9-]+)\b/g;
  let m: RegExpExecArray | null;
  while ((m = conceptRe.exec(article.body)) !== null) {
    conceptHits.set(m[1], (conceptHits.get(m[1]) ?? 0) + 1);
  }
  while ((m = urlRe.exec(article.body)) !== null) {
    conceptHits.set(m[1], (conceptHits.get(m[1]) ?? 0) + 1);
  }
  if (conceptHits.size === 0) return [];

  const sorted = [...conceptHits.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, cap);
  const slugs = sorted.map(([s]) => s);

  const rows = db
    .select({
      slug: sql<string>`slug`,
      title: sql<string>`title`,
    })
    .from(sql`wiki_pages`)
    .where(inArray(sql`slug`, slugs))
    .all();
  // Preserve mention-count order.
  const byslug = new Map(rows.map((r) => [r.slug, r.title]));
  return slugs
    .filter((s) => byslug.has(s))
    .map((s) => ({ slug: s, title: byslug.get(s)! }));
}

// Wiki slugs that are prerequisites of the given wiki slug, derived
// from any mastery node that includes the target slug in its pageIds.
// For each such node, we walk its prerequisiteNodeIds, look up the
// prereq nodes, and union their pageIds. Deduped, capped, ordered by
// the union's first appearance.
export function prereqWikiSlugsForSlug(
  slug: string,
  cap = 8,
  db: Db = getDb(),
): string[] {
  const hostNodes = db
    .select({
      id: masteryNodes.id,
      prerequisiteNodeIds: masteryNodes.prerequisiteNodeIds,
    })
    .from(masteryNodes)
    .where(
      sql`EXISTS (SELECT 1 FROM json_each(${masteryNodes.pageIds}) WHERE value = ${slug})`,
    )
    .all();
  if (hostNodes.length === 0) return [];

  const prereqNodeIds = new Set<string>();
  for (const node of hostNodes) {
    try {
      const ids = JSON.parse(node.prerequisiteNodeIds);
      if (Array.isArray(ids)) {
        for (const id of ids) {
          if (typeof id === "string") prereqNodeIds.add(id);
        }
      }
    } catch {
      // ignore malformed
    }
  }
  if (prereqNodeIds.size === 0) return [];

  const prereqNodes = db
    .select({ pageIds: masteryNodes.pageIds })
    .from(masteryNodes)
    .where(inArray(masteryNodes.id, [...prereqNodeIds]))
    .all();

  const out: string[] = [];
  const seen = new Set<string>([slug]);
  for (const node of prereqNodes) {
    try {
      const slugs = JSON.parse(node.pageIds);
      if (!Array.isArray(slugs)) continue;
      for (const s of slugs) {
        if (typeof s !== "string" || seen.has(s)) continue;
        seen.add(s);
        out.push(s);
        if (out.length >= cap) return out;
      }
    } catch {
      // ignore
    }
  }
  return out;
}

// Wiki slugs referenced from a free-text body via either the
// `[[concept-slug]]` syntax or `/wiki/concept-slug` URLs. Returns the
// existing wiki page slugs in mention-count order, capped. Reuses the
// same regex pair as `wikiPagesForArticle` but works against any body
// string — useful for research papers, capstone briefs, etc.
export function extractReferencedWikiSlugs(
  body: string,
  cap = 8,
  db: Db = getDb(),
): string[] {
  if (!body) return [];
  const counts = new Map<string, number>();
  const conceptRe = /\[\[([a-z0-9][a-z0-9-]+)(?:\|[^\]]+)?\]\]/g;
  const urlRe = /\/wiki\/([a-z0-9][a-z0-9-]+)\b/g;
  let m: RegExpExecArray | null;
  while ((m = conceptRe.exec(body)) !== null) {
    counts.set(m[1], (counts.get(m[1]) ?? 0) + 1);
  }
  while ((m = urlRe.exec(body)) !== null) {
    counts.set(m[1], (counts.get(m[1]) ?? 0) + 1);
  }
  if (counts.size === 0) return [];

  const sorted = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([s]) => s);

  const candidate = sorted.slice(0, cap * 2);
  const rows = db
    .select({ slug: sql<string>`slug` })
    .from(sql`wiki_pages`)
    .where(inArray(sql`slug`, candidate))
    .all();
  const valid = new Set(rows.map((r) => r.slug));
  return sorted.filter((s) => valid.has(s)).slice(0, cap);
}

// Suppress unused warning for `ne` (kept for future use).
void ne;