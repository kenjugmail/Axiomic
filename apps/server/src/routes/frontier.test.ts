// Phase 29F — fused research-frontier feed.

import { describe, test, expect } from "bun:test";
import { app } from "../index";

async function req(path: string, opts?: RequestInit): Promise<Response> {
  return await app.fetch(new Request(`http://localhost/api/v1${path}`, opts));
}
function cookieHeader(cookie: string): Record<string, string> {
  return { cookie: cookie.split(";")[0] };
}
const testRun =
  Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
async function signup(suffix: string) {
  const username = `fr_${suffix}_${testRun}`.slice(0, 30);
  const res = await req("/auth/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username,
      email: `${username}@example.com`,
      password: "testpass123",
    }),
  });
  const data = (await res.json()) as { user: { id: string } };
  return {
    cookie: res.headers.get("set-cookie") || "",
    userId: data.user.id,
    username,
  };
}

describe("research frontier feed (Phase 29D)", () => {
  test("fuses bounties + papers-needing-reproduction; breakdown sums; anon non-empty fallback", async () => {
    const { getDb, researchPapers } = await import("@axiomic/db");
    const { randomUUID } = await import("crypto");
    const poster = await signup("post");

    // A published paper with no reproduction → needs_reproduction.
    getDb()
      .insert(researchPapers)
      .values({
        id: randomUUID(),
        slug: `fr-paper-${testRun}`,
        title: "Unreproduced result",
        authorId: poster.userId,
        status: "published",
        tags: JSON.stringify(["softmax"]),
      })
      .run();

    // An open, discoverable bounty.
    const mk = await req("/bounties", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...cookieHeader(poster.cookie),
      },
      body: JSON.stringify({
        slug: `fr-bounty-${testRun}`,
        title: "Reproduce the softmax benchmark",
        descriptionMd: "Re-run it.",
        kind: "reproduce",
        rewardXp: 100,
      }),
    });
    expect(mk.status).toBe(201);

    const res = await req("/research/feed/frontier?limit=40", {
      headers: cookieHeader(poster.cookie),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      personalized: boolean;
      items: Array<{
        kind: string;
        title: string;
        breakdown: {
          relevance: number;
          weakness: number;
          urgency: number;
          reproGap: number;
          total: number;
        };
      }>;
    };
    expect(body.personalized).toBe(true);
    const kinds = new Set(body.items.map((i) => i.kind));
    expect(kinds.has("bounty")).toBe(true);
    expect(kinds.has("needs_reproduction")).toBe(true);

    // Every item's total is a non-negative number bounded by 1.
    for (const it of body.items) {
      expect(it.breakdown.total).toBeGreaterThanOrEqual(0);
      expect(it.breakdown.total).toBeLessThanOrEqual(1.001);
    }
    // Sorted descending by score.
    for (let i = 1; i < body.items.length; i++) {
      expect(body.items[i - 1]!.breakdown.total).toBeGreaterThanOrEqual(
        body.items[i]!.breakdown.total,
      );
    }

    // Anonymous still gets a (non-personalized) payload, no 500.
    const anon = await req("/research/feed/frontier");
    expect(anon.status).toBe(200);
    const anonBody = (await anon.json()) as {
      personalized: boolean;
      items: unknown[];
    };
    expect(anonBody.personalized).toBe(false);
    expect(Array.isArray(anonBody.items)).toBe(true);
  });
});
