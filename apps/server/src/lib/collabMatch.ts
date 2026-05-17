// Phase 30D — research collaboration matcher.
//
// The frontier feed is single-user and bounty claimants are
// hidden from each other. This pairs fellow (non-rejected,
// non-poster) claimants of the same bounty by overlapping
// weakness profiles so two people stuck on the same concept can
// co-work it in a shared room. Deterministic; no AI.

import { and, eq, ne } from "drizzle-orm";
import {
  bountyClaims,
  getDb,
  misconceptionDiagnoses,
  researchBounties,
  userProgress,
  users,
} from "@axiomic/db";
import {
  buildWeaknessProfile,
  prebuildWeaknessContext,
  type PrebuiltWeaknessContext,
} from "./studentWeaknesses";

const WEAK = 0.6;

function bootstrapTopicSlugs(
  userId: string,
  ctx: PrebuiltWeaknessContext,
): string[] {
  const db = getDb();
  const diag = db
    .select({ slug: misconceptionDiagnoses.conceptSlug })
    .from(misconceptionDiagnoses)
    .where(
      and(
        eq(misconceptionDiagnoses.userId, userId),
        eq(misconceptionDiagnoses.status, "active"),
      ),
    )
    .all()
    .map((r) => r.slug);
  const low: string[] = [];
  for (const r of db
    .select({ nodeId: userProgress.nodeId, q: userProgress.quizScore })
    .from(userProgress)
    .where(eq(userProgress.userId, userId))
    .all()) {
    if (r.q != null && r.q < WEAK) {
      const slug = ctx.nodeToSlug.get(r.nodeId);
      if (slug) low.push(slug);
    }
  }
  return [...new Set([...diag, ...low])];
}

async function weakSlugSet(
  userId: string,
  ctx: PrebuiltWeaknessContext,
): Promise<{ slugs: Set<string>; titles: Map<string, string> }> {
  const topicSlugs = bootstrapTopicSlugs(userId, ctx);
  if (topicSlugs.length === 0) {
    return { slugs: new Set(), titles: new Map() };
  }
  const profile = await buildWeaknessProfile(
    { userId, topicSlugs, level: null, maxTopics: 12 },
    ctx,
  );
  return {
    slugs: new Set(profile.topics.map((t) => t.conceptSlug)),
    titles: new Map(
      profile.topics.map((t) => [t.conceptSlug, t.conceptTitle ?? t.conceptSlug]),
    ),
  };
}

export interface Collaborator {
  username: string;
  displayName: string | null;
  overlapScore: number;
  sharedConcepts: Array<{ slug: string; title: string }>;
  reason: string;
}

// All non-rejected, non-poster co-claimants (excluding the
// caller) with a shared-weakness snippet. No ranking — the
// roster the bounty UI hides today, deliberately exposed to
// fellow claimants.
export async function listCollaborators(
  bountyId: string,
  callerId: string,
): Promise<Collaborator[]> {
  const ranked = await rankCollaborators(bountyId, callerId, 100);
  return ranked;
}

export async function rankCollaborators(
  bountyId: string,
  callerId: string,
  limit = 3,
): Promise<Collaborator[]> {
  const db = getDb();
  const bounty = db
    .select({ posterId: researchBounties.posterId })
    .from(researchBounties)
    .where(eq(researchBounties.id, bountyId))
    .get();
  if (!bounty) return [];

  const peers = db
    .select({
      userId: bountyClaims.userId,
      username: users.username,
      displayName: users.displayName,
      status: bountyClaims.status,
    })
    .from(bountyClaims)
    .innerJoin(users, eq(bountyClaims.userId, users.id))
    .where(
      and(
        eq(bountyClaims.bountyId, bountyId),
        ne(bountyClaims.userId, callerId),
        ne(bountyClaims.status, "rejected"),
      ),
    )
    .all()
    .filter((p) => p.userId !== bounty.posterId);
  if (peers.length === 0) return [];

  const ctx = prebuildWeaknessContext();
  const mine = await weakSlugSet(callerId, ctx);

  const out: Collaborator[] = [];
  for (const p of peers) {
    const theirs = await weakSlugSet(p.userId, ctx);
    const inter: string[] = [];
    for (const s of mine.slugs) if (theirs.slugs.has(s)) inter.push(s);
    const unionSize = new Set([...mine.slugs, ...theirs.slugs]).size;
    const jaccard = unionSize === 0 ? 0 : inter.length / unionSize;
    const shared = inter.map((s) => ({
      slug: s,
      title: mine.titles.get(s) ?? theirs.titles.get(s) ?? s,
    }));
    out.push({
      username: p.username,
      displayName: p.displayName,
      overlapScore: Math.round(jaccard * 1000) / 1000,
      sharedConcepts: shared.slice(0, 5),
      reason:
        shared.length > 0
          ? `both working on ${shared[0]!.title}`
          : "fellow claimant on this bounty",
    });
  }
  out.sort(
    (a, b) =>
      b.overlapScore - a.overlapScore ||
      b.sharedConcepts.length - a.sharedConcepts.length,
  );
  return out.slice(0, limit);
}
