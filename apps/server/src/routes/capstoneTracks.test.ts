import { describe, test, expect } from "bun:test";
import { app } from "../index";

async function req(path: string, opts?: RequestInit): Promise<Response> {
  return await app.fetch(new Request(`http://localhost/api/v1${path}`, opts));
}

function cookieHeader(cookie: string): Record<string, string> {
  return { cookie: cookie.split(";")[0] };
}

const testId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

async function signup(
  suffix: string,
): Promise<{ cookie: string; username: string }> {
  const username = `tr_${suffix}_${testId}`.slice(0, 30);
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

const minimalRubric = {
  criteria: [
    {
      id: "correctness",
      weight: 1,
      description: "Code does what's asked.",
      aiPrompt: "Score correctness.",
    },
  ],
  passingScore: 0.6,
};

async function createCapstone(
  cookie: string,
  slug: string,
  milestoneCount = 1,
): Promise<string> {
  const res = await req("/capstones", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...cookieHeader(cookie) },
    body: JSON.stringify({
      slug,
      title: `Capstone ${slug}`,
      contentUndergrad: `Body ${slug}`,
      status: "published",
    }),
  });
  expect(res.status).toBe(201);
  const data = (await res.json()) as { id: string };
  for (let i = 0; i < milestoneCount; i++) {
    const mr = await req(`/capstones/${slug}/milestones`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(cookie) },
      body: JSON.stringify({
        title: `Milestone ${i + 1}`,
        description: "Do the thing.",
        rubric: minimalRubric,
        requiredArtifactKinds: ["github"],
        estimatedDays: 3,
      }),
    });
    expect(mr.status).toBe(201);
  }
  return data.id;
}

describe("capstone tracks CRUD (Sprint 52)", () => {
  test("anonymous create rejected", async () => {
    const res = await req("/tracks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        slug: `tr-anon-${testId}`,
        title: "Anon",
      }),
    });
    expect(res.status).toBe(401);
  });

  test("create + attach + detail listing", async () => {
    const author = await signup("a1");
    const trackSlug = `track-a1-${testId}`;

    const create = await req("/tracks", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...cookieHeader(author.cookie),
      },
      body: JSON.stringify({
        slug: trackSlug,
        title: "Test track",
        summary: "Test track summary",
        contentUndergrad: "## body",
        status: "published",
      }),
    });
    expect(create.status).toBe(201);

    const cap1 = `tr-cap1-${testId}`;
    const cap2 = `tr-cap2-${testId}`;
    await createCapstone(author.cookie, cap1);
    await createCapstone(author.cookie, cap2);

    const a1 = await req(`/tracks/${trackSlug}/capstones`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...cookieHeader(author.cookie),
      },
      body: JSON.stringify({ capstoneSlug: cap1, order: 0, optional: false }),
    });
    expect(a1.status).toBe(201);

    const a2 = await req(`/tracks/${trackSlug}/capstones`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...cookieHeader(author.cookie),
      },
      body: JSON.stringify({ capstoneSlug: cap2, order: 1, optional: true }),
    });
    expect(a2.status).toBe(201);

    const detail = await req(`/tracks/${trackSlug}`);
    expect(detail.status).toBe(200);
    const detailData = (await detail.json()) as {
      track: { slug: string; title: string };
      capstones: Array<{ slug: string; order: number; optional: boolean }>;
      myCompletion: unknown;
    };
    expect(detailData.track.slug).toBe(trackSlug);
    expect(detailData.capstones.length).toBe(2);
    expect(detailData.capstones[0].slug).toBe(cap1);
    expect(detailData.capstones[0].optional).toBe(false);
    expect(detailData.capstones[1].optional).toBe(true);
    expect(detailData.myCompletion).toBeNull();

    const list = await req("/tracks");
    expect(list.status).toBe(200);
    const listData = (await list.json()) as {
      tracks: Array<{ slug: string; capstoneCount: number; requiredCount: number }>;
    };
    const ours = listData.tracks.find((t) => t.slug === trackSlug);
    expect(ours).toBeDefined();
    expect(ours!.capstoneCount).toBe(2);
    expect(ours!.requiredCount).toBe(1);
  });

  test("non-author cannot attach capstones", async () => {
    const owner = await signup("a2");
    const stranger = await signup("a3");
    const trackSlug = `track-a2-${testId}`;
    await req("/tracks", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...cookieHeader(owner.cookie),
      },
      body: JSON.stringify({
        slug: trackSlug,
        title: "Owned",
        contentUndergrad: "x",
        status: "published",
      }),
    });
    const cap = `tr-cap3-${testId}`;
    await createCapstone(owner.cookie, cap);

    const res = await req(`/tracks/${trackSlug}/capstones`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...cookieHeader(stranger.cookie),
      },
      body: JSON.stringify({ capstoneSlug: cap }),
    });
    expect(res.status).toBe(403);
  });

  test("draft track invisible to non-author", async () => {
    const author = await signup("a4");
    const stranger = await signup("a5");
    const trackSlug = `track-a4-${testId}`;
    await req("/tracks", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...cookieHeader(author.cookie),
      },
      body: JSON.stringify({
        slug: trackSlug,
        title: "Draft",
        contentUndergrad: "x",
        status: "draft",
      }),
    });

    const fromStranger = await req(`/tracks/${trackSlug}`, {
      headers: cookieHeader(stranger.cookie),
    });
    expect(fromStranger.status).toBe(404);

    const fromAuthor = await req(`/tracks/${trackSlug}`, {
      headers: cookieHeader(author.cookie),
    });
    expect(fromAuthor.status).toBe(200);
  });

  test("public artifact returns 404 when no completion exists", async () => {
    const res = await req(`/tracks/c/never-${testId}`);
    expect(res.status).toBe(404);
  });
});
