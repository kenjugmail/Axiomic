// Sprint 71 — grants.gov ingest. Runs every 12h to pick up newly
// posted opportunities + close-date changes. Optionally scoped to
// a comma-separated list of agency codes via GRANTS_GOV_AGENCIES
// (e.g. "CDC,NSF,ED"); empty filter pulls all agencies.

import { fetchGrantsGovOpportunities } from "../lib/external/grantsGovClient";
import { persistGrants } from "../lib/external/persistGrants";
import type { JobDefinition } from "../lib/jobs";

function configuredAgencies(): string[] {
  const raw = process.env.GRANTS_GOV_AGENCIES?.trim();
  if (!raw) return [];
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

export const ingestGrantsGovJob: JobDefinition = {
  name: "ingest_grants_gov",
  intervalMs: 12 * 60 * 60_000, // 12h
  async run() {
    const grants = await fetchGrantsGovOpportunities({
      agencies: configuredAgencies(),
      rows: 50,
    });
    const result = persistGrants(grants);
    return { itemsProcessed: result.inserted + result.updated };
  },
};
