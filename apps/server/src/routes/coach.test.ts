import { describe, test, expect } from "bun:test";
import { app } from "../index";

async function req(path: string, opts?: RequestInit): Promise<Response> {
  return await app.fetch(new Request(`http://localhost/api/v1${path}`, opts));
}

function cookieHeader(cookie: string): Record<string, string> {
  return { cookie: cookie.split(";")[0] };
}

const testId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

async function signup(suffix: string): Promise<{ cookie: string; username: string }> {
  const username = `coach_${suffix}_${testId}`;
  const res = await req("/auth/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username,
      email: `${username}@example.com`,
      password: "testpass123",
    }),
  });
  const cookie = res.headers.get("set-cookie") || "";
  return { cookie, username };
}

describe("coach context + suggest (Sprint 18)", () => {
  test("requires authentication", async () => {
    const ctxRes = await req("/ai/coach/context");
    expect(ctxRes.status).toBe(401);
    const sugRes = await req("/ai/coach/suggest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(sugRes.status).toBe(401);
  });

  test("fresh user gets empty arrays + zero due cards", async () => {
    const { cookie } = await signup("fresh");
    const res = await req("/ai/coach/context", {
      headers: cookieHeader(cookie),
    });
    expect(res.status).toBe(200);
    const ctx = (await res.json()) as any;
    expect(Array.isArray(ctx.recentMistakes)).toBe(true);
    expect(ctx.recentMistakes).toHaveLength(0);
    expect(ctx.dueFlashcards).toBe(0);
    expect(Array.isArray(ctx.weakConcepts)).toBe(true);
    expect(ctx.weakConcepts).toHaveLength(0);
    expect(ctx.currentLessonProgress).toBeNull();
    expect(Array.isArray(ctx.prerequisiteGaps)).toBe(true);
  });

  test("suggest returns an array (possibly empty) for a fresh user", async () => {
    const { cookie } = await signup("sug");
    const res = await req("/ai/coach/suggest", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(cookie) },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(Array.isArray(body.suggestions)).toBe(true);
    expect(body.suggestions.length).toBeLessThanOrEqual(3);
  });

  test("prereq gaps populate when pageSlug points at a node with prereqs the user hasn't completed", async () => {
    const { cookie } = await signup("prereq");
    // The seeded `attention` page is taught by the `attention-intro`
    // mastery node, which has prereqs `embeddings-basics` +
    // `softmax-basics`. A brand-new user has completed neither, so
    // the gap list should be non-empty.
    const res = await req("/ai/coach/context?pageSlug=attention", {
      headers: cookieHeader(cookie),
    });
    expect(res.status).toBe(200);
    const ctx = (await res.json()) as any;
    expect(Array.isArray(ctx.prerequisiteGaps)).toBe(true);
    expect(ctx.prerequisiteGaps.length).toBeGreaterThan(0);
    const titles = ctx.prerequisiteGaps.map((g: any) => g.title);
    // Sanity: at least one of the seeded prereqs appears.
    const hasPrereq = titles.some(
      (t: string) =>
        t.toLowerCase().includes("embedding") ||
        t.toLowerCase().includes("softmax"),
    );
    expect(hasPrereq).toBe(true);
  });

  test("lite mode skips the prereq-gap walk", async () => {
    const { cookie } = await signup("lite");
    const res = await req("/ai/coach/context?pageSlug=attention&lite=1", {
      headers: cookieHeader(cookie),
    });
    expect(res.status).toBe(200);
    const ctx = (await res.json()) as any;
    expect(ctx.prerequisiteGaps).toEqual([]);
  });
});
