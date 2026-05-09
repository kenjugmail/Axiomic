// Sprint 71 — NIH RePORTER ingestor.
//
// API docs: https://api.reporter.nih.gov/. POST to /v2/projects/search
// with a JSON body. Returns active research projects (each row is an
// awarded grant). We treat each project as a "grant opportunity" for
// the funding feed — for actively-recruiting RFPs, swap the source
// to NIH Guide and add a separate ingestor (deferred).

import { rateLimitedFetch, type FetchLike } from "./httpClient";
import type { NormalizedGrant } from "./normalizeGrant";

const NIH_BASE = "https://api.reporter.nih.gov";
const NIH_MIN_INTERVAL_MS = 500;

interface NihAwardNotice {
  url?: string | null;
  link?: string | null;
}

interface NihOrgInfo {
  org_name?: string;
}

interface NihProject {
  appl_id?: number | string;
  project_num?: string;
  project_title?: string;
  abstract_text?: string | null;
  fiscal_year?: number;
  project_start_date?: string | null;
  project_end_date?: string | null;
  award_amount?: number | null;
  organization?: NihOrgInfo;
  // Activity code, e.g. "R01", "K99". Sometimes lives under
  // `activity` and sometimes derived from project_num.
  activity?: string;
  pref_terms?: string | null;
  // The "Notice of Funding Opportunity" link.
  award_notice?: NihAwardNotice;
}

interface NihSearchResponse {
  results?: NihProject[];
  meta?: { total?: number };
}

function deriveActivityFromProjectNum(num: string | undefined): string | null {
  if (!num) return null;
  // NIH project numbers are <type><activity><institute>... — e.g.
  // "5R01CA123456-03" or "1K99CA999999-01". The activity code is one
  // letter followed by two digits ("R01", "K99", "F32"). The
  // institute code is two letters and follows the activity directly.
  const m = num.match(/^[0-9]([A-Z]\d{2})/);
  return m ? m[1] : null;
}

function termsToTopics(terms: string | null | undefined): string[] {
  if (!terms) return [];
  // RePORTER ships PT (Pref-Term) lists as semicolon-separated.
  return terms
    .split(/[;|]/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0)
    .slice(0, 12);
}

function projectToGrant(p: NihProject): NormalizedGrant | null {
  const sourceId = p.project_num ?? (p.appl_id ? String(p.appl_id) : null);
  if (!sourceId || !p.project_title) return null;

  const url =
    p.award_notice?.url ??
    p.award_notice?.link ??
    `https://reporter.nih.gov/project-details/${sourceId}`;

  const summary = (p.abstract_text ?? "").slice(0, 1000);
  const fullDescription = p.abstract_text ?? "";
  const mechanism = p.activity ?? deriveActivityFromProjectNum(p.project_num);

  return {
    source: "nih" as const,
    sourceId,
    agency: "NIH" + (p.organization?.org_name ? ` (${p.organization.org_name})` : ""),
    title: p.project_title,
    summary,
    fullDescription,
    mechanism: mechanism ?? null,
    amountCeiling: p.award_amount ?? null,
    postedAt: p.project_start_date ?? null,
    deadlineAt: p.project_end_date ?? null,
    url,
    topics: termsToTopics(p.pref_terms),
    rawJson: { applId: p.appl_id, projectNum: p.project_num },
  };
}

export interface NihReporterQuery {
  // RePORTER criteria object — pass through as-is. Reasonable
  // defaults: { fiscal_years: [<current_fy>] }.
  criteria?: Record<string, unknown>;
  limit?: number;
  offset?: number;
}

export interface NihReporterClientOptions {
  fetchImpl?: FetchLike;
}

export async function fetchNihGrants(
  query: NihReporterQuery,
  opts: NihReporterClientOptions = {},
): Promise<NormalizedGrant[]> {
  const body = JSON.stringify({
    criteria: query.criteria ?? {},
    limit: query.limit ?? 25,
    offset: query.offset ?? 0,
    sort_field: "project_start_date",
    sort_order: "desc",
  });

  const res = await rateLimitedFetch(`${NIH_BASE}/v2/projects/search`, {
    method: "POST",
    minIntervalMs: NIH_MIN_INTERVAL_MS,
    fetchImpl: opts.fetchImpl,
    headers: { "Content-Type": "application/json" },
    body,
  });
  if (!res.ok) throw new Error(`NIH RePORTER returned ${res.status}`);
  const data = (await res.json()) as NihSearchResponse;
  const results = data.results ?? [];
  const grants: NormalizedGrant[] = [];
  for (const p of results) {
    const g = projectToGrant(p);
    if (g) grants.push(g);
  }
  return grants;
}
