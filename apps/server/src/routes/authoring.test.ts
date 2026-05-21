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

describe("/authoring/slide", () => {
  async function regen(body: Record<string, unknown>) {
    return app.fetch(
      new Request("http://localhost/api/v1/authoring/slide", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }),
    );
  }

  test("rejects missing lesson (422 — runtime shape check)", async () => {
    const res = await regen({ slideIdx: 0 });
    // z.unknown() doesn't reject undefined at parse-time; the runtime
    // shape check inside the handler returns 422.
    expect(res.status).toBe(422);
  });

  test("rejects out-of-range slideIdx", async () => {
    const res = await regen({
      lesson: { slides: [{ kind: "text" }] },
      slideIdx: 5,
    });
    expect(res.status).toBe(422);
  });

  test("returns slide payload on well-formed input", async () => {
    const res = await regen({
      lesson: {
        meta: { timeMinutes: 10, difficulty: "intermediate" },
        slides: [{ kind: "text", title: "A", body: "x" }, { kind: "text", title: "B", body: "y" }],
      },
      slideIdx: 0,
      hint: "Make it more concrete",
    });
    // Mock provider isn't going to produce a valid slide object,
    // so accept either 200 (parsed something), 422 (couldn't parse),
    // or 503 (provider failed). All three indicate the route is wired.
    expect([200, 422, 503]).toContain(res.status);
    const data = await res.json();
    if (res.status === 200) {
      expect(data).toHaveProperty("slide");
    } else {
      expect(data).toHaveProperty("error");
    }
  });
});

describe("/authoring/save", () => {
  async function save(body: Record<string, unknown>) {
    return app.fetch(
      new Request("http://localhost/api/v1/authoring/save", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }),
    );
  }

  test("rejects with 403 when DEV_AUTH_BYPASS is not set", async () => {
    const prev = process.env.DEV_AUTH_BYPASS;
    delete process.env.DEV_AUTH_BYPASS;
    const res = await save({
      nodeSlug: "test-save-no-bypass",
      lesson: { meta: { timeMinutes: 10 }, slides: [{ kind: "text", title: "x", body: "y" }] },
    });
    expect(res.status).toBe(403);
    if (prev !== undefined) process.env.DEV_AUTH_BYPASS = prev;
  });

  test("rejects invalid slug shape with 400", async () => {
    process.env.DEV_AUTH_BYPASS = "1";
    const res = await save({
      nodeSlug: "Has Caps",
      lesson: { meta: { timeMinutes: 10 }, slides: [{ kind: "text", title: "x", body: "y" }] },
    });
    expect(res.status).toBe(400);
  });

  test("rejects a lesson that fails schema validation", async () => {
    process.env.DEV_AUTH_BYPASS = "1";
    const res = await save({
      nodeSlug: "test-save-bad-lesson",
      lesson: { meta: { timeMinutes: 999 }, slides: [] },
    });
    expect(res.status).toBe(422);
    const data = await res.json();
    expect(data.warnings.length).toBeGreaterThan(0);
  });

  test("save flow works end-to-end (write + warnings + bytes)", async () => {
    process.env.DEV_AUTH_BYPASS = "1";
    const lesson = {
      meta: { timeMinutes: 12, difficulty: "intermediate", objectives: ["x"], prereqs: [] },
      slides: [
        { kind: "text", title: "first concept", body: "body text" },
        { kind: "text", title: "second concept", body: "more text" },
        { kind: "text", title: "third concept", body: "even more" },
      ],
    };
    // Use overwrite=true so re-running tests succeeds
    const res = await save({
      nodeSlug: "test-save-roundtrip-tmp",
      lesson,
      overwrite: true,
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.path).toContain("test-save-roundtrip-tmp.json");
    expect(data.bytes).toBeGreaterThan(0);
    expect(Array.isArray(data.warnings)).toBe(true);

    // Cleanup
    try {
      const fs = await import("fs");
      const path = await import("path");
      fs.unlinkSync(path.resolve(import.meta.dir, "../../../../seed-content/lessons/test-save-roundtrip-tmp.json"));
    } catch {
      void 0;
    }
  });
});
