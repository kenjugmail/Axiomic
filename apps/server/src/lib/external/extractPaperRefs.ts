// Sprint 72 — Extract paper references (DOI, arXiv ID) from free
// text. Used by the social-post harvester to link a BlueSky post to
// the paper(s) it mentions, so the paper detail page can surface
// "discussed by @user.bsky.social" + the author profile can show
// "their recent posts about papers".
//
// Patterns we recognize:
//   - DOI: 10.<registrant>/<suffix> (per Crossref's public format).
//     Also tolerates "doi:10.…" and "https://doi.org/10.…".
//   - arXiv: 2501.12345 or arXiv:2501.12345 or
//     https://arxiv.org/abs/2501.12345 (with optional vN suffix).
//
// Mirrors the spirit of crossLinks.ts:343 (extractReferencedWikiSlugs)
// but for external-paper IDs instead of internal slugs.

export interface ExtractedRef {
  source: "doi" | "arxiv";
  sourceId: string;
}

const DOI_RE = /\b(?:doi:|https?:\/\/(?:dx\.)?doi\.org\/)?(10\.\d{4,9}\/[-._;()/:A-Za-z0-9]+)\b/g;
// arXiv ID pattern requires an explicit prefix ('arxiv:' or an
// arxiv.org URL). The bare 4.4-digit pattern matched too many
// false positives — timestamps, financial figures, version
// strings — and polluted social_posts with bogus references.
const ARXIV_RE =
  /(?:arxiv:|https?:\/\/arxiv\.org\/(?:abs|pdf)\/)(\d{4}\.\d{4,5})(?:v\d+)?\b/gi;

// Case-insensitive ID lookup keys; dedup so a post mentioning
// "10.1234/foo" and "doi:10.1234/foo" yields one ref.
function dedupKey(ref: ExtractedRef): string {
  return `${ref.source}:${ref.sourceId.toLowerCase()}`;
}

export function extractPaperRefs(text: string): ExtractedRef[] {
  if (!text) return [];
  const out = new Map<string, ExtractedRef>();

  let m: RegExpExecArray | null;
  // Reset lastIndex defensively (regex literals are stateful when /g).
  DOI_RE.lastIndex = 0;
  while ((m = DOI_RE.exec(text)) !== null) {
    const sourceId = m[1];
    if (!sourceId) continue;
    // DOIs are case-insensitive — lowercase here so a post saying
    // 10.1234/Foo and an OpenAlex row stored as 10.1234/foo match.
    const ref: ExtractedRef = { source: "doi", sourceId: sourceId.toLowerCase() };
    out.set(dedupKey(ref), ref);
  }
  ARXIV_RE.lastIndex = 0;
  while ((m = ARXIV_RE.exec(text)) !== null) {
    const sourceId = m[1];
    if (!sourceId) continue;
    const ref: ExtractedRef = { source: "arxiv", sourceId };
    out.set(dedupKey(ref), ref);
  }

  return [...out.values()];
}
