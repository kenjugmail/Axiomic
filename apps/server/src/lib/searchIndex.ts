import { desc, eq } from "drizzle-orm";
import { getAIProvider } from "@axiomic/ai";
import { getDb, wikiPages, pageVersions, forumTopics } from "@axiomic/db";

// Hybrid keyword + semantic search index.
//
// Holds an in-memory cache of {wiki pages, forum topics} with their
// embeddings, computed lazily on first read and refreshed when content
// changes. At ~50 pages + ~15 topics this fits comfortably in memory; if
// we ever scale up, this is the file to swap out for a persistent
// embeddings table.

export interface IndexedPage {
  kind: "page";
  id: string;
  slug: string;
  title: string;
  category: string;
  // First ~500 chars of intro tier — enough vocabulary for TF-IDF clustering.
  snippet: string;
  vector: number[];
}

export interface IndexedTopic {
  kind: "topic";
  id: string;
  slug: string;
  title: string;
  postType: string;
  domainSlug: string;
  snippet: string;
  vector: number[];
}

export type IndexedItem = IndexedPage | IndexedTopic;

let cache: IndexedItem[] | null = null;
let building: Promise<IndexedItem[]> | null = null;

async function buildIndex(): Promise<IndexedItem[]> {
  const db = getDb();
  const provider = getAIProvider();
  const items: IndexedItem[] = [];

  const pages = db.select().from(wikiPages).all();
  for (const page of pages) {
    const version = db
      .select()
      .from(pageVersions)
      .where(eq(pageVersions.pageId, page.id))
      .orderBy(desc(pageVersions.version))
      .get();
    if (!version) continue;
    const snippet = version.contentIntro.slice(0, 500);
    const vector = await provider.embed(`${page.title} ${snippet}`);
    items.push({
      kind: "page",
      id: page.id,
      slug: page.slug,
      title: page.title,
      category: page.category,
      snippet,
      vector,
    });
  }

  const topics = db.select().from(forumTopics).all();
  for (const topic of topics) {
    const snippet = topic.body.slice(0, 500);
    const vector = await provider.embed(`${topic.title} ${snippet}`);
    items.push({
      kind: "topic",
      id: topic.id,
      slug: topic.slug,
      title: topic.title,
      postType: topic.postType,
      domainSlug: "",  // resolved at query time if needed
      snippet,
      vector,
    });
  }

  return items;
}

export async function getSearchIndex(): Promise<IndexedItem[]> {
  if (cache) return cache;
  if (building) return building;
  building = (async () => {
    const items = await buildIndex();
    cache = items;
    building = null;
    return items;
  })();
  return building;
}

// Drop the cache so the next read rebuilds. Cheap; called from write paths
// that change indexed content (wiki edit, new topic, new post).
export function invalidateSearchIndex(): void {
  cache = null;
  building = null;
}

// Pre-warm at server startup so the first user search is fast (the build
// scans every page + version + topic, which is ~150ms at current scale).
// Errors are swallowed: if prewarm fails, the next search will lazily
// retry.
export function prewarmSearchIndex(): void {
  getSearchIndex().catch((err) => {
    console.error("search index prewarm failed", err);
  });
}

export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}

export type MatchedBy = "keyword" | "semantic" | "both";

export interface ScoredItem {
  item: IndexedItem;
  score: number;
  matchedBy: MatchedBy;
}

// Score every cached item against a query. Combines:
//   - cosine similarity of query embedding vs item embedding (0..1)
//   - keyword bonus: +0.4 if query appears as substring of title/slug
//   - title-exact bonus: +0.4 if title (lowercased) equals query (lowercased)
// Caller filters / truncates / sorts.
export async function scoreQuery(
  query: string,
  limit: number,
): Promise<ScoredItem[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const items = await getSearchIndex();
  const provider = getAIProvider();
  const queryEmbed = await provider.embed(trimmed);
  const q = trimmed.toLowerCase();

  const scored: ScoredItem[] = [];
  for (const item of items) {
    const titleLower = item.title.toLowerCase();
    const slugLower = item.slug.toLowerCase();
    const semantic = cosineSimilarity(queryEmbed, item.vector);
    const keywordHit = titleLower.includes(q) || slugLower.includes(q);
    const exactTitle = titleLower === q;

    let score = semantic;
    let matchedBy: MatchedBy = "semantic";
    if (keywordHit) {
      score += 0.4;
      matchedBy = "keyword";
    }
    if (exactTitle) {
      score += 0.4;
    }
    if (keywordHit && semantic > 0.15) matchedBy = "both";

    // Drop noise: pure-semantic items below a threshold don't help.
    if (!keywordHit && semantic < 0.18) continue;

    scored.push({ item, score, matchedBy });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}
