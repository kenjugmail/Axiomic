// Sprint 71 — grants.gov ingestor.
//
// API docs: https://www.grants.gov/web/grants/s2s/grantor/schemas/grants-funding-synopsis.html
// POST to /grantsws/rest/opportunities/search/ with a JSON criteria
// body. Covers CDC, HHS, NSF, Education, and ~25 other federal
// agencies — the agency name lives on each row, not in the
// endpoint, so callers filter via `agencies: ["CDC"]` etc.
//
// CDC has no separate ingestor — its opportunities flow through
// here. The `cdcClient.ts` re-export below is a thin convenience
// wrapper.

import { rateLimitedFetch, type FetchLike } from "./httpClient";
import type { NormalizedGrant } from "./normalizeGrant";

const GRANTS_GOV_BASE = "https://www.grants.gov/grantsws/rest";
const GRANTS_GOV_MIN_INTERVAL_MS = 750;

interface GrantsGovOpportunity {
  id?: number | string;
  number?: string;
  title?: string;
  agencyCode?: string;
  agency?: string;
  agencyName?: string;
  openDate?: string;
  closeDate?: string;
  oppStatus?: string;
  docType?: string;
  cfdaList?: string;
}

interface GrantsGovSearchResponse {
  errorcode?: number;
  msg?: string;
  data?: {
    oppHits?: GrantsGovOpportunity[];
    hitCount?: number;
  };
}

function dateFromMmDdYyyy(s: string | undefined): string | null {
  if (!s) return null;
  // grants.gov returns dates as MM/DD/YYYY. Convert to ISO so the
  // deadline cron can compare with `new Date()`.
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  return `${m[3]}-${m[1]}-${m[2]}`;
}

function rowToGrant(o: GrantsGovOpportunity): NormalizedGrant | null {
  const sourceId =
    o.number ?? (o.id != null ? String(o.id) : null);
  if (!sourceId || !o.title) return null;
  const agencyName = o.agencyName ?? o.agency ?? o.agencyCode ?? "Unknown";
  return {
    source: "grants_gov" as const,
    sourceId,
    agency: agencyName,
    title: o.title,
    summary: "", // Search payload doesn't include the synopsis text.
    fullDescription: "",
    mechanism: o.docType ?? null,
    amountCeiling: null,
    postedAt: dateFromMmDdYyyy(o.openDate),
    deadlineAt: dateFromMmDdYyyy(o.closeDate),
    url: `https://grants.gov/search-results-detail/${o.id ?? sourceId}`,
    topics: o.cfdaList
      ? o.cfdaList
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : [],
    rawJson: {
      id: o.id,
      number: o.number,
      cfdaList: o.cfdaList,
      oppStatus: o.oppStatus,
    },
  };
}

export interface GrantsGovQuery {
  keyword?: string;
  // Filter by agency CODE (e.g. ["CDC", "NSF", "ED"]). Maps onto
  // grants.gov `agencies` filter.
  agencies?: string[];
  // Defaults to "forecasted|posted" — what's currently open or
  // about to be.
  oppStatuses?: string;
  // 1-based page.
  startRecordNum?: number;
  rows?: number;
}

export interface GrantsGovClientOptions {
  fetchImpl?: FetchLike;
}

export async function fetchGrantsGovOpportunities(
  query: GrantsGovQuery = {},
  opts: GrantsGovClientOptions = {},
): Promise<NormalizedGrant[]> {
  const body = JSON.stringify({
    keyword: query.keyword ?? "",
    agencies: query.agencies ?? [],
    oppStatuses: query.oppStatuses ?? "forecasted|posted",
    startRecordNum: query.startRecordNum ?? 0,
    rows: query.rows ?? 25,
    sortBy: "openDate|desc",
  });

  const res = await rateLimitedFetch(
    `${GRANTS_GOV_BASE}/opportunities/search/`,
    {
      method: "POST",
      minIntervalMs: GRANTS_GOV_MIN_INTERVAL_MS,
      fetchImpl: opts.fetchImpl,
      headers: { "Content-Type": "application/json" },
      body,
    },
  );
  if (!res.ok) throw new Error(`grants.gov returned ${res.status}`);
  const data = (await res.json()) as GrantsGovSearchResponse;
  if (data.errorcode && data.errorcode !== 0) {
    throw new Error(`grants.gov error: ${data.msg ?? "unknown"}`);
  }
  const hits = data.data?.oppHits ?? [];
  const grants: NormalizedGrant[] = [];
  for (const o of hits) {
    const g = rowToGrant(o);
    if (g) grants.push(g);
  }
  return grants;
}

// CDC convenience wrapper — exactly the grants.gov client with the
// `agencies: ["CDC"]` filter pre-applied. Exported so the cron
// jobs file can register a separate cron schedule for CDC if ops
// want it tracked independently.
export function fetchCdcGrants(
  query: Omit<GrantsGovQuery, "agencies"> = {},
  opts: GrantsGovClientOptions = {},
): Promise<NormalizedGrant[]> {
  return fetchGrantsGovOpportunities(
    { ...query, agencies: ["CDC"] },
    opts,
  );
}
