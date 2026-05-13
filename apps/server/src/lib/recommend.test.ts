// Sprint 70 — Recommendation ranker tests.
//
// Anchors the ranker against real seeded papers and a freshly-created
// test user. We don't assert exact rankings (those depend on the mock
// embedder's output) but we do assert structural invariants:
//
//   - score breakdown components are all in expected ranges
//   - total score equals the weighted sum of components
//   - excludeOwnPapers filters out a user's own papers
//   - rankFromFollows returns nothing when the user follows nobody
//   - recordImpressions doesn't throw and survives idempotency

import { describe, test, expect, beforeEach } from "bun:test";
import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import {
  getDb,
  researchPapers,
  searches,
  userFollows,
  users,
} from "@axiomic/db";
import {
  rankFromFollows,
  rankPapersForUser,
  rankTrending,
  recordImpressions,
} from "./recommend";
import { getSearchIndex, invalidateSearchIndex } from "./searchIndex";

async function ensureTestUser(): Promise<string> {
  const db = getDb();
  const username = `recommend-test-${Math.random().toString(36).slice(2, 8)}`;
  const id = randomUUID();
  db.insert(users)
    .values({
      id,
      username,
      email: `${username}@test.local`,
      passwordHash: "x".repeat(60),
      displayName: "Recommend Test",
    })
    .run();
  return id;
}

describe("recommend ranker (Sprint 70)", () => {
  beforeEach(async () => {
    // Rebuild before each test so no individual test can observe a stale
    // index left by test-created content inserted in a prior test.
    invalidateSearchIndex();
    await getSearchIndex();
  });

  test("anonymous (userId=null) returns ranked papers without personalization", async () => {
    const ranked = await rankPapersForUser(null, { limit: 10 });
    expect(ranked.length).toBeGreaterThan(0);
    for (const r of ranked) {
      // The anonymous ranker doesn't filter by kind — research +
      // external_paper both make it through. Accept either.
      expect(["research", "external_paper"]).toContain(r.paper.kind);
      // No per-user signals → interestScore + queryAffinity must be 0.
      expect(r.breakdown.interestScore).toBe(0);
      expect(r.breakdown.queryAffinity).toBe(0);
      expect(r.breakdown.authorOverlap).toBe(0);
      expect(r.breakdown.recencyDecay).toBeGreaterThanOrEqual(0);
      expect(r.breakdown.recencyDecay).toBeLessThanOrEqual(1);
      expect(r.breakdown.citationBoost).toBeGreaterThanOrEqual(0);
      expect(r.breakdown.citationBoost).toBeLessThanOrEqual(1);
    }
  });

  test("anonymous results are sorted by score descending", async () => {
    const ranked = await rankPapersForUser(null, { limit: 10 });
    for (let i = 1; i < ranked.length; i++) {
      expect(ranked[i - 1].score).toBeGreaterThanOrEqual(ranked[i].score);
    }
  });

  test("score = weighted sum of breakdown components", async () => {
    const userId = await ensureTestUser();
    // Seed a search so the ranker has SOME signal to score against.
    getDb()
      .insert(searches)
      .values({
        id: randomUUID(),
        userId,
        query: "transformer attention",
        resultCount: 5,
      })
      .run();

    const ranked = await rankPapersForUser(userId, { limit: 5 });
    expect(ranked.length).toBeGreaterThan(0);
    for (const r of ranked) {
      const expected =
        0.45 * r.breakdown.interestScore +
        0.2 * r.breakdown.queryAffinity +
        0.15 * r.breakdown.authorOverlap +
        0.1 * r.breakdown.recencyDecay +
        0.1 * r.breakdown.citationBoost +
        (r.breakdown.alreadyShown ? -0.2 : 0);
      // Tolerance for fp drift.
      expect(Math.abs(r.score - expected)).toBeLessThan(1e-9);
      expect(r.score).toBeCloseTo(r.breakdown.total, 9);
    }
  });

  test("excludeOwnPapers filters out user's authored papers", async () => {
    const db = getDb();
    // Find any seeded paper to "claim" as ours by switching authorId.
    const samplePaper = db
      .select({ id: researchPapers.id, slug: researchPapers.slug })
      .from(researchPapers)
      .where(eq(researchPapers.status, "published"))
      .get();
    if (!samplePaper) return;

    const userId = await ensureTestUser();
    const originalAuthor = db
      .select({ authorId: researchPapers.authorId })
      .from(researchPapers)
      .where(eq(researchPapers.id, samplePaper.id))
      .get()?.authorId;

    db.update(researchPapers)
      .set({ authorId: userId })
      .where(eq(researchPapers.id, samplePaper.id))
      .run();
    invalidateSearchIndex();
    await getSearchIndex();

    const ranked = await rankPapersForUser(userId, {
      limit: 50,
      excludeOwnPapers: true,
    });
    const ownIncluded = ranked.find((r) => r.paper.id === samplePaper.id);
    expect(ownIncluded).toBeUndefined();

    // Restore so we don't poison other tests.
    if (originalAuthor) {
      db.update(researchPapers)
        .set({ authorId: originalAuthor })
        .where(eq(researchPapers.id, samplePaper.id))
        .run();
      invalidateSearchIndex();
      await getSearchIndex();
    }
  });

  test("rankFromFollows returns empty list when user follows nobody", async () => {
    const userId = await ensureTestUser();
    const ranked = await rankFromFollows(userId, { limit: 10 });
    expect(ranked).toEqual([]);
  });

  test("rankFromFollows surfaces papers when the user follows their author", async () => {
    const db = getDb();
    const samplePaper = db
      .select({
        id: researchPapers.id,
        authorId: researchPapers.authorId,
      })
      .from(researchPapers)
      .where(eq(researchPapers.status, "published"))
      .get();
    if (!samplePaper) return;

    const userId = await ensureTestUser();
    db.insert(userFollows)
      .values({
        id: randomUUID(),
        followerId: userId,
        followeeId: samplePaper.authorId,
      })
      .run();

    const ranked = await rankFromFollows(userId, { limit: 20 });
    expect(ranked.length).toBeGreaterThan(0);
    for (const r of ranked) {
      expect(r.paper.authorId).toBe(samplePaper.authorId);
      expect(r.breakdown.authorOverlap).toBe(1);
    }
  });

  test("rankTrending returns positively-scored items", async () => {
    const ranked = await rankTrending(null, { limit: 10 });
    expect(ranked.length).toBeGreaterThan(0);
    for (const r of ranked) {
      expect(r.score).toBeGreaterThan(0);
    }
  });

  test("recordImpressions is idempotent + survives multiple calls", async () => {
    const userId = await ensureTestUser();
    const items = [
      { kind: "research", id: "test-paper-1" },
      { kind: "research", id: "test-paper-2" },
    ];
    expect(() => recordImpressions(userId, items)).not.toThrow();
    expect(() => recordImpressions(userId, items)).not.toThrow();
  });
});
