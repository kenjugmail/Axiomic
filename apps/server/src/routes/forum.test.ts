import { describe, test, expect, beforeAll } from "bun:test";
import { app } from "../index";
import { checkRateLimit, rateLimits } from "../lib/rateLimit";

async function req(path: string, opts?: RequestInit): Promise<Response> {
  return await app.fetch(new Request(`http://localhost/api/v1${path}`, opts));
}

function cookieHeader(setCookie: string | null): Record<string, string> {
  if (!setCookie) return {};
  return { cookie: setCookie.split(";")[0] };
}

const testId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

async function signupAndCookie(suffix: string): Promise<{ cookie: string; username: string }> {
  const username = `forum_${suffix}_${testId}`;
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

describe("Forum: domains and topics", () => {
  test("GET /forum/domains returns at least the seeded ones", async () => {
    const res = await req("/forum/domains");
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    const slugs = data.domains.map((d: any) => d.slug);
    expect(slugs).toContain("ml");
  });

  test("GET /forum/topics returns seeded topics", async () => {
    const res = await req("/forum/topics?sort=new");
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.topics.length).toBeGreaterThan(0);
    const t = data.topics[0];
    expect(typeof t.slug).toBe("string");
    expect(typeof t.title).toBe("string");
    expect(typeof t.score).toBe("number");
    expect(typeof t.postCount).toBe("number");
  });

  test("GET /forum/topics filters by domain", async () => {
    const res = await req("/forum/topics?domain=ml");
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    for (const t of data.topics) expect(t.domainSlug).toBe("ml");
  });

  test("GET /forum/topics filters by postType", async () => {
    const res = await req("/forum/topics?postType=question");
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    for (const t of data.topics) expect(t.postType).toBe("question");
  });
});

describe("Forum: create topic + reply + vote", () => {
  let cookie = "";
  let username = "";
  let createdSlug = "";

  beforeAll(async () => {
    const s = await signupAndCookie("author");
    cookie = s.cookie;
    username = s.username;
  });

  test("create without auth returns 401", async () => {
    const res = await req("/forum/topics", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "x",
        body: "y",
        postType: "claim",
        domainSlug: "ml",
      }),
    });
    expect(res.status).toBe(401);
  });

  test("create with bad postType is rejected", async () => {
    const res = await req("/forum/topics", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(cookie) },
      body: JSON.stringify({
        title: "Test",
        body: "Body",
        postType: "rant",
        domainSlug: "ml",
      }),
    });
    expect(res.status).toBe(400);
  });

  test("create succeeds and topic is fetchable", async () => {
    const res = await req("/forum/topics", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(cookie) },
      body: JSON.stringify({
        title: `Test claim from ${username}`,
        body: "I claim that X.",
        postType: "claim",
        domainSlug: "ml",
      }),
    });
    expect(res.status).toBe(201);
    const data = (await res.json()) as any;
    expect(data.topic.title).toContain("Test claim");
    expect(data.topic.postType).toBe("claim");
    expect(data.topic.authorUsername).toBe(username);
    createdSlug = data.topic.slug;

    // Fetchable by slug
    const fetchRes = await req(`/forum/topics/${createdSlug}`);
    expect(fetchRes.status).toBe(200);
    const fetchData = (await fetchRes.json()) as any;
    expect(fetchData.topic.title).toContain("Test claim");
    expect(fetchData.topic.posts).toEqual([]);
  });

  test("reply requires auth", async () => {
    const res = await req(`/forum/topics/${createdSlug}/posts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: "no auth" }),
    });
    expect(res.status).toBe(401);
  });

  test("reply succeeds and appears in topic detail", async () => {
    const res = await req(`/forum/topics/${createdSlug}/posts`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(cookie) },
      body: JSON.stringify({ body: "First reply." }),
    });
    expect(res.status).toBe(201);

    const fetchData = (await (await req(`/forum/topics/${createdSlug}`)).json()) as any;
    expect(fetchData.topic.posts.length).toBe(1);
    expect(fetchData.topic.posts[0].body).toBe("First reply.");
    expect(fetchData.topic.postCount).toBe(1);
  });

  test("vote toggle on topic flips score and userVote", async () => {
    // Use a different account so we can vote (no self-vote restriction in our impl,
    // but a fresh account exercises the path where there's no prior vote).
    const voter = await signupAndCookie("voter");

    let res = await req(`/forum/topics/${createdSlug}/vote`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(voter.cookie) },
      body: JSON.stringify({ value: 1 }),
    });
    expect(res.status).toBe(200);

    let data = (await (await req(`/forum/topics/${createdSlug}`, {
      headers: cookieHeader(voter.cookie),
    })).json()) as any;
    expect(data.topic.score).toBe(1);
    expect(data.topic.userVote).toBe(1);

    // Same vote toggles off.
    res = await req(`/forum/topics/${createdSlug}/vote`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(voter.cookie) },
      body: JSON.stringify({ value: 1 }),
    });
    expect(res.status).toBe(200);

    data = (await (await req(`/forum/topics/${createdSlug}`, {
      headers: cookieHeader(voter.cookie),
    })).json()) as any;
    expect(data.topic.score).toBe(0);
    expect(data.topic.userVote).toBe(0);
  });

  test("editing another user's post returns 403", async () => {
    // Create a post as the original author.
    const replyRes = await req(`/forum/topics/${createdSlug}/posts`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(cookie) },
      body: JSON.stringify({ body: "Edit me — only the author can." }),
    });
    const post = ((await replyRes.json()) as any).post;

    // Another user tries to edit; should 403.
    const other = await signupAndCookie("intruder");
    const editRes = await req(`/forum/posts/${post.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...cookieHeader(other.cookie) },
      body: JSON.stringify({ body: "hacked" }),
    });
    expect(editRes.status).toBe(403);

    // Author edits succeeds.
    const okEdit = await req(`/forum/posts/${post.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...cookieHeader(cookie) },
      body: JSON.stringify({ body: "Edited body." }),
    });
    expect(okEdit.status).toBe(200);
  });
});

describe("Forum: reputation aggregation", () => {
  test("seeded user 'alice' has positive reputation in ml", async () => {
    const res = await req("/forum/users/alice/reputation");
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.username).toBe("alice");
    expect(data.total).toBeGreaterThan(0);
    const ml = data.domains.find((d: any) => d.domainSlug === "ml");
    expect(ml).toBeTruthy();
    expect(ml.score).toBeGreaterThan(0);
    expect(ml.topicCount).toBeGreaterThan(0);
  });

  test("nonexistent user returns 404", async () => {
    const res = await req("/forum/users/nobody-1234567/reputation");
    expect(res.status).toBe(404);
  });
});

describe("Forum: AI thread summary", () => {
  test("summarize requires auth", async () => {
    const list = (await (await req("/forum/topics?sort=new")).json()) as any;
    const slug = list.topics[0].slug;
    const res = await req(`/forum/topics/${slug}/summarize`, { method: "POST" });
    expect(res.status).toBe(401);
  });

  test("summarize returns SSE stream", async () => {
    process.env.NODE_ENV = "test";
    const { cookie } = await signupAndCookie("summarize");
    // Pick any seeded slug.
    const list = (await (await req("/forum/topics?sort=new")).json()) as any;
    const slug = list.topics[0].slug;
    const res = await req(`/forum/topics/${slug}/summarize`, {
      method: "POST",
      headers: cookieHeader(cookie),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    const text = await res.text();
    expect(text).toContain("data:");
    expect(text).toContain("[DONE]");
  });
});

describe("Forum: rate limiter math (Phase I)", () => {
  test("forum-topic: 10 succeed, 11th rejected", () => {
    const key = `forum-topic:user-${testId}-1`;
    rateLimits.delete(key);
    for (let i = 0; i < 10; i++) {
      expect(checkRateLimit(key, 10, 60_000)).toBe(true);
    }
    expect(checkRateLimit(key, 10, 60_000)).toBe(false);
  });

  test("forum-reply: 30 succeed, 31st rejected", () => {
    const key = `forum-reply:user-${testId}-1`;
    rateLimits.delete(key);
    for (let i = 0; i < 30; i++) {
      expect(checkRateLimit(key, 30, 60_000)).toBe(true);
    }
    expect(checkRateLimit(key, 30, 60_000)).toBe(false);
  });

  test("forum-summarize: 5 succeed, 6th rejected", () => {
    const key = `forum-summarize:user-${testId}-1`;
    rateLimits.delete(key);
    for (let i = 0; i < 5; i++) {
      expect(checkRateLimit(key, 5, 60_000)).toBe(true);
    }
    expect(checkRateLimit(key, 5, 60_000)).toBe(false);
  });
});
