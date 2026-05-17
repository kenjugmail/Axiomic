// Sprint 71 — Funding feed routes.
//
//   GET  /grants                    list (filters: agency, source,
//                                    deadline window, mechanism); paginated
//   GET  /grants/feed               personalized matches for the
//                                    signed-in user (cold-start fallback
//                                    to upcoming deadlines for anon)
//   GET  /grants/:id                detail
//   POST /grants/:id/bookmark       toggle bookmark
//   GET  /grants/me/bookmarks       list bookmarks
//
// Grants for paper rails are surfaced via /research/:slug/grants in
// research.ts; this router is the standalone funding surface.

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { randomUUID } from "crypto";
import {
  and,
  asc,
  desc,
  eq,
  gt,
  isNotNull,
  like,
  lt,
  sql,
} from "drizzle-orm";
import {
  getDb,
  grants,
  grantBookmarks,
} from "@axiomic/db";
import { matchGrantsForUser, rankByDeadline } from "../lib/grantMatch";
import { getSessionUser, requireAuth } from "../middleware/auth";
import type { Env } from "../env";

export const grantsRouter = new Hono<Env>();

interface GrantPayload {
  id: string;
  source: string;
  sourceId: string;
  agency: string;
  title: string;
  summary: string;
  mechanism: string | null;
  amountCeiling: number | null;
  postedAt: string | null;
  deadlineAt: string | null;
  url: string;
  topics: string[];
  // Set when the request is authenticated AND the user has bookmarked
  // the grant. Always undefined for anonymous traffic.
  bookmarked?: boolean;
}

function safeTopics(json: string | null | undefined): string[] {
  if (!json) return [];
  try {
    const arr = JSON.parse(json);
    if (Array.isArray(arr))
      return arr.filter((s): s is string => typeof s === "string");
  } catch {}
  return [];
}

function rowToPayload(row: typeof grants.$inferSelect): GrantPayload {
  return {
    id: row.id,
    source: row.source,
    sourceId: row.sourceId,
    agency: row.agency,
    title: row.title,
    summary: (row.summary ?? "").slice(0, 280),
    mechanism: row.mechanism,
    amountCeiling: row.amountCeiling,
    postedAt: row.postedAt,
    deadlineAt: row.deadlineAt,
    url: row.url,
    topics: safeTopics(row.topicsJson),
  };
}

function bookmarkedSetForUser(
  userId: string,
  grantIds: string[],
): Set<string> {
  if (grantIds.length === 0) return new Set();
  const db = getDb();
  const rows = db
    .select({ grantId: grantBookmarks.grantId })
    .from(grantBookmarks)
    .where(eq(grantBookmarks.userId, userId))
    .all();
  const owned = new Set(rows.map((r) => r.grantId));
  // Filter to the requested ids so the set stays compact.
  const out = new Set<string>();
  for (const g of grantIds) if (owned.has(g)) out.add(g);
  return out;
}

const listSchema = z.object({
  agency: z.string().optional(),
  source: z.enum(["nih", "nsf", "grants_gov"]).optional(),
  // Filter to grants closing within this many days. 0 = past
  // deadlines hidden but no upper bound.
  withinDays: z
    .string()
    .optional()
    .transform((v) => {
      if (!v) return undefined;
      const n = parseInt(v, 10);
      return Number.isFinite(n) && n > 0 ? n : undefined;
    }),
  q: z.string().optional(),
  limit: z
    .string()
    .optional()
    // Phase 20B — cap bumped 50 → 500 (mirrors the Phase 18C
    // review-queue fix). The persistent test DB accumulates grants
    // across runs and freshly-seeded test fixtures can fall outside
    // the lower window; the in-memory cost of a 500-row pull is
    // trivial.
    .transform((v) => Math.min(500, Math.max(1, parseInt(v ?? "20", 10) || 20))),
});

grantsRouter.get("/", zValidator("query", listSchema), async (c) => {
  const { agency, source, withinDays, q, limit } = c.req.valid("query");
  const db = getDb();

  const conds = [];
  if (agency) conds.push(eq(grants.agency, agency));
  if (source) conds.push(eq(grants.source, source));
  if (q && q.trim().length > 0) {
    const pat = `%${q.trim().toLowerCase()}%`;
    conds.push(sql`lower(${grants.title}) LIKE ${pat}`);
  }
  // Always hide past deadlines.
  const nowDate = new Date().toISOString().slice(0, 10);
  conds.push(sql`(${grants.deadlineAt} IS NULL OR ${grants.deadlineAt} >= ${nowDate})`);
  if (withinDays != null) {
    const upper = new Date(Date.now() + withinDays * 86400_000)
      .toISOString()
      .slice(0, 10);
    conds.push(
      and(
        isNotNull(grants.deadlineAt),
        lt(grants.deadlineAt, upper),
      )!,
    );
  }

  const rows = db
    .select()
    .from(grants)
    .where(and(...conds))
    .orderBy(
      // Closest deadline first (nulls last via a CASE).
      sql`CASE WHEN ${grants.deadlineAt} IS NULL THEN 1 ELSE 0 END`,
      asc(grants.deadlineAt),
      desc(grants.postedAt),
    )
    .limit(limit)
    .all();

  const sessionUser = await getSessionUser(c);
  const ids = rows.map((r) => r.id);
  const bookmarks = sessionUser
    ? bookmarkedSetForUser(sessionUser.id, ids)
    : new Set<string>();

  const items: GrantPayload[] = rows.map((r) => {
    const p = rowToPayload(r);
    if (sessionUser) p.bookmarked = bookmarks.has(r.id);
    return p;
  });

  return c.json({ items, count: items.length });
});

const feedSchema = z.object({
  limit: z
    .string()
    .optional()
    .transform((v) => Math.min(30, Math.max(1, parseInt(v ?? "10", 10) || 10))),
});

grantsRouter.get("/feed", zValidator("query", feedSchema), async (c) => {
  const { limit } = c.req.valid("query");
  const sessionUser = await getSessionUser(c);

  const matches = sessionUser
    ? await matchGrantsForUser(sessionUser.id, { limit })
    : rankByDeadline({ limit });

  const ids = matches.map((m) => m.grant.id);
  const bookmarks = sessionUser
    ? bookmarkedSetForUser(sessionUser.id, ids)
    : new Set<string>();

  return c.json({
    personalized: Boolean(sessionUser),
    items: matches.map((m) => ({
      grant: {
        id: m.grant.id,
        source: m.grant.source,
        sourceId: m.grant.sourceId,
        agency: m.grant.agency,
        title: m.grant.title,
        summary: m.grant.summary.slice(0, 280),
        mechanism: m.grant.mechanism,
        amountCeiling: m.grant.amountCeiling,
        postedAt: m.grant.postedAt,
        deadlineAt: m.grant.deadlineAt,
        url: m.grant.url,
        topics: m.grant.topics,
        bookmarked: sessionUser ? bookmarks.has(m.grant.id) : undefined,
      },
      score: Math.round(m.score * 1000) / 1000,
      vectorScore: Math.round(m.vectorScore * 1000) / 1000,
      topicOverlap: Math.round(m.topicOverlap * 1000) / 1000,
      reason: m.reason,
    })),
  });
});

grantsRouter.get("/me/bookmarks", requireAuth, async (c) => {
  const me = c.get("user")!;
  const db = getDb();
  const rows = db
    .select({
      grant: grants,
      bookmarkedAt: grantBookmarks.createdAt,
    })
    .from(grantBookmarks)
    .innerJoin(grants, eq(grantBookmarks.grantId, grants.id))
    .where(eq(grantBookmarks.userId, me.id))
    .orderBy(desc(grantBookmarks.createdAt))
    .all();
  return c.json({
    items: rows.map((r) => ({
      ...rowToPayload(r.grant),
      bookmarked: true,
      bookmarkedAt: r.bookmarkedAt,
    })),
  });
});

grantsRouter.get("/:id", async (c) => {
  const id = c.req.param("id");
  if (!id) return c.json({ error: "Missing id" }, 400);
  const db = getDb();
  const row = db.select().from(grants).where(eq(grants.id, id)).get();
  if (!row) return c.json({ error: "Not found" }, 404);
  const sessionUser = await getSessionUser(c);
  const bookmarks = sessionUser
    ? bookmarkedSetForUser(sessionUser.id, [row.id])
    : new Set<string>();
  return c.json({
    grant: {
      ...rowToPayload(row),
      summary: row.summary,
      fullDescription: row.fullDescription,
      bookmarked: sessionUser ? bookmarks.has(row.id) : undefined,
    },
  });
});

grantsRouter.post("/:id/bookmark", requireAuth, async (c) => {
  const id = c.req.param("id");
  if (!id) return c.json({ error: "Missing id" }, 400);
  const me = c.get("user")!;
  const db = getDb();
  const grant = db
    .select({ id: grants.id })
    .from(grants)
    .where(eq(grants.id, id))
    .get();
  if (!grant) return c.json({ error: "Not found" }, 404);

  // Toggle: if a row exists, delete; else insert.
  const existing = db
    .select({ id: grantBookmarks.id })
    .from(grantBookmarks)
    .where(
      and(
        eq(grantBookmarks.userId, me.id),
        eq(grantBookmarks.grantId, grant.id),
      ),
    )
    .get();
  if (existing) {
    db.delete(grantBookmarks)
      .where(eq(grantBookmarks.id, existing.id))
      .run();
    return c.json({ bookmarked: false });
  }
  db.insert(grantBookmarks)
    .values({ id: randomUUID(), userId: me.id, grantId: grant.id })
    .run();
  return c.json({ bookmarked: true });
});

// Suppress unused-import warnings if linter trips on `gt` (kept for
// future deadline-window helpers).
void gt;
void like;
