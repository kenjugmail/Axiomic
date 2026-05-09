// Sprint 66b — ai route coverage focused on the gaps left by
// `coach.test.ts` and `tutor-modes.test.ts`: the `/ai/chat` streaming
// endpoint + the `/ai/models` listing (S63f).
//
// `/ai/chat` returns an SSE stream; we read the body fully and assert
// on the encoded events, since the mock provider is deterministic.

import { describe, test, expect } from "bun:test";
import { app } from "../index";

async function req(path: string, opts?: RequestInit): Promise<Response> {
  return await app.fetch(new Request(`http://localhost/api/v1${path}`, opts));
}

const testId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

async function readSSE(res: Response): Promise<string> {
  if (!res.body) return "";
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let out = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    out += decoder.decode(value, { stream: true });
  }
  return out + decoder.decode();
}

describe("ai/chat (Sprint 66b)", () => {
  test("rejects malformed body with 400", async () => {
    const res = await req("/ai/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: [] }),
    });
    expect(res.status).toBe(400);
  });

  test("happy path streams an SSE response with [DONE] sentinel", async () => {
    const res = await req("/ai/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pageSlug: `mock-${testId}`,
        tier: "intro",
        messages: [{ role: "user", content: "What is attention?" }],
      }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type") || "").toContain("text/event-stream");
    const body = await readSSE(res);
    expect(body).toContain("data:");
    expect(body).toContain("[DONE]");
  });

  test("anonymous chat works (unauthenticated baseline)", async () => {
    const res = await req("/ai/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pageSlug: `anon-${testId}`,
        tier: "intro",
        messages: [{ role: "user", content: "ping" }],
      }),
    });
    expect(res.status).toBe(200);
    const body = await readSSE(res);
    expect(body).toContain("[DONE]");
  });

  test("accepts an optional model parameter", async () => {
    const res = await req("/ai/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pageSlug: `model-${testId}`,
        tier: "intro",
        messages: [{ role: "user", content: "hi" }],
        model: "mock-fast",
      }),
    });
    expect(res.status).toBe(200);
    const body = await readSSE(res);
    expect(body).toContain("[DONE]");
  });

  test("rejects an invalid tutor mode with 400", async () => {
    const res = await req("/ai/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pageSlug: `mode-${testId}`,
        tier: "intro",
        messages: [{ role: "user", content: "hi" }],
        // Schema enforces a specific enum; an arbitrary string should 400.
        mode: "totally-invalid-mode",
      }),
    });
    expect(res.status).toBe(400);
  });
});

describe("ai/models (Sprint 66b — Sprint 63f endpoint)", () => {
  test("returns {available, default, provider} shape", async () => {
    const res = await req("/ai/models");
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(Array.isArray(body.available)).toBe(true);
    expect(typeof body.default).toBe("string");
    expect(typeof body.provider).toBe("string");
    // Mock provider should expose at least one model.
    expect(body.available.length).toBeGreaterThan(0);
    expect(body.available[0]).toHaveProperty("id");
  });

  test("AI_AVAILABLE_MODELS env override is respected", async () => {
    const before = process.env.AI_AVAILABLE_MODELS;
    process.env.AI_AVAILABLE_MODELS = "ovr-alpha,ovr-beta";
    try {
      const res = await req("/ai/models");
      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      const ids = body.available.map((m: any) => m.id);
      expect(ids).toContain("ovr-alpha");
      expect(ids).toContain("ovr-beta");
    } finally {
      if (before === undefined) delete process.env.AI_AVAILABLE_MODELS;
      else process.env.AI_AVAILABLE_MODELS = before;
    }
  });
});
