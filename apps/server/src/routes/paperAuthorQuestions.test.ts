// Phase I — coverage for the per-(paper, author slot) Q&A thread.

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
  const username = `paq_${suffix}_${testId}`;
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

describe("GET /external-papers/:id/authors/:ordinal/questions", () => {
  test("unknown paper returns 404", async () => {
    const res = await req("/external-papers/no-such-paper/authors/0/questions");
    expect(res.status).toBe(404);
  });

  test("non-numeric ordinal returns 400", async () => {
    const res = await req("/external-papers/some-id/authors/abc/questions");
    expect(res.status).toBe(400);
  });
});

describe("POST /external-papers/:id/authors/:ordinal/questions", () => {
  test("unauthenticated returns 401", async () => {
    const res = await req("/external-papers/some-id/authors/0/questions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "When did you write this?" }),
    });
    expect(res.status).toBe(401);
  });

  test("unknown paper returns 404", async () => {
    const u = await signup("nopaper");
    const res = await req("/external-papers/no-such-paper/authors/0/questions", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(u.cookie) },
      body: JSON.stringify({ content: "What's your hypothesis?" }),
    });
    expect(res.status).toBe(404);
  });

  test("empty content returns 400", async () => {
    const u = await signup("empty");
    const res = await req("/external-papers/some-id/authors/0/questions", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(u.cookie) },
      body: JSON.stringify({ content: "" }),
    });
    expect(res.status).toBe(400);
  });

  test("content over 5000 chars returns 400", async () => {
    const u = await signup("long");
    const res = await req("/external-papers/some-id/authors/0/questions", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(u.cookie) },
      body: JSON.stringify({ content: "x".repeat(5001) }),
    });
    expect(res.status).toBe(400);
  });
});
