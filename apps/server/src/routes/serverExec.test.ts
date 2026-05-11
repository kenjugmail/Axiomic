// Phase I — coverage for the server-side execution router.
//
// Stub backend is the default in tests; we mainly check auth, schema
// validation, owner-only run access, and that the disabled backend
// returns a not_enabled status without trying to actually execute.

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
  const username = `exec_${suffix}_${testId}`;
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

describe("GET /server-exec/status", () => {
  test("returns enabled=false when backend is the stub", async () => {
    const res = await req("/server-exec/status");
    expect(res.status).toBe(200);
    const data = (await res.json()) as { enabled: boolean };
    expect(data.enabled).toBe(false);
  });
});

describe("POST /server-exec/runs", () => {
  test("unauthenticated returns 401", async () => {
    const res = await req("/server-exec/runs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kernelKey: "k1",
        language: "python",
        source: "print(1)",
      }),
    });
    expect(res.status).toBe(401);
  });

  test("missing fields returns 400", async () => {
    const u = await signup("missing");
    const res = await req("/server-exec/runs", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(u.cookie) },
      body: JSON.stringify({ kernelKey: "k1" }),
    });
    expect(res.status).toBe(400);
  });

  test("invalid language returns 400", async () => {
    const u = await signup("badlang");
    const res = await req("/server-exec/runs", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(u.cookie) },
      body: JSON.stringify({
        kernelKey: "k1",
        language: "ruby",
        source: "puts 1",
      }),
    });
    expect(res.status).toBe(400);
  });

  test("source over 50k returns 400", async () => {
    const u = await signup("bigsource");
    const res = await req("/server-exec/runs", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(u.cookie) },
      body: JSON.stringify({
        kernelKey: "k1",
        language: "python",
        source: "x".repeat(50_001),
      }),
    });
    expect(res.status).toBe(400);
  });

  test("happy path with stub backend returns not_enabled status", async () => {
    const u = await signup("happy");
    const res = await req("/server-exec/runs", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(u.cookie) },
      body: JSON.stringify({
        kernelKey: `k-${testId}`,
        language: "python",
        source: "print('hello')",
      }),
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as { id: string; status: string };
    expect(typeof data.id).toBe("string");
    expect(data.status).toBe("not_enabled");
  });
});

describe("GET /server-exec/runs/:id", () => {
  test("unauthenticated returns 401", async () => {
    const res = await req("/server-exec/runs/some-id");
    expect(res.status).toBe(401);
  });

  test("unknown id returns 404", async () => {
    const u = await signup("notfound");
    const res = await req("/server-exec/runs/does-not-exist", {
      headers: cookieHeader(u.cookie),
    });
    expect(res.status).toBe(404);
  });

  test("non-owner returns 403", async () => {
    const owner = await signup("owner");
    const create = await req("/server-exec/runs", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...cookieHeader(owner.cookie),
      },
      body: JSON.stringify({
        kernelKey: `k-${testId}`,
        language: "js",
        source: "1+1",
      }),
    });
    const { id } = (await create.json()) as { id: string };

    const intruder = await signup("intruder");
    const res = await req(`/server-exec/runs/${id}`, {
      headers: cookieHeader(intruder.cookie),
    });
    expect(res.status).toBe(403);
  });

  test("owner gets their run", async () => {
    const owner = await signup("getown");
    const create = await req("/server-exec/runs", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...cookieHeader(owner.cookie),
      },
      body: JSON.stringify({
        kernelKey: `k-${testId}`,
        language: "js",
        source: "1+1",
      }),
    });
    const { id } = (await create.json()) as { id: string };
    const res = await req(`/server-exec/runs/${id}`, {
      headers: cookieHeader(owner.cookie),
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as { id: string; language: string };
    expect(data.id).toBe(id);
    expect(data.language).toBe("js");
  });
});

describe("GET /server-exec/runs (list)", () => {
  test("unauthenticated returns 401", async () => {
    const res = await req("/server-exec/runs");
    expect(res.status).toBe(401);
  });

  test("owner sees their runs filtered by kernelKey", async () => {
    const owner = await signup("listown");
    const kernelKey = `k-${testId}-list`;
    await req("/server-exec/runs", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...cookieHeader(owner.cookie),
      },
      body: JSON.stringify({
        kernelKey,
        language: "python",
        source: "pass",
      }),
    });
    const res = await req(`/server-exec/runs?kernelKey=${kernelKey}`, {
      headers: cookieHeader(owner.cookie),
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      runs: Array<{ kernelKey: string }>;
    };
    expect(Array.isArray(data.runs)).toBe(true);
    expect(data.runs.length).toBeGreaterThan(0);
    expect(data.runs.every((r) => r.kernelKey === kernelKey)).toBe(true);
  });
});
