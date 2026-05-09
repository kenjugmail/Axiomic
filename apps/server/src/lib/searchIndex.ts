import { desc, eq } from "drizzle-orm";
import { getAIProvider } from "@axiomic/ai";
import {
  equipment,
  externalPapers,
  getDb,
  wikiPages,
  pageVersions,
  forumTopics,
  masteryNodes,
  masteryPaths,
  newsArticles,
  protocols,
  researchPapers,
} from "@axiomic/db";

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

export interface IndexedLesson {
  kind: "lesson";
  id: string;
  // The path slug + node slug let the client build a /paths/<p>/lessons/<n>
  // URL without a follow-up DB lookup.
  pathSlug: string;
  nodeSlug: string;
  // We reuse `slug` to mean nodeSlug so existing keyword-on-slug scoring
  // applies uniformly across all kinds.
  slug: string;
  title: string;
  snippet: string;
  vector: number[];
}

export interface IndexedNewsArticle {
  kind: "news";
  id: string;
  slug: string;
  title: string;
  snippet: string;
  vector: number[];
}

export interface IndexedResearchPaper {
  kind: "research";
  id: string;
  slug: string;
  title: string;
  format: string;
  snippet: string;
  vector: number[];
  // Sprint 70 — ranking signals for the for-you feed. Indexed alongside
  // the vector so the recommend ranker doesn't have to re-query the DB.
  authorId: string;
  citationCount: number;
  // ISO timestamp; createdAt of the paper row (research_papers has no
  // dedicated publishedAt column — published-vs-draft is a status flag).
  publishedAt: string;
  tags: string[];
}

// Sprint 69 — External research paper from arXiv / OpenAlex / PubMed.
// Shares the IndexedResearchPaper-style ranking signals so the S70
// for-you ranker can score it the same way as internally-authored
// papers. `authorId` is null for external papers (no internal user
// behind the byline yet); the ranker treats null as "never
// followed", which is the right default.
export interface IndexedExternalPaper {
  kind: "external_paper";
  id: string;
  slug: string; // synthesized as `${source}-${sourceId}`
  title: string;
  source: string;
  doi: string | null;
  htmlUrl: string | null;
  pdfUrl: string | null;
  snippet: string;
  vector: number[];
  authorId: string | null;
  authorNames: string[];
  citationCount: number;
  publishedAt: string;
  tags: string[];
}

// Sprint 79 — Lab protocols + equipment manuals. Indexed alongside
// research / wiki / forum so a single search bar surfaces "PCR" hits
// from prose, protocols, and equipment manuals together.
export interface IndexedProtocol {
  kind: "protocol";
  id: string;
  slug: string;
  title: string;
  discipline: string;
  category: string | null;
  snippet: string;
  vector: number[];
  authorId: string;
  publishedAt: string;
}

export interface IndexedEquipment {
  kind: "equipment";
  id: string;
  slug: string;
  title: string;
  discipline: string;
  manufacturer: string | null;
  model: string | null;
  snippet: string;
  vector: number[];
  authorId: string;
}

export type IndexedItem =
  | IndexedPage
  | IndexedTopic
  | IndexedLesson
  | IndexedNewsArticle
  | IndexedResearchPaper
  | IndexedExternalPaper
  | IndexedProtocol
  | IndexedEquipment;

let cache: IndexedItem[] | null = null;
let building: Promise<IndexedItem[]> | null = null;

// Sprint 78 — wrap provider.embed so a single transient failure skips
// one item instead of rejecting the whole index build (which would
// leave `cache` null and force every subsequent search request to
// retry from scratch). Returns null on failure; callers skip the
// item.
async function safeEmbed(
  provider: ReturnType<typeof getAIProvider>,
  text: string,
): Promise<number[] | null> {
  try {
    return await provider.embed(text);
  } catch (err) {
    console.warn(
      `[search] embed failed (${(err as Error).message ?? "unknown"}); skipping item`,
    );
    return null;
  }
}

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
    const vector = await safeEmbed(provider, `${page.title} ${snippet}`);
    if (!vector) continue;
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
    const vector = await safeEmbed(provider, `${topic.title} ${snippet}`);
    if (!vector) continue;
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

  // Lessons. We extract slide titles + the first ~2KB of slide bodies
  // and feed the concatenation through the same embedding pipeline.
  // Nodes without authored lessons (lessonData IS NULL) are skipped.
  const nodes = db
    .select({
      id: masteryNodes.id,
      slug: masteryNodes.slug,
      title: masteryNodes.title,
      lessonData: masteryNodes.lessonData,
      pathSlug: masteryPaths.slug,
    })
    .from(masteryNodes)
    .innerJoin(masteryPaths, eq(masteryNodes.pathId, masteryPaths.id))
    .all();
  for (const node of nodes) {
    if (!node.lessonData) continue;
    let parsed: { slides?: Array<{ kind: string; title?: string; body?: string; question?: { question?: string } }> };
    try {
      parsed = JSON.parse(node.lessonData);
    } catch {
      continue;
    }
    const slides = parsed.slides ?? [];
    if (slides.length === 0) continue;
    const titles = slides
      .map((s) => s.title ?? s.question?.question ?? "")
      .filter(Boolean)
      .join(" · ");
    const bodies = slides
      .map((s) => s.body ?? "")
      .join(" ")
      .slice(0, 2000);
    const snippet = (titles + " " + bodies).slice(0, 500);
    const vector = await safeEmbed(
      provider,
      `${node.title} ${titles} ${bodies}`,
    );
    if (!vector) continue;
    items.push({
      kind: "lesson",
      id: node.id,
      pathSlug: node.pathSlug,
      nodeSlug: node.slug,
      slug: node.slug,
      title: node.title,
      snippet,
      vector,
    });
  }

  // Sprint 25 — news articles + research papers. Both surface the
  // same metadata shape; we index title + summary + abstract + body
  // (truncated) so a search for "attention" picks up both prose
  // articles and tiered research papers.
  const articles = db
    .select({
      id: newsArticles.id,
      slug: newsArticles.slug,
      title: newsArticles.title,
      summary: newsArticles.summary,
      abstract: newsArticles.abstract,
      body: newsArticles.body,
    })
    .from(newsArticles)
    .where(eq(newsArticles.status, "published"))
    .all();
  for (const a of articles) {
    const snippet = (a.summary || a.abstract || a.body).slice(0, 500);
    const vector = await safeEmbed(
      provider,
      `${a.title} ${a.summary} ${a.abstract.slice(0, 600)} ${a.body.slice(0, 1500)}`,
    );
    if (!vector) continue;
    items.push({
      kind: "news",
      id: a.id,
      slug: a.slug,
      title: a.title,
      snippet,
      vector,
    });
  }

  const papers = db
    .select({
      id: researchPapers.id,
      slug: researchPapers.slug,
      title: researchPapers.title,
      summary: researchPapers.summary,
      abstract: researchPapers.abstract,
      contentIntro: researchPapers.contentIntro,
      contentUndergrad: researchPapers.contentUndergrad,
      contentGrad: researchPapers.contentGrad,
      canonicalTier: researchPapers.canonicalTier,
      format: researchPapers.format,
      authorId: researchPapers.authorId,
      citationCount: researchPapers.citationCount,
      createdAt: researchPapers.createdAt,
      tags: researchPapers.tags,
    })
    .from(researchPapers)
    .where(eq(researchPapers.status, "published"))
    .all();
  for (const p of papers) {
    const canonicalBody =
      p.canonicalTier === "intro"
        ? p.contentIntro
        : p.canonicalTier === "grad"
          ? p.contentGrad
          : p.contentUndergrad;
    const fallback =
      canonicalBody.trim().length > 0
        ? canonicalBody
        : p.contentUndergrad || p.contentIntro || p.contentGrad;
    const snippet = (p.summary || p.abstract || fallback).slice(0, 500);
    const vector = await safeEmbed(
      provider,
      `${p.title} ${p.summary} ${p.abstract.slice(0, 600)} ${fallback.slice(0, 1500)}`,
    );
    if (!vector) continue;
    let parsedTags: string[] = [];
    try {
      const t = JSON.parse(p.tags ?? "[]");
      if (Array.isArray(t)) parsedTags = t.filter((x): x is string => typeof x === "string");
    } catch {}
    items.push({
      kind: "research",
      id: p.id,
      slug: p.slug,
      title: p.title,
      format: p.format,
      snippet,
      vector,
      authorId: p.authorId,
      citationCount: p.citationCount ?? 0,
      publishedAt: p.createdAt,
      tags: parsedTags,
    });
  }

  // Sprint 79 — lab protocols. Index title + summary + body bodies +
  // hazards so a search for "agarose gel" finds the protocol card,
  // and "BSL-2" surfaces protocols that need that cert.
  const protocolRows = db
    .select({
      id: protocols.id,
      slug: protocols.slug,
      title: protocols.title,
      discipline: protocols.discipline,
      category: protocols.category,
      summary: protocols.summary,
      contentIntro: protocols.contentIntro,
      contentUndergrad: protocols.contentUndergrad,
      contentGrad: protocols.contentGrad,
      hazardsMd: protocols.hazardsMd,
      authorId: protocols.authorId,
      createdAt: protocols.createdAt,
    })
    .from(protocols)
    .where(eq(protocols.status, "published"))
    .all();
  for (const p of protocolRows) {
    const body =
      p.contentUndergrad || p.contentIntro || p.contentGrad || "";
    const snippet = (p.summary || body).slice(0, 500);
    const vector = await safeEmbed(
      provider,
      `${p.title} ${p.discipline} ${p.summary} ${body.slice(0, 1500)} ${p.hazardsMd.slice(0, 500)}`,
    );
    if (!vector) continue;
    items.push({
      kind: "protocol",
      id: p.id,
      slug: p.slug,
      title: p.title,
      discipline: p.discipline,
      category: p.category,
      snippet,
      vector,
      authorId: p.authorId,
      publishedAt: p.createdAt,
    });
  }

  // Sprint 79 — equipment manuals. Index title + manufacturer + model
  // + manual body + hazards. Common search: "where do I find the
  // NanoDrop?" → equipment card with locationHint surfaced.
  const equipmentRows = db
    .select({
      id: equipment.id,
      slug: equipment.slug,
      title: equipment.title,
      discipline: equipment.discipline,
      manufacturer: equipment.manufacturer,
      model: equipment.model,
      manualMd: equipment.manualMd,
      hazardsMd: equipment.hazardsMd,
      authorId: equipment.authorId,
    })
    .from(equipment)
    .where(eq(equipment.status, "active"))
    .all();
  for (const eq_ of equipmentRows) {
    const snippet = eq_.manualMd.slice(0, 500);
    const vector = await safeEmbed(
      provider,
      `${eq_.title} ${eq_.manufacturer ?? ""} ${eq_.model ?? ""} ${eq_.discipline} ${eq_.manualMd.slice(0, 1500)} ${eq_.hazardsMd.slice(0, 500)}`,
    );
    if (!vector) continue;
    items.push({
      kind: "equipment",
      id: eq_.id,
      slug: eq_.slug,
      title: eq_.title,
      discipline: eq_.discipline,
      manufacturer: eq_.manufacturer,
      model: eq_.model,
      snippet,
      vector,
      authorId: eq_.authorId,
    });
  }

  // Sprint 69 — external papers (arXiv / OpenAlex / PubMed). Same
  // ranker signals as internal research papers; authorId is null
  // because the byline isn't a platform user (yet — S72 author
  // claims will bridge that).
  const externals = db.select().from(externalPapers).all();
  for (const p of externals) {
    let authorNames: string[] = [];
    try {
      const arr = JSON.parse(p.authorsJson ?? "[]");
      if (Array.isArray(arr)) {
        authorNames = arr
          .map((a) => (a && typeof a.name === "string" ? a.name : null))
          .filter((n): n is string => n !== null);
      }
    } catch {}
    let topics: string[] = [];
    try {
      const arr = JSON.parse(p.topicsJson ?? "[]");
      if (Array.isArray(arr))
        topics = arr.filter((t): t is string => typeof t === "string");
    } catch {}
    const snippet = (p.abstract || p.title).slice(0, 500);
    const vector = await safeEmbed(
      provider,
      `${p.title} ${p.abstract.slice(0, 1500)} ${authorNames.join(", ")}`,
    );
    if (!vector) continue;
    items.push({
      kind: "external_paper",
      id: p.id,
      slug: `${p.source}-${p.sourceId}`,
      title: p.title,
      source: p.source,
      doi: p.doi ?? null,
      htmlUrl: p.htmlUrl ?? null,
      pdfUrl: p.pdfUrl ?? null,
      snippet,
      vector,
      authorId: null,
      authorNames,
      citationCount: p.citationCount ?? 0,
      publishedAt: p.publishedAt ?? p.fetchedAt,
      tags: topics,
    });
  }

  return items;
}

// Sprint 50 — last build telemetry. Surfaced via /admin/reindex so an
// operator can confirm prewarm finished and read the item count
// without scraping logs.
let lastBuild: {
  durationMs: number;
  itemCount: number;
  builtAt: string;
} | null = null;

export function getLastBuildStats(): {
  durationMs: number;
  itemCount: number;
  builtAt: string;
} | null {
  return lastBuild;
}

export async function getSearchIndex(): Promise<IndexedItem[]> {
  if (cache) return cache;
  if (building) return building;
  building = (async () => {
    const t0 = performance.now();
    const items = await buildIndex();
    const durationMs = Math.round(performance.now() - t0);
    lastBuild = {
      durationMs,
      itemCount: items.length,
      builtAt: new Date().toISOString(),
    };
    console.log(
      `[search] index built in ${durationMs}ms (${items.length} items)`,
    );
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
  // Sprint 78 — fall back to keyword-only ranking when the query
  // embed fails (e.g., Ollama is down). Better to return relevant
  // keyword hits than to 500 the whole search request.
  const queryEmbed = await safeEmbed(provider, trimmed);
  const q = trimmed.toLowerCase();

  const scored: ScoredItem[] = [];
  for (const item of items) {
    const titleLower = item.title.toLowerCase();
    const slugLower = item.slug.toLowerCase();
    const semantic = queryEmbed
      ? cosineSimilarity(queryEmbed, item.vector)
      : 0;
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
