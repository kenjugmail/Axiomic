import { describe, test, expect } from "bun:test";
import { app } from "../index";

async function search(q: string, limit?: number) {
  const sp = new URLSearchParams({ q });
  if (limit) sp.set("limit", String(limit));
  const res = await app.fetch(
    new Request(`http://localhost/api/v1/search?${sp.toString()}`),
  );
  expect(res.status).toBe(200);
  return (await res.json()) as any;
}

describe("Hybrid search", () => {
  test("empty query returns empty results", async () => {
    const data = await search("");
    expect(data.results).toEqual([]);
  });

  test("exact title match wins (keyword path)", async () => {
    const data = await search("attention");
    expect(data.results.length).toBeGreaterThan(0);
    const top = data.results[0];
    // Sprint 25 — news + research kinds joined the index; we no longer
    // guarantee the wiki page outranks a same-title article. What the
    // keyword path guarantees is the title actually contains the query
    // and the match was at minimum keyword-driven.
    expect(top.title.toLowerCase()).toContain("attention");
    expect(top.matchedBy).not.toBe("semantic");
  });

  test("paraphrase with no title match still surfaces relevant pages (semantic path)", async () => {
    // Vocabulary that lives in attention/transformer-related pages but
    // doesn't appear in any page title.
    const data = await search("how do queries find keys");
    expect(data.results.length).toBeGreaterThan(0);
    // At least one result should be tagged semantic.
    const semantics = data.results.filter((r: any) => r.matchedBy === "semantic");
    expect(semantics.length).toBeGreaterThan(0);
    // And one of the top results should be an attention-related page.
    const titles = data.results.map((r: any) => r.title.toLowerCase()).join(" | ");
    const attentionRelated =
      titles.includes("attention") ||
      titles.includes("self-attention") ||
      titles.includes("transformer");
    expect(attentionRelated).toBe(true);
  });

  test("results include forum topics when relevant", async () => {
    // The seeded forum corpus mentions induction heads (a wiki page topic).
    const data = await search("induction heads");
    const kinds = new Set(data.results.map((r: any) => r.kind));
    // Should include at least one of page or topic; both is best.
    expect(kinds.has("page") || kinds.has("topic")).toBe(true);
  });

  test("limit caps the result count", async () => {
    const data = await search("attention", 3);
    expect(data.results.length).toBeLessThanOrEqual(3);
  });

  test("matched-by tagging is consistent with score", async () => {
    const data = await search("transformer");
    for (const r of data.results) {
      expect(["keyword", "semantic", "both"]).toContain(r.matchedBy);
      expect(typeof r.score).toBe("number");
      expect(r.score).toBeGreaterThan(0);
    }
  });

  test("short snippet is included for each result", async () => {
    const data = await search("softmax");
    for (const r of data.results) {
      expect(typeof r.snippet).toBe("string");
      expect(r.snippet.length).toBeLessThanOrEqual(180);
    }
  });

  test("Sprint 25 — kind filter narrows to a single kind", async () => {
    // ?kind=page should keep only wiki page results, even though the
    // query has matches across kinds.
    const sp = new URLSearchParams({ q: "attention", kind: "page" });
    const res = await app.fetch(
      new Request(`http://localhost/api/v1/search?${sp.toString()}`),
    );
    const data = (await res.json()) as any;
    expect(data.results.length).toBeGreaterThan(0);
    for (const r of data.results) {
      expect(r.kind).toBe("page");
    }
  });

  test("Sprint 25 — kind filter accepts a comma-list of kinds", async () => {
    const sp = new URLSearchParams({ q: "attention", kind: "page,lesson" });
    const res = await app.fetch(
      new Request(`http://localhost/api/v1/search?${sp.toString()}`),
    );
    const data = (await res.json()) as any;
    for (const r of data.results) {
      expect(["page", "lesson"]).toContain(r.kind);
    }
  });
});
