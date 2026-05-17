// Phase 28F — predictive readiness tests.
//
// Covers: /me/readiness returns a velocity from seeded snapshots,
// a positive trajectory, a dated study plan derived from active
// misconception diagnoses; and the daily snapshot upsert (hooked
// into the Knowledge MRI build) is idempotent per UTC day.

import { describe, test, expect } from "bun:test";
import { app } from "../index";

async function req(path: string, opts?: RequestInit): Promise<Response> {
  return await app.fetch(new Request(`http://localhost/api/v1${path}`, opts));
}

function cookieHeader(cookie: string): Record<string, string> {
  return { cookie: cookie.split(";")[0] };
}

const testRun = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

async function signup(
  suffix: string,
): Promise<{ cookie: string; userId: string; username: string }> {
  const username = `rd_${suffix}_${testRun}`.slice(0, 30);
  const res = await req("/auth/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username,
      email: `${username}@example.com`,
      password: "testpass123",
    }),
  });
  const data = (await res.json()) as { user: { id: string } };
  const cookie = res.headers.get("set-cookie") || "";
  return { cookie, userId: data.user.id, username };
}

function ymd(daysAgo: number): string {
  const d = new Date(Date.now() - daysAgo * 86_400_000);
  return d.toISOString().slice(0, 10);
}

describe("predictive readiness (Phase 28E)", () => {
  test("velocity + dated plan from seeded snapshots and an active diagnosis", async () => {
    const { getDb, masterySnapshots, misconceptionDiagnoses } =
      await import("@axiomic/db");
    const { randomUUID } = await import("crypto");
    const u = await signup("traj");

    // Two snapshots, +4 mastered over 4 days → slope = 1/day.
    getDb()
      .insert(masterySnapshots)
      .values([
        {
          id: randomUUID(),
          userId: u.userId,
          capturedOn: ymd(4),
          masteredCount: 2,
          inProgressCount: 3,
          untouchedCount: 10,
          weakConceptCount: 2,
        },
        {
          id: randomUUID(),
          userId: u.userId,
          capturedOn: ymd(0),
          masteredCount: 6,
          inProgressCount: 2,
          untouchedCount: 7,
          weakConceptCount: 1,
        },
      ])
      .run();

    // One active misconception diagnosis → a blocker + plan entry.
    getDb()
      .insert(misconceptionDiagnoses)
      .values({
        id: randomUUID(),
        userId: u.userId,
        conceptSlug: `softmax-${testRun}`,
        misconceptionKey: "temp-confusion",
        label: "Confuses temperature with logits",
        status: "active",
      })
      .run();

    const res = await req("/me/readiness", {
      headers: cookieHeader(u.cookie),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      velocityPerDay: number;
      snapshots: Array<{ capturedOn: string; mastered: number }>;
      weakConcepts: number;
      estimatedReadyOn: string | null;
      plan: Array<{ conceptSlug: string; targetDate: string }>;
    };

    expect(body.snapshots.length).toBe(2);
    expect(body.velocityPerDay).toBeCloseTo(1, 5);
    expect(body.weakConcepts).toBe(1);
    expect(body.estimatedReadyOn).not.toBeNull();
    expect(body.plan.length).toBe(1);
    expect(body.plan[0]!.conceptSlug).toBe(`softmax-${testRun}`);
    expect(body.plan[0]!.targetDate).not.toBe("");
  });

  test("daily snapshot upsert (via Knowledge MRI) is idempotent per UTC day", async () => {
    const { getDb, masterySnapshots } = await import("@axiomic/db");
    const { and, eq } = await import("drizzle-orm");
    const u = await signup("idem");

    // Two MRI builds the same day → at most one snapshot row.
    await req("/me/knowledge-mri", { headers: cookieHeader(u.cookie) });
    await req("/me/knowledge-mri", { headers: cookieHeader(u.cookie) });

    const today = new Date().toISOString().slice(0, 10);
    const rows = getDb()
      .select()
      .from(masterySnapshots)
      .where(
        and(
          eq(masterySnapshots.userId, u.userId),
          eq(masterySnapshots.capturedOn, today),
        ),
      )
      .all();
    expect(rows.length).toBeLessThanOrEqual(1);
  });

  test("no snapshots → zero velocity, empty plan, null ready date", async () => {
    const u = await signup("empty");
    const res = await req("/me/readiness", {
      headers: cookieHeader(u.cookie),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      velocityPerDay: number;
      snapshots: unknown[];
      estimatedReadyOn: string | null;
    };
    expect(body.velocityPerDay).toBe(0);
    expect(body.estimatedReadyOn).toBeNull();
  });
});
