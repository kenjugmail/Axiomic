// Phase 29F — collaborative review room tests + liveBus fan-out.

import { describe, test, expect } from "bun:test";
import { app } from "../index";
import { subscribeRoom, publishToRoom } from "../lib/liveBus";

async function req(path: string, opts?: RequestInit): Promise<Response> {
  return await app.fetch(new Request(`http://localhost/api/v1${path}`, opts));
}
function cookieHeader(cookie: string): Record<string, string> {
  return { cookie: cookie.split(";")[0] };
}
const testRun =
  Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
async function signup(suffix: string) {
  const username = `rr_${suffix}_${testRun}`.slice(0, 30);
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

describe("review rooms (Phase 29B)", () => {
  test("post → list (ordered) for a reviewable reproduction; non-participant 403", async () => {
    const { getDb, reproductions } = await import("@axiomic/db");
    const { randomUUID } = await import("crypto");
    const author = await signup("auth");
    const reviewer = await signup("rev");

    // status='success' → reviewable → open to any authed user.
    const okId = randomUUID();
    getDb()
      .insert(reproductions)
      .values({
        id: okId,
        articleId: null,
        targetKind: "research_paper",
        targetId: `p-${testRun}`,
        reproducerId: author.userId,
        status: "success",
      })
      .run();

    const post1 = await req(
      `/review-rooms/reproduction/${okId}/messages`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...cookieHeader(reviewer.cookie),
        },
        body: JSON.stringify({ bodyMd: "First question about Fig 2." }),
      },
    );
    expect(post1.status).toBe(201);
    const post2 = await req(
      `/review-rooms/reproduction/${okId}/messages`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...cookieHeader(author.cookie),
        },
        body: JSON.stringify({ bodyMd: "Good point — re-running." }),
      },
    );
    expect(post2.status).toBe(201);

    const list = await req(
      `/review-rooms/reproduction/${okId}/messages`,
      { headers: cookieHeader(author.cookie) },
    );
    expect(list.status).toBe(200);
    const body = (await list.json()) as {
      messages: Array<{ bodyMd: string }>;
    };
    expect(body.messages.length).toBe(2);
    expect(body.messages[0]!.bodyMd).toBe("First question about Fig 2.");

    // A non-reviewable (status!='success') reproduction: only the
    // reproducer may enter — a stranger gets 403.
    const closedId = randomUUID();
    getDb()
      .insert(reproductions)
      .values({
        id: closedId,
        articleId: null,
        targetKind: "research_paper",
        targetId: `p2-${testRun}`,
        reproducerId: author.userId,
        status: "partial",
      })
      .run();
    const stranger = await signup("str");
    const denied = await req(
      `/review-rooms/reproduction/${closedId}/messages`,
      { headers: cookieHeader(stranger.cookie) },
    );
    expect(denied.status).toBe(403);
    // The reproducer themselves is allowed.
    const allowed = await req(
      `/review-rooms/reproduction/${closedId}/messages`,
      { headers: cookieHeader(author.cookie) },
    );
    expect(allowed.status).toBe(200);

    // Unknown room kind → 400.
    const badKind = await req(
      `/review-rooms/nonsense/${okId}/messages`,
      { headers: cookieHeader(author.cookie) },
    );
    expect(badKind.status).toBe(400);
  });

  test("liveBus publishToRoom fans out to subscribed sockets only", () => {
    const received: string[] = [];
    const mkWs = (sink: string[]) =>
      ({
        data: { userId: "u", subscriptions: new Set<string>() },
        send: (j: string) => sink.push(j),
      }) as unknown as Parameters<typeof subscribeRoom>[0];

    const a = mkWs(received);
    const other: string[] = [];
    const b = mkWs(other);
    subscribeRoom(a, "reproduction", `room-${testRun}`);
    subscribeRoom(b, "reproduction", `other-${testRun}`);
    publishToRoom("reproduction", `room-${testRun}`, {
      type: "room_message",
      hello: 1,
    });
    expect(received.length).toBe(1);
    expect(other.length).toBe(0);
    expect(JSON.parse(received[0]!).hello).toBe(1);
  });
});
