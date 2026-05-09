// Sprint 71 — Grant↔researcher matching.
//
// For each grant, score = cosine(grantVec, userPubVec) * 0.7 +
// topicOverlap * 0.3. The user-pub vector is the same one S70's
// recommend.ts builds (mean of authored-paper embeddings); we
// rebuild it here rather than expose it from recommend.ts so the
// two surfaces stay decoupled (a future revision could persist the
// vector to `users.publication_corpus_vector_json` and read from
// either place).
//
// Reasons explain the match in plain language: which user topic
// overlaps + which grant snippet drove it. Used by the UI's "Why?"
// hint and by the email/notification fan-out.

import { eq } from "drizzle-orm";
import { getDb, grants, researchPapers } from "@axiomic/db";
import { getOrEmbed } from "./embeddingCache";
import { cosineSimilarity, getSearchIndex } from "./searchIndex";
import type { IndexedResearchPaper } from "./searchIndex";

const W_VECTOR = 0.7;
const W_TOPIC = 0.3;
const TITLE_BODY_MAX = 4000;

export interface GrantRow {
  id: string;
  source: string;
  sourceId: string;
  agency: string;
  title: string;
  summary: string;
  fullDescription: string;
  mechanism: string | null;
  amountCeiling: number | null;
  postedAt: string | null;
  deadlineAt: string | null;
  url: string;
  topics: string[];
}

export interface GrantMatch {
  grant: GrantRow;
  score: number;
  vectorScore: number;
  topicOverlap: number;
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

async function getUserPubVec(userId: string): Promise<number[] | null> {
  const items = await getSearchIndex();
  const my = items.filter(
    (it): it is IndexedResearchPaper =>
      it.kind === "research" && it.authorId === userId,
  );
  return meanVector(my.map((p) => p.vector));
}

function getUserTopicSet(userId: string): Set<string> {
  const db = getDb();
  const rows = db
    .select({ tags: researchPapers.tags })
    .from(researchPapers)
    .where(eq(researchPapers.authorId, userId))
    .all();
  const tags = new Set<string>();
  for (const r of rows) {
    try {
      const arr = JSON.parse(r.tags ?? "[]");
      if (Array.isArray(arr)) {
        for (const t of arr)
          if (typeof t === "string") tags.add(t.toLowerCase());
      }
    } catch {}
  }
  return tags;
}

export function loadGrantsForMatching(): GrantRow[] {
  const db = getDb();
  const rows = db.select().from(grants).all();
  return rows.map<GrantRow>((r) => ({
    id: r.id,
    source: r.source,
    sourceId: r.sourceId,
    agency: r.agency,
    title: r.title,
    summary: r.summary ?? "",
    fullDescription: r.fullDescription ?? "",
    mechanism: r.mechanism,
    amountCeiling: r.amountCeiling,
    postedAt: r.postedAt,
    deadlineAt: r.deadlineAt,
    url: r.url,
    topics: safeTopics(r.topicsJson),
  }));
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

function grantEmbeddingText(g: GrantRow): string {
  const parts = [g.title, g.summary, g.fullDescription];
  return parts.join(" ").slice(0, TITLE_BODY_MAX);
}

function buildReason(
  g: GrantRow,
  userTopics: Set<string>,
  vectorScore: number,
): string {
  const overlapping: string[] = [];
  for (const t of g.topics) {
    if (userTopics.has(t.toLowerCase())) overlapping.push(t);
  }
  if (overlapping.length > 0) {
    const list = overlapping.slice(0, 2).join(", ");
    return `Matches your work on ${list} (${g.agency}).`;
  }
  if (vectorScore > 0.45) {
    return `Closely matches the topics in your recent papers (${g.agency}).`;
  }
  if (vectorScore > 0.25) {
    return `Loosely matches your publication interests (${g.agency}).`;
  }
  return `Open call from ${g.agency}.`;
}

function topicOverlapFraction(
  grantTopics: string[],
  userTopics: Set<string>,
): number {
  if (grantTopics.length === 0 || userTopics.size === 0) return 0;
  let hits = 0;
  for (const t of grantTopics) if (userTopics.has(t.toLowerCase())) hits++;
  // Normalize by grant topic count so a grant tagged with one of
  // our topics scores high.
  return hits / grantTopics.length;
}

export interface MatchOptions {
  limit?: number;
  // Drops matches below this combined score. Default 0.15 — keeps
  // a long tail visible for serendipity but filters obvious noise.
  minScore?: number;
}

export async function matchGrantsForUser(
  userId: string,
  opts: MatchOptions = {},
): Promise<GrantMatch[]> {
  const userPubVec = await getUserPubVec(userId);
  const userTopics = getUserTopicSet(userId);
  if (!userPubVec && userTopics.size === 0) {
    // Cold-start user — fall back to upcoming-deadline ranking so
    // the panel is never empty.
    return rankByDeadline(opts);
  }

  const allGrants = loadGrantsForMatching();
  const matches: GrantMatch[] = [];
  for (const g of allGrants) {
    const text = grantEmbeddingText(g);
    if (!text.trim()) continue;
    let vectorScore = 0;
    if (userPubVec) {
      const grantVec = await getOrEmbed("grant", g.id, text);
      vectorScore = Math.max(0, cosineSimilarity(userPubVec, grantVec));
    }
    const topicOverlap = topicOverlapFraction(g.topics, userTopics);
    const score = W_VECTOR * vectorScore + W_TOPIC * topicOverlap;
    if (score < (opts.minScore ?? 0.15)) continue;
    matches.push({
      grant: g,
      score,
      vectorScore,
      topicOverlap,
      reason: buildReason(g, userTopics, vectorScore),
    });
  }
  matches.sort((a, b) => b.score - a.score);
  return matches.slice(0, opts.limit ?? 12);
}

// Cold-start fallback: rank by closest-upcoming deadline. Skips
// grants without a deadline + grants whose deadline has passed.
export function rankByDeadline(opts: MatchOptions = {}): GrantMatch[] {
  const all = loadGrantsForMatching();
  const now = Date.now();
  const upcoming = all
    .filter((g) => {
      if (!g.deadlineAt) return false;
      const t = Date.parse(g.deadlineAt);
      return Number.isFinite(t) && t > now;
    })
    .sort(
      (a, b) =>
        Date.parse(a.deadlineAt!) - Date.parse(b.deadlineAt!),
    );
  return upcoming.slice(0, opts.limit ?? 12).map((g) => ({
    grant: g,
    score: 0,
    vectorScore: 0,
    topicOverlap: 0,
    reason: `Upcoming deadline at ${g.agency}.`,
  }));
}

// Used by the SuggestedGrantsRail on a paper-detail page: match
// grants against the paper itself rather than the viewing user.
// Reuses the grant vectors but skips topic-overlap (the paper's
// tags are already in the embedding text).
export async function matchGrantsForPaperVector(
  paperVec: number[],
  opts: MatchOptions = {},
): Promise<GrantMatch[]> {
  const allGrants = loadGrantsForMatching();
  const matches: GrantMatch[] = [];
  for (const g of allGrants) {
    const text = grantEmbeddingText(g);
    if (!text.trim()) continue;
    const grantVec = await getOrEmbed("grant", g.id, text);
    const score = Math.max(0, cosineSimilarity(paperVec, grantVec));
    if (score < (opts.minScore ?? 0.18)) continue;
    matches.push({
      grant: g,
      score,
      vectorScore: score,
      topicOverlap: 0,
      reason: `Topic match with ${g.agency}.`,
    });
  }
  matches.sort((a, b) => b.score - a.score);
  return matches.slice(0, opts.limit ?? 5);
}
