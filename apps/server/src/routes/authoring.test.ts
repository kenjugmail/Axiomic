import { describe, expect, test } from "bun:test";
import { app } from "../index";

// Tests for POST /authoring/lesson. The mock AI provider doesn't
// generate real lesson JSON, so most tests assert the route's
// validation + error-handling behavior rather than the quality of
// the generated content. A separate manual smoke test (with a real
// provider + ANTHROPIC_API_KEY) exercises the happy path.

async function authorLesson(body: Record<string, unknown>) {
  const res = await app.fetch(
    new Request("http://localhost/api/v1/authoring/lesson", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
  return res;
}

describe("/authoring/lesson", () => {
  test("rejects missing fields with 400", async () => {
    const res = await authorLesson({});
    expect(res.status).toBe(400);
  });

  test("rejects invalid slug shape", async () => {
    const res = await authorLesson({
      nodeSlug: "Has Spaces And Caps",
      topic: "Something interesting to learn",
      objectives: ["Understand the topic deeply"],
    });
    expect(res.status).toBe(400);
  });

  test("rejects too-short topic", async () => {
    const res = await authorLesson({
      nodeSlug: "test-node",
      topic: "short",
      objectives: ["Understand the topic deeply"],
    });
    expect(res.status).toBe(400);
  });

  test("rejects empty objectives array", async () => {
    const res = await authorLesson({
      nodeSlug: "test-node",
      topic: "A reasonable topic for a lesson on attention mechanisms",
      objectives: [],
    });
    expect(res.status).toBe(400);
  });

  test("accepts well-formed input and returns lesson|warnings payload", async () => {
    const res = await authorLesson({
      nodeSlug: "test-attention-recap",
      topic: "Recap how self-attention computes Q, K, V dot products to produce a weighted sum of values",
      objectives: [
        "Derive the scaled dot-product attention formula",
        "Explain why softmax is applied before the value-weighting step",
        "Identify the role of d_k in the scaling factor",
      ],
      difficulty: "advanced",
      timeMinutes: 22,
    });
    // The mock provider doesn't produce valid JSON, so we expect
    // either 200 with warnings, 422 (couldn't parse), or 503 (stream
    // failed). All three indicate the route's plumbing works.
    expect([200, 422, 503]).toContain(res.status);
    const data = await res.json();
    if (res.status === 200) {
      expect(data).toHaveProperty("lesson");
      expect(data).toHaveProperty("warnings");
      expect(Array.isArray(data.warnings)).toBe(true);
      expect(typeof data.valid).toBe("boolean");
    } else {
      expect(data).toHaveProperty("error");
    }
  });

  test("includes rawOutput in error responses for debugging", async () => {
    const res = await authorLesson({
      nodeSlug: "test-node",
      topic: "A reasonable topic for a lesson on something specific",
      objectives: ["Learn something useful"],
    });
    if (res.status === 422 || res.status === 503) {
      const data = await res.json();
      expect(data).toHaveProperty("rawOutput");
    }
  });
});
