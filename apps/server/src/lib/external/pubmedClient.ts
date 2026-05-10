// Sprint 69 — PubMed ingestor (NCBI eUtils).
//
// Two-step flow per PubMed's API:
//
//   1. esearch.fcgi → IDs matching a query
//   2. esummary.fcgi → metadata for those IDs
//
// We pull JSON because the XML parser would be heavier than the
// surface area we need. Polite rate limit per NCBI: 3 req/sec without
// an api_key; we stay at 350ms intervals to be safe.
//
// PubMed esummary doesn't include abstracts. For full abstracts we'd
// need a third call to efetch.fcgi (XML only) — deferred for now;
// callers that need abstracts can hit OpenAlex for the same DOI.
// PubMed remains useful for medical/biology papers that don't appear
// elsewhere in our corpus.

import { rateLimitedFetch, type FetchLike } from "./httpClient";
import type {
  NormalizedExternalPaper,
  ExternalAuthor,
} from "./normalize";

const ENTREZ_BASE = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";
const PUBMED_MIN_INTERVAL_MS = 350;
const PUBMED_TOOL_NAME = "axiomic";
const PUBMED_EMAIL = "research@axiomic.app";

interface PubmedAuthorRaw {
  name?: string;
  authtype?: string;
}

interface PubmedSummaryEntry {
  uid: string;
  pubdate?: string;
  title?: string;
  fulljournalname?: string;
  source?: string;
  authors?: PubmedAuthorRaw[];
  articleids?: Array<{ idtype: string; value: string }>;
  pubtype?: string[];
}

interface PubmedSearchResponse {
  esearchresult?: {
    idlist?: string[];
    count?: string;
  };
}

interface PubmedSummaryResponse {
  result?: Record<string, PubmedSummaryEntry | string[]> & {
    uids?: string[];
  };
}

function pickDoiFromArticleIds(
  ids: PubmedSummaryEntry["articleids"],
): string | null {
  if (!ids) return null;
  for (const x of ids) if (x.idtype === "doi") return x.value;
  return null;
}

function summaryToNormalized(
  e: PubmedSummaryEntry,
): NormalizedExternalPaper | null {
  if (!e.title) return null;
  const authors: ExternalAuthor[] =
    e.authors
      ?.filter((a) => a.name && a.authtype !== "CollectiveName")
      .map((a) => ({ name: a.name! })) ?? [];

  return {
    source: "pubmed" as const,
    sourceId: e.uid,
    doi: pickDoiFromArticleIds(e.articleids),
    title: e.title,
    abstract: "",
    authors,
    venue: e.fulljournalname ?? e.source ?? null,
    publishedAt: e.pubdate ?? null,
    pdfUrl: null,
    htmlUrl: `https://pubmed.ncbi.nlm.nih.gov/${e.uid}/`,
    topics: e.pubtype ?? [],
    citationCount: 0,
    rawJson: { uid: e.uid, source: "pubmed" },
  };
}

export interface PubmedQuery {
  // PubMed search query (PubMed's own syntax, e.g. "covid AND
  // 2025[pdat]").
  term: string;
  retmax?: number;
}

export interface PubmedClientOptions {
  fetchImpl?: FetchLike;
}

export async function fetchPubmedPapers(
  query: PubmedQuery,
  opts: PubmedClientOptions = {},
): Promise<NormalizedExternalPaper[]> {
  const searchParams = new URLSearchParams({
    db: "pubmed",
    term: query.term,
    retmode: "json",
    retmax: String(query.retmax ?? 50),
    tool: PUBMED_TOOL_NAME,
    email: PUBMED_EMAIL,
  });

  const searchRes = await rateLimitedFetch(
    `${ENTREZ_BASE}/esearch.fcgi?${searchParams.toString()}`,
    { minIntervalMs: PUBMED_MIN_INTERVAL_MS, fetchImpl: opts.fetchImpl },
  );
  if (!searchRes.ok) throw new Error(`PubMed esearch returned ${searchRes.status}`);
  const searchData = (await searchRes.json()) as PubmedSearchResponse;
  const ids = searchData.esearchresult?.idlist ?? [];
  if (ids.length === 0) return [];

  const summaryParams = new URLSearchParams({
    db: "pubmed",
    id: ids.join(","),
    retmode: "json",
    tool: PUBMED_TOOL_NAME,
    email: PUBMED_EMAIL,
  });
  const summaryRes = await rateLimitedFetch(
    `${ENTREZ_BASE}/esummary.fcgi?${summaryParams.toString()}`,
    { minIntervalMs: PUBMED_MIN_INTERVAL_MS, fetchImpl: opts.fetchImpl },
  );
  if (!summaryRes.ok)
    throw new Error(`PubMed esummary returned ${summaryRes.status}`);
  const summaryData = (await summaryRes.json()) as PubmedSummaryResponse;
  const result = summaryData.result;
  if (!result) return [];

  const papers: NormalizedExternalPaper[] = [];
  const uids = (result.uids as string[]) ?? ids;
  for (const uid of uids) {
    const entry = result[uid];
    if (!entry || Array.isArray(entry)) continue;
    const norm = summaryToNormalized(entry as PubmedSummaryEntry);
    if (norm) papers.push(norm);
  }
  return papers;
}
