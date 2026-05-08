// Sprint 34 — Citation export helpers.
//
// Pure formatters: turn a paper or capstone record into BibTeX, RIS,
// and plain-text citations. Author names default to the platform
// username; consumers can pass a fully-formatted display name when
// available.

export interface CitationSource {
  kind: "paper" | "capstone";
  slug: string;
  title: string;
  authors: string[];        // ordered; first author printed first
  year: number;
  url: string;              // canonical URL (DOI-style permalink)
  abstract?: string;
  publishedAt: string;      // ISO date
}

// Slugify an author name for the BibTeX cite key.
function citeKey(src: CitationSource): string {
  const first = src.authors[0]?.toLowerCase() ?? "anon";
  const author = first.replace(/[^a-z0-9]+/g, "");
  const titleWord =
    src.title
      .toLowerCase()
      .split(/\s+/)
      .find((w) => w.length >= 4 && /^[a-z0-9]+$/.test(w)) ?? "untitled";
  return `${author}${src.year}${titleWord}`;
}

// BibTeX escape — restricted set of LaTeX-unsafe characters that
// commonly appear in titles and abstracts.
function bibEscape(s: string): string {
  return s
    .replace(/\\/g, "\\textbackslash{}")
    .replace(/&/g, "\\&")
    .replace(/%/g, "\\%")
    .replace(/_/g, "\\_")
    .replace(/\$/g, "\\$")
    .replace(/#/g, "\\#")
    .replace(/\{/g, "\\{")
    .replace(/\}/g, "\\}")
    .replace(/[\r\n]+/g, " ")
    .trim();
}

export function toBibtex(src: CitationSource): string {
  const key = citeKey(src);
  const authors = src.authors.length > 0 ? src.authors.join(" and ") : "Anonymous";
  const entryType = src.kind === "paper" ? "misc" : "misc";
  const lines = [
    `@${entryType}{${key},`,
    `  author = {${bibEscape(authors)}},`,
    `  title = {${bibEscape(src.title)}},`,
    `  year = {${src.year}},`,
    `  url = {${src.url}},`,
    `  note = {Axiomic ${src.kind === "paper" ? "research paper" : "capstone"}, accessed ${new Date()
      .toISOString()
      .slice(0, 10)}},`,
    `}`,
  ];
  return lines.join("\n");
}

// RIS — common bibliographic interchange used by Zotero, Mendeley.
// TY=GEN keeps it generic since Axiomic papers aren't peer-reviewed
// in the journal sense.
export function toRis(src: CitationSource): string {
  const lines: string[] = [];
  lines.push("TY  - GEN");
  for (const a of src.authors) lines.push(`AU  - ${a}`);
  if (src.authors.length === 0) lines.push("AU  - Anonymous");
  lines.push(`TI  - ${src.title}`);
  lines.push(`PY  - ${src.year}`);
  lines.push(`DA  - ${src.publishedAt.slice(0, 10).replace(/-/g, "/")}`);
  lines.push(`UR  - ${src.url}`);
  if (src.abstract) {
    lines.push(`AB  - ${src.abstract.replace(/\s+/g, " ").trim().slice(0, 1000)}`);
  }
  lines.push(`PB  - Axiomic`);
  lines.push("ER  - ");
  return lines.join("\n");
}

// Plain-text — APA-ish hand-format. Useful as a fallback paste for
// docs and emails.
export function toPlainText(src: CitationSource): string {
  const authors =
    src.authors.length === 0
      ? "Anonymous"
      : src.authors.length === 1
        ? src.authors[0]
        : src.authors.length === 2
          ? `${src.authors[0]} & ${src.authors[1]}`
          : `${src.authors[0]} et al.`;
  return `${authors} (${src.year}). ${src.title}. Axiomic. ${src.url}`;
}
