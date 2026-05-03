import { describe, test, expect, beforeAll } from "bun:test";
import { app } from "../index";
import { extractMentionUsernames, toPreview } from "../lib/notifications";

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
  const username = `notif_${suffix}_${testId}`;
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

async function listNotifications(cookie: string): Promise<any[]> {
  const res = await req("/notifications", {
    headers: cookieHeader(cookie),
  });
  expect(res.status).toBe(200);
  const data = (await res.json()) as any;
  return data.notifications;
}

async function unreadCount(cookie: string): Promise<number> {
  const res = await req("/notifications/unread-count", {
    headers: cookieHeader(cookie),
  });
  expect(res.status).toBe(200);
  const data = (await res.json()) as any;
  return data.count;
}

async function createTopic(
  cookie: string,
  title: string,
  body: string,
): Promise<any> {
  const res = await req("/forum/topics", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...cookieHeader(cookie) },
    body: JSON.stringify({
      title,
      body,
      postType: "claim",
      domainSlug: "ml",
    }),
  });
  expect(res.status).toBe(201);
  const data = (await res.json()) as any;
  return data.topic;
}

describe("extractMentionUsernames", () => {
  test("matches plain mentions", () => {
    expect(extractMentionUsernames("hi @bob and @alice")).toEqual([
      "bob",
      "alice",
    ]);
  });

  test("ignores @user inside fenced code blocks", () => {
    const body = "before\n```\n@hidden user\n```\nafter @bob";
    expect(extractMentionUsernames(body)).toEqual(["bob"]);
  });

  test("ignores @user inside inline code", () => {
    expect(extractMentionUsernames("see `@hidden` and @bob")).toEqual(["bob"]);
  });

  test("ignores @user inside inline math", () => {
    expect(extractMentionUsernames("$@hidden$ and @bob")).toEqual(["bob"]);
  });

  test("ignores @user inside block math", () => {
    expect(extractMentionUsernames("$$\n@hidden\n$$\n@bob")).toEqual(["bob"]);
  });

  test("ignores email-like tokens", () => {
    expect(extractMentionUsernames("ping bob@example.com only")).toEqual([]);
  });

  test("ignores URLs", () => {
    expect(extractMentionUsernames("see https://x.com/@bob and @alice")).toEqual(
      ["alice"],
    );
  });

  test("rejects too-short usernames", () => {
    expect(extractMentionUsernames("hi @ab and @abc")).toEqual(["abc"]);
  });

  test("dedupes and lowercases", () => {
    expect(extractMentionUsernames("@Bob @bob @BOB")).toEqual(["bob"]);
  });

  test("caps at 10 mentions", () => {
    const body = Array.from({ length: 30 }, (_, i) => `@u${i.toString().padStart(3, "0")}`).join(
      " ",
    );
    expect(extractMentionUsernames(body).length).toBe(10);
  });
});

describe("toPreview", () => {
  test("strips markdown and truncates", () => {
    const text = `# Heading\n\nSome **bold** and \`code\` and a [link](https://x.com).`;
    const out = toPreview(text);
    expect(out).not.toContain("#");
    expect(out).not.toContain("**");
    expect(out).not.toContain("`");
    expect(out).toContain("link");
    expect(out.length).toBeLessThanOrEqual(140);
  });
});

describe("Notifications: mentions in forum topics", () => {
  let alice = { cookie: "", username: "" };
  let bob = { cookie: "", username: "" };

  beforeAll(async () => {
    alice = await signup("alice");
    bob = await signup("bob");
  });

  test("mention in topic body creates notification for the mentioned user", async () => {
    const before = await unreadCount(bob.cookie);
    await createTopic(
      alice.cookie,
      "Hello forum",
      `Hey @${bob.username}, what do you think?`,
    );
    const after = await unreadCount(bob.cookie);
    expect(after).toBe(before + 1);

    const list = await listNotifications(bob.cookie);
    const fresh = list.find(
      (n) => n.kind === "mention" && n.actor?.username === alice.username,
    );
    expect(fresh).toBeDefined();
    expect(fresh.subjectType).toBe("topic");
    expect(fresh.preview).toContain("what do you think");
    expect(fresh.readAt).toBeNull();
  });

  test("self-mention does not notify", async () => {
    const before = await unreadCount(alice.cookie);
    await createTopic(
      alice.cookie,
      "Self talk",
      `I'm just @${alice.username} talking to myself`,
    );
    const after = await unreadCount(alice.cookie);
    expect(after).toBe(before);
  });

  test("mention inside code block does not notify", async () => {
    const before = await unreadCount(bob.cookie);
    await createTopic(
      alice.cookie,
      "Code embed",
      "```\n@" + bob.username + "\n```\nNothing else",
    );
    const after = await unreadCount(bob.cookie);
    expect(after).toBe(before);
  });

  test("unknown @username silently dropped", async () => {
    const res = await req("/forum/topics", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(alice.cookie) },
      body: JSON.stringify({
        title: "Unknown user",
        body: "@noSuchUser_xyz hi",
        postType: "claim",
        domainSlug: "ml",
      }),
    });
    expect(res.status).toBe(201);
    // No exception, no notification anywhere — implicit. Just check the topic exists.
  });
});

describe("Notifications: replies in forum posts", () => {
  let alice = { cookie: "", username: "" };
  let bob = { cookie: "", username: "" };
  let topicSlug = "";

  beforeAll(async () => {
    alice = await signup("reply_a");
    bob = await signup("reply_b");
    const t = await createTopic(alice.cookie, "Reply target", "body of topic");
    topicSlug = t.slug;
  });

  test("replying to someone's topic notifies them with topic_reply", async () => {
    const before = await unreadCount(alice.cookie);
    const res = await req(`/forum/topics/${topicSlug}/posts`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(bob.cookie) },
      body: JSON.stringify({ body: "interesting take" }),
    });
    expect(res.status).toBe(201);
    const after = await unreadCount(alice.cookie);
    expect(after).toBe(before + 1);

    const list = await listNotifications(alice.cookie);
    const reply = list.find(
      (n) => n.kind === "topic_reply" && n.actor?.username === bob.username,
    );
    expect(reply).toBeDefined();
  });

  test("reply that also @mentions the topic author sends only the mention", async () => {
    const before = await unreadCount(alice.cookie);
    const res = await req(`/forum/topics/${topicSlug}/posts`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(bob.cookie) },
      body: JSON.stringify({ body: `cc @${alice.username} thoughts?` }),
    });
    expect(res.status).toBe(201);
    const data = (await res.json()) as any;
    const newPostId = data.post.id;

    const after = await unreadCount(alice.cookie);
    // Exactly one new notification: the mention. Reply notification is
    // suppressed because the recipient is also the @-mentioned user.
    expect(after).toBe(before + 1);

    // Find the notification(s) anchored to this post; only the mention
    // should exist (no topic_reply) because mentions take precedence.
    const list = await listNotifications(alice.cookie);
    const forThisPost = list.filter((n) => n.subjectId === newPostId);
    expect(forThisPost.length).toBe(1);
    expect(forThisPost[0].kind).toBe("mention");
  });

  test("self-reply does not notify", async () => {
    const before = await unreadCount(alice.cookie);
    const res = await req(`/forum/topics/${topicSlug}/posts`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(alice.cookie) },
      body: JSON.stringify({ body: "follow-up to my own topic" }),
    });
    expect(res.status).toBe(201);
    const after = await unreadCount(alice.cookie);
    expect(after).toBe(before);
  });
});

describe("Notifications: mark-read and access control", () => {
  let alice = { cookie: "", username: "" };
  let bob = { cookie: "", username: "" };

  beforeAll(async () => {
    alice = await signup("mr_a");
    bob = await signup("mr_b");
    // Generate two notifications for bob.
    await createTopic(alice.cookie, "MR1", `hi @${bob.username}`);
    await createTopic(alice.cookie, "MR2", `again @${bob.username}`);
  });

  test("requires auth", async () => {
    const res = await req("/notifications");
    expect(res.status).toBe(401);
  });

  test("mark-read with specific ids", async () => {
    const list = await listNotifications(bob.cookie);
    const target = list[0];
    expect(target.readAt).toBeNull();

    const res = await req("/notifications/mark-read", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(bob.cookie) },
      body: JSON.stringify({ ids: [target.id] }),
    });
    expect(res.status).toBe(200);

    const list2 = await listNotifications(bob.cookie);
    const updated = list2.find((n) => n.id === target.id);
    expect(updated.readAt).not.toBeNull();
  });

  test("mark-read { ids } cannot affect another user's row", async () => {
    const bobList = await listNotifications(bob.cookie);
    const someBobId = bobList[0]?.id;
    if (!someBobId) throw new Error("expected at least one bob notification");

    // alice tries to mark bob's notification read.
    const res = await req("/notifications/mark-read", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(alice.cookie) },
      body: JSON.stringify({ ids: [someBobId] }),
    });
    expect(res.status).toBe(200); // request succeeds...

    // but bob's row is unaffected (re-fetch and verify readAt unchanged)
    const refreshed = await listNotifications(bob.cookie);
    const same = refreshed.find((n) => n.id === someBobId);
    if (same) {
      expect(same.readAt).toEqual(bobList.find((n) => n.id === someBobId)!.readAt);
    }
  });

  test("mark-read { all: true } clears all unread for the user only", async () => {
    const res = await req("/notifications/mark-read", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(bob.cookie) },
      body: JSON.stringify({ all: true }),
    });
    expect(res.status).toBe(200);

    const after = await unreadCount(bob.cookie);
    expect(after).toBe(0);
  });

  test("mark-read with neither all nor ids is rejected", async () => {
    const res = await req("/notifications/mark-read", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(bob.cookie) },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  test("unread filter only returns unread", async () => {
    // After mark-read all, unread filter returns empty for bob.
    const res = await req("/notifications?unread=true", {
      headers: cookieHeader(bob.cookie),
    });
    const data = (await res.json()) as any;
    expect(data.notifications.length).toBe(0);
  });
});
