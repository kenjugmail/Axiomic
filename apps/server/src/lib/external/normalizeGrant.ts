// Sprint 71 — Normalized grant opportunity.
//
// Each ingestor (NIH RePORTER / NSF Award Search / grants.gov)
// returns a list of these. The persist layer dedups by (source,
// sourceId) and writes to `grants`. Mirrors the
// NormalizedExternalPaper pattern — anything source-specific lives
// under `rawJson`.

import { z } from "zod";

export const NormalizedGrantSchema = z.object({
  source: z.enum(["nih", "nsf", "grants_gov"]),
  sourceId: z.string().min(1),
  agency: z.string().min(1),
  title: z.string().min(1),
  summary: z.string().default(""),
  fullDescription: z.string().default(""),
  mechanism: z.string().nullable().optional(),
  amountCeiling: z.number().int().min(0).nullable().optional(),
  postedAt: z.string().nullable().optional(),
  deadlineAt: z.string().nullable().optional(),
  url: z.string().min(1),
  topics: z.array(z.string()).default([]),
  rawJson: z.record(z.string(), z.unknown()).default({}),
});

export type NormalizedGrant = z.infer<typeof NormalizedGrantSchema>;

// Hash that's stable to citation-style drift (e.g., NIH RePORTER's
// `award_amount` field can wiggle between fiscal years without the
// underlying opportunity changing). Keyed on title + summary +
// description + topics so the matching-vector cache only invalidates
// when the semantic content moves.
//
// Sprint 78 — deadlineAt + postedAt are now part of the hash so a
// deadline shift forces an UPDATE; the previous hash skipped these
// dates and a moved deadline silently kept the stale row, which broke
// the deadline-soon notifier's window calculation. Switched from
// djb2 (~31-bit) to sha256 to remove birthday-collision risk at
// scale (>10k grants).
import { createHash } from "crypto";
export function grantContentHash(g: NormalizedGrant): string {
  const parts = [
    g.title.trim(),
    g.summary.trim(),
    g.fullDescription.trim(),
    [...g.topics].sort().join("|"),
    g.postedAt ?? "",
    g.deadlineAt ?? "",
  ];
  return createHash("sha256")
    .update(parts.join("\x00"))
    .digest("hex")
    .slice(0, 32);
}
