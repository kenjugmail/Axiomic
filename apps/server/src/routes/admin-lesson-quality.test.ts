// /admin/lesson-quality dashboard endpoint — role gate + response shape.

import { describe, test, expect } from "bun:test";
import { eq } from "drizzle-orm";
import { app } from "../index";
import { getDb, users } from "@axiomic/db";

async function req(path: string, opts?: RequestInit): Promise<Response> {
  return await app.fetch(new Request(`http://localhost/api/v1${path}`, opts));
}

function cookieHeader(cookie: string): Record<string, string> {
  return { cookie: cookie.split(";")[0] };
}

const testId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

async function signup(suffix: string) {
  const username = `lq_${suffix}_${testId}`.slice(0, 30);
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

interface LessonRow {
  nodeSlug: string;
  pathSlug: string;
  title: string;
  composite: number;
  totalBodyWords: number;
  nameDropCount: number;
  flags: string[];
}
interface QualityResponse {
  lessons: LessonRow[];
  summary: {
    total: number;
    scored: number;
    missing: number;
    avg: number;
    median: number;
    flaggedCount: number;
  };
}

describe("/admin/lesson-quality", () => {
  test("requires admin", async () => {
    const u = await signup("nonadmin");
    const r = await req("/admin/lesson-quality", { headers: cookieHeader(u.cookie) });
    expect(r.status).toBe(403);
  });

  test("returns scored lessons + summary for admin", async () => {
    const admin = await signup("ok");
    promoteAdmin(admin.username);
    const r = await req("/admin/lesson-quality", {
      headers: cookieHeader(admin.cookie),
    });
    expect(r.status).toBe(200);
    const data = (await r.json()) as QualityResponse;

    // Seed has many lesson-kind nodes.
    expect(data.lessons.length).toBeGreaterThan(0);
    expect(data.summary.total).toBe(data.lessons.length);
    expect(data.summary.avg).toBeGreaterThanOrEqual(0);
    expect(data.summary.avg).toBeLessThanOrEqual(100);
    expect(typeof data.summary.median).toBe("number");

    // Worst-first ordering.
    const composites = data.lessons.map((l) => l.composite);
    for (let i = 1; i < composites.length; i++) {
      expect(composites[i]).toBeGreaterThanOrEqual(composites[i - 1]);
    }

    // Each row carries the fields the dashboard renders + deep-links on.
    const row = data.lessons[0];
    expect(typeof row.nodeSlug).toBe("string");
    expect(row.nodeSlug.length).toBeGreaterThan(0);
    expect(typeof row.pathSlug).toBe("string");
    expect(row.pathSlug.length).toBeGreaterThan(0);
    expect(Array.isArray(row.flags)).toBe(true);
  });
});
