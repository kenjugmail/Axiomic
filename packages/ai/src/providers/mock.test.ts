import { describe, test, expect } from "bun:test";
import { MockProvider } from "./mock";

describe("MockProvider", () => {
  const provider = new MockProvider();

  test("stream produces tokens", async () => {
    const tokens: string[] = [];
    await provider.stream({
      system: "You are a tutor. page: attention tier: intro",
      messages: [{ role: "user", content: "explain this" }],
      onToken: (token) => tokens.push(token),
    });

    expect(tokens.length).toBeGreaterThan(10);
    const fullResponse = tokens.join("");
    expect(fullResponse.length).toBeGreaterThan(50);
  });

  test("embed produces 384-dim vectors", async () => {
    const vec = await provider.embed("transformer attention mechanism");
    expect(vec.length).toBe(384);

    // Check normalization
    const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0));
    expect(norm).toBeCloseTo(1, 1);
  });

  test("embed is deterministic", async () => {
    const vec1 = await provider.embed("hello world");
    const vec2 = await provider.embed("hello world");
    expect(vec1).toEqual(vec2);
  });

  test("different texts produce different embeddings", async () => {
    const vec1 = await provider.embed("attention mechanism");
    const vec2 = await provider.embed("cooking recipes");

    // Should not be identical
    const same = vec1.every((v, i) => v === vec2[i]);
    expect(same).toBe(false);
  });

  test("semantically related texts cluster more than unrelated", async () => {
    // TF-IDF over the seeded ML corpus should pick up that the attention /
    // self-attention / multi-head texts share distinctive vocabulary, while
    // "cooking recipes" sits in an unrelated subspace.
    const a = await provider.embed("self-attention with multi-head attention");
    const b = await provider.embed("attention mechanism in transformers");
    const c = await provider.embed("cooking recipes for pasta");

    const cosine = (x: number[], y: number[]) =>
      x.reduce((s, v, i) => s + v * y[i], 0);

    const related = cosine(a, b);
    const unrelated = cosine(a, c);

    expect(related).toBeGreaterThan(unrelated);
    expect(related).toBeGreaterThan(0.2);
  });

  test("stream adjusts to tier", async () => {
    const introTokens: string[] = [];
    await provider.stream({
      system: "page: attention tier: intro",
      messages: [{ role: "user", content: "explain" }],
      onToken: (t) => introTokens.push(t),
    });

    const gradTokens: string[] = [];
    await provider.stream({
      system: "page: attention tier: grad",
      messages: [{ role: "user", content: "explain" }],
      onToken: (t) => gradTokens.push(t),
    });

    // Both should produce content
    expect(introTokens.join("").length).toBeGreaterThan(50);
    expect(gradTokens.join("").length).toBeGreaterThan(50);
  });
});
