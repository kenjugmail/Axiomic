// Sprint 69 — Periodic PubMed ingest.
//
// Runs once per day. PubMed is the bio/medical complement to arXiv —
// most relevant when at least one user has a medical / biology
// research interest. The query string is intentionally broad ("recent
// systematic reviews + clinical trials in the last 14 days"); a
// future revision can specialize per user.

import { fetchPubmedPapers } from "../lib/external/pubmedClient";
import { persistExternalPapers } from "../lib/external/persist";
import { invalidateSearchIndex } from "../lib/searchIndex";
import type { JobDefinition } from "../lib/jobs";

const RETMAX = 50;

function buildTerm(): string {
  const days = Number(process.env.PUBMED_LOOKBACK_DAYS) || 14;
  return `("last ${days} days"[PDat]) AND (Review[ptyp] OR Clinical Trial[ptyp])`;
}

export const ingestPubmedJob: JobDefinition = {
  name: "ingest_pubmed",
  intervalMs: 24 * 60 * 60_000, // 24h
  async run() {
    const papers = await fetchPubmedPapers({
      term: buildTerm(),
      retmax: RETMAX,
    });
    const result = persistExternalPapers(papers);
    if (result.inserted + result.updated > 0) invalidateSearchIndex();
    return { itemsProcessed: result.inserted + result.updated };
  },
};
