// Phase 29A — reviewer reputation weighting.
//
// Derives a trust weight per reviewer from the same signal the
// forum reputation surface uses: the summed value of community
// votes on every topic + post the reviewer has authored
// (mirrors voteScores() in routes/forum.ts, re-derived here so
// this module stays decoupled from the forum route — same
// pattern grantMatch.ts uses vs recommend.ts).
//
// The weight gates Phase 28B's reproduction credential: instead
// of a flat count of 2 'confirmed' verdicts, the credential
// mints when the SUM of confirming reviewers' weights crosses
// CONFIRM_WEIGHT_THRESHOLD. A floor keeps low/zero/negative-rep
// reviewers contributing; a ceiling stops any single reviewer
// soloing the mint.

import { and, eq, inArray, sql } from "drizzle-orm";
import { getDb, forumPosts, forumTopics, forumVotes } from "@axiomic/db";

// Tunable knobs (module-top so they can move without touching
// the summation loop — mirrors recommend.ts weight constants).
// Floor 1.5 is chosen so two baseline (zero-rep) reviewers sum to
// exactly the threshold (3.0) — i.e. the legacy "two ordinary
// reviewers mint on the 2nd confirm" behavior is preserved
// exactly, while reputation only ever *accelerates* the mint.
export const BASE_WEIGHT = 1.5;
export const REP_SCALE = 10; // reputation points per +1.0 bonus
export const MAX_WEIGHT = 2.5; // single-reviewer ceiling
// Replaces the old flat `confirmed >= 2`. Single-reviewer max
// (2.5) < threshold (3.0) ⇒ no solo-mint, ever. Two baseline
// reviewers (1.5 + 1.5) = 3.0 ⇒ mint, exactly like the old count.
export const CONFIRM_WEIGHT_THRESHOLD = 3.0;

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

export function reviewerWeight(reputation: number): number {
  return clamp(
    BASE_WEIGHT + Math.max(0, reputation) / REP_SCALE,
    BASE_WEIGHT,
    MAX_WEIGHT,
  );
}

// Batch: userId -> total forum reputation (sum of vote values on
// their authored topics + posts). Missing/never-voted users map
// to 0. One pass per subject type, no N+1.
export function getReviewerReputations(
  userIds: string[],
): Map<string, number> {
  const out = new Map<string, number>();
  for (const id of userIds) out.set(id, 0);
  if (userIds.length === 0) return out;
  const db = getDb();

  const topics = db
    .select({ id: forumTopics.id, authorId: forumTopics.authorId })
    .from(forumTopics)
    .where(inArray(forumTopics.authorId, userIds))
    .all();
  const posts = db
    .select({ id: forumPosts.id, authorId: forumPosts.authorId })
    .from(forumPosts)
    .where(inArray(forumPosts.authorId, userIds))
    .all();

  const topicAuthor = new Map(topics.map((t) => [t.id, t.authorId]));
  const postAuthor = new Map(posts.map((p) => [p.id, p.authorId]));

  const addVotes = (
    subjectType: "topic" | "post",
    ids: string[],
    owner: Map<string, string>,
  ) => {
    if (ids.length === 0) return;
    const rows = db
      .select({
        subjectId: forumVotes.subjectId,
        total: sql<number>`sum(${forumVotes.value})`.as("total"),
      })
      .from(forumVotes)
      .where(
        and(
          eq(forumVotes.subjectType, subjectType),
          inArray(forumVotes.subjectId, ids),
        ),
      )
      .groupBy(forumVotes.subjectId)
      .all();
    for (const r of rows) {
      const uid = owner.get(r.subjectId);
      if (!uid) continue;
      out.set(uid, (out.get(uid) ?? 0) + (r.total || 0));
    }
  };

  addVotes(
    "topic",
    topics.map((t) => t.id),
    topicAuthor,
  );
  addVotes(
    "post",
    posts.map((p) => p.id),
    postAuthor,
  );
  return out;
}

// Convenience: summed confirming-reviewer weight for a set of
// reviewer ids (used by the reproduction mint gate).
export function confirmedWeight(reviewerIds: string[]): number {
  if (reviewerIds.length === 0) return 0;
  const reps = getReviewerReputations(reviewerIds);
  let sum = 0;
  for (const id of reviewerIds) sum += reviewerWeight(reps.get(id) ?? 0);
  return sum;
}
