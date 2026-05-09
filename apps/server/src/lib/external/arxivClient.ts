// Sprint 69 — arXiv ingestor.
//
// arXiv's "query API" returns Atom XML. We don't need a full XML
// parser — every entry is a single <entry> block with a small set of
// child tags. A line-oriented regex extractor is enough for our
// fields (title, summary, ID, authors, categories, published date,
// PDF URL, DOI). Strict-parser purists: this is a pragmatic choice
// for a feed that's been stable for 25 years; if arXiv ever ships a
// JSON endpoint we swap this file out and keep the
// NormalizedExternalPaper contract.
//
// Polite-pool rule: 1 req/sec; the shared httpClient enforces it.

import { rateLimitedFetch, type FetchLike } from "./httpClient";
import type {
  NormalizedExternalPaper,
  ExternalAuthor,
} from "./normalize";

const ARXIV_QUERY_URL = "https://export.arxiv.org/api/query";
const ARXIV_MIN_INTERVAL_MS = 1000;

export interface ArxivQuery {
  // arXiv API search query string (e.g. `cat:cs.LG`,
  // `all:transformer`, `cat:cs.LG+AND+all:attention`).
  searchQuery: string;
  start?: number;
  maxResults?: number;
  // 'lastUpdatedDate' | 'submittedDate' | 'relevance'
  sortBy?: string;
  sortOrder?: "ascending" | "descending";
}

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(parseInt(n, 10)));
}

function stripWhitespace(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function extractTagOnce(block: string, tag: string): string | null {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`);
  const m = block.match(re);
  return m ? decodeXmlEntities(stripWhitespace(m[1])) : null;
}

function extractTagAll(block: string, tag: string): string[] {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "g");
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(block)) !== null) {
    out.push(decodeXmlEntities(stripWhitespace(m[1])));
  }
  return out;
}

function extractEntries(xml: string): string[] {
  const out: string[] = [];
  const re = /<entry>([\s\S]*?)<\/entry>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) out.push(m[1]);
  return out;
}

function extractAuthors(entry: string): ExternalAuthor[] {
  const re = /<author>([\s\S]*?)<\/author>/g;
  const authors: ExternalAuthor[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(entry)) !== null) {
    const block = m[1];
    const name = extractTagOnce(block, "name");
    if (name) authors.push({ name });
  }
  return authors;
}

function extractCategories(entry: string): string[] {
  const re = /<category[^>]*term="([^"]+)"/g;
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(entry)) !== null) out.push(m[1]);
  return out;
}

function extractPdfUrl(entry: string): string | null {
  // Atom permits attributes in any order — find each <link> tag and
  // check both type+href independently.
  const re = /<link\b([^>]*)\/?>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(entry)) !== null) {
    const attrs = m[1];
    if (!/type="application\/pdf"/.test(attrs)) continue;
    const href = attrs.match(/href="([^"]+)"/);
    if (href) return href[1];
  }
  return null;
}

function extractHtmlUrl(entry: string): string | null {
  const m = entry.match(/<id>([^<]+)<\/id>/);
  return m ? m[1].trim() : null;
}

function parseEntry(entry: string): NormalizedExternalPaper | null {
  const id = extractTagOnce(entry, "id");
  if (!id) return null;
  // arXiv ids look like https://arxiv.org/abs/2501.12345v1 — the
  // canonical sourceId strips both the prefix and the version.
  const sourceId = id
    .replace(/^https?:\/\/arxiv\.org\/abs\//, "")
    .replace(/v\d+$/, "");

  const title = extractTagOnce(entry, "title");
  if (!title) return null;
  const abstract = extractTagOnce(entry, "summary") ?? "";
  const publishedAt = extractTagOnce(entry, "published");
  const authors = extractAuthors(entry);
  const categories = extractCategories(entry);
  const doi = extractTagOnce(entry, "arxiv:doi");

  return {
    source: "arxiv" as const,
    sourceId,
    doi: doi ?? null,
    title,
    abstract,
    authors,
    venue: "arXiv",
    publishedAt: publishedAt ?? null,
    pdfUrl: extractPdfUrl(entry),
    htmlUrl: extractHtmlUrl(entry),
    topics: categories,
    citationCount: 0, // arXiv doesn't publish citation counts
    rawJson: { id },
  };
}

export interface ArxivClientOptions {
  fetchImpl?: FetchLike;
}

export async function fetchArxivPapers(
  query: ArxivQuery,
  opts: ArxivClientOptions = {},
): Promise<NormalizedExternalPaper[]> {
  const params = new URLSearchParams({
    search_query: query.searchQuery,
    start: String(query.start ?? 0),
    max_results: String(query.maxResults ?? 50),
    sortBy: query.sortBy ?? "submittedDate",
    sortOrder: query.sortOrder ?? "descending",
  });

  const res = await rateLimitedFetch(`${ARXIV_QUERY_URL}?${params.toString()}`, {
    minIntervalMs: ARXIV_MIN_INTERVAL_MS,
    fetchImpl: opts.fetchImpl,
    headers: { Accept: "application/atom+xml" },
  });
  if (!res.ok) {
    throw new Error(`arXiv API returned ${res.status}`);
  }
  const xml = await res.text();
  const entries = extractEntries(xml);
  const papers: NormalizedExternalPaper[] = [];
  for (const entry of entries) {
    const parsed = parseEntry(entry);
    if (parsed) papers.push(parsed);
  }
  return papers;
}
