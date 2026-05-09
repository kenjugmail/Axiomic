// Sprint 66b — auth route coverage.
//
// `auth.ts` was exercised through signup helpers in many other test
// files but had no dedicated suite. This covers the full login /
// logout / me lifecycle + the validation rejections.

import { describe, test, expect } from "bun:test";
import { app } from "../index";

async function req(path: string, opts?: RequestInit): Promise<Response> {
  return await app.fetch(new Request(`http://localhost/api/v1${path}`, opts));
}

function cookieHeader(cookie: string): Record<string, string> {
  return { cookie: cookie.split(";")[0] };
}

const testId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
let counter = 0;
function nextUsername(label: string): string {
  return `auth_${label}_${testId}_${counter++}`;
}

describe("auth route (Sprint 66b)", () => {
  test("signup happy path returns 201 + sets cookie", async () => {
    const username = nextUsername("happy");
    const res = await req("/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username,
        email: `${username}@example.com`,
        password: "testpass123",
      }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as any;
    expect(body.user.username).toBe(username);
    expect(body.user.email).toBe(`${username}@example.com`);
    expect(body.user.displayName).toBe(username);
    expect(res.headers.get("set-cookie")).toBeTruthy();
  });

  test("signup with displayName uses the provided value", async () => {
    const username = nextUsername("display");
    const res = await req("/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username,
        email: `${username}@example.com`,
        password: "testpass123",
        displayName: "Captain Test",
      }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as any;
    expect(body.user.displayName).toBe("Captain Test");
  });

  test("signup rejects duplicate email with 409", async () => {
    const username = nextUsername("dupe1");
    const email = `${username}@example.com`;
    const first = await req("/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, email, password: "testpass123" }),
    });
    expect(first.status).toBe(201);
    const second = await req("/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: nextUsername("dupe2"),
        email,
        password: "testpass123",
      }),
    });
    expect(second.status).toBe(409);
    const body = (await second.json()) as any;
    expect(body.error).toMatch(/email/i);
  });

  test("signup rejects duplicate username with 409", async () => {
    const username = nextUsername("dupeuser");
    const first = await req("/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username,
        email: `${username}-1@example.com`,
        password: "testpass123",
      }),
    });
    expect(first.status).toBe(201);
    const second = await req("/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username,
        email: `${username}-2@example.com`,
        password: "testpass123",
      }),
    });
    expect(second.status).toBe(409);
    const body = (await second.json()) as any;
    expect(body.error).toMatch(/username/i);
  });

  test("signup rejects short password (zod)", async () => {
    const username = nextUsername("shortpw");
    const res = await req("/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username,
        email: `${username}@example.com`,
        password: "short",
      }),
    });
    expect(res.status).toBe(400);
  });

  test("signup rejects invalid username characters", async () => {
    const res = await req("/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: "invalid name!",
        email: `bad_${testId}@example.com`,
        password: "testpass123",
      }),
    });
    expect(res.status).toBe(400);
  });

  test("login happy path with correct password", async () => {
    const username = nextUsername("login");
    const email = `${username}@example.com`;
    const password = "loginpass1234";
    await req("/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, email, password }),
    });
    const res = await req("/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.user.username).toBe(username);
    expect(res.headers.get("set-cookie")).toBeTruthy();
  });

  test("login rejects wrong password with 401", async () => {
    const username = nextUsername("wrongpw");
    const email = `${username}@example.com`;
    await req("/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, email, password: "rightpass1234" }),
    });
    const res = await req("/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: "wrongpass1234" }),
    });
    expect(res.status).toBe(401);
  });

  test("login rejects unknown email with 401", async () => {
    const res = await req("/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: `nobody_${testId}@example.com`,
        password: "anything1234",
      }),
    });
    expect(res.status).toBe(401);
  });

  test("/me returns null user when anonymous", async () => {
    const res = await req("/auth/me");
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.user).toBeNull();
  });

  test("/me returns the signed-in user", async () => {
    const username = nextUsername("me");
    const signup = await req("/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username,
        email: `${username}@example.com`,
        password: "testpass123",
      }),
    });
    const cookie = signup.headers.get("set-cookie") || "";
    const res = await req("/auth/me", { headers: cookieHeader(cookie) });
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.user.username).toBe(username);
  });

  test("logout clears the session — subsequent /me with same cookie returns null", async () => {
    const username = nextUsername("logout");
    const signup = await req("/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username,
        email: `${username}@example.com`,
        password: "testpass123",
      }),
    });
    const cookie = signup.headers.get("set-cookie") || "";
    const logout = await req("/auth/logout", {
      method: "POST",
      headers: cookieHeader(cookie),
    });
    expect(logout.status).toBe(200);
    // Use the cookie that logout sent back (it cleared the session).
    const cleared = logout.headers.get("set-cookie") || cookie;
    const res = await req("/auth/me", { headers: cookieHeader(cleared) });
    const body = (await res.json()) as any;
    expect(body.user).toBeNull();
  });
});
