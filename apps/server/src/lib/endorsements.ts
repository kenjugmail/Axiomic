// Phase 33C — signed, competency-weighted peer skill endorsements.
//
// Unlike LinkedIn's flat endorsements, an Axiomic endorsement is
// only worth something if the ENDORSER has themselves proven the
// skill: weightAtEndorsement is a snapshot of the endorser's own
// signed-credential proof on that slug (userSkillIndex) amplified
// by their reviewer reputation. A no-proof endorser contributes
// exactly 0, so Sybil endorsement rings are worthless. Each
// endorsement is Ed25519-signed. This is a SEPARATE web-of-trust
// band — it never mutates userSkillIndex.proofCount.

import { randomUUID } from "crypto";
import { and, eq, isNull } from "drizzle-orm";
import {
  getDb,
  skillEndorsements,
  userSkillIndex,
  users,
} from "@axiomic/db";
import { getReviewerReputations } from "./reviewerTrust";
import { signCredential, type SignedCredential } from "./signing";

// Module-top knobs (mirrors the compositeScore/reviewerTrust
// constant convention).
export const ENDORSE_PROOF_SATURATION = 3; // proofs → full proof factor
export const ENDORSE_REP_SATURATION = 50; // reviewer rep → full bonus
export const MAX_ENDORSE_WEIGHT = 1.0;

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

// The endorser's standing on THIS skill, at endorsement time.
// proofN === 0 (no signed credential proving the skill) ⇒ 0,
// regardless of reputation — reputation only amplifies someone
// who has actually proven it.
export function endorserWeight(
  endorserId: string,
  skillSlug: string,
): number {
  const proof = getDb()
    .select({ proofCount: userSkillIndex.proofCount })
    .from(userSkillIndex)
    .where(
      and(
        eq(userSkillIndex.userId, endorserId),
        eq(userSkillIndex.skillSlug, skillSlug),
      ),
    )
    .get();
  const proofN = clamp01((proof?.proofCount ?? 0) / ENDORSE_PROOF_SATURATION);
  if (proofN === 0) return 0;
  const rep = getReviewerReputations([endorserId]).get(endorserId) ?? 0;
  const repN = clamp01(Math.max(0, rep) / ENDORSE_REP_SATURATION);
  const w = proofN * (0.7 + 0.3 * repN) * MAX_ENDORSE_WEIGHT;
  return Math.round(w * 100) / 100;
}

export interface CreatedEndorsement {
  id: string;
  weight: number;
  signed: SignedCredential;
}

export function createEndorsement(
  endorserId: string,
  endorseeId: string,
  skillSlug: string,
  skillTitle: string,
  note: string,
): { ok: true; value: CreatedEndorsement } | { ok: false; conflict: true } {
  const db = getDb();
  const weight = endorserWeight(endorserId, skillSlug);
  const issuedAt = new Date().toISOString();
  const signed = signCredential("skill_endorsement", {
    endorserId,
    endorseeId,
    skillSlug,
    skillTitle,
    weight,
    issuedAt,
  });
  const id = randomUUID();
  try {
    db.insert(skillEndorsements)
      .values({
        id,
        endorserId,
        endorseeId,
        skillSlug,
        skillTitle,
        weightAtEndorsement: weight,
        note: note.slice(0, 280),
        signedJson: JSON.stringify(signed),
      })
      .run();
  } catch {
    return { ok: false, conflict: true };
  }
  return { ok: true, value: { id, weight, signed } };
}

export function revokeEndorsement(id: string, endorserId: string): boolean {
  const r = getDb()
    .update(skillEndorsements)
    .set({ revokedAt: new Date().toISOString() })
    .where(
      and(
        eq(skillEndorsements.id, id),
        eq(skillEndorsements.endorserId, endorserId),
        isNull(skillEndorsements.revokedAt),
      ),
    )
    .run();
  return ((r as unknown as { changes?: number }).changes ?? 0) > 0;
}

export interface EndorsementSkillGroup {
  skillSlug: string;
  skillTitle: string;
  totalWeight: number;
  endorsements: Array<{
    endorserUsername: string;
    endorserDisplayName: string | null;
    weight: number;
    note: string;
    createdAt: string;
  }>;
}

// Active endorsements for a user, grouped by skill, ranked by
// summed endorser weight. This is the web-of-trust band the
// wallet/skills pages render — clearly separate from signed proof.
export function endorsementsForUser(
  endorseeId: string,
): EndorsementSkillGroup[] {
  const rows = getDb()
    .select({
      skillSlug: skillEndorsements.skillSlug,
      skillTitle: skillEndorsements.skillTitle,
      weight: skillEndorsements.weightAtEndorsement,
      note: skillEndorsements.note,
      createdAt: skillEndorsements.createdAt,
      endorserUsername: users.username,
      endorserDisplayName: users.displayName,
    })
    .from(skillEndorsements)
    .innerJoin(users, eq(skillEndorsements.endorserId, users.id))
    .where(
      and(
        eq(skillEndorsements.endorseeId, endorseeId),
        isNull(skillEndorsements.revokedAt),
      ),
    )
    .all();
  const bySlug = new Map<string, EndorsementSkillGroup>();
  for (const r of rows) {
    let g = bySlug.get(r.skillSlug);
    if (!g) {
      g = {
        skillSlug: r.skillSlug,
        skillTitle: r.skillTitle || r.skillSlug,
        totalWeight: 0,
        endorsements: [],
      };
      bySlug.set(r.skillSlug, g);
    }
    g.totalWeight = Math.round((g.totalWeight + r.weight) * 100) / 100;
    g.endorsements.push({
      endorserUsername: r.endorserUsername,
      endorserDisplayName: r.endorserDisplayName,
      weight: r.weight,
      note: r.note,
      createdAt: r.createdAt,
    });
  }
  return [...bySlug.values()].sort((a, b) => b.totalWeight - a.totalWeight);
}
