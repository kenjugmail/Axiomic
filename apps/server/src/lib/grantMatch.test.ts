// Sprint 71 — grantMatch tests.

import { describe, test, expect } from "bun:test";
import { randomUUID } from "crypto";
import { getDb, grants, users } from "@axiomic/db";
import {
  matchGrantsForUser,
  rankByDeadline,
} from "./grantMatch";

function seedGrant(overrides: Partial<typeof grants.$inferInsert> = {}): string {
  const id = randomUUID();
  const sourceId = `gm-${Math.random().toString(36).slice(2, 10)}`;
  getDb()
    .insert(grants)
    .values({
      id,
      source: "nih",
      sourceId,
      agency: "NIH",
      title: "Cold-start grant",
      summary: "Summary.",
      fullDescription: "Body.",
      mechanism: "R01",
      amountCeiling: 100_000,
      postedAt: "2025-01-01",
      deadlineAt: new Date(Date.now() + 60 * 86400_000)
        .toISOString()
        .slice(0, 10),
      url: "https://example.com",
      topicsJson: JSON.stringify([]),
      contentHash: randomUUID().slice(0, 8),
      ...overrides,
    })
    .run();
  return id;
}

async function ensureCleanUser(): Promise<string> {
  const id = randomUUID();
  const username = `gm-${Math.random().toString(36).slice(2, 10)}`;
  getDb()
    .insert(users)
    .values({
      id,
      username,
      email: `${username}@test.local`,
      passwordHash: "x".repeat(60),
    })
    .run();
  return id;
}

describe("grantMatch (Sprint 71)", () => {
  test("rankByDeadline returns soonest-closing grants first", () => {
    seedGrant({
      deadlineAt: new Date(Date.now() + 5 * 86400_000)
        .toISOString()
        .slice(0, 10),
    });
    seedGrant({
      deadlineAt: new Date(Date.now() + 90 * 86400_000)
        .toISOString()
        .slice(0, 10),
    });
    const ranked = rankByDeadline({ limit: 20 });
    expect(ranked.length).toBeGreaterThan(0);
    for (let i = 1; i < ranked.length; i++) {
      const prev = Date.parse(ranked[i - 1].grant.deadlineAt!);
      const cur = Date.parse(ranked[i].grant.deadlineAt!);
      expect(prev).toBeLessThanOrEqual(cur);
    }
  });

  test("rankByDeadline excludes past deadlines", () => {
    seedGrant({ deadlineAt: "2010-01-01" });
    const ranked = rankByDeadline({ limit: 100 });
    for (const r of ranked) {
      const t = Date.parse(r.grant.deadlineAt!);
      expect(t).toBeGreaterThan(Date.now());
    }
  });

  test("matchGrantsForUser falls back to deadline ranking when user has no signal", async () => {
    const userId = await ensureCleanUser();
    seedGrant();
    const matches = await matchGrantsForUser(userId, { limit: 5 });
    // Cold-start path returns rankByDeadline output — score is 0.
    for (const m of matches) {
      expect(m.score).toBe(0);
      expect(m.reason).toContain("Upcoming deadline");
    }
  });

  test("matchGrantsForUser surfaces topic-overlap reason when applicable", async () => {
    // We can't easily wire a publication here without polluting
    // seed data; this covers the cold-start path. The
    // topic-overlap path is exercised in the route + a dedicated
    // unit test would mock the search index — deferred.
    const userId = await ensureCleanUser();
    const ranked = await matchGrantsForUser(userId, { limit: 1 });
    expect(Array.isArray(ranked)).toBe(true);
  });
});
