// Sprint 71 — Grant opportunity persistence. Idempotent upsert
// keyed by (source, sourceId). Mirrors persistExternalPapers.

import { randomUUID } from "crypto";
import { and, eq } from "drizzle-orm";
import { getDb, grants } from "@axiomic/db";
import { grantContentHash, type NormalizedGrant } from "./normalizeGrant";

export interface GrantPersistResult {
  inserted: number;
  updated: number;
  skipped: number;
  errors: number;
}

export function persistGrants(items: NormalizedGrant[]): GrantPersistResult {
  const db = getDb();
  const result: GrantPersistResult = {
    inserted: 0,
    updated: 0,
    skipped: 0,
    errors: 0,
  };

  for (const g of items) {
    const hash = grantContentHash(g);
    const existing = db
      .select({ id: grants.id, contentHash: grants.contentHash })
      .from(grants)
      .where(and(eq(grants.source, g.source), eq(grants.sourceId, g.sourceId)))
      .get();

    try {
      if (!existing) {
        db.insert(grants)
          .values({
            id: randomUUID(),
            source: g.source,
            sourceId: g.sourceId,
            agency: g.agency,
            title: g.title,
            summary: g.summary,
            fullDescription: g.fullDescription,
            mechanism: g.mechanism ?? null,
            amountCeiling: g.amountCeiling ?? null,
            postedAt: g.postedAt ?? null,
            deadlineAt: g.deadlineAt ?? null,
            url: g.url,
            topicsJson: JSON.stringify(g.topics),
            rawJson: JSON.stringify(g.rawJson),
            contentHash: hash,
          })
          .run();
        result.inserted++;
      } else if (existing.contentHash === hash) {
        result.skipped++;
      } else {
        db.update(grants)
          .set({
            agency: g.agency,
            title: g.title,
            summary: g.summary,
            fullDescription: g.fullDescription,
            mechanism: g.mechanism ?? null,
            amountCeiling: g.amountCeiling ?? null,
            postedAt: g.postedAt ?? null,
            deadlineAt: g.deadlineAt ?? null,
            url: g.url,
            topicsJson: JSON.stringify(g.topics),
            rawJson: JSON.stringify(g.rawJson),
            contentHash: hash,
            fetchedAt: new Date()
              .toISOString()
              .slice(0, 19)
              .replace("T", " "),
          })
          .where(eq(grants.id, existing.id))
          .run();
        result.updated++;
      }
    } catch (err) {
      result.errors++;
      console.warn(
        `[grants] failed to persist ${g.source}:${g.sourceId}`,
        err,
      );
    }
  }
  return result;
}
