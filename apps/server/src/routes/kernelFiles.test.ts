// Phase I — coverage for kernel-files (attach uploaded files to a kernel scope).

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
  const username = `kf_${suffix}_${testId}`;
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

describe("GET /kernel-files", () => {
  test("unauthenticated returns 401", async () => {
    const res = await req("/kernel-files?kernelKey=k1");
    expect(res.status).toBe(401);
  });

  test("missing kernelKey returns 400", async () => {
    const u = await signup("noq");
    const res = await req("/kernel-files", { headers: cookieHeader(u.cookie) });
    expect(res.status).toBe(400);
  });

  test("returns empty list for a fresh kernel", async () => {
    const u = await signup("empty");
    const res = await req(`/kernel-files?kernelKey=k-${testId}-empty`, {
      headers: cookieHeader(u.cookie),
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as { files: unknown[] };
    expect(Array.isArray(data.files)).toBe(true);
    expect(data.files.length).toBe(0);
  });
});

describe("POST /kernel-files", () => {
  test("unauthenticated returns 401", async () => {
    const res = await req("/kernel-files", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kernelKey: "k1", attachmentId: "a1" }),
    });
    expect(res.status).toBe(401);
  });

  test("unknown attachment returns 404", async () => {
    const u = await signup("noatt");
    const res = await req("/kernel-files", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(u.cookie) },
      body: JSON.stringify({ kernelKey: "k1", attachmentId: "no-such-attachment" }),
    });
    expect(res.status).toBe(404);
  });

  test("invalid name characters rejected by schema", async () => {
    const u = await signup("badname");
    const res = await req("/kernel-files", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(u.cookie) },
      body: JSON.stringify({
        kernelKey: "k1",
        attachmentId: "a1",
        name: "../etc/passwd",
      }),
    });
    expect(res.status).toBe(400);
  });
});

describe("DELETE /kernel-files/:id", () => {
  test("unauthenticated returns 401", async () => {
    const res = await req("/kernel-files/some-id", { method: "DELETE" });
    expect(res.status).toBe(401);
  });

  test("unknown id returns 404", async () => {
    const u = await signup("delnf");
    const res = await req("/kernel-files/does-not-exist", {
      method: "DELETE",
      headers: cookieHeader(u.cookie),
    });
    expect(res.status).toBe(404);
  });
});
