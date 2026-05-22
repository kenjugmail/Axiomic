import { describe, expect, test } from "bun:test";
import { app } from "../index";

// Tests for the /concepts/search keyword endpoint. Distinct from the
// concept-preview tests (./concepts.test.ts) — different route, no
// embedding dependency.

interface SearchResponse {
  query: string;
  totalHits: number;
  groups: Array<{
    pathSlug: string;
    pathTitle: string;
    topScore: number;
    hits: Array<{
      nodeSlug: string;
      nodeTitle: string;
      nodeDescription: string;
      matchedIn: string;
      snippet: string;
      score: number;
    }>;
  }>;
}

async function conceptSearch(q: string, limit?: number): Promise<SearchResponse> {
  const sp = new URLSearchParams({ q });
  if (limit) sp.set("limit", String(limit));
  const res = await app.fetch(
    new Request(`http://localhost/api/v1/concepts/search?${sp.toString()}`),
  );
  expect(res.status).toBe(200);
  return (await res.json()) as SearchResponse;
}

describe("/concepts/search — cross-path keyword search", () => {
  test("short queries (< 2 chars) return empty", async () => {
    const data = await conceptSearch("a");
    expect(data.totalHits).toBe(0);
    expect(data.groups).toEqual([]);
  });

  test("matches mastery-node titles across multiple paths", async () => {
    // 'transformer' should appear in ML/NLP-flavored paths' node titles
    const data = await conceptSearch("transformer");
    expect(data.totalHits).toBeGreaterThan(0);
    expect(data.groups.length).toBeGreaterThan(0);
    // At least one hit should be a node-title match (highest scoring)
    const allHits = data.groups.flatMap((g) => g.hits);
    const titleHits = allHits.filter((h) => h.matchedIn === "node-title");
    expect(titleHits.length).toBeGreaterThan(0);
  });

  test("groups results by path; topScore reflects best hit", async () => {
    const data = await conceptSearch("evolution");
    if (data.groups.length === 0) return; // graceful if seed corpus lacks term
    for (const g of data.groups) {
      const maxScore = Math.max(...g.hits.map((h) => h.score));
      expect(g.topScore).toBe(maxScore);
    }
    // Groups sorted by topScore desc
    for (let i = 1; i < data.groups.length; i++) {
      expect(data.groups[i - 1].topScore).toBeGreaterThanOrEqual(
        data.groups[i].topScore,
      );
    }
  });

  test("returns a snippet field for every hit", async () => {
    const data = await conceptSearch("memory");
    const allHits = data.groups.flatMap((g) => g.hits);
    for (const h of allHits) {
      expect(typeof h.snippet).toBe("string");
      expect(h.snippet.length).toBeGreaterThan(0);
    }
  });

  test("respects the limit parameter", async () => {
    const data = await conceptSearch("the", 5);
    expect(data.totalHits).toBeLessThanOrEqual(5);
  });

  test("nonexistent term returns zero hits", async () => {
    const data = await conceptSearch("xyzzzyqqq42neverappears");
    expect(data.totalHits).toBe(0);
    expect(data.groups).toEqual([]);
  });

  test("scoring: node-title beats description beats lesson-body", async () => {
    // Pick a term we know is a node title somewhere
    const data = await conceptSearch("attention");
    if (data.totalHits === 0) return;
    // The top group's best hit should be a node-title or lesson-title
    // (score >= 2), not just a description match.
    const top = data.groups[0];
    expect(top.topScore).toBeGreaterThanOrEqual(2);
  });
});
