// Sprint 50 — admin endpoints.

import { describe, test, expect } from "bun:test";
import { app } from "../index";

async function req(path: string, opts?: RequestInit): Promise<Response> {
  return await app.fetch(new Request(`http://localhost/api/v1${path}`, opts));
}

function cookieHeader(cookie: string): Record<string, string> {
  return { cookie: cookie.split(";")[0] };
}

const testId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

async function signup(suffix: string) {
  const username = `adm_${suffix}_${testId}`.slice(0, 30);
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

describe("Sprint 50 — admin endpoints", () => {
  test("/admin/reindex requires auth", async () => {
    const res = await req("/admin/reindex", { method: "POST" });
    expect(res.status).toBe(401);
  });

  test("/admin/reindex rebuilds the search index and returns stats", async () => {
    const me = await signup("rebuild");
    const res = await req("/admin/reindex", {
      method: "POST",
      headers: cookieHeader(me.cookie),
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.rebuilt).toBe(true);
    expect(typeof data.itemCount).toBe("number");
    expect(typeof data.durationMs).toBe("number");
    expect(data.itemCount).toBeGreaterThan(0);
  });

  test("/admin/search-stats returns lastBuild after a reindex", async () => {
    const me = await signup("stats");
    await req("/admin/reindex", { method: "POST", headers: cookieHeader(me.cookie) });
    const res = await req("/admin/search-stats", { headers: cookieHeader(me.cookie) });
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.lastBuild).toBeDefined();
    expect(typeof data.lastBuild.itemCount).toBe("number");
    expect(typeof data.lastBuild.durationMs).toBe("number");
    expect(typeof data.lastBuild.builtAt).toBe("string");
  });
});
