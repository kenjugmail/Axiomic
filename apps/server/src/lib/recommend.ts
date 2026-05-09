// Sprint 70 — Researcher for-you ranker.
//
// Builds a per-user interest vector + recent-query bias vector, then
// scores every published research paper in the search index against
// them. Returns ranked items with a transparent score breakdown so the
// "Why this was recommended?" popover can show the user exactly why.
//
// Inputs gathered from the DB on each call (cheap at our scale):
//
//   - researchPapers authored by the user → mean of their vectors
//     becomes `userPubVec`. Captures the user's existing publication
//     history.
//   - Last N searches by the user → mean of query embeddings becomes
//     `recentQueryVec`. Captures what the user is currently
//     thinking about.
//   - userFollows: the set of authors the user has followed → used for
//     authorOverlap boost when a candidate paper's author is followed.
//   - feedImpressions: papers we've already shown the user → demoted
//     to keep the feed fresh across visits.
//
// Score components (each in roughly the [0,1] range so the weighted
// sum stays interpretable):
//
//   interestScore  = cosine(userPubVec, paperVec)        weight 0.45
//   queryAffinity  = cosine(recentQueryVec, paperVec)    weight 0.20
//   authorOverlap  = 1 if author is followed else 0      weight 0.15
//   recencyDecay   = exp(-ageDays / 60)                  weight 0.10
//   citationBoost  = log10(citations + 1) / 3, capped 1  weight 0.10
//   alreadyShown   = -0.20 if shown in last 14 days
//
// All weights live as named constants so they can be tweaked without
// chasing through the scoring loop.

import { and, desc, eq, gt, sql } from "drizzle-orm";
import { getAIProvider } from "@axiomic/ai";
import {
  feedImpressions,
  getDb,
  researchPapers,
  searches,
  userFollows,
} from "@axiomic/db";
import { cosineSimilarity, getSearchIndex } from "./searchIndex";
import type { IndexedResearchPaper } from "./searchIndex";

const W_INTEREST = 0.45;
const W_QUERY = 0.2;
const W_AUTHOR = 0.15;
const W_RECENCY = 0.1;
const W_CITATIONS = 0.1;
const ALREADY_SHOWN_PENALTY = 0.2;
const RECENT_QUERIES = 30;
const RECENT_IMPRESSIONS_DAYS = 14;
const RECENCY_HALFLIFE_DAYS = 60;

export interface ScoreBreakdown {
  interestScore: number;
  queryAffinity: number;
  authorOverlap: number;
  recencyDecay: number;
  citationBoost: number;
  alreadyShown: boolean;
  total: number;
}

export interface RankedPaper {
  paper: IndexedResearchPaper;
  score: number;
  breakdown: ScoreBreakdown;
  // Human-readable explanation for the "Why?" popover. Built from the
  // top contributing components so every user-visible reason
  // corresponds to a real number in `breakdown`.
  reason: string;
}

function meanVector(vectors: number[][]): number[] | null {
  if (vectors.length === 0) return null;
  const dim = vectors[0].length;
  const out = new Array<number>(dim).fill(0);
  for (const v of vectors) {
    if (v.length !== dim) continue;
    for (let i = 0; i < dim; i++) out[i] += v[i];
  }
  for (let i = 0; i < dim; i++) out[i] /= vectors.length;
  return out;
}

async function buildUserPubVector(userId: string): Promise<number[] | null> {
  const items = await getSearchIndex();
  const userPapers = items.filter(
    (it): it is IndexedResearchPaper =>
      it.kind === "research" && it.authorId === userId,
  );
  return meanVector(userPapers.map((p) => p.vector));
}

async function buildRecentQueryVector(
  userId: string,
): Promise<number[] | null> {
  const db = getDb();
  const rows = db
    .select({ query: searches.query })
    .from(searches)
    .where(eq(searches.userId, userId))
    .orderBy(desc(searches.createdAt))
    .limit(RECENT_QUERIES)
    .all();
  if (rows.length === 0) return null;
  const provider = getAIProvider();
  const seen = new Set<string>();
  const vecs: number[][] = [];
  for (const r of rows) {
    const q = r.query.trim().toLowerCase();
    if (!q || seen.has(q)) continue;
    seen.add(q);
    try {
      vecs.push(await provider.embed(r.query));
    } catch {
      // Skip a single failed embedding rather than failing the feed.
    }
  }
  return meanVector(vecs);
}

function getFollowedAuthorIds(userId: string): Set<string> {
  const db = getDb();
  const rows = db
    .select({ id: userFollows.followeeId })
    .from(userFollows)
    .where(eq(userFollows.followerId, userId))
    .all();
  return new Set(rows.map((r) => r.id));
}

function getRecentImpressionKeys(userId: string): Set<string> {
  const db = getDb();
  const cutoffMs = Date.now() - RECENT_IMPRESSIONS_DAYS * 86400_000;
  const cutoffIso = new Date(cutoffMs).toISOString().slice(0, 19).replace("T", " ");
  const rows = db
    .select({ paperKind: feedImpressions.paperKind, paperId: feedImpressions.paperId })
    .from(feedImpressions)
    .where(
      and(
        eq(feedImpressions.userId, userId),
        gt(feedImpressions.shownAt, cutoffIso),
      ),
    )
    .all();
  return new Set(rows.map((r) => `${r.paperKind}:${r.paperId}`));
}

function ageDaysFromIso(iso: string): number {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return 365;
  return Math.max(0, (Date.now() - t) / 86400_000);
}

function recencyScore(ageDays: number): number {
  // Exponential decay; ageDays=0 → 1.0, ageDays=60 → ~0.37.
  return Math.exp(-ageDays / RECENCY_HALFLIFE_DAYS);
}

function citationScore(citationCount: number): number {
  if (citationCount <= 0) return 0;
  return Math.min(1, Math.log10(citationCount + 1) / 3);
}

function buildReason(breakdown: ScoreBreakdown): string {
  const parts: { label: string; weight: number }[] = [];
  if (breakdown.interestScore > 0.25) {
    parts.push({
      label: "matches your publication topics",
      weight: breakdown.interestScore * W_INTEREST,
    });
  }
  if (breakdown.queryAffinity > 0.25) {
    parts.push({
      label: "relates to your recent searches",
      weight: breakdown.queryAffinity * W_QUERY,
    });
  }
  if (breakdown.authorOverlap > 0) {
    parts.push({ label: "by an author you follow", weight: W_AUTHOR });
  }
  if (breakdown.citationBoost > 0.5) {
    parts.push({
      label: "highly cited",
      weight: breakdown.citationBoost * W_CITATIONS,
    });
  }
  if (breakdown.recencyDecay > 0.7) {
    parts.push({
      label: "recently published",
      weight: breakdown.recencyDecay * W_RECENCY,
    });
  }
  if (parts.length === 0) {
    return "Surfaced as a general-interest paper for your feed.";
  }
  parts.sort((a, b) => b.weight - a.weight);
  const top = parts.slice(0, 2).map((p) => p.label);
  return top.length === 1
    ? `Recommended because it ${top[0]}.`
    : `Recommended because it ${top[0]} and ${top[1]}.`;
}

export interface RankOptions {
  limit?: number;
  // When set, the user has not signed in. Returns popular-recent
  // papers without personalization.
  anonymous?: boolean;
  // When true, skip authoredByUser papers (researchers shouldn't see
  // their own papers in their for-you rail).
  excludeOwnPapers?: boolean;
}

// Anonymous fallback — pure citation + recency, no per-user signals.
async function rankAnonymous(opts: RankOptions): Promise<RankedPaper[]> {
  const items = await getSearchIndex();
  const papers = items.filter(
    (it): it is IndexedResearchPaper => it.kind === "research",
  );
  const ranked = papers.map<RankedPaper>((p) => {
    const ageDays = ageDaysFromIso(p.publishedAt);
    const recency = recencyScore(ageDays);
    const citations = citationScore(p.citationCount);
    const total = W_RECENCY * recency + W_CITATIONS * citations;
    const breakdown: ScoreBreakdown = {
      interestScore: 0,
      queryAffinity: 0,
      authorOverlap: 0,
      recencyDecay: recency,
      citationBoost: citations,
      alreadyShown: false,
      total,
    };
    return {
      paper: p,
      score: total,
      breakdown,
      reason: buildReason(breakdown),
    };
  });
  ranked.sort((a, b) => b.score - a.score);
  return ranked.slice(0, opts.limit ?? 20);
}

export async function rankPapersForUser(
  userId: string | null,
  opts: RankOptions = {},
): Promise<RankedPaper[]> {
  if (!userId || opts.anonymous) {
    return rankAnonymous(opts);
  }

  const [items, userPubVec, recentQueryVec] = await Promise.all([
    getSearchIndex(),
    buildUserPubVector(userId),
    buildRecentQueryVector(userId),
  ]);
  const followedAuthors = getFollowedAuthorIds(userId);
  const recentImpressionKeys = getRecentImpressionKeys(userId);

  const candidates = items.filter(
    (it): it is IndexedResearchPaper => it.kind === "research",
  );

  const ranked: RankedPaper[] = [];
  for (const paper of candidates) {
    if (opts.excludeOwnPapers && paper.authorId === userId) continue;

    const interestScore = userPubVec
      ? Math.max(0, cosineSimilarity(userPubVec, paper.vector))
      : 0;
    const queryAffinity = recentQueryVec
      ? Math.max(0, cosineSimilarity(recentQueryVec, paper.vector))
      : 0;
    const authorOverlap = followedAuthors.has(paper.authorId) ? 1 : 0;
    const recencyDecay = recencyScore(ageDaysFromIso(paper.publishedAt));
    const citationBoost = citationScore(paper.citationCount);
    const alreadyShown = recentImpressionKeys.has(`research:${paper.id}`);

    const total =
      W_INTEREST * interestScore +
      W_QUERY * queryAffinity +
      W_AUTHOR * authorOverlap +
      W_RECENCY * recencyDecay +
      W_CITATIONS * citationBoost +
      (alreadyShown ? -ALREADY_SHOWN_PENALTY : 0);

    const breakdown: ScoreBreakdown = {
      interestScore,
      queryAffinity,
      authorOverlap,
      recencyDecay,
      citationBoost,
      alreadyShown,
      total,
    };
    ranked.push({
      paper,
      score: total,
      breakdown,
      reason: buildReason(breakdown),
    });
  }

  ranked.sort((a, b) => b.score - a.score);
  return ranked.slice(0, opts.limit ?? 20);
}

// Used by /research/feed to mark items as shown so the next request
// demotes them. Best-effort writes; failure does not break the
// response.
export function recordImpressions(
  userId: string,
  items: Array<{ kind: string; id: string }>,
): void {
  if (items.length === 0) return;
  const db = getDb();
  for (const it of items) {
    try {
      db.insert(feedImpressions)
        .values({
          id: crypto.randomUUID(),
          userId,
          paperKind: it.kind,
          paperId: it.id,
        })
        .run();
    } catch {
      // Swallow — a constraint failure here doesn't matter for ranking.
    }
  }
  // Trim per-user impressions to ~500 most recent so the table doesn't
  // grow without bound.
  try {
    const cutoff = db
      .select({ shownAt: feedImpressions.shownAt })
      .from(feedImpressions)
      .where(eq(feedImpressions.userId, userId))
      .orderBy(desc(feedImpressions.shownAt))
      .limit(1)
      .offset(500)
      .get();
    if (cutoff) {
      db.delete(feedImpressions)
        .where(
          and(
            eq(feedImpressions.userId, userId),
            sql`${feedImpressions.shownAt} <= ${cutoff.shownAt}`,
          ),
        )
        .run();
    }
  } catch {
    // Trim failure is fine.
  }
}

// Trending — papers with high citation velocity over a 30-day window.
// Used by the "Trending in your field" rail. When userId is provided
// we filter to papers whose tags overlap with the user's interest tags
// (mean of their authored papers' tags); otherwise it's a global rail.
export async function rankTrending(
  userId: string | null,
  opts: RankOptions = {},
): Promise<RankedPaper[]> {
  const items = await getSearchIndex();
  const papers = items.filter(
    (it): it is IndexedResearchPaper => it.kind === "research",
  );

  let userTags: Set<string> | null = null;
  if (userId) {
    const db = getDb();
    const myPapers = db
      .select({ tags: researchPapers.tags })
      .from(researchPapers)
      .where(eq(researchPapers.authorId, userId))
      .all();
    const tags = new Set<string>();
    for (const p of myPapers) {
      try {
        const arr = JSON.parse(p.tags ?? "[]");
        if (Array.isArray(arr)) {
          for (const t of arr) if (typeof t === "string") tags.add(t.toLowerCase());
        }
      } catch {}
    }
    if (tags.size > 0) userTags = tags;
  }

  const filtered = userTags
    ? papers.filter((p) =>
        p.tags.some((t) => userTags!.has(t.toLowerCase())),
      )
    : papers;

  // Trending = recency * citationCount (citation velocity proxy).
  const ranked = filtered.map<RankedPaper>((p) => {
    const ageDays = ageDaysFromIso(p.publishedAt);
    const recency = recencyScore(ageDays);
    const citations = citationScore(p.citationCount);
    const total = recency * Math.max(0.1, citations);
    const breakdown: ScoreBreakdown = {
      interestScore: 0,
      queryAffinity: 0,
      authorOverlap: 0,
      recencyDecay: recency,
      citationBoost: citations,
      alreadyShown: false,
      total,
    };
    return {
      paper: p,
      score: total,
      breakdown,
      reason:
        userTags && p.tags.length > 0
          ? `Trending in ${p.tags[0]}.`
          : "Trending across the platform.",
    };
  });
  ranked.sort((a, b) => b.score - a.score);
  return ranked.slice(0, opts.limit ?? 12);
}

// Papers from authors a user follows, ordered by recency. Used by the
// "From people you follow" rail.
export async function rankFromFollows(
  userId: string,
  opts: RankOptions = {},
): Promise<RankedPaper[]> {
  const followed = getFollowedAuthorIds(userId);
  if (followed.size === 0) return [];
  const items = await getSearchIndex();
  const papers = items.filter(
    (it): it is IndexedResearchPaper =>
      it.kind === "research" && followed.has(it.authorId),
  );
  const ranked = papers.map<RankedPaper>((p) => {
    const ageDays = ageDaysFromIso(p.publishedAt);
    const recency = recencyScore(ageDays);
    const breakdown: ScoreBreakdown = {
      interestScore: 0,
      queryAffinity: 0,
      authorOverlap: 1,
      recencyDecay: recency,
      citationBoost: 0,
      alreadyShown: false,
      total: recency,
    };
    return {
      paper: p,
      score: recency,
      breakdown,
      reason: "From an author you follow.",
    };
  });
  ranked.sort((a, b) => b.score - a.score);
  return ranked.slice(0, opts.limit ?? 12);
}
