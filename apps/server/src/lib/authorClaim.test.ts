// Sprint 72 — author-claim helper tests.

import { describe, test, expect } from "bun:test";
import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import {
  authorClaimRequests,
  externalPaperAuthorships,
  externalPapers,
  getDb,
  users,
} from "@axiomic/db";
import {
  approveClaimRequest,
  buildOrcidUserMap,
  claimAuthorshipsByOrcid,
  rejectClaimRequest,
} from "./authorClaim";

function makeUser(orcid?: string): string {
  const id = randomUUID();
  const username = `ac-${Math.random().toString(36).slice(2, 10)}`;
  getDb()
    .insert(users)
    .values({
      id,
      username,
      email: `${username}@test.local`,
      passwordHash: "x".repeat(60),
      orcid: orcid ?? null,
    })
    .run();
  return id;
}

function makeExternalPaper(
  authors: Array<{ name: string; orcid?: string }>,
): string {
  const id = randomUUID();
  const sourceId = `ac-${Math.random().toString(36).slice(2, 10)}`;
  getDb()
    .insert(externalPapers)
    .values({
      id,
      source: "arxiv",
      sourceId,
      title: "Test paper",
      authorsJson: JSON.stringify(authors),
      contentHash: "x".repeat(8),
    })
    .run();
  return id;
}

describe("authorClaim (Sprint 72)", () => {
  test("ORCID auto-claim inserts an authorship row", () => {
    const orcid = "0000-0001-2345-678X";
    const userId = makeUser(orcid);
    const paperId = makeExternalPaper([
      { name: "Other Author" },
      { name: "Me", orcid },
    ]);
    const map = new Map([[orcid, userId]]);
    const result = claimAuthorshipsByOrcid(map);
    expect(result.inserted).toBe(1);

    const row = getDb()
      .select()
      .from(externalPaperAuthorships)
      .where(eq(externalPaperAuthorships.externalPaperId, paperId))
      .get();
    expect(row?.userId).toBe(userId);
    expect(row?.ordinal).toBe(1);
    expect(row?.verifiedVia).toBe("orcid_auto");
  });

  test("ORCID auto-claim is idempotent on rerun", () => {
    const orcid = "0000-0001-1111-2222";
    const userId = makeUser(orcid);
    makeExternalPaper([{ name: "Me", orcid }]);
    const map = new Map([[orcid, userId]]);
    const r1 = claimAuthorshipsByOrcid(map);
    expect(r1.inserted).toBe(1);
    const r2 = claimAuthorshipsByOrcid(map);
    expect(r2.inserted).toBe(0);
    expect(r2.alreadyExisting).toBeGreaterThanOrEqual(1);
  });

  test("ORCID with https://orcid.org/ prefix is normalized", () => {
    const orcid = "0000-0002-3333-4444";
    const userId = makeUser(orcid);
    const paperId = makeExternalPaper([
      { name: "Me", orcid: `https://orcid.org/${orcid}` },
    ]);
    const map = new Map([[orcid, userId]]);
    const result = claimAuthorshipsByOrcid(map);
    expect(result.inserted).toBe(1);

    const row = getDb()
      .select()
      .from(externalPaperAuthorships)
      .where(eq(externalPaperAuthorships.externalPaperId, paperId))
      .get();
    expect(row?.userId).toBe(userId);
  });

  test("ORCID auto-claim does nothing when no ORCID match exists", () => {
    const userId = makeUser("0000-0003-5555-6666");
    makeExternalPaper([{ name: "Me", orcid: "0000-0009-9999-0000" }]);
    const result = claimAuthorshipsByOrcid(
      new Map([["0000-0003-5555-6666", userId]]),
    );
    expect(result.inserted).toBe(0);
  });

  test("buildOrcidUserMap collects every ORCID-bearing user", () => {
    makeUser("0000-0004-1111-1111");
    makeUser("0000-0004-2222-2222");
    const map = buildOrcidUserMap();
    expect(map.size).toBeGreaterThanOrEqual(2);
    expect(map.has("0000-0004-1111-1111")).toBe(true);
    expect(map.has("0000-0004-2222-2222")).toBe(true);
  });

  test("approveClaimRequest writes authorship + marks claim approved", () => {
    const userId = makeUser();
    const paperId = makeExternalPaper([
      { name: "X" },
      { name: "Y" },
    ]);
    const requestId = randomUUID();
    getDb()
      .insert(authorClaimRequests)
      .values({
        id: requestId,
        userId,
        externalPaperId: paperId,
        ordinal: 1,
      })
      .run();

    const reviewer = makeUser();
    const decision = approveClaimRequest(requestId, {
      reviewerId: reviewer,
      reviewNote: "Looks good.",
    });
    expect(decision.ok).toBe(true);

    const claim = getDb()
      .select()
      .from(authorClaimRequests)
      .where(eq(authorClaimRequests.id, requestId))
      .get();
    expect(claim?.status).toBe("approved");

    const auth = getDb()
      .select()
      .from(externalPaperAuthorships)
      .where(eq(externalPaperAuthorships.externalPaperId, paperId))
      .get();
    expect(auth?.userId).toBe(userId);
    expect(auth?.verifiedVia).toBe("admin_verified");
  });

  test("approveClaimRequest fails if slot already claimed", () => {
    const claimer = makeUser();
    const otherClaimer = makeUser();
    const paperId = makeExternalPaper([{ name: "X" }]);
    // Pre-occupy slot 0.
    getDb()
      .insert(externalPaperAuthorships)
      .values({
        id: randomUUID(),
        externalPaperId: paperId,
        ordinal: 0,
        userId: otherClaimer,
        verifiedVia: "orcid_auto",
      })
      .run();
    const requestId = randomUUID();
    getDb()
      .insert(authorClaimRequests)
      .values({
        id: requestId,
        userId: claimer,
        externalPaperId: paperId,
        ordinal: 0,
      })
      .run();
    const reviewer = makeUser();
    const decision = approveClaimRequest(requestId, { reviewerId: reviewer });
    expect(decision.ok).toBe(false);
    const claim = getDb()
      .select({ status: authorClaimRequests.status })
      .from(authorClaimRequests)
      .where(eq(authorClaimRequests.id, requestId))
      .get();
    expect(claim?.status).toBe("rejected");
  });

  test("rejectClaimRequest marks claim rejected without inserting an authorship", () => {
    const userId = makeUser();
    const paperId = makeExternalPaper([{ name: "X" }]);
    const requestId = randomUUID();
    getDb()
      .insert(authorClaimRequests)
      .values({
        id: requestId,
        userId,
        externalPaperId: paperId,
        ordinal: 0,
      })
      .run();
    const reviewer = makeUser();
    const decision = rejectClaimRequest(requestId, {
      reviewerId: reviewer,
      reviewNote: "Insufficient evidence.",
    });
    expect(decision.ok).toBe(true);
    const auth = getDb()
      .select()
      .from(externalPaperAuthorships)
      .where(eq(externalPaperAuthorships.externalPaperId, paperId))
      .get();
    expect(auth).toBeUndefined();
  });
});
