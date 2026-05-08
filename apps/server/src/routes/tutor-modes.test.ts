// Sprint 30 — tutor-mode behaviour tests. We can't deterministically
// assert what an LLM returns, but we CAN assert the gating + 400s.

import { describe, test, expect } from "bun:test";
import { app } from "../index";

async function req(path: string, opts?: RequestInit): Promise<Response> {
  return await app.fetch(new Request(`http://localhost/api/v1${path}`, opts));
}

function cookieHeader(cookie: string): Record<string, string> {
  return { cookie: cookie.split(";")[0] };
}

const testId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

async function signup(suffix: string): Promise<string> {
  const username = `tm_${suffix}_${testId}`.slice(0, 30);
  const res = await req("/auth/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username,
      email: `${username}@example.com`,
      password: "testpass123",
    }),
  });
  return res.headers.get("set-cookie") || "";
}

describe("AI tutor modes (Sprint 30)", () => {
  test("debate mode without forumTopicId is rejected", async () => {
    const cookie = await signup("debate");
    const res = await req("/ai/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(cookie) },
      body: JSON.stringify({
        pageSlug: "attention",
        tier: "intro",
        messages: [{ role: "user", content: "challenge me" }],
        mode: "debate",
      }),
    });
    expect(res.status).toBe(400);
  });

  test("misconception mode without diagnosisId is rejected", async () => {
    const cookie = await signup("misc");
    const res = await req("/ai/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(cookie) },
      body: JSON.stringify({
        pageSlug: "softmax",
        tier: "intro",
        messages: [{ role: "user", content: "help" }],
        mode: "misconception",
      }),
    });
    expect(res.status).toBe(400);
  });

  test("contribution mode without auth is rejected", async () => {
    const res = await req("/ai/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pageSlug: "softmax",
        tier: "intro",
        messages: [{ role: "user", content: "what should I write?" }],
        mode: "contribution",
      }),
    });
    expect(res.status).toBe(400);
  });

  test("socratic mode is accepted without extra context", async () => {
    const cookie = await signup("soc");
    const res = await req("/ai/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(cookie) },
      body: JSON.stringify({
        pageSlug: "softmax",
        tier: "intro",
        messages: [{ role: "user", content: "explain" }],
        mode: "socratic",
      }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type") ?? "").toContain("text/event-stream");
  });
});
