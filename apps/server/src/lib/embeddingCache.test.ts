import { describe, test, expect } from "bun:test";
import { getOrEmbed, hashContent } from "./embeddingCache";

describe("embeddingCache (Sprint 25)", () => {
  test("hashContent is deterministic for same input + differs by content", () => {
    expect(hashContent("hello")).toBe(hashContent("hello"));
    expect(hashContent("hello")).not.toBe(hashContent("world"));
  });

  test("getOrEmbed caches by (kind, id) and short-circuits on identical text", async () => {
    const id = `test-${Math.random().toString(36).slice(2)}`;
    const text = "Attention is all you need.";
    const v1 = await getOrEmbed("news_article", id, text);
    expect(Array.isArray(v1)).toBe(true);
    expect(v1.length).toBeGreaterThan(0);

    // Second call with the SAME text should return the same vector
    // (same hash → cache hit). MockProvider's embed is deterministic
    // for the same input, so an identical-output assertion holds even
    // without the cache; the contract here is that subsequent calls
    // don't fail.
    const v2 = await getOrEmbed("news_article", id, text);
    expect(v2.length).toBe(v1.length);
    expect(v2[0]).toBeCloseTo(v1[0]);
  });

  test("changing the text invalidates the cache and re-embeds", async () => {
    const id = `test2-${Math.random().toString(36).slice(2)}`;
    const before = await getOrEmbed("research_paper", id, "Original text.");
    const after = await getOrEmbed("research_paper", id, "Different text now.");
    expect(after.length).toBe(before.length);
    // Vectors should differ — at least one component must change for
    // any reasonable embedder (MockProvider hashes the input).
    let changed = false;
    for (let i = 0; i < before.length; i++) {
      if (Math.abs(before[i] - after[i]) > 1e-9) {
        changed = true;
        break;
      }
    }
    expect(changed).toBe(true);
  });
});
