// Sprint 69 — Periodic OpenAlex ingest.
//
// Runs every 12 hours by default. OpenAlex is broader than arXiv
// (covers all disciplines) so we filter to recent works only —
// `from_publication_date` set to "today minus 30 days" — and pull a
// single page of recent results per cron tick. Operators who need
// deeper backfill can adjust OPENALEX_LOOKBACK_DAYS.

import { fetchOpenAlexWorks } from "../lib/external/openAlexClient";
import { persistExternalPapers } from "../lib/external/persist";
import { invalidateSearchIndex } from "../lib/searchIndex";
import type { JobDefinition } from "../lib/jobs";

const PER_PAGE = 50;
const DEFAULT_LOOKBACK_DAYS = 30;

function lookbackDate(): string {
  const days = Number(process.env.OPENALEX_LOOKBACK_DAYS) || DEFAULT_LOOKBACK_DAYS;
  const d = new Date(Date.now() - days * 86400_000);
  return d.toISOString().slice(0, 10);
}

export const ingestOpenAlexJob: JobDefinition = {
  name: "ingest_openalex",
  intervalMs: 12 * 60 * 60_000, // 12h
  async run() {
    const filter = `from_publication_date:${lookbackDate()},type:journal-article`;
    const { papers } = await fetchOpenAlexWorks({
      filter,
      perPage: PER_PAGE,
      cursor: "*",
    });
    const result = persistExternalPapers(papers);
    if (result.inserted + result.updated > 0) invalidateSearchIndex();
    return { itemsProcessed: result.inserted + result.updated };
  },
};
