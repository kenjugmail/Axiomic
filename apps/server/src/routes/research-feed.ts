// Sprint 70 — Researcher for-you feed.
//
// Returns three rails of research papers:
//
//   for_you   personalized via recommend.rankPapersForUser()
//   trending  recency × citation velocity, optionally filtered to the
//             user's own publication tags
//   from_follows  recent papers from authors the user follows
//
// Anonymous traffic gets the trending rail only — for_you and
// from_follows require sign-in to be useful. The route is intentionally
// chatty (three rails per call) so the client doesn't have to make
// three separate roundtrips on a cold load.

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { getDb, users } from "@axiomic/db";
import {
  rankFromFollows,
  rankPapersForUser,
  rankTrending,
  recordImpressions,
} from "../lib/recommend";
import type { RankedPaper } from "../lib/recommend";
import { buildFrontier } from "../lib/frontier";
import { getSessionUser } from "../middleware/auth";
import type { Env } from "../env";

export const researchFeedRouter = new Hono<Env>();

interface FeedItemPayload {
  // 'research' for internal papers; 'external_paper' for ingested
  // arXiv / OpenAlex / PubMed papers. The UI renders the same card
  // shape for both but routes the title differently (internal →
  // /research/:slug; external → htmlUrl in a new tab).
  kind: "research" | "external_paper";
  id: string;
  slug: string;
  title: string;
  // 'research'/'explainer'/'survey'/'opinion' for internal; the
  // upstream source name ('arxiv'/'openalex'/'pubmed') for external.
  format: string;
  snippet: string;
  citationCount: number;
  publishedAt: string;
  tags: string[];
  // Internal author username (when known); external papers always
  // null until S72 author-claims bridges them to internal users.
  authorUsername: string | null;
  // External-only fields. Null for internal papers.
  htmlUrl: string | null;
  doi: string | null;
  score: number;
  reason: string;
  breakdown: RankedPaper["breakdown"];
}

function authorUsernamesByIds(ids: string[]): Map<string, string> {
  if (ids.length === 0) return new Map();
  const db = getDb();
  const rows = db
    .select({ id: users.id, username: users.username })
    .from(users)
    .all();
  const wanted = new Set(ids);
  const map = new Map<string, string>();
  for (const r of rows) if (wanted.has(r.id)) map.set(r.id, r.username);
  return map;
}

function toPayload(
  ranked: RankedPaper[],
  authors: Map<string, string>,
): FeedItemPayload[] {
  return ranked.map((r) => {
    const p = r.paper;
    const isExternal = p.kind === "external_paper";
    return {
      kind: p.kind,
      id: p.id,
      slug: p.slug,
      title: p.title,
      format: isExternal ? p.source : p.format,
      snippet: p.snippet.slice(0, 240),
      citationCount: p.citationCount,
      publishedAt: p.publishedAt,
      tags: p.tags,
      authorUsername: isExternal
        ? null
        : authors.get(p.authorId) ?? null,
      htmlUrl: isExternal ? p.htmlUrl : null,
      doi: isExternal ? p.doi : null,
      score: Math.round(r.score * 1000) / 1000,
      reason: r.reason,
      breakdown: {
        ...r.breakdown,
        interestScore: Math.round(r.breakdown.interestScore * 1000) / 1000,
        queryAffinity: Math.round(r.breakdown.queryAffinity * 1000) / 1000,
        recencyDecay: Math.round(r.breakdown.recencyDecay * 1000) / 1000,
        citationBoost: Math.round(r.breakdown.citationBoost * 1000) / 1000,
        total: Math.round(r.breakdown.total * 1000) / 1000,
      },
    };
  });
}

researchFeedRouter.get(
  "/feed",
  zValidator(
    "query",
    z.object({
      perRail: z
        .string()
        .optional()
        .transform((v) =>
          Math.min(20, Math.max(1, parseInt(v ?? "8", 10) || 8)),
        ),
    }),
  ),
  async (c) => {
    const { perRail } = c.req.valid("query");
    const sessionUser = await getSessionUser(c);
    const userId = sessionUser?.id ?? null;

    const [forYou, trending, fromFollows] = await Promise.all([
      rankPapersForUser(userId, { limit: perRail, excludeOwnPapers: true }),
      rankTrending(userId, { limit: perRail }),
      userId ? rankFromFollows(userId, { limit: perRail }) : Promise.resolve([]),
    ]);

    const allAuthorIds = new Set<string>();
    for (const list of [forYou, trending, fromFollows]) {
      for (const r of list) {
        if (r.paper.kind === "research") allAuthorIds.add(r.paper.authorId);
      }
    }
    const authors = authorUsernamesByIds([...allAuthorIds]);

    // Record impressions for the for_you rail only — that's the rail
    // whose ranking depends on prior shown-state. Trending + follows
    // are deliberately not deduped across visits.
    if (userId) {
      recordImpressions(
        userId,
        forYou.map((r) => ({ kind: r.paper.kind, id: r.paper.id })),
      );
    }

    return c.json({
      personalized: Boolean(userId),
      rails: {
        for_you: toPayload(forYou, authors),
        trending: toPayload(trending, authors),
        from_follows: toPayload(fromFollows, authors),
      },
    });
  },
);

// Phase 29D — the fused research-frontier rail. Separate endpoint
// (not folded into /feed) so it's independently togglable and the
// /feed payload stays small. Anonymous callers get a non-empty
// recency/citation fallback via the underlying rankers.
researchFeedRouter.get(
  "/feed/frontier",
  zValidator(
    "query",
    z.object({
      limit: z
        .string()
        .optional()
        .transform((v) =>
          Math.min(40, Math.max(1, parseInt(v ?? "20", 10) || 20)),
        ),
    }),
  ),
  async (c) => {
    const { limit } = c.req.valid("query");
    const sessionUser = await getSessionUser(c);
    const result = await buildFrontier(sessionUser?.id ?? null, limit);
    return c.json(result);
  },
);
