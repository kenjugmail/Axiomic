// Sprint 69 — Normalized external-paper shape.
//
// Each ingestor (arXiv / OpenAlex / PubMed) returns a list of these,
// the persist layer dedups by (source, sourceId) and writes to
// `external_papers`. The shape is deliberately small + JSON-friendly
// — anything source-specific lives under `rawJson`.

import { z } from "zod";

export const ExternalAuthorSchema = z.object({
  name: z.string(),
  orcid: z.string().optional(),
  openAlexAuthorId: z.string().optional(),
});

export type ExternalAuthor = z.infer<typeof ExternalAuthorSchema>;

export const NormalizedExternalPaperSchema = z.object({
  source: z.enum(["arxiv", "openalex", "pubmed"]),
  sourceId: z.string().min(1),
  doi: z.string().nullable().optional(),
  title: z.string().min(1),
  abstract: z.string().default(""),
  authors: z.array(ExternalAuthorSchema).default([]),
  venue: z.string().nullable().optional(),
  publishedAt: z.string().nullable().optional(),
  pdfUrl: z.string().nullable().optional(),
  htmlUrl: z.string().nullable().optional(),
  topics: z.array(z.string()).default([]),
  citationCount: z.number().int().min(0).default(0),
  rawJson: z.record(z.string(), z.unknown()).default({}),
});

export type NormalizedExternalPaper = z.infer<typeof NormalizedExternalPaperSchema>;

// Stable hash for cache invalidation. Built from title + abstract +
// author-name list + topic list — anything that affects the search
// embedding. Citation-count drift alone doesn't bust the embedding
// cache (that's a numeric ranking signal, not a semantic one).
export function externalPaperContentHash(p: NormalizedExternalPaper): string {
  const parts = [
    p.title.trim(),
    p.abstract.trim(),
    p.authors.map((a) => a.name).join("|"),
    [...p.topics].sort().join("|"),
  ];
  // Cheap djb2; we don't need cryptographic strength here.
  let h = 5381;
  const s = parts.join("");
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h).toString(16).padStart(8, "0");
}
