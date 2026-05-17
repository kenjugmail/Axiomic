// Phase 39 — public mission impact graph.
//
// Clone of provenance.ts's buildProvenance shape: a public,
// read-only attestation graph for a Mission. Surfaces every
// peer/expert-verified, non-revoked contribution grouped by
// contributor (with the confirmed reviewer weight that minted it),
// the backing-org attestations on those contributions, and the
// solved-sub-problem counts. Never 404s for "no impact" — a fresh
// mission returns empty arrays.
//
// A refuted-then-revoked contribution is no longer a verified
// contribution, so (exactly like buildProvenance drops a revoked
// reproduction) it is filtered out via the shared revokedKeySet().

import { and, eq, inArray, isNotNull } from "drizzle-orm";
import {
  getDb,
  missionContributions,
  missionSubproblems,
  missions,
  orgAttestations,
  users,
} from "@axiomic/db";
import { revokedKeySet, revocationKey } from "./revocation";

export interface MissionImpact {
  mission: {
    slug: string;
    title: string;
    theme: string;
    status: string;
  };
  // Verified, non-revoked contributions grouped by contributor.
  verifiedContributions: Array<{
    username: string;
    kind: string;
    contributionId: string;
    confirmedWeight: number | null;
    mintedAt: string;
  }>;
  // Org attestations on those verified contributions.
  orgAttestations: Array<{
    orgSlug: string;
    contributionId: string;
    statement: string;
    createdAt: string;
  }>;
  // Sub-problem progress rollup.
  subproblems: {
    total: number;
    solved: number;
    inProgress: number;
    open: number;
  };
}

// Build the impact graph for a mission id. The slug is looked up so
// the public payload carries the human-facing identifier.
export function buildMissionImpact(missionId: string): MissionImpact | null {
  const db = getDb();
  const mission = db
    .select({
      slug: missions.slug,
      title: missions.title,
      theme: missions.theme,
      status: missions.status,
    })
    .from(missions)
    .where(eq(missions.id, missionId))
    .get();
  if (!mission) return null;

  const minted = db
    .select({
      id: missionContributions.id,
      username: users.username,
      kind: missionContributions.kind,
      weight: missionContributions.credentialMintWeight,
      mintedAt: missionContributions.credentialMintedAt,
    })
    .from(missionContributions)
    .innerJoin(users, eq(missionContributions.userId, users.id))
    .where(
      and(
        eq(missionContributions.missionId, missionId),
        isNotNull(missionContributions.credentialMintedAt),
      ),
    )
    .all();

  // Phase 32A parity — a refuted-then-revoked contribution is no
  // longer verified; drop it from the public attestation.
  const revoked = revokedKeySet();
  const verifiedContributions = minted
    .filter(
      (r) =>
        r.mintedAt != null &&
        !revoked.has(revocationKey("mission_contribution", r.id)),
    )
    .map((r) => ({
      username: r.username,
      kind: r.kind,
      contributionId: r.id,
      confirmedWeight: r.weight,
      mintedAt: r.mintedAt as string,
    }));

  // Org attestations scoped to the still-verified contributions.
  const verifiedIds = verifiedContributions.map((v) => v.contributionId);
  const attestations: MissionImpact["orgAttestations"] = [];
  if (verifiedIds.length > 0) {
    const rows = db
      .select({
        orgSlug: orgAttestations.orgId,
        attestRef: orgAttestations.attestRef,
        statement: orgAttestations.statement,
        createdAt: orgAttestations.createdAt,
        signedJson: orgAttestations.signedJson,
      })
      .from(orgAttestations)
      .where(
        and(
          eq(orgAttestations.attestKind, "mission_contribution"),
          inArray(orgAttestations.attestRef, verifiedIds),
        ),
      )
      .all();
    // attestRef is the contributionId; resolve orgSlug from the
    // signed manifest (the org slug is part of the signed bytes).
    for (const r of rows) {
      let orgSlug = "";
      try {
        const parsed = JSON.parse(r.signedJson) as {
          manifest?: { orgSlug?: unknown };
        };
        if (typeof parsed.manifest?.orgSlug === "string") {
          orgSlug = parsed.manifest.orgSlug;
        }
      } catch {
        orgSlug = "";
      }
      attestations.push({
        orgSlug,
        contributionId: r.attestRef,
        statement: r.statement,
        createdAt: r.createdAt,
      });
    }
  }

  const subs = db
    .select({ status: missionSubproblems.status })
    .from(missionSubproblems)
    .where(eq(missionSubproblems.missionId, missionId))
    .all();
  const solved = subs.filter((s) => s.status === "solved").length;
  const inProgress = subs.filter((s) => s.status === "in_progress").length;
  const open = subs.filter((s) => s.status === "open").length;

  return {
    mission: {
      slug: mission.slug,
      title: mission.title,
      theme: mission.theme,
      status: mission.status,
    },
    verifiedContributions,
    orgAttestations: attestations,
    subproblems: {
      total: subs.length,
      solved,
      inProgress,
      open,
    },
  };
}
