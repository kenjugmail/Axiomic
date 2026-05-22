// Sprint 25 — embedding cache.
//
// Wraps the AI provider's embed() with a SQLite-backed cache keyed by
// (corpusKind, corpusId, contentHash). Cache hits skip the round-trip;
// content changes (different hash) silently re-embed. The wizard's
// suggest-references / suggest-concepts endpoints used to re-embed the
// entire corpus on every call; this cuts that to a single embedding
// per query plus already-warm cache lookups for the candidates.

import { createHash } from "crypto";
import { and, eq } from "drizzle-orm";
import { getAIProvider } from "@axiomic/ai";
import { cachedEmbeddings, getDb } from "@axiomic/db";

// Sprint 71 — `grant` kind added so the for-you funding feed
// caches per-grant vectors the same way papers do. Sprint 69
// would have added `external_paper` here too; for now external
// papers are embedded inline via the search index's lazy
// per-row build because they re-embed on every search-index
// rebuild anyway.
export type CorpusKind =
  | "news_article"
  | "research_paper"
  | "wiki_page"
  | "grant"
  | "lesson";

export function hashContent(text: string): string {
  return createHash("sha256").update(text).digest("hex").slice(0, 32);
}

// Return the cached vector for (kind, id) if its hash matches the
// caller's; otherwise embed-and-store the supplied text and return the
// fresh vector. Cache writes are best-effort; failures fall back to
// returning the just-computed vector without caching.
export async function getOrEmbed(
  kind: CorpusKind,
  id: string,
  text: string,
): Promise<number[]> {
  const db = getDb();
  const provider = getAIProvider();
  const hash = hashContent(text);

  const cached = db
    .select({
      contentHash: cachedEmbeddings.contentHash,
      vectorJson: cachedEmbeddings.vectorJson,
    })
    .from(cachedEmbeddings)
    .where(
      and(
        eq(cachedEmbeddings.corpusKind, kind),
        eq(cachedEmbeddings.corpusId, id),
      ),
    )
    .get();
  if (cached && cached.contentHash === hash) {
    try {
      const v = JSON.parse(cached.vectorJson);
      if (Array.isArray(v) && v.every((n) => typeof n === "number")) {
        return v as number[];
      }
    } catch {
      // fall through and re-embed
    }
  }

  const vector = await provider.embed(text);
  try {
    if (cached) {
      db.update(cachedEmbeddings)
        .set({
          contentHash: hash,
          vectorJson: JSON.stringify(vector),
        })
        .where(
          and(
            eq(cachedEmbeddings.corpusKind, kind),
            eq(cachedEmbeddings.corpusId, id),
          ),
        )
        .run();
    } else {
      db.insert(cachedEmbeddings)
        .values({
          corpusKind: kind,
          corpusId: id,
          contentHash: hash,
          vectorJson: JSON.stringify(vector),
        })
        .run();
    }
  } catch {
    // Best-effort cache write — race conditions on first-insert are fine.
  }
  return vector;
}

// Bulk variant: takes a list of (kind, id, text) and returns vectors in
// the same order, fetching from cache where possible and embedding the
// rest in sequence. Caller decides ranking + thresholds.
export async function bulkGetOrEmbed(
  items: Array<{ kind: CorpusKind; id: string; text: string }>,
): Promise<number[][]> {
  const out: number[][] = new Array(items.length);
  for (let i = 0; i < items.length; i++) {
    out[i] = await getOrEmbed(items[i].kind, items[i].id, items[i].text);
  }
  return out;
}
