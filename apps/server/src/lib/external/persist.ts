// Sprint 69 — External-paper persistence.
//
// Idempotent upsert keyed by (source, sourceId). Writes are O(1) per
// row; we don't try to be clever with a single multi-row UPSERT
// because better-sqlite3 / drizzle don't expose the bulk variant
// cleanly and the row counts here (tens to hundreds per ingest run)
// don't justify it.
//
// `contentHash` short-circuits when the upstream row hasn't changed —
// no INSERT or UPDATE happens, and the downstream search-index
// invalidation is skipped. This keeps re-runs cheap.

import { randomUUID } from "crypto";
import { and, eq } from "drizzle-orm";
import { externalPapers, getDb } from "@axiomic/db";
import {
  externalPaperContentHash,
  type NormalizedExternalPaper,
} from "./normalize";

export interface PersistResult {
  inserted: number;
  updated: number;
  skipped: number; // hash unchanged
  errors: number;
}

export function persistExternalPapers(
  papers: NormalizedExternalPaper[],
): PersistResult {
  const db = getDb();
  const result: PersistResult = { inserted: 0, updated: 0, skipped: 0, errors: 0 };

  for (const paper of papers) {
    const hash = externalPaperContentHash(paper);
    const existing = db
      .select({ id: externalPapers.id, contentHash: externalPapers.contentHash })
      .from(externalPapers)
      .where(
        and(
          eq(externalPapers.source, paper.source),
          eq(externalPapers.sourceId, paper.sourceId),
        ),
      )
      .get();

    try {
      if (!existing) {
        db.insert(externalPapers)
          .values({
            id: randomUUID(),
            source: paper.source,
            sourceId: paper.sourceId,
            doi: paper.doi ?? null,
            title: paper.title,
            abstract: paper.abstract,
            authorsJson: JSON.stringify(paper.authors),
            venue: paper.venue ?? null,
            publishedAt: paper.publishedAt ?? null,
            pdfUrl: paper.pdfUrl ?? null,
            htmlUrl: paper.htmlUrl ?? null,
            topicsJson: JSON.stringify(paper.topics),
            citationCount: paper.citationCount,
            rawJson: JSON.stringify(paper.rawJson),
            contentHash: hash,
          })
          .run();
        result.inserted++;
      } else if (existing.contentHash === hash) {
        result.skipped++;
      } else {
        db.update(externalPapers)
          .set({
            doi: paper.doi ?? null,
            title: paper.title,
            abstract: paper.abstract,
            authorsJson: JSON.stringify(paper.authors),
            venue: paper.venue ?? null,
            publishedAt: paper.publishedAt ?? null,
            pdfUrl: paper.pdfUrl ?? null,
            htmlUrl: paper.htmlUrl ?? null,
            topicsJson: JSON.stringify(paper.topics),
            citationCount: paper.citationCount,
            rawJson: JSON.stringify(paper.rawJson),
            contentHash: hash,
            fetchedAt: new Date()
              .toISOString()
              .slice(0, 19)
              .replace("T", " "),
          })
          .where(eq(externalPapers.id, existing.id))
          .run();
        result.updated++;
      }
    } catch (err) {
      result.errors++;
      // Don't throw — one malformed row shouldn't kill the whole
      // ingest run. The job's run-history shows non-zero errors.
      console.warn(
        `[external_papers] failed to persist ${paper.source}:${paper.sourceId}`,
        err,
      );
    }
  }
  return result;
}
