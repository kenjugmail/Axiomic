// Sprint 71 — NSF Award Search ingestor.
//
// API docs: https://www.research.gov/common/webapi/awardapisearch-v1.htm
// REST endpoint at api.nsf.gov/services/v1/awards.json. Pulls awarded
// projects (NSF doesn't surface open RFPs through this API; the
// FastLane/Research.gov RFP feed would be a follow-up).

import { rateLimitedFetch, type FetchLike } from "./httpClient";
import type { NormalizedGrant } from "./normalizeGrant";

const NSF_BASE = "https://api.nsf.gov/services/v1/awards.json";
const NSF_MIN_INTERVAL_MS = 500;

interface NsfAward {
  id?: string;
  title?: string;
  abstractText?: string;
  agency?: string;
  awardeeName?: string;
  fundsObligatedAmt?: string | number;
  date?: string;
  startDate?: string;
  expDate?: string;
  fundProgramName?: string;
  cfdaNumber?: string;
  pdPIName?: string;
  publicAccessMandate?: string;
}

interface NsfAwardsResponse {
  response?: {
    award?: NsfAward[];
  };
}

function parseAmount(v: string | number | undefined): number | null {
  if (v == null) return null;
  if (typeof v === "number") return Math.max(0, Math.floor(v));
  // NSF strings sometimes carry "$" or commas.
  const cleaned = v.replace(/[$,\s]/g, "");
  const n = parseInt(cleaned, 10);
  return Number.isFinite(n) ? Math.max(0, n) : null;
}

function awardToGrant(a: NsfAward): NormalizedGrant | null {
  if (!a.id || !a.title) return null;
  const url = `https://www.nsf.gov/awardsearch/showAward?AWD_ID=${a.id}`;
  return {
    source: "nsf" as const,
    sourceId: a.id,
    agency: "NSF" + (a.fundProgramName ? ` (${a.fundProgramName})` : ""),
    title: a.title,
    summary: (a.abstractText ?? "").slice(0, 1000),
    fullDescription: a.abstractText ?? "",
    mechanism: a.fundProgramName ?? a.cfdaNumber ?? null,
    amountCeiling: parseAmount(a.fundsObligatedAmt),
    postedAt: a.startDate ?? a.date ?? null,
    // Sprint 78 — NSF Award Search returns AWARDED projects;
    // expDate is when funding ends, not an application deadline.
    // Setting null avoids the deadline-soon notifier telling
    // researchers a closed grant is "closing in 3 days". Live RFPs
    // should be ingested via grants.gov.
    deadlineAt: null,
    url,
    topics: a.fundProgramName ? [a.fundProgramName] : [],
    rawJson: {
      pi: a.pdPIName,
      awardee: a.awardeeName,
      cfdaNumber: a.cfdaNumber,
      projectExpDate: a.expDate ?? null,
    },
  };
}

export interface NsfAwardQuery {
  // Free-text search keyword (matches title + abstract).
  keyword?: string;
  // YYYY-MM-DD lower bound on award start date.
  dateStart?: string;
  // YYYY-MM-DD upper bound on award start date.
  dateEnd?: string;
  // NSF program element code (e.g., "7942" for AI). Optional.
  programElementCode?: string;
  // Page-aligned offset, 1-based per NSF docs.
  offset?: number;
  // Up to 25 per page (NSF max).
  rpp?: number;
}

export interface NsfClientOptions {
  fetchImpl?: FetchLike;
}

const NSF_PRINTFIELDS = [
  "id",
  "title",
  "abstractText",
  "agency",
  "awardeeName",
  "fundsObligatedAmt",
  "date",
  "startDate",
  "expDate",
  "fundProgramName",
  "cfdaNumber",
  "pdPIName",
].join(",");

export async function fetchNsfGrants(
  query: NsfAwardQuery = {},
  opts: NsfClientOptions = {},
): Promise<NormalizedGrant[]> {
  const params = new URLSearchParams({
    rpp: String(query.rpp ?? 25),
    offset: String(query.offset ?? 1),
    printFields: NSF_PRINTFIELDS,
  });
  if (query.keyword) params.set("keyword", query.keyword);
  if (query.dateStart) params.set("dateStart", query.dateStart);
  if (query.dateEnd) params.set("dateEnd", query.dateEnd);
  if (query.programElementCode)
    params.set("fundProgramName", query.programElementCode);

  const res = await rateLimitedFetch(`${NSF_BASE}?${params.toString()}`, {
    minIntervalMs: NSF_MIN_INTERVAL_MS,
    fetchImpl: opts.fetchImpl,
  });
  if (!res.ok) throw new Error(`NSF Awards API returned ${res.status}`);
  const data = (await res.json()) as NsfAwardsResponse;
  const awards = data.response?.award ?? [];
  const grants: NormalizedGrant[] = [];
  for (const a of awards) {
    const g = awardToGrant(a);
    if (g) grants.push(g);
  }
  return grants;
}
