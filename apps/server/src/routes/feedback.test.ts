// Phase I — coverage for the feedback inbox.
//
// Anonymous POST is allowed (userId null); admin-only GET /admin
// surface; per-identity rate-limit at 20/min.

import { describe, test, expect } from "bun:test";
import { app } from "../index";
import { getDb, users } from "@axiomic/db";
import { eq } from "drizzle-orm";

async function req(path: string, opts?: RequestInit): Promise<Response> {
  return await app.fetch(new Request(`http://localhost/api/v1${path}`, opts));
}

function cookieHeader(cookie: string): Record<string, string> {
  return { cookie: cookie.split(";")[0] };
}

const testId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

async function signup(suffix: string): Promise<{ cookie: string; username: string }> {
  const username = `fb_${suffix}_${testId}`;
  const res = await req("/auth/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username,
      email: `${username}@example.com`,
      password: "testpass123",
    }),
  });
  return { cookie: res.headers.get("set-cookie") || "", username };
}

function promoteAdmin(username: string) {
  getDb().update(users).set({ role: "admin" }).where(eq(users.username, username)).run();
}

describe("POST /feedback", () => {
  test("anonymous bug report succeeds", async () => {
    const res = await req("/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: "bug",
        message: `anon bug ${testId}`,
        currentUrl: "/wiki/foo",
      }),
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as { ok: boolean };
    expect(data.ok).toBe(true);
  });

  test("authenticated report attributes to user", async () => {
    const u = await signup("auth");
    const res = await req("/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(u.cookie) },
      body: JSON.stringify({ kind: "idea", message: `idea from ${u.username}` }),
    });
    expect(res.status).toBe(200);
  });

  test("invalid kind returns 400", async () => {
    const res = await req("/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "rant", message: "x" }),
    });
    expect(res.status).toBe(400);
  });

  test("empty message returns 400", async () => {
    const res = await req("/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "praise", message: "" }),
    });
    expect(res.status).toBe(400);
  });

  test("message over 2000 chars returns 400", async () => {
    const res = await req("/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "praise", message: "x".repeat(2001) }),
    });
    expect(res.status).toBe(400);
  });

  test("praise + idea + bug all accepted", async () => {
    for (const kind of ["bug", "idea", "praise"]) {
      const res = await req("/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, message: `${kind} ${testId}` }),
      });
      expect(res.status).toBe(200);
    }
  });
});

describe("GET /feedback/admin", () => {
  test("unauthenticated returns 401", async () => {
    const res = await req("/feedback/admin");
    expect(res.status).toBe(401);
  });

  test("non-admin returns 403", async () => {
    const u = await signup("nonadmin");
    const res = await req("/feedback/admin", { headers: cookieHeader(u.cookie) });
    expect(res.status).toBe(403);
  });

  test("admin lists recent reports", async () => {
    // Seed a known report so the admin list is non-empty.
    await req("/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "bug", message: `seed for admin ${testId}` }),
    });
    const admin = await signup("admin");
    promoteAdmin(admin.username);
    const res = await req("/feedback/admin", { headers: cookieHeader(admin.cookie) });
    expect(res.status).toBe(200);
    const data = (await res.json()) as { reports: Array<{ message: string }> };
    expect(Array.isArray(data.reports)).toBe(true);
    expect(data.reports.length).toBeGreaterThan(0);
  });
});
