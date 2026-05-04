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
  const username = `act_${suffix}_${testId}`;
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

describe("activity routes", () => {
  test("GET /activity/users/:username returns events for known users", async () => {
    const { cookie, username } = await signup("a");

    // Save a flashcard to seed an activity row.
    await req("/flashcards", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(cookie) },
      body: JSON.stringify({
        pageSlug: "softmax",
        pageTitle: "Softmax",
        front: "What is softmax?",
        back: "An exp/sum normalization.",
      }),
    });

    const res = await req(`/activity/users/${username}?limit=3`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { events: Array<Record<string, string>> };
    expect(Array.isArray(body.events)).toBe(true);
    expect(body.events.length).toBeGreaterThan(0);
    expect(body.events[0]).toHaveProperty("kind");
    expect(body.events[0]).toHaveProperty("title");
    expect(body.events[0]).toHaveProperty("href");
    expect(body.events[0]).toHaveProperty("occurredAt");
  });

  test("GET /activity/users/:username 404s for unknown users", async () => {
    const res = await req("/activity/users/nope-not-real-user-xyz");
    expect(res.status).toBe(404);
  });
});

describe("flashcards due/count", () => {
  test("returns 0 for a user with no cards", async () => {
    const { cookie } = await signup("b");
    const res = await req("/flashcards/due/count", {
      headers: cookieHeader(cookie),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { count: number };
    expect(body.count).toBe(0);
  });

  test("counts due cards (new cards count as due)", async () => {
    const { cookie } = await signup("c");
    await req("/flashcards", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(cookie) },
      body: JSON.stringify({
        pageSlug: "attention",
        pageTitle: "Attention",
        front: "Q",
        back: "A",
      }),
    });
    const res = await req("/flashcards/due/count", {
      headers: cookieHeader(cookie),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { count: number };
    expect(body.count).toBe(1);
  });

  test("requires auth", async () => {
    const res = await req("/flashcards/due/count");
    expect(res.status).toBe(401);
  });
});

describe("mastery next-node", () => {
  test("requires auth", async () => {
    const res = await req("/mastery/next-node");
    expect(res.status).toBe(401);
  });

  test("returns null or a node payload for an authed user", async () => {
    const { cookie } = await signup("d");
    const res = await req("/mastery/next-node", {
      headers: cookieHeader(cookie),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { next: any };
    // Either no paths exist (test isolation w/o seed) or a node is returned
    // with the documented shape.
    if (body.next !== null) {
      expect(body.next).toHaveProperty("pathSlug");
      expect(body.next).toHaveProperty("nodeSlug");
      expect(body.next).toHaveProperty("level");
      expect(body.next).toHaveProperty("hasLesson");
    }
  });
});

describe("wiki create + restore", () => {
  test("POST /wiki creates a new page; rejects duplicate slugs", async () => {
    const { cookie } = await signup("e");
    const slug = `created-${testId}`;
    const res = await req("/wiki", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(cookie) },
      body: JSON.stringify({
        slug,
        title: "Created Page",
        category: "test",
        contentIntro: "intro body",
        contentUndergrad: "ug body",
        contentGrad: "grad body",
      }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { page: { slug: string; currentVersion: number } };
    expect(body.page.slug).toBe(slug);
    expect(body.page.currentVersion).toBe(1);

    // Duplicate slug rejected.
    const dup = await req("/wiki", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(cookie) },
      body: JSON.stringify({
        slug,
        title: "Other",
        contentIntro: "x",
        contentUndergrad: "x",
        contentGrad: "x",
      }),
    });
    expect(dup.status).toBe(409);
  });

  test("POST /wiki/:slug/restore writes a new version with the chosen version's content", async () => {
    const { cookie } = await signup("f");
    const slug = `restorable-${testId}`;
    await req("/wiki", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(cookie) },
      body: JSON.stringify({
        slug,
        title: "Restorable",
        contentIntro: "ORIGINAL_INTRO",
        contentUndergrad: "ORIGINAL_UG",
        contentGrad: "ORIGINAL_GRAD",
      }),
    });

    // Edit it.
    await req(`/wiki/${slug}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...cookieHeader(cookie) },
      body: JSON.stringify({
        contentIntro: "EDITED_INTRO",
        contentUndergrad: "EDITED_UG",
        contentGrad: "EDITED_GRAD",
      }),
    });

    // Restore v1.
    const restore = await req(`/wiki/${slug}/restore`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(cookie) },
      body: JSON.stringify({ version: 1 }),
    });
    expect(restore.status).toBe(200);

    // After restore, the page's current content matches v1.
    const after = await req(`/wiki/${slug}`);
    expect(after.status).toBe(200);
    const body = (await after.json()) as { content: string; allContent: Record<string, string>; page: { currentVersion: number } };
    expect(body.allContent.intro).toBe("ORIGINAL_INTRO");
    expect(body.allContent.undergrad).toBe("ORIGINAL_UG");
    expect(body.page.currentVersion).toBe(3);
  });

  test("POST /wiki/:slug/restore 404s on unknown slug", async () => {
    const { cookie } = await signup("g");
    const res = await req("/wiki/no-such-page-xyz/restore", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(cookie) },
      body: JSON.stringify({ version: 1 }),
    });
    expect(res.status).toBe(404);
  });
});
