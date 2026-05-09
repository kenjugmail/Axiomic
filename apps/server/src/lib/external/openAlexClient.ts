// Sprint 69 — OpenAlex ingestor.
//
// REST API; cursor pagination. We use the `mailto=` polite-pool query
// param so OpenAlex routes us to a higher rate-limit tier. Full
// schema docs: https://docs.openalex.org/api-entities/works.
//
// Map of OpenAlex fields → NormalizedExternalPaper:
//   id                → htmlUrl + sourceId (last path segment)
//   doi               → doi
//   title             → title
//   abstract_inverted_index → abstract (reconstructed from inverted index)
//   authorships       → authors (with optional ORCID + OpenAlex IDs)
//   host_venue.display_name → venue
//   publication_date  → publishedAt
//   open_access.oa_url → pdfUrl
//   concepts          → topics (display_name)
//   cited_by_count    → citationCount

import { rateLimitedFetch, type FetchLike } from "./httpClient";
import type {
  NormalizedExternalPaper,
  ExternalAuthor,
} from "./normalize";

const OPENALEX_BASE = "https://api.openalex.org";
// OpenAlex's polite-pool tier is 10 req/sec for authenticated users
// with a registered mailto. Stay well under to be a good citizen.
const OPENALEX_MIN_INTERVAL_MS = 200;
const OPENALEX_MAILTO = "research@axiomic.app";

interface OpenAlexAuthor {
  id?: string;
  display_name: string;
  orcid?: string | null;
}

interface OpenAlexAuthorship {
  author: OpenAlexAuthor;
}

interface OpenAlexConcept {
  display_name: string;
  level?: number;
}

interface OpenAlexWork {
  id: string;
  doi?: string | null;
  title: string;
  abstract_inverted_index?: Record<string, number[]>;
  authorships?: OpenAlexAuthorship[];
  host_venue?: { display_name?: string | null };
  primary_location?: { source?: { display_name?: string | null } };
  publication_date?: string;
  open_access?: { oa_url?: string | null };
  concepts?: OpenAlexConcept[];
  cited_by_count?: number;
}

interface OpenAlexResponse {
  results?: OpenAlexWork[];
  meta?: { next_cursor?: string | null };
}

// OpenAlex ships abstracts as an inverted index (word → list of
// positions). Reconstruct in-order. Cap at 4000 chars to keep the
// downstream embedding tractable.
function reconstructAbstract(
  inv: Record<string, number[]> | undefined,
): string {
  if (!inv) return "";
  const positions: Array<[number, string]> = [];
  for (const [word, places] of Object.entries(inv)) {
    for (const p of places) positions.push([p, word]);
  }
  positions.sort((a, b) => a[0] - b[0]);
  const out = positions.map(([, w]) => w).join(" ");
  return out.slice(0, 4000);
}

function extractSourceId(idUrl: string): string {
  // OpenAlex IDs look like https://openalex.org/W2741809807 — last
  // path segment is the canonical sourceId.
  const m = idUrl.match(/\/(W\d+)$/);
  return m ? m[1] : idUrl;
}

function normalizeWork(w: OpenAlexWork): NormalizedExternalPaper | null {
  if (!w.id || !w.title) return null;
  const sourceId = extractSourceId(w.id);
  const authors: ExternalAuthor[] =
    w.authorships?.map((a) => ({
      name: a.author.display_name,
      orcid: a.author.orcid?.replace(/^https?:\/\/orcid\.org\//, "") ?? undefined,
      openAlexAuthorId: a.author.id?.match(/\/(A\d+)$/)?.[1],
    })) ?? [];

  const venue =
    w.host_venue?.display_name ?? w.primary_location?.source?.display_name ?? null;

  return {
    source: "openalex" as const,
    sourceId,
    doi: w.doi?.replace(/^https?:\/\/doi\.org\//, "") ?? null,
    title: w.title,
    abstract: reconstructAbstract(w.abstract_inverted_index),
    authors,
    venue,
    publishedAt: w.publication_date ?? null,
    pdfUrl: w.open_access?.oa_url ?? null,
    htmlUrl: w.id,
    topics:
      w.concepts
        ?.filter((c) => (c.level ?? 0) <= 2)
        .map((c) => c.display_name) ?? [],
    citationCount: w.cited_by_count ?? 0,
    rawJson: { id: w.id },
  };
}

export interface OpenAlexQuery {
  // Filter string per https://docs.openalex.org/api-entities/works/filter-works
  // e.g. `from_publication_date:2025-01-01,concepts.id:C154945302`
  filter?: string;
  search?: string;
  perPage?: number;
  // Set to "*" for the first page; OpenAlex returns the next cursor
  // in `meta.next_cursor`. Pass null to disable cursor pagination.
  cursor?: string | null;
}

export interface OpenAlexClientOptions {
  fetchImpl?: FetchLike;
}

export async function fetchOpenAlexWorks(
  query: OpenAlexQuery,
  opts: OpenAlexClientOptions = {},
): Promise<{ papers: NormalizedExternalPaper[]; nextCursor: string | null }> {
  const params = new URLSearchParams({
    mailto: OPENALEX_MAILTO,
    "per-page": String(query.perPage ?? 25),
  });
  if (query.filter) params.set("filter", query.filter);
  if (query.search) params.set("search", query.search);
  if (query.cursor) params.set("cursor", query.cursor);

  const res = await rateLimitedFetch(
    `${OPENALEX_BASE}/works?${params.toString()}`,
    {
      minIntervalMs: OPENALEX_MIN_INTERVAL_MS,
      fetchImpl: opts.fetchImpl,
    },
  );
  if (!res.ok) throw new Error(`OpenAlex API returned ${res.status}`);
  const data = (await res.json()) as OpenAlexResponse;
  const works = data.results ?? [];
  const papers: NormalizedExternalPaper[] = [];
  for (const w of works) {
    const norm = normalizeWork(w);
    if (norm) papers.push(norm);
  }
  return {
    papers,
    nextCursor: data.meta?.next_cursor ?? null,
  };
}
