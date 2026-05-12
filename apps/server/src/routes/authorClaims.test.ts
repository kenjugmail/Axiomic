// Phase I — coverage for the manual author-claim flow.

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
  const username = `claim_${suffix}_${testId}`;
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

describe("POST /author-claims", () => {
  test("unauthenticated returns 401", async () => {
    const res = await req("/author-claims", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ externalPaperId: "paper-xyz123", ordinal: 0 }),
    });
    expect(res.status).toBe(401);
  });

  test("unknown paper returns 404", async () => {
    const u = await signup("nopaper");
    const res = await req("/author-claims", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(u.cookie) },
      body: JSON.stringify({
        externalPaperId: "paper-does-not-exist",
        ordinal: 0,
        evidenceText: "I wrote this",
      }),
    });
    expect(res.status).toBe(404);
  });

  test("schema rejects short externalPaperId", async () => {
    const u = await signup("badid");
    const res = await req("/author-claims", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(u.cookie) },
      body: JSON.stringify({ externalPaperId: "x", ordinal: 0 }),
    });
    expect(res.status).toBe(400);
  });
});

describe("GET /author-claims/me", () => {
  test("unauthenticated returns 401", async () => {
    const res = await req("/author-claims/me");
    expect(res.status).toBe(401);
  });

  test("returns empty list for a new user", async () => {
    const u = await signup("mine");
    const res = await req("/author-claims/me", { headers: cookieHeader(u.cookie) });
    expect(res.status).toBe(200);
    const data = (await res.json()) as { items: unknown[] };
    expect(Array.isArray(data.items)).toBe(true);
    expect(data.items.length).toBe(0);
  });
});
