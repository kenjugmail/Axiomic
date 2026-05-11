// Sprint 70 — /research/feed integration test.
//
// Validates that the route returns the expected three rails plus a
// `personalized` flag, that anonymous traffic still gets the trending
// rail, and that score breakdowns shape-match the type contract.

import { describe, test, expect, beforeAll } from "bun:test";
import { app } from "../index";
import type { ResearchFeedResponse } from "@axiomic/types";
import { getSearchIndex, invalidateSearchIndex } from "../lib/searchIndex";

beforeAll(async () => {
  // Ensure the search index is built from seeded data before any test runs.
  // Without this, the index relies on a background prewarm that can fail
  // silently if another worker holds a DB write lock at startup.
  invalidateSearchIndex();
  await getSearchIndex();
});

async function getFeed(): Promise<ResearchFeedResponse> {
  const res = await app.fetch(
    new Request("http://localhost/api/v1/research/feed?perRail=6"),
  );
  expect(res.status).toBe(200);
  return (await res.json()) as ResearchFeedResponse;
}

describe("/research/feed (Sprint 70)", () => {
  test("anonymous request returns shape with three rails", async () => {
    const data = await getFeed();
    expect(data).toHaveProperty("personalized");
    expect(data.personalized).toBe(false);
    expect(data.rails).toBeDefined();
    expect(Array.isArray(data.rails.for_you)).toBe(true);
    expect(Array.isArray(data.rails.trending)).toBe(true);
    expect(Array.isArray(data.rails.from_follows)).toBe(true);
    // Anonymous → from_follows is always empty.
    expect(data.rails.from_follows.length).toBe(0);
  });

  test("trending rail items have full payload + score breakdown", async () => {
    const data = await getFeed();
    expect(data.rails.trending.length).toBeGreaterThan(0);
    for (const item of data.rails.trending) {
      expect(item.kind).toBe("research");
      expect(typeof item.id).toBe("string");
      expect(typeof item.slug).toBe("string");
      expect(typeof item.title).toBe("string");
      expect(typeof item.score).toBe("number");
      expect(typeof item.reason).toBe("string");
      expect(item.breakdown).toBeDefined();
      expect(typeof item.breakdown.total).toBe("number");
      expect(typeof item.breakdown.interestScore).toBe("number");
      expect(typeof item.breakdown.recencyDecay).toBe("number");
    }
  });

  test("perRail caps each rail's length", async () => {
    const res = await app.fetch(
      new Request("http://localhost/api/v1/research/feed?perRail=2"),
    );
    const data = (await res.json()) as ResearchFeedResponse;
    expect(data.rails.for_you.length).toBeLessThanOrEqual(2);
    expect(data.rails.trending.length).toBeLessThanOrEqual(2);
    expect(data.rails.from_follows.length).toBeLessThanOrEqual(2);
  });
});
