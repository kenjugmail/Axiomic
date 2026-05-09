// Sprint 71 — Daily NSF Award Search ingest. Pulls awards started
// in the last 30 days by default; operators can stretch the lookback
// via NSF_LOOKBACK_DAYS.

import { fetchNsfGrants } from "../lib/external/nsfAwardSearchClient";
import { persistGrants } from "../lib/external/persistGrants";
import type { JobDefinition } from "../lib/jobs";

function lookbackDate(): string {
  const days = Number(process.env.NSF_LOOKBACK_DAYS) || 30;
  return new Date(Date.now() - days * 86400_000).toISOString().slice(0, 10);
}

export const ingestNsfGrantsJob: JobDefinition = {
  name: "ingest_nsf_grants",
  intervalMs: 24 * 60 * 60_000, // 24h
  async run() {
    const grants = await fetchNsfGrants({
      dateStart: lookbackDate(),
      rpp: 25,
    });
    const result = persistGrants(grants);
    return { itemsProcessed: result.inserted + result.updated };
  },
};
