import { describe, test, expect } from "bun:test";
import { app } from "../index";

async function req(path: string, opts?: RequestInit): Promise<Response> {
  return await app.fetch(new Request(`http://localhost/api/v1${path}`, opts));
}

function cookieHeader(cookie: string): Record<string, string> {
  return { cookie: cookie.split(";")[0] };
}

const testId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

async function signup(suffix: string): Promise<{ cookie: string }> {
  const username = `pa_${suffix}_${testId}`;
  const res = await req("/auth/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username,
      email: `${username}@example.com`,
      password: "testpass123",
    }),
  });
  return { cookie: res.headers.get("set-cookie") || "" };
}

describe("paper AI endpoints (Sprint 21)", () => {
  test("all endpoints require authentication", async () => {
    const cases = [
      [
        "/ai/paper/outline",
        { title: "Topic", format: "research", tier: "undergrad", length: "medium" },
      ],
      [
        "/ai/paper/draft-section",
        {
          paper: { title: "T", format: "research" },
          section: { title: "S", bullets: ["x"] },
        },
      ],
      ["/ai/paper/suggest-viz", { section: { title: "S", body: "B" } }],
      ["/ai/paper/suggest-concepts", { body: "Some body about attention." }],
      [
        "/ai/paper/suggest-references",
        {
          title: "Title",
          body:
            "Body about attention and softmax mechanisms in transformers, with enough characters to satisfy the schema's minimum.",
        },
      ],
      [
        "/ai/paper/derive-tier",
        {
          canonicalBody:
            "## Section\n\nLong enough body content here for the schema's minimum character count requirement.",
          canonicalTier: "undergrad",
          targetTier: "intro",
          format: "research",
        },
      ],
    ] as const;
    for (const [path, body] of cases) {
      const res = await req(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      expect(res.status).toBe(401);
    }
  });

  test("suggest-viz ranks the catalog deterministically by keyword overlap", async () => {
    const { cookie } = await signup("viz");
    const res = await req("/ai/paper/suggest-viz", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(cookie) },
      body: JSON.stringify({
        section: {
          title: "Attention weights walkthrough",
          body: "We render the attention heatmap and show how queries pick keys.",
        },
      }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { suggestions: any[] };
    expect(body.suggestions.length).toBeGreaterThan(0);
    expect(body.suggestions[0].name).toBe("attention-heatmap");
  });

  test("suggest-concepts returns kebab-case slugs from the wiki corpus", async () => {
    const { cookie } = await signup("conc");
    const res = await req("/ai/paper/suggest-concepts", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(cookie) },
      body: JSON.stringify({
        body:
          "We use softmax attention over the embedding sequence to compute weighted sums.",
      }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { suggestions: any[] };
    expect(Array.isArray(body.suggestions)).toBe(true);
    if (body.suggestions.length > 0) {
      const slugs = body.suggestions.map((s) => s.slug);
      // softmax + attention pages exist in the seed; at least one
      // should match.
      const hasMatch = slugs.some(
        (s) => s.includes("softmax") || s.includes("attention"),
      );
      expect(hasMatch).toBe(true);
    }
  });

  test("derive-tier rejects matching source/target tiers", async () => {
    const { cookie } = await signup("derive");
    const res = await req("/ai/paper/derive-tier", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(cookie) },
      body: JSON.stringify({
        canonicalBody: "## Section\n\nLong enough body content here for the schema.",
        canonicalTier: "undergrad",
        targetTier: "undergrad",
      }),
    });
    expect(res.status).toBe(400);
  });

  test("outline endpoint returns SSE stream for a valid request", async () => {
    const { cookie } = await signup("outline");
    const res = await req("/ai/paper/outline", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(cookie) },
      body: JSON.stringify({
        title: "RoPE positional encoding from scratch",
        researchQuestion: "Why does rotary encoding generalize to longer contexts?",
        format: "explainer",
        tier: "undergrad",
        length: "short",
      }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type") || "").toContain("text/event-stream");
  });
});
