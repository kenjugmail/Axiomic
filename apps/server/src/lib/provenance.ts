// Phase 31D — research-artifact provenance.
//
// Public, read-only attestation graph for a paper/article: who
// peer-verified a reproduction of it (minted only) and who
// completed a linked research bounty. Reproducer usernames are
// already public on the artifact pages — this just joins them
// into one queryable shape. Never 404 for "no provenance".

import { and, eq, inArray, isNotNull } from "drizzle-orm";
import {
  bountyClaims,
  getDb,
  reproductions,
  researchBounties,
  users,
} from "@axiomic/db";

export interface Provenance {
  target: { kind: string; id: string };
  reproducedBy: Array<{
    username: string;
    confirmedWeight: number | null;
    mintedAt: string;
  }>;
  bountyContributions: Array<{
    username: string;
    bountySlug: string;
    bountyTitle: string;
    acceptedAt: string;
  }>;
}

export function buildProvenance(
  targetKind: string,
  targetId: string,
): Provenance {
  const db = getDb();

  const repros = db
    .select({
      username: users.username,
      weight: reproductions.credentialMintWeight,
      mintedAt: reproductions.credentialMintedAt,
    })
    .from(reproductions)
    .innerJoin(users, eq(reproductions.reproducerId, users.id))
    .where(
      and(
        eq(reproductions.targetKind, targetKind),
        eq(reproductions.targetId, targetId),
        isNotNull(reproductions.credentialMintedAt),
      ),
    )
    .all();

  // Bounties linked to this artifact, then their accepted claims.
  const linkCol =
    targetKind === "research_paper"
      ? researchBounties.linkedPaperId
      : researchBounties.linkedArticleId;
  const linked = db
    .select({
      id: researchBounties.id,
      slug: researchBounties.slug,
      title: researchBounties.title,
    })
    .from(researchBounties)
    .where(eq(linkCol, targetId))
    .all();
  const bountyContributions: Provenance["bountyContributions"] = [];
  if (linked.length > 0) {
    const byId = new Map(linked.map((b) => [b.id, b]));
    const accepted = db
      .select({
        username: users.username,
        bountyId: bountyClaims.bountyId,
        acceptedAt: bountyClaims.claimedAt,
      })
      .from(bountyClaims)
      .innerJoin(users, eq(bountyClaims.userId, users.id))
      .where(
        and(
          inArray(
            bountyClaims.bountyId,
            linked.map((b) => b.id),
          ),
          eq(bountyClaims.status, "accepted"),
        ),
      )
      .all();
    for (const a of accepted) {
      const b = byId.get(a.bountyId);
      if (!b) continue;
      bountyContributions.push({
        username: a.username,
        bountySlug: b.slug,
        bountyTitle: b.title,
        acceptedAt: a.acceptedAt,
      });
    }
  }

  return {
    target: { kind: targetKind, id: targetId },
    reproducedBy: repros
      .filter((r) => r.mintedAt != null)
      .map((r) => ({
        username: r.username,
        confirmedWeight: r.weight,
        mintedAt: r.mintedAt as string,
      })),
    bountyContributions,
  };
}
