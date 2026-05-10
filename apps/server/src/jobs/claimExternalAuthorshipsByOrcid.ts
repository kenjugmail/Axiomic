// Sprint 72 — Periodic ORCID auto-claim. Scans externalPapers for
// ORCID hits against the platform's `users.orcid` set + writes any
// new authorship rows. Cheap because it walks the externalPapers
// table once per run; idempotent on (externalPaperId, ordinal). Runs
// every 6h to pick up new external papers + newly-set ORCIDs.

import {
  buildOrcidUserMap,
  claimAuthorshipsByOrcid,
} from "../lib/authorClaim";
import type { JobDefinition } from "../lib/jobs";

export const claimExternalAuthorshipsByOrcidJob: JobDefinition = {
  name: "claim_external_authorships_by_orcid",
  intervalMs: 6 * 60 * 60_000, // 6h
  async run() {
    const map = buildOrcidUserMap();
    if (map.size === 0) return { itemsProcessed: 0 };
    const result = claimAuthorshipsByOrcid(map);
    return { itemsProcessed: result.inserted };
  },
};
