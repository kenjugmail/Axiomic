import { describe, test, expect, beforeAll } from "bun:test";
import { app } from "../index";

async function req(path: string, opts?: RequestInit): Promise<Response> {
  return await app.fetch(new Request(`http://localhost/api/v1${path}`, opts));
}

function cookieHeader(cookie: string): Record<string, string> {
  return { cookie: cookie.split(";")[0] };
}

const testId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

async function signup(suffix: string): Promise<{ cookie: string; username: string }> {
  const username = `set_${suffix}_${testId}`;
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

describe("Settings: defaults and round-trip", () => {
  let user = { cookie: "", username: "" };

  beforeAll(async () => {
    user = await signup("rt");
  });

  test("requires auth", async () => {
    const res = await req("/settings");
    expect(res.status).toBe(401);
  });

  test("returns default settings for a new user", async () => {
    const res = await req("/settings", { headers: cookieHeader(user.cookie) });
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.settings.username).toBe(user.username);
    expect(data.settings.theme).toBe("system");
    expect(data.settings.notifyMentions).toBe(true);
    expect(data.settings.notifyReplies).toBe(true);
  });

  test("PUT updates fields and GET reflects them", async () => {
    const put = await req("/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...cookieHeader(user.cookie) },
      body: JSON.stringify({
        theme: "dark",
        notifyMentions: false,
        displayName: "Test User",
        bio: "hello",
      }),
    });
    expect(put.status).toBe(200);
    const putData = (await put.json()) as any;
    expect(putData.settings.theme).toBe("dark");
    expect(putData.settings.notifyMentions).toBe(false);
    expect(putData.settings.displayName).toBe("Test User");

    const get = await req("/settings", { headers: cookieHeader(user.cookie) });
    const data = (await get.json()) as any;
    expect(data.settings.theme).toBe("dark");
    expect(data.settings.notifyMentions).toBe(false);
    expect(data.settings.notifyReplies).toBe(true);
    expect(data.settings.bio).toBe("hello");
  });

  test("invalid theme rejected", async () => {
    const res = await req("/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...cookieHeader(user.cookie) },
      body: JSON.stringify({ theme: "neon" }),
    });
    expect(res.status).toBe(400);
  });
});

describe("Notification gating by preferences", () => {
  let alice = { cookie: "", username: "" };
  let bob = { cookie: "", username: "" };

  beforeAll(async () => {
    alice = await signup("gate_a");
    bob = await signup("gate_b");
  });

  async function unread(cookie: string): Promise<number> {
    const res = await req("/notifications/unread-count", {
      headers: cookieHeader(cookie),
    });
    const data = (await res.json()) as any;
    return data.count;
  }

  test("muting mentions suppresses mention notifications", async () => {
    // Bob mutes mentions.
    await req("/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...cookieHeader(bob.cookie) },
      body: JSON.stringify({ notifyMentions: false }),
    });

    const before = await unread(bob.cookie);
    await req("/forum/topics", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(alice.cookie) },
      body: JSON.stringify({
        title: "muted mention",
        body: `Hi @${bob.username}!`,
        postType: "claim",
        domainSlug: "ml",
      }),
    });
    const after = await unread(bob.cookie);
    expect(after).toBe(before);
  });

  test("muting mentions still allows reply notifications", async () => {
    // Bob still has notifyReplies=true.
    const topic = await req("/forum/topics", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(bob.cookie) },
      body: JSON.stringify({
        title: "bob's topic",
        body: "i wrote this",
        postType: "claim",
        domainSlug: "ml",
      }),
    });
    const t = (await topic.json()) as any;

    const before = await unread(bob.cookie);
    await req(`/forum/topics/${t.topic.slug}/posts`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(alice.cookie) },
      body: JSON.stringify({ body: "alice replies (no mention)" }),
    });
    const after = await unread(bob.cookie);
    expect(after).toBe(before + 1);
  });

  test("muting replies suppresses reply notifications", async () => {
    await req("/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...cookieHeader(bob.cookie) },
      body: JSON.stringify({ notifyReplies: false }),
    });

    const topic = await req("/forum/topics", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(bob.cookie) },
      body: JSON.stringify({
        title: "bob mute replies",
        body: "i wrote this too",
        postType: "claim",
        domainSlug: "ml",
      }),
    });
    const t = (await topic.json()) as any;

    const before = await unread(bob.cookie);
    await req(`/forum/topics/${t.topic.slug}/posts`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(alice.cookie) },
      body: JSON.stringify({ body: "alice replies again" }),
    });
    const after = await unread(bob.cookie);
    expect(after).toBe(before);
  });
});

describe("Wiki linkedTopics", () => {
  test("seeded induction-heads page surfaces its anchored topic", async () => {
    const res = await req("/wiki/induction-heads");
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(Array.isArray(data.linkedTopics)).toBe(true);
    // Two seeded topics anchor to induction-heads (one claim, one critique).
    expect(data.linkedTopics.length).toBeGreaterThan(0);
    const t = data.linkedTopics[0];
    expect(typeof t.title).toBe("string");
    expect(typeof t.score).toBe("number");
    expect(typeof t.postCount).toBe("number");
    expect(t.wikiPageSlug).toBe("induction-heads");
  });

  test("page with no anchored topics returns empty linkedTopics", async () => {
    const res = await req("/wiki/calculus-foundations");
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(Array.isArray(data.linkedTopics)).toBe(true);
    expect(data.linkedTopics.length).toBe(0);
  });
});
