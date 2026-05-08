import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, eq, isNotNull, or, sql } from "drizzle-orm";
import {
  capstones,
  capstoneEnrollments,
  getDb,
} from "@axiomic/db";
import { scoreQuery } from "../lib/searchIndex";
import type { Env } from "../env";

export const searchRouter = new Hono<Env>();

interface CapstoneBuildHit {
  kind: "capstone";
  slug: string;
  title: string;
  snippet: string;
  estimatedWeeks: number;
  completionCount: number;
}

// Sprint 32 — Navigator's "build" group. The flat search index doesn't
// cover capstones, so this side query scores capstones by case-
// insensitive matches across title + summary + brief. Returns up to
// `cap` results.
function searchCapstonesForBuild(query: string, cap = 5): CapstoneBuildHit[] {
  const tokens = query
    .toLowerCase()
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2);
  if (tokens.length === 0) return [];

  const db = getDb();
  const conditions = tokens.flatMap((t) => {
    const pat = `%${t}%`;
    return [
      sql`lower(${capstones.title}) LIKE ${pat}`,
      sql`lower(${capstones.summary}) LIKE ${pat}`,
      sql`lower(${capstones.contentIntro}) LIKE ${pat}`,
      sql`lower(${capstones.contentUndergrad}) LIKE ${pat}`,
    ];
  });
  if (conditions.length === 0) return [];

  const rows = db
    .select({
      id: capstones.id,
      slug: capstones.slug,
      title: capstones.title,
      summary: capstones.summary,
      estimatedWeeks: capstones.estimatedWeeks,
    })
    .from(capstones)
    .where(and(eq(capstones.status, "published"), or(...conditions)))
    .limit(cap * 2)
    .all();

  if (rows.length === 0) return [];

  const completionRows = db
    .select({
      capstoneId: capstoneEnrollments.capstoneId,
      n: sql<number>`COUNT(*)`,
    })
    .from(capstoneEnrollments)
    .where(isNotNull(capstoneEnrollments.completedAt))
    .groupBy(capstoneEnrollments.capstoneId)
    .all();
  const completionsById = new Map(completionRows.map((r) => [r.capstoneId, Number(r.n)]));

  const scored = rows.map((r) => {
    const haystack = `${r.title} ${r.summary}`.toLowerCase();
    let matches = 0;
    for (const t of tokens) if (haystack.includes(t)) matches++;
    return { row: r, score: matches };
  });
  scored.sort((a, b) => b.score - a.score);

  return scored.slice(0, cap).map(({ row }) => ({
    kind: "capstone" as const,
    slug: row.slug,
    title: row.title,
    snippet: row.summary.slice(0, 180),
    estimatedWeeks: row.estimatedWeeks,
    completionCount: completionsById.get(row.id) ?? 0,
  }));
}

const querySchema = z.object({
  q: z.string().optional().default(""),
  limit: z
    .string()
    .optional()
    .transform((v) => Math.min(20, Math.max(1, parseInt(v ?? "12", 10) || 12))),
  // Sprint 25 — comma-separated kind filter, e.g. ?kind=research or
  // ?kind=research,news. Empty / unset returns all kinds.
  kind: z.string().optional(),
  // Sprint 31 — Knowledge Navigator: when set, the response is grouped
  // by intent (define / practice / discuss / read / build) instead of
  // a flat ranked list. The grouping ranks the same scored items;
  // it's purely a presentation reshape.
  navigator: z.string().optional(),
});

searchRouter.get("/", zValidator("query", querySchema), async (c) => {
  const { q, limit, kind, navigator } = c.req.valid("query");
  const trimmed = q.trim();
  if (!trimmed) {
    return c.json({ query: "", results: [] });
  }

  const wanted = kind
    ? new Set(
        kind
          .split(",")
          .map((s) => s.trim().toLowerCase())
          .filter(Boolean),
      )
    : null;

  // Pull a wider candidate set when filtering so the top-N after the
  // filter still contains `limit` items.
  const candidateLimit = wanted ? Math.max(limit * 4, 40) : limit;
  const scored = await scoreQuery(trimmed, candidateLimit);

  const filtered = wanted
    ? scored.filter((s) => wanted.has(s.item.kind))
    : scored;

  const results = filtered.slice(0, limit).map((s) => {
    const base = {
      id: s.item.id,
      slug: s.item.slug,
      title: s.item.title,
      snippet: s.item.snippet.slice(0, 180),
      score: Math.round(s.score * 1000) / 1000,
      matchedBy: s.matchedBy,
    };
    if (s.item.kind === "page") {
      return { kind: "page" as const, ...base, category: s.item.category };
    }
    if (s.item.kind === "lesson") {
      return {
        kind: "lesson" as const,
        ...base,
        pathSlug: s.item.pathSlug,
        nodeSlug: s.item.nodeSlug,
      };
    }
    if (s.item.kind === "news") {
      return { kind: "news" as const, ...base };
    }
    if (s.item.kind === "research") {
      return { kind: "research" as const, ...base, format: s.item.format };
    }
    return { kind: "topic" as const, ...base, postType: s.item.postType };
  });

  if (navigator === "1" || navigator === "true") {
    // Group by intent. Mapping:
    //   page    → define
    //   lesson  → practice
    //   topic   → discuss
    //   news    → read
    //   research→ read
    //   capstone→ build (side query against capstones table since
    //            capstones aren't in the flat search index yet).
    const groups: Record<string, any[]> = {
      define: [],
      practice: [],
      discuss: [],
      read: [],
      build: [],
    };
    for (const r of results) {
      const intent =
        r.kind === "page"
          ? "define"
          : r.kind === "lesson"
            ? "practice"
            : r.kind === "topic"
              ? "discuss"
              : "read";
      groups[intent].push(r);
    }
    groups.build = searchCapstonesForBuild(trimmed, 5);
    return c.json({
      query: trimmed,
      navigator: true,
      groups,
    });
  }

  return c.json({ query: trimmed, results });
});
