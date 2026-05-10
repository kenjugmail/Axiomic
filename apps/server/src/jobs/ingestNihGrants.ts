// Sprint 71 — Daily NIH RePORTER ingest. Pulls active grants for
// the current fiscal year. Operators can scope further via
// NIH_AGENCIES (comma-separated IC codes, e.g. "NCI,NIMH") or
// override the page size via NIH_GRANT_PAGE_SIZE.

import { fetchNihGrants } from "../lib/external/nihReporterClient";
import { persistGrants } from "../lib/external/persistGrants";
import type { JobDefinition } from "../lib/jobs";

function currentFiscalYear(): number {
  // US federal fiscal year starts Oct 1.
  const now = new Date();
  const month = now.getUTCMonth() + 1;
  return month >= 10 ? now.getUTCFullYear() + 1 : now.getUTCFullYear();
}

function configuredAgencies(): string[] | undefined {
  const raw = process.env.NIH_AGENCIES?.trim();
  if (!raw) return undefined;
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

export const ingestNihGrantsJob: JobDefinition = {
  name: "ingest_nih_grants",
  intervalMs: 24 * 60 * 60_000, // 24h
  async run() {
    const limit = Number(process.env.NIH_GRANT_PAGE_SIZE) || 50;
    const fy = currentFiscalYear();
    const agencies = configuredAgencies();
    const criteria: Record<string, unknown> = { fiscal_years: [fy] };
    if (agencies) criteria.agencies = agencies;
    const grants = await fetchNihGrants({ criteria, limit });
    const result = persistGrants(grants);
    return { itemsProcessed: result.inserted + result.updated };
  },
};
