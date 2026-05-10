// Sprint 69 — Periodic arXiv ingest.
//
// Runs every 6 hours by default; pulls the latest arXiv submissions
// across the topic categories registered for active researchers on
// the platform. Cold-start strategy: pull the most recent N
// submissions for each canonical category we care about. Once
// `users.publication_corpus_vector_json` is populated for at least
// one user, future revisions can narrow this to "topics our
// researchers actually publish in"; for now the broad-pull is fine
// at the volumes involved (≤ 100 papers per category per pull).

import { fetchArxivPapers } from "../lib/external/arxivClient";
import { persistExternalPapers } from "../lib/external/persist";
import { invalidateSearchIndex } from "../lib/searchIndex";
import type { JobDefinition } from "../lib/jobs";

// Default categories — broad CS + ML coverage. Operators can override
// via the ARXIV_CATEGORIES env var (comma-separated).
const DEFAULT_CATEGORIES = [
  "cs.LG", // Machine Learning
  "cs.CL", // Computation & Language
  "cs.CV", // Computer Vision
  "cs.AI", // Artificial Intelligence
  "stat.ML", // Statistics — Machine Learning
];

function configuredCategories(): string[] {
  const raw = process.env.ARXIV_CATEGORIES?.trim();
  if (!raw) return DEFAULT_CATEGORIES;
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

const PER_CATEGORY = 30;

export const ingestArxivJob: JobDefinition = {
  name: "ingest_arxiv",
  intervalMs: 6 * 60 * 60_000, // 6h
  async run() {
    let total = 0;
    for (const cat of configuredCategories()) {
      const papers = await fetchArxivPapers({
        searchQuery: `cat:${cat}`,
        sortBy: "submittedDate",
        sortOrder: "descending",
        maxResults: PER_CATEGORY,
      });
      const result = persistExternalPapers(papers);
      total += result.inserted + result.updated;
    }
    if (total > 0) invalidateSearchIndex();
    return { itemsProcessed: total };
  },
};
