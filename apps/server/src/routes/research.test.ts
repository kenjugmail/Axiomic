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
  const username = `rp_${suffix}_${testId}`;
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

describe("research papers — CRUD + tier reader (Sprint 20)", () => {
  test("requires auth to create", async () => {
    const res = await req("/research", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        slug: `rp-anon-${testId}`,
        title: "Anon",
        contentUndergrad: "Body",
      }),
    });
    expect(res.status).toBe(401);
  });

  test("rejects publish with no body content in any tier", async () => {
    const { cookie } = await signup("empty");
    const res = await req("/research", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(cookie) },
      body: JSON.stringify({
        slug: `rp-empty-${testId}`,
        title: "Empty paper",
        status: "published",
      }),
    });
    expect(res.status).toBe(400);
  });

  test("create draft → fetch → publish → list shows it", async () => {
    const { cookie } = await signup("crud");
    const slug = `rp-crud-${testId}`;
    const create = await req("/research", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(cookie) },
      body: JSON.stringify({
        slug,
        title: "RoPE positional encoding from scratch",
        summary: "What rotary encoding does and why it matters.",
        format: "explainer",
        abstract: "RoPE is the encoding behind LLaMA, Qwen, and most modern open-weights LLMs.",
        contentIntro: "Plain-English version with no math.",
        contentUndergrad: "## Setup\n\nGiven a query vector q and a key vector k...",
        contentGrad: "Block-diagonal rotation matrices over $\\mathbb{R}^{2}$ subspaces...",
        canonicalTier: "undergrad",
        paperStructure: {
          researchQuestion: "Why does RoPE generalize better to longer contexts?",
          method: "Algebraic derivation + ablations.",
        },
        tags: ["transformers", "positional-encoding"],
      }),
    });
    expect(create.status).toBe(201);

    // Fetch as author — sees draft.
    const draftFetch = await req(`/research/${slug}`, {
      headers: cookieHeader(cookie),
    });
    expect(draftFetch.status).toBe(200);
    const draftBody = (await draftFetch.json()) as { paper: any };
    expect(draftBody.paper.status).toBe("draft");
    expect(draftBody.paper.title).toContain("RoPE");
    expect(draftBody.paper.format).toBe("explainer");
    expect(draftBody.paper.canonicalTier).toBe("undergrad");
    expect(draftBody.paper.availableTiers).toContain("intro");
    expect(draftBody.paper.availableTiers).toContain("undergrad");
    expect(draftBody.paper.availableTiers).toContain("grad");
    expect(draftBody.paper.paperStructure.researchQuestion).toContain("RoPE");

    // Anonymous reader cannot see drafts.
    const anonFetch = await req(`/research/${slug}`);
    expect(anonFetch.status).toBe(404);

    // Publish.
    const pub = await req(`/research/${slug}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...cookieHeader(cookie) },
      body: JSON.stringify({ status: "published" }),
    });
    expect(pub.status).toBe(200);

    // Anonymous reader now sees it.
    const pubFetch = await req(`/research/${slug}?tier=intro`);
    expect(pubFetch.status).toBe(200);
    const pubBody = (await pubFetch.json()) as { paper: any };
    expect(pubBody.paper.tier).toBe("intro");
    expect(pubBody.paper.content).toContain("Plain-English");

    // List shows it.
    const list = await req("/research");
    const lb = (await list.json()) as { papers: any[] };
    expect(lb.papers.some((p) => p.slug === slug)).toBe(true);
  });

  test("tier fallback: requesting empty tier serves canonical instead", async () => {
    const { cookie } = await signup("tierfb");
    const slug = `rp-tierfb-${testId}`;
    await req("/research", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(cookie) },
      body: JSON.stringify({
        slug,
        title: "Only undergrad",
        contentUndergrad: "## Body\n\nSome content.",
        canonicalTier: "undergrad",
        status: "published",
      }),
    });

    const res = await req(`/research/${slug}?tier=grad`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { paper: any };
    expect(body.paper.requestedTier).toBe("grad");
    expect(body.paper.tier).toBe("undergrad");
    expect(body.paper.availableTiers).toEqual(["undergrad"]);
  });

  test("update is author-only (403 for strangers)", async () => {
    const author = await signup("auth_owner");
    const stranger = await signup("auth_stranger");
    const slug = `rp-auth-${testId}`;
    await req("/research", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(author.cookie) },
      body: JSON.stringify({
        slug,
        title: "Mine",
        contentUndergrad: "Body.",
      }),
    });

    const res = await req(`/research/${slug}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...cookieHeader(stranger.cookie) },
      body: JSON.stringify({ title: "Stolen" }),
    });
    expect(res.status).toBe(403);
  });

  test("slug collision returns 409", async () => {
    const { cookie } = await signup("colp");
    const slug = `rp-col-${testId}`;
    const first = await req("/research", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(cookie) },
      body: JSON.stringify({
        slug,
        title: "First",
        contentUndergrad: "Body.",
      }),
    });
    expect(first.status).toBe(201);
    const second = await req("/research", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(cookie) },
      body: JSON.stringify({
        slug,
        title: "Second",
        contentUndergrad: "Body.",
      }),
    });
    expect(second.status).toBe(409);
  });

  test("drafts list returns only the caller's drafts", async () => {
    const a = await signup("dl_a");
    const b = await signup("dl_b");
    await req("/research", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(a.cookie) },
      body: JSON.stringify({
        slug: `rp-dla-${testId}`,
        title: "A's draft",
        contentUndergrad: "Body.",
      }),
    });
    await req("/research", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(b.cookie) },
      body: JSON.stringify({
        slug: `rp-dlb-${testId}`,
        title: "B's draft",
        contentUndergrad: "Body.",
      }),
    });

    const aRes = await req("/research/me/drafts", {
      headers: cookieHeader(a.cookie),
    });
    const aBody = (await aRes.json()) as { papers: any[] };
    const aSlugs = aBody.papers.map((p) => p.slug);
    expect(aSlugs).toContain(`rp-dla-${testId}`);
    expect(aSlugs).not.toContain(`rp-dlb-${testId}`);
  });
});
