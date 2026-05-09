import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { randomUUID } from "crypto";
import { and, desc, eq, isNotNull, or, sql } from "drizzle-orm";
import {
  capstones,
  capstoneEnrollments,
  getDb,
  searches,
} from "@axiomic/db";
import { scoreQuery } from "../lib/searchIndex";
import { getSessionUser } from "../middleware/auth";
import type { Env } from "../env";

export const searchRouter = new Hono<Env>();

// Sprint 70 — keep the searches table from growing without bound.
// 200 most-recent rows per user is plenty for the ranker's recent-query
// bias term (~30 rows) plus headroom for analytics later.
const MAX_SEARCH_HISTORY_PER_USER = 200;

function trimSearchHistory(userId: string): void {
  const db = getDb();
  const cutoff = db
    .select({ createdAt: searches.createdAt })
    .from(searches)
    .where(eq(searches.userId, userId))
    .orderBy(desc(searches.createdAt))
    .limit(1)
    .offset(MAX_SEARCH_HISTORY_PER_USER)
    .get();
  if (!cutoff) return;
  db.delete(searches)
    .where(
      and(
        eq(searches.userId, userId),
        sql`${searches.createdAt} <= ${cutoff.createdAt}`,
      ),
    )
    .run();
}

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

  // Sprint 70 — record the query for the recommendation ranker's
  // recent-query bias. Best-effort; failures don't break the search
  // response. Anonymous traffic still records (null userId) but the
  // ranker only reads userId-scoped rows.
  try {
    const sessionUser = await getSessionUser(c);
    const searchId = randomUUID();
    getDb()
      .insert(searches)
      .values({
        id: searchId,
        userId: sessionUser?.id ?? null,
        query: trimmed.slice(0, 500),
        resultCount: filtered.length,
      })
      .run();
    if (sessionUser) trimSearchHistory(sessionUser.id);
    c.header("X-Search-Id", searchId);
  } catch {
    // Swallow — recording history must not break search.
  }

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
    if (s.item.kind === "external_paper") {
      return {
        kind: "external_paper" as const,
        ...base,
        source: s.item.source,
        doi: s.item.doi,
        htmlUrl: s.item.htmlUrl,
        publishedAt: s.item.publishedAt,
      };
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

// Sprint 70 — click-through recording. The web client posts the
// X-Search-Id it got from /search along with the kind+id of whatever
// the user actually clicked. Used by the recommendation ranker to
// strengthen the recent-query bias toward queries that landed.
const clickSchema = z.object({
  searchId: z.string().min(8).max(64),
  itemKind: z.string().min(1).max(40),
  itemId: z.string().min(1).max(120),
});

searchRouter.post("/click", zValidator("json", clickSchema), async (c) => {
  const { searchId, itemKind, itemId } = c.req.valid("json");
  const db = getDb();
  // Idempotent on the (searchId) — we only record the FIRST click since
  // a user clicking multiple results in one query is rare and the
  // ranker only needs one signal per query.
  const existing = db
    .select({ id: searches.id, clickedItemKind: searches.clickedItemKind })
    .from(searches)
    .where(eq(searches.id, searchId))
    .get();
  if (!existing) return c.json({ error: "Unknown search id" }, 404);
  if (existing.clickedItemKind) return c.json({ ok: true, alreadyRecorded: true });
  db.update(searches)
    .set({ clickedItemKind: itemKind, clickedItemId: itemId })
    .where(eq(searches.id, searchId))
    .run();
  return c.json({ ok: true });
});
