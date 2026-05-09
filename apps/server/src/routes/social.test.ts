// Sprint 67b — social route coverage.
//
// Follows + follow-stats + follow lists + personalized feed + user search.

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

async function signup(label: string): Promise<{ cookie: string; username: string }> {
  const username = `social_${label}_${testId}_${counter++}`;
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

let alice = "";
let bob = "";
let aliceUsername = "";
let bobUsername = "";

beforeAll(async () => {
  const a = await signup("alice");
  const b = await signup("bob");
  alice = a.cookie;
  bob = b.cookie;
  aliceUsername = a.username;
  bobUsername = b.username;
});

describe("social route (Sprint 67b)", () => {
  test("POST /users/:username/follow requires auth", async () => {
    const res = await req(`/users/${bobUsername}/follow`, {
      method: "POST",
    });
    expect(res.status).toBe(401);
  });

  test("POST /users/:username/follow 404s on unknown user", async () => {
    const res = await req(`/users/no-such-user-${testId}/follow`, {
      method: "POST",
      headers: cookieHeader(alice),
    });
    expect(res.status).toBe(404);
  });

  test("POST /users/:username/follow 400s on self-follow", async () => {
    const res = await req(`/users/${aliceUsername}/follow`, {
      method: "POST",
      headers: cookieHeader(alice),
    });
    expect(res.status).toBe(400);
  });

  test("POST /users/:username/follow toggles follow state", async () => {
    const r1 = await req(`/users/${bobUsername}/follow`, {
      method: "POST",
      headers: cookieHeader(alice),
    });
    expect(r1.status).toBe(200);
    expect(((await r1.json()) as any).following).toBe(true);

    const r2 = await req(`/users/${bobUsername}/follow`, {
      method: "POST",
      headers: cookieHeader(alice),
    });
    expect(((await r2.json()) as any).following).toBe(false);
  });

  test("GET /users/:username/follow-stats reports counts + viewer state", async () => {
    // Re-follow so bob has alice as follower.
    await req(`/users/${bobUsername}/follow`, {
      method: "POST",
      headers: cookieHeader(alice),
    });

    const anon = await req(`/users/${bobUsername}/follow-stats`);
    const anonBody = (await anon.json()) as any;
    expect(typeof anonBody.followerCount).toBe("number");
    expect(anonBody.followerCount).toBeGreaterThanOrEqual(1);
    expect(anonBody.following).toBe(false); // anon, no session

    const authed = await req(`/users/${bobUsername}/follow-stats`, {
      headers: cookieHeader(alice),
    });
    const authedBody = (await authed.json()) as any;
    expect(authedBody.following).toBe(true);
  });

  test("GET /users/:username/follow-stats 404s on unknown user", async () => {
    const res = await req(`/users/no-such-user-${testId}-x/follow-stats`);
    expect(res.status).toBe(404);
  });

  test("GET /users/:username/follows returns followers + following", async () => {
    const res = await req(`/users/${bobUsername}/follows`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(Array.isArray(body.followers)).toBe(true);
    expect(Array.isArray(body.following)).toBe(true);
    expect(body.followers.some((u: any) => u.username === aliceUsername)).toBe(true);
  });

  test("GET /me/feed requires auth", async () => {
    const res = await req("/me/feed");
    expect(res.status).toBe(401);
  });

  test("GET /me/feed returns empty array for new user with no follows", async () => {
    const c2 = (await signup("loner")).cookie;
    const res = await req("/me/feed", { headers: cookieHeader(c2) });
    expect(res.status).toBe(200);
    expect(((await res.json()) as any).items).toEqual([]);
  });

  test("GET /users?q= prefix searches usernames", async () => {
    const res = await req(`/users?q=social_alice_${testId}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.users.some((u: any) => u.username === aliceUsername)).toBe(true);
  });

  test("GET /users?q= returns empty for empty query", async () => {
    const res = await req("/users?q=");
    expect(res.status).toBe(200);
    expect(((await res.json()) as any).users).toEqual([]);
  });
});
