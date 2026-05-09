// Sprint 66b — wiki route coverage.
//
// Wiki is one of the most-edited surfaces and had no dedicated suite.
// Covers GET happy path, slug-uniqueness, version creation on PUT,
// restore behavior, and 404s.

import { describe, test, expect, beforeAll } from "bun:test";
import { app } from "../index";

async function req(path: string, opts?: RequestInit): Promise<Response> {
  return await app.fetch(new Request(`http://localhost/api/v1${path}`, opts));
}

function cookieHeader(cookie: string): Record<string, string> {
  return { cookie: cookie.split(";")[0] };
}

const testId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
let counter = 0;
function nextSlug(label: string): string {
  return `wiki-${label}-${testId}-${counter++}`;
}

async function signup(label: string): Promise<{ cookie: string; username: string }> {
  const username = `wiki_${label}_${testId}_${counter++}`;
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

let authorCookie = "";

beforeAll(async () => {
  const { cookie } = await signup("author");
  authorCookie = cookie;
});

describe("wiki route (Sprint 66b)", () => {
  test("GET /wiki/:slug returns 404 for unknown slug", async () => {
    const res = await req("/wiki/this-page-does-not-exist-zzz");
    expect(res.status).toBe(404);
  });

  test("POST / creates a new page with v1 content", async () => {
    const slug = nextSlug("create");
    const res = await req("/wiki", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(authorCookie) },
      body: JSON.stringify({
        slug,
        title: "Created Page",
        category: "test",
        contentIntro: "intro v1",
        contentUndergrad: "undergrad v1",
        contentGrad: "grad v1",
      }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as any;
    expect(body.page.slug).toBe(slug);
    expect(body.page.currentVersion).toBe(1);

    const get = await req(`/wiki/${slug}`);
    expect(get.status).toBe(200);
    const fetched = (await get.json()) as any;
    expect(fetched.page.slug).toBe(slug);
    expect(fetched.content).toBe("intro v1");
    expect(fetched.allContent.intro).toBe("intro v1");
    expect(fetched.allContent.undergrad).toBe("undergrad v1");
    expect(fetched.allContent.grad).toBe("grad v1");
    expect(fetched.versions).toHaveLength(1);
  });

  test("POST / requires authentication", async () => {
    const res = await req("/wiki", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        slug: nextSlug("anon"),
        title: "Anon",
        contentIntro: "x",
        contentUndergrad: "x",
        contentGrad: "x",
      }),
    });
    // requireAuth returns 401 when no session.
    expect(res.status).toBe(401);
  });

  test("POST / 200 for valid create (sanity, after slug-fix)", async () => {
    // Sanity-check after fixing trailing-slash on the route.
    const slug = nextSlug("sanity");
    const res = await req("/wiki", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(authorCookie) },
      body: JSON.stringify({
        slug,
        title: "Sanity",
        contentIntro: "i",
        contentUndergrad: "u",
        contentGrad: "g",
      }),
    });
    expect(res.status).toBe(201);
  });

  test("POST / rejects duplicate slug with 409", async () => {
    const slug = nextSlug("dupe");
    const first = await req("/wiki", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(authorCookie) },
      body: JSON.stringify({
        slug,
        title: "First",
        contentIntro: "i",
        contentUndergrad: "u",
        contentGrad: "g",
      }),
    });
    expect(first.status).toBe(201);
    const second = await req("/wiki", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(authorCookie) },
      body: JSON.stringify({
        slug,
        title: "Second",
        contentIntro: "i",
        contentUndergrad: "u",
        contentGrad: "g",
      }),
    });
    expect(second.status).toBe(409);
  });

  test("POST / rejects malformed slug (zod)", async () => {
    const res = await req("/wiki", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(authorCookie) },
      body: JSON.stringify({
        slug: "Not Kebab Case",
        title: "Bad",
        contentIntro: "i",
        contentUndergrad: "u",
        contentGrad: "g",
      }),
    });
    expect(res.status).toBe(400);
  });

  test("PUT /:slug creates a new version + bumps currentVersion", async () => {
    const slug = nextSlug("put");
    await req("/wiki", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(authorCookie) },
      body: JSON.stringify({
        slug,
        title: "Putable",
        contentIntro: "intro v1",
        contentUndergrad: "u v1",
        contentGrad: "g v1",
      }),
    });

    const put = await req(`/wiki/${slug}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...cookieHeader(authorCookie) },
      body: JSON.stringify({
        contentIntro: "intro v2",
        contentUndergrad: "u v2",
        contentGrad: "g v2",
        editMessage: "second pass",
      }),
    });
    expect(put.status).toBe(200);
    const body = (await put.json()) as any;
    expect(body.page.currentVersion).toBe(2);

    const get = await req(`/wiki/${slug}?tier=intro`);
    const fetched = (await get.json()) as any;
    expect(fetched.content).toBe("intro v2");
    expect(fetched.versions).toHaveLength(2);
  });

  test("GET /:slug?tier=undergrad returns the matching tier content", async () => {
    const slug = nextSlug("tier");
    await req("/wiki", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(authorCookie) },
      body: JSON.stringify({
        slug,
        title: "Tiered",
        contentIntro: "INTRO",
        contentUndergrad: "UNDERGRAD",
        contentGrad: "GRAD",
      }),
    });
    const ug = await req(`/wiki/${slug}?tier=undergrad`);
    expect(((await ug.json()) as any).content).toBe("UNDERGRAD");
    const grad = await req(`/wiki/${slug}?tier=grad`);
    expect(((await grad.json()) as any).content).toBe("GRAD");
  });

  test("PUT /:slug requires authentication", async () => {
    const slug = nextSlug("putanon");
    await req("/wiki", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(authorCookie) },
      body: JSON.stringify({
        slug,
        title: "Anon target",
        contentIntro: "i",
        contentUndergrad: "u",
        contentGrad: "g",
      }),
    });
    const res = await req(`/wiki/${slug}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contentIntro: "x",
        contentUndergrad: "x",
        contentGrad: "x",
      }),
    });
    expect(res.status).toBe(401);
  });

  test("PUT /:slug 404s on unknown slug", async () => {
    const res = await req("/wiki/missing-page-zzz", {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...cookieHeader(authorCookie) },
      body: JSON.stringify({
        contentIntro: "x",
        contentUndergrad: "x",
        contentGrad: "x",
      }),
    });
    expect(res.status).toBe(404);
  });

  test("POST /:slug/restore creates a new version matching the target", async () => {
    const slug = nextSlug("restore");
    await req("/wiki", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(authorCookie) },
      body: JSON.stringify({
        slug,
        title: "Restorable",
        contentIntro: "v1 intro",
        contentUndergrad: "v1 u",
        contentGrad: "v1 g",
      }),
    });
    await req(`/wiki/${slug}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...cookieHeader(authorCookie) },
      body: JSON.stringify({
        contentIntro: "v2 intro",
        contentUndergrad: "v2 u",
        contentGrad: "v2 g",
      }),
    });
    const restore = await req(`/wiki/${slug}/restore`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(authorCookie) },
      body: JSON.stringify({ version: 1 }),
    });
    expect(restore.status).toBe(200);
    const body = (await restore.json()) as any;
    expect(body.page.currentVersion).toBe(3);

    const get = await req(`/wiki/${slug}`);
    const fetched = (await get.json()) as any;
    expect(fetched.content).toBe("v1 intro");
    expect(fetched.versions).toHaveLength(3);
  });

  test("POST /:slug/restore 404s on unknown version", async () => {
    const slug = nextSlug("restorebad");
    await req("/wiki", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(authorCookie) },
      body: JSON.stringify({
        slug,
        title: "Restorable",
        contentIntro: "v1",
        contentUndergrad: "v1",
        contentGrad: "v1",
      }),
    });
    const res = await req(`/wiki/${slug}/restore`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(authorCookie) },
      body: JSON.stringify({ version: 999 }),
    });
    expect(res.status).toBe(404);
  });

  test("GET / lists pages with category filter", async () => {
    const slug = nextSlug("listed");
    await req("/wiki", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(authorCookie) },
      body: JSON.stringify({
        slug,
        title: "Listed",
        category: `wiki-test-${testId}`,
        contentIntro: "i",
        contentUndergrad: "u",
        contentGrad: "g",
      }),
    });
    const res = await req(`/wiki?category=wiki-test-${testId}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(Array.isArray(body.pages)).toBe(true);
    expect(body.pages.some((p: any) => p.slug === slug)).toBe(true);
  });
});
