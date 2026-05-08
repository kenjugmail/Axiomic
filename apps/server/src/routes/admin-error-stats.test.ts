// Sprint 53 — /admin/error-stats endpoint.

import { describe, test, expect } from "bun:test";
import { eq } from "drizzle-orm";
import { app } from "../index";
import { getDb, users } from "@axiomic/db";
import { logger } from "../lib/logger";
import { resetSampler } from "../lib/errorSampler";

async function req(path: string, opts?: RequestInit): Promise<Response> {
  return await app.fetch(new Request(`http://localhost/api/v1${path}`, opts));
}

function cookieHeader(cookie: string): Record<string, string> {
  return { cookie: cookie.split(";")[0] };
}

const testId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

async function signup(suffix: string) {
  const username = `errstat_${suffix}_${testId}`.slice(0, 30);
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

describe("/admin/error-stats (Sprint 53)", () => {
  test("requires admin", async () => {
    const u = await signup("nonadmin");
    const r = await req("/admin/error-stats", { headers: cookieHeader(u.cookie) });
    expect(r.status).toBe(403);
  });

  test("returns counters + recent for admin after errors are logged", async () => {
    resetSampler();
    logger.error({ kind: "test_endpoint_kind", msg: "boom" });
    logger.error({ kind: "test_endpoint_kind", msg: "boom 2" });
    logger.error({ kind: "other_kind", msg: "ok" });

    const admin = await signup("ok");
    promoteAdmin(admin.username);
    const r = await req("/admin/error-stats", {
      headers: cookieHeader(admin.cookie),
    });
    expect(r.status).toBe(200);
    const data = (await r.json()) as {
      counters: Record<string, number>;
      recent: Array<{ kind: string; msg: string }>;
    };
    expect(data.counters.test_endpoint_kind).toBe(2);
    expect(data.counters.other_kind).toBe(1);
    expect(data.recent.length).toBeGreaterThanOrEqual(3);
    // Newest first.
    expect(data.recent[0].msg).toBe("ok");
  });
});
