// Phase 32A — verifiable credential revocation registry.
//
// Signing + /api/v1/keys/verify are UNCHANGED. This is an additive,
// issuer-asserted layer modelled on a real-world CRL/OCSP: the
// ed25519 signature on a credential still verifies `valid:true`
// forever, but the issuer can separately mark the underlying claim
// revoked (e.g. a reproduction that gets *refuted* after its
// credential was minted, or an admin pulling a disputed credential).
//
// One row per (kind, ref), toggled via `active` so an over-turned
// refute can un-revoke without losing the audit trail. Wallet,
// provenance, the Axiomic Score, /keys/verify, and the public
// revocations feed all consult this table — nothing reads the
// signed bytes. Revocations are rare, so callers that need many
// at once use the small whole-table snapshot (revokedKeySet()).

import { randomUUID } from "crypto";
import { and, eq } from "drizzle-orm";
import { credentialRevocations, getDb } from "@axiomic/db";

// Symmetric with reproductions' CONFIRM_WEIGHT_THRESHOLD (3.0): it
// takes as much summed reviewer trust to revoke a minted
// reproduction credential as it took to mint it. Module-top so it
// tunes without touching the refute path.
export const REFUTE_WEIGHT_THRESHOLD = 3.0;

export type CredentialKind =
  | "reproduction"
  | "bounty"
  | "composite_score"
  | "capstone";

export function revocationKey(kind: string, ref: string): string {
  return `${kind}:${ref}`;
}

export interface RevocationRow {
  active: boolean;
  reason: string;
  revokedAt: string;
}

// Single-credential lookup. Returns null when there has never been
// a revocation row, or when the row exists but is inactive
// (un-revoked) — callers treat both as "not revoked".
export function getRevocation(
  kind: string,
  ref: string,
): RevocationRow | null {
  const row = getDb()
    .select({
      active: credentialRevocations.active,
      reason: credentialRevocations.reason,
      revokedAt: credentialRevocations.revokedAt,
    })
    .from(credentialRevocations)
    .where(
      and(
        eq(credentialRevocations.credentialKind, kind),
        eq(credentialRevocations.credentialRef, ref),
      ),
    )
    .get();
  if (!row || !row.active) return null;
  return { active: true, reason: row.reason, revokedAt: row.revokedAt };
}

export function isRevoked(kind: string, ref: string): boolean {
  return getRevocation(kind, ref) !== null;
}

// Whole-table snapshot of currently-active revocations as a
// `${kind}:${ref}` Set. Cheap (revocations are rare) and lets
// buildWallet annotate every item with zero N+1.
export function revokedKeySet(): Set<string> {
  const rows = getDb()
    .select({
      kind: credentialRevocations.credentialKind,
      ref: credentialRevocations.credentialRef,
    })
    .from(credentialRevocations)
    .where(eq(credentialRevocations.active, true))
    .all();
  return new Set(rows.map((r) => revocationKey(r.kind, r.ref)));
}

export interface PublicRevocation {
  credentialKind: string;
  credentialRef: string;
  reason: string;
  revokedAt: string;
}

// Public, externally-checkable feed: any third party that cached a
// credential offline can poll this to learn it was revoked.
export function listActiveRevocations(): PublicRevocation[] {
  return getDb()
    .select({
      credentialKind: credentialRevocations.credentialKind,
      credentialRef: credentialRevocations.credentialRef,
      reason: credentialRevocations.reason,
      revokedAt: credentialRevocations.revokedAt,
    })
    .from(credentialRevocations)
    .where(eq(credentialRevocations.active, true))
    .all();
}

// Idempotent upsert: re-revoking refreshes the reason; un-revoking
// then re-revoking flips `active` back on rather than stacking
// rows. `byUserId` null = system (auto-revoke on refute weight).
export function revokeCredential(
  kind: CredentialKind,
  ref: string,
  reason: string,
  byUserId: string | null,
): void {
  const db = getDb();
  const now = new Date().toISOString();
  const existing = db
    .select({ id: credentialRevocations.id })
    .from(credentialRevocations)
    .where(
      and(
        eq(credentialRevocations.credentialKind, kind),
        eq(credentialRevocations.credentialRef, ref),
      ),
    )
    .get();
  if (existing) {
    db.update(credentialRevocations)
      .set({
        active: true,
        reason,
        revokedByUserId: byUserId,
        revokedAt: now,
        updatedAt: now,
      })
      .where(eq(credentialRevocations.id, existing.id))
      .run();
    return;
  }
  db.insert(credentialRevocations)
    .values({
      id: randomUUID(),
      credentialKind: kind,
      credentialRef: ref,
      reason,
      revokedByUserId: byUserId,
      active: true,
      revokedAt: now,
      updatedAt: now,
    })
    .run();
}

// Reverse a revocation (e.g. a refute was itself overturned). Safe
// no-op if there was never a revocation row.
export function unrevoke(
  kind: CredentialKind,
  ref: string,
  byUserId: string | null,
): void {
  getDb()
    .update(credentialRevocations)
    .set({
      active: false,
      revokedByUserId: byUserId,
      updatedAt: new Date().toISOString(),
    })
    .where(
      and(
        eq(credentialRevocations.credentialKind, kind),
        eq(credentialRevocations.credentialRef, ref),
      ),
    )
    .run();
}
