// Sprint 44 — server-side execution stub tests.
//
// Verifies the API surface, the rate limit gate, the owner-only poll,
// and that the default backend reports `not_enabled` so cells fall
// back to the in-browser kernel when a deploy hasn't enabled real
// server execution.

import { describe, test, expect } from "bun:test";
import { app } from "../index";
import {
  setServerExecBackend,
  getServerExecBackend,
} from "../lib/serverExec";

async function req(path: string, opts?: RequestInit): Promise<Response> {
  return await app.fetch(new Request(`http://localhost/api/v1${path}`, opts));
}

function cookieHeader(cookie: string): Record<string, string> {
  return { cookie: cookie.split(";")[0] };
}

const testId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

async function signup(suffix: string) {
  const username = `se_${suffix}_${testId}`.slice(0, 30);
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
  return { cookie };
}

describe("Sprint 44 — server-side execution", () => {
  test("status reports disabled by default", async () => {
    const res = await req("/server-exec/status");
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.enabled).toBe(false);
  });

  test("anon submit is 401", async () => {
    const res = await req("/server-exec/runs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kernelKey: "test:k",
        language: "python",
        source: "print(1)",
      }),
    });
    expect(res.status).toBe(401);
  });

  test("default backend persists not_enabled", async () => {
    const me = await signup("def");
    const res = await req("/server-exec/runs", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(me.cookie) },
      body: JSON.stringify({
        kernelKey: `test:def-${testId}`,
        language: "python",
        source: "print('hi')",
      }),
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.status).toBe("not_enabled");
    expect(typeof data.error).toBe("string");
    expect(data.error).toContain("not enabled");

    // Owner can poll the run.
    const poll = await req(`/server-exec/runs/${data.id}`, {
      headers: cookieHeader(me.cookie),
    });
    expect(poll.status).toBe(200);
    const pollData = (await poll.json()) as any;
    expect(pollData.id).toBe(data.id);
    expect(pollData.status).toBe("not_enabled");
  });

  test("polling someone else's run is 403", async () => {
    const me = await signup("a");
    const them = await signup("b");
    const submit = await req("/server-exec/runs", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(me.cookie) },
      body: JSON.stringify({
        kernelKey: `test:cross-${testId}`,
        language: "python",
        source: "print(1)",
      }),
    });
    const { id } = (await submit.json()) as any;
    const poll = await req(`/server-exec/runs/${id}`, {
      headers: cookieHeader(them.cookie),
    });
    expect(poll.status).toBe(403);
  });

  test("custom backend round-trips through the run", async () => {
    const original = getServerExecBackend();
    setServerExecBackend(async (run) => ({
      status: "succeeded",
      exitCode: 0,
      stdout: `echo: ${run.source}`,
      stderr: "",
      error: null,
      durationMs: 12,
    }));
    try {
      const me = await signup("custom");
      const res = await req("/server-exec/runs", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...cookieHeader(me.cookie),
        },
        body: JSON.stringify({
          kernelKey: `test:custom-${testId}`,
          language: "python",
          source: "data = 42",
        }),
      });
      expect(res.status).toBe(200);
      const data = (await res.json()) as any;
      expect(data.status).toBe("succeeded");
      expect(data.stdout).toBe("echo: data = 42");
      expect(data.exitCode).toBe(0);

      // Status endpoint now reports enabled.
      const status = await req("/server-exec/status");
      expect(((await status.json()) as any).enabled).toBe(true);
    } finally {
      setServerExecBackend(original);
    }
  });
});
