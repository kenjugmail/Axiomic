// Phase 34B — organization / institution accounts.
//
// The signing key stays per-instance; an org credential is the
// instance key signing on behalf of a NAMED issuer recorded in
// the manifest (no per-org keypair — honest + standards-valid via
// the Phase 33A did:web issuer). Membership/role mirrors
// cohortMembers + the gateCohort guard. Attestations also write a
// Phase 33B transparency leaf and surface in the member's wallet.

import { randomUUID } from "crypto";
import { and, eq, isNull } from "drizzle-orm";
import {
  getDb,
  orgAttestations,
  orgMembers,
  orgs,
  users,
} from "@axiomic/db";
import { signCredential, type SignedCredential } from "./signing";
import { appendCredentialEvent } from "./transparency";

export type OrgRole = "member" | "admin" | "verifier";

export interface OrgRow {
  id: string;
  slug: string;
  name: string;
  descriptionMd: string;
  website: string;
  verificationStatus: string;
  creatorId: string;
}

export function getOrg(slug: string): OrgRow | null {
  return (
    getDb()
      .select()
      .from(orgs)
      .where(eq(orgs.slug, slug))
      .get() ?? null
  );
}

export function memberRole(orgId: string, userId: string): OrgRole | null {
  const m = getDb()
    .select({ role: orgMembers.role })
    .from(orgMembers)
    .where(and(eq(orgMembers.orgId, orgId), eq(orgMembers.userId, userId)))
    .get();
  return (m?.role as OrgRole) ?? null;
}

const RANK: Record<OrgRole, number> = { member: 0, verifier: 1, admin: 2 };

// gateOrg — resolve the org + check the caller's role meets a
// minimum. Mirrors gateCohort's shape.
export function gateOrg(
  slug: string,
  userId: string | null,
  minRole: OrgRole | null,
):
  | { ok: true; org: OrgRow; role: OrgRole | null }
  | { ok: false; status: 404 | 401 | 403; error: string } {
  const org = getOrg(slug);
  if (!org) return { ok: false, status: 404, error: "Org not found" };
  if (!minRole) return { ok: true, org, role: userId ? memberRole(org.id, userId) : null };
  if (!userId) return { ok: false, status: 401, error: "Unauthorized" };
  const role = memberRole(org.id, userId);
  if (!role || RANK[role] < RANK[minRole]) {
    return { ok: false, status: 403, error: `Requires ${minRole} role` };
  }
  return { ok: true, org, role };
}

export function createOrg(
  creatorId: string,
  input: {
    slug: string;
    name: string;
    descriptionMd?: string;
    website?: string;
  },
): { ok: true; id: string } | { ok: false; conflict: true } {
  const db = getDb();
  const id = randomUUID();
  try {
    db.insert(orgs)
      .values({
        id,
        slug: input.slug,
        name: input.name,
        descriptionMd: input.descriptionMd ?? "",
        website: input.website ?? "",
        creatorId,
      })
      .run();
  } catch {
    return { ok: false, conflict: true };
  }
  db.insert(orgMembers)
    .values({
      id: randomUUID(),
      orgId: id,
      userId: creatorId,
      role: "admin",
    })
    .run();
  return { ok: true, id };
}

export type AttestKind =
  | "reproduction"
  | "bounty"
  | "skill"
  // Phase 39 — an org backing a mission attests an external
  // contributor's verified contribution. Unlike the others, the
  // contributor need NOT be an org member, so this kind is signed
  // via attestContribution() (no membership precondition).
  | "mission_contribution";

// Shared internals: sign on behalf of the named org, persist the
// attestation row, append a transparency leaf. Both attestForMember
// (membership-gated) and attestContribution (external-subject) call
// this so the signed bytes + log shape stay identical.
function issueOrgAttestation(
  org: OrgRow,
  attestedById: string,
  subjectUserId: string,
  attestKind: AttestKind,
  attestRef: string,
  statement: string,
): { id: string; signed: SignedCredential } {
  const db = getDb();
  const issuedAt = new Date().toISOString();
  const id = randomUUID();
  const signed = signCredential("org_attestation", {
    orgId: org.id,
    orgSlug: org.slug,
    orgName: org.name,
    issuer: `did:axiomic:org:${org.slug}`,
    subjectUserId,
    attestedById,
    attestKind,
    attestRef,
    statement,
    issuedAt,
  });
  db.insert(orgAttestations)
    .values({
      id,
      orgId: org.id,
      subjectUserId,
      attestedByUserId: attestedById,
      attestKind,
      attestRef,
      statement: statement.slice(0, 1000),
      signedJson: JSON.stringify(signed),
    })
    .run();
  appendCredentialEvent("issued", "org_attestation", id, {
    orgSlug: org.slug,
    subjectUserId,
    attestKind,
    attestRef,
    issuedAt,
  });
  return { id, signed };
}

// Verifier/admin attests a member's artifact. Signs on behalf of
// the named org + appends a transparency leaf. REQUIRES the subject
// to be a member of the org (the org is vouching for its own
// person).
export function attestForMember(
  org: OrgRow,
  attestedById: string,
  subjectUserId: string,
  attestKind: AttestKind,
  attestRef: string,
  statement: string,
): { ok: true; id: string; signed: SignedCredential } | { ok: false; error: string } {
  if (memberRole(org.id, subjectUserId) === null) {
    return { ok: false, error: "Subject is not a member of this org" };
  }
  const r = issueOrgAttestation(
    org,
    attestedById,
    subjectUserId,
    attestKind,
    attestRef,
    statement,
  );
  return { ok: true, id: r.id, signed: r.signed };
}

// Phase 39 — a backing org's verifier/admin attests an EXTERNAL
// mission contributor's verified contribution. Same signed bytes +
// transparency leaf as attestForMember, but WITHOUT the membership
// precondition (mission contributors are not org members). The
// caller (the missions route) enforces that the org actually backs
// the mission and the actor holds verifier/admin via gateOrg.
export function attestContribution(
  org: OrgRow,
  attestedById: string,
  subjectUserId: string,
  attestRef: string,
  statement: string,
): { ok: true; id: string; signed: SignedCredential } {
  const r = issueOrgAttestation(
    org,
    attestedById,
    subjectUserId,
    "mission_contribution",
    attestRef,
    statement,
  );
  return { ok: true, id: r.id, signed: r.signed };
}

export interface OrgAttestationView {
  id: string;
  orgSlug: string;
  orgName: string;
  attestKind: string;
  attestRef: string;
  statement: string;
  createdAt: string;
  signed: SignedCredential | null;
}

// Active org attestations of a user — for the wallet `org_attested`
// band + the org public verify page.
export function orgAttestationsForUser(
  subjectUserId: string,
): OrgAttestationView[] {
  return getDb()
    .select({
      id: orgAttestations.id,
      orgSlug: orgs.slug,
      orgName: orgs.name,
      attestKind: orgAttestations.attestKind,
      attestRef: orgAttestations.attestRef,
      statement: orgAttestations.statement,
      createdAt: orgAttestations.createdAt,
      signedJson: orgAttestations.signedJson,
    })
    .from(orgAttestations)
    .innerJoin(orgs, eq(orgAttestations.orgId, orgs.id))
    .where(
      and(
        eq(orgAttestations.subjectUserId, subjectUserId),
        isNull(orgAttestations.revokedAt),
      ),
    )
    .all()
    .map((r) => ({
      id: r.id,
      orgSlug: r.orgSlug,
      orgName: r.orgName,
      attestKind: r.attestKind,
      attestRef: r.attestRef,
      statement: r.statement,
      createdAt: r.createdAt,
      signed: r.signedJson ? (JSON.parse(r.signedJson) as SignedCredential) : null,
    }));
}

export function listOrgMembers(orgId: string) {
  return getDb()
    .select({
      username: users.username,
      displayName: users.displayName,
      role: orgMembers.role,
      joinedAt: orgMembers.joinedAt,
    })
    .from(orgMembers)
    .innerJoin(users, eq(orgMembers.userId, users.id))
    .where(eq(orgMembers.orgId, orgId))
    .all();
}
