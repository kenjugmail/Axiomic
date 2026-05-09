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

const DOI_RE = /\b(?:doi:|https?:\/\/(?:dx\.)?doi\.org\/)?(10\.\d{4,9}\/[\-._;()/:A-Za-z0-9]+)\b/g;
const ARXIV_RE =
  /(?:arxiv:|https?:\/\/arxiv\.org\/(?:abs|pdf)\/)?(\d{4}\.\d{4,5})(?:v\d+)?\b/gi;

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
    const ref: ExtractedRef = { source: "doi", sourceId };
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
