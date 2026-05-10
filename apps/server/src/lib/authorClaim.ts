// Sprint 72 — Author-claim helpers.
//
// `claimAuthorshipsByOrcid` is the happy path: scan every external
// paper for author entries whose ORCID matches an internal user's
// `users.orcid`, and write the corresponding row in
// `external_paper_authorships`. Idempotent on
// (externalPaperId, ordinal). Used by:
//   - the periodic `claimExternalAuthorshipsByOrcid` cron job
//   - the user's settings page when they save a fresh ORCID
//     (synchronous one-shot scan so they see results immediately)
//
// `approveClaimRequest` / `rejectClaimRequest` are the manual
// admin-review path — used by the admin endpoints.

import { randomUUID } from "crypto";
import { and, eq, isNotNull } from "drizzle-orm";
import {
  authorClaimRequests,
  externalPaperAuthorships,
  externalPapers,
  getDb,
  users,
} from "@axiomic/db";

export interface ExternalAuthorEntry {
  name: string;
  orcid?: string;
  openAlexAuthorId?: string;
}

function safeAuthors(json: string | null | undefined): ExternalAuthorEntry[] {
  if (!json) return [];
  try {
    const arr = JSON.parse(json);
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((a) => a && typeof a.name === "string")
      .map((a) => ({
        name: a.name,
        orcid: typeof a.orcid === "string" ? a.orcid : undefined,
        openAlexAuthorId:
          typeof a.openAlexAuthorId === "string"
            ? a.openAlexAuthorId
            : undefined,
      }));
  } catch {
    return [];
  }
}

function normalizeOrcid(s: string | null | undefined): string | null {
  if (!s) return null;
  const stripped = s.replace(/^https?:\/\/orcid\.org\//, "").trim();
  if (!/^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/.test(stripped)) return null;
  return stripped;
}

export interface AutoClaimResult {
  inserted: number;
  alreadyExisting: number;
}

// Scan all external papers + match against the supplied ORCID-set.
// When `orcidToUserId` carries a single mapping (e.g., the just-set
// ORCID for a user), the scan is bounded by externalPapers anyway.
// Returns the count of new authorship rows inserted.
export function claimAuthorshipsByOrcid(
  orcidToUserId: Map<string, string>,
): AutoClaimResult {
  if (orcidToUserId.size === 0) return { inserted: 0, alreadyExisting: 0 };

  const db = getDb();
  let inserted = 0;
  let alreadyExisting = 0;

  const papers = db
    .select({
      id: externalPapers.id,
      authorsJson: externalPapers.authorsJson,
    })
    .from(externalPapers)
    .all();

  for (const p of papers) {
    const authors = safeAuthors(p.authorsJson);
    for (let i = 0; i < authors.length; i++) {
      const orcid = normalizeOrcid(authors[i].orcid);
      if (!orcid) continue;
      const userId = orcidToUserId.get(orcid);
      if (!userId) continue;

      // Idempotency check: don't re-insert an existing claim.
      const exists = db
        .select({ id: externalPaperAuthorships.id })
        .from(externalPaperAuthorships)
        .where(
          and(
            eq(externalPaperAuthorships.externalPaperId, p.id),
            eq(externalPaperAuthorships.ordinal, i),
          ),
        )
        .get();
      if (exists) {
        alreadyExisting++;
        continue;
      }

      try {
        db.insert(externalPaperAuthorships)
          .values({
            id: randomUUID(),
            externalPaperId: p.id,
            ordinal: i,
            userId,
            verifiedVia: "orcid_auto",
          })
          .run();
        inserted++;
      } catch {
        // Rare: another process raced us to the unique index. Treat
        // as already-existing.
        alreadyExisting++;
      }
    }
  }

  return { inserted, alreadyExisting };
}

// Snapshot every user with an ORCID set into a single map. Used by
// the cron job to scan all external papers in one pass. For the
// "user just saved their ORCID" case, callers build a 1-element
// map and pass it directly — that's much cheaper than rescanning
// the whole users table.
export function buildOrcidUserMap(): Map<string, string> {
  const db = getDb();
  const rows = db
    .select({ id: users.id, orcid: users.orcid })
    .from(users)
    .where(isNotNull(users.orcid))
    .all();
  const map = new Map<string, string>();
  for (const r of rows) {
    const norm = normalizeOrcid(r.orcid);
    if (norm) map.set(norm, r.id);
  }
  return map;
}

export interface ClaimDecisionInput {
  reviewerId: string;
  reviewNote?: string;
}

export type ClaimDecision =
  | { ok: true; authorshipId?: string }
  | { ok: false; error: string };

export function approveClaimRequest(
  requestId: string,
  input: ClaimDecisionInput,
): ClaimDecision {
  const db = getDb();
  const req = db
    .select()
    .from(authorClaimRequests)
    .where(eq(authorClaimRequests.id, requestId))
    .get();
  if (!req) return { ok: false, error: "Not found" };
  if (req.status !== "pending") {
    return { ok: false, error: `Already ${req.status}` };
  }

  // Refuse if the (paper, ordinal) is already claimed — the request
  // is stale.
  const occupied = db
    .select({ id: externalPaperAuthorships.id })
    .from(externalPaperAuthorships)
    .where(
      and(
        eq(externalPaperAuthorships.externalPaperId, req.externalPaperId),
        eq(externalPaperAuthorships.ordinal, req.ordinal),
      ),
    )
    .get();
  if (occupied) {
    db.update(authorClaimRequests)
      .set({
        status: "rejected",
        reviewerId: input.reviewerId,
        reviewNote: "Authorship slot already claimed.",
        decidedAt: new Date().toISOString(),
      })
      .where(eq(authorClaimRequests.id, requestId))
      .run();
    return { ok: false, error: "Already claimed" };
  }

  const authorshipId = randomUUID();
  db.insert(externalPaperAuthorships)
    .values({
      id: authorshipId,
      externalPaperId: req.externalPaperId,
      ordinal: req.ordinal,
      userId: req.userId,
      verifiedVia: "admin_verified",
    })
    .run();
  db.update(authorClaimRequests)
    .set({
      status: "approved",
      reviewerId: input.reviewerId,
      reviewNote: input.reviewNote ?? null,
      decidedAt: new Date().toISOString(),
    })
    .where(eq(authorClaimRequests.id, requestId))
    .run();
  return { ok: true, authorshipId };
}

export function rejectClaimRequest(
  requestId: string,
  input: ClaimDecisionInput,
): ClaimDecision {
  const db = getDb();
  const req = db
    .select({ status: authorClaimRequests.status })
    .from(authorClaimRequests)
    .where(eq(authorClaimRequests.id, requestId))
    .get();
  if (!req) return { ok: false, error: "Not found" };
  if (req.status !== "pending") {
    return { ok: false, error: `Already ${req.status}` };
  }
  db.update(authorClaimRequests)
    .set({
      status: "rejected",
      reviewerId: input.reviewerId,
      reviewNote: input.reviewNote ?? null,
      decidedAt: new Date().toISOString(),
    })
    .where(eq(authorClaimRequests.id, requestId))
    .run();
  return { ok: true };
}
