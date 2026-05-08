// Sprint 33 — Knowledge MRI aggregator tests.

import { describe, test, expect } from "bun:test";
import { app } from "../index";
import { getDb, masteryNodes, masteryPaths, userProgress } from "@axiomic/db";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";

async function req(path: string, opts?: RequestInit): Promise<Response> {
  return await app.fetch(new Request(`http://localhost/api/v1${path}`, opts));
}

function cookieHeader(cookie: string): Record<string, string> {
  return { cookie: cookie.split(";")[0] };
}

const testId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

async function signup(suffix: string) {
  const username = `mri_${suffix}_${testId}`.slice(0, 30);
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
  const data = (await res.json()) as any;
  return { cookie, username, userId: data?.user?.id as string };
}

describe("/me/knowledge-mri (Sprint 33)", () => {
  test("requires auth", async () => {
    const res = await req("/me/knowledge-mri");
    expect(res.status).toBe(401);
  });

  test("brand-new user gets a sensible empty-ish shape", async () => {
    const { cookie } = await signup("empty");
    const res = await req("/me/knowledge-mri", {
      headers: cookieHeader(cookie),
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(Array.isArray(data.paths)).toBe(true);
    expect(typeof data.overall.mastered).toBe("number");
    expect(typeof data.overall.inProgress).toBe("number");
    expect(typeof data.overall.untouched).toBe("number");
    expect(typeof data.overall.activeDiagnoses).toBe("number");
    // hottestPath is null when nothing is hot.
    expect(
      data.overall.hottestPath === null ||
        typeof data.overall.hottestPath === "object",
    ).toBe(true);
    // A brand-new user has no mastered nodes; everything is untouched.
    expect(data.overall.mastered).toBe(0);
  });

  test("user with mastered progress shows up in overall.mastered", async () => {
    const { cookie, userId } = await signup("master");
    const db = getDb();
    // Pull any existing seeded mastery node — we don't depend on a
    // specific slug.
    const node = db
      .select({ id: masteryNodes.id })
      .from(masteryNodes)
      .limit(1)
      .get();
    if (!node) {
      // No seed data — bail. Empty state is covered by the test above.
      return;
    }
    db.insert(userProgress).values({
      id: randomUUID(),
      userId,
      nodeId: node.id,
      completed: true,
      quizScore: 0.9,
      completedAt: new Date().toISOString(),
    }).run();

    const res = await req("/me/knowledge-mri", {
      headers: cookieHeader(cookie),
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.overall.mastered).toBeGreaterThanOrEqual(1);
    // Find the path containing this node and verify the heatmap row
    // reports the mastered status.
    const path = (data.paths as any[]).find((p) =>
      p.nodes.find((n: any) => n.nodeId === node.id),
    );
    expect(path).toBeDefined();
    const cell = path.nodes.find((n: any) => n.nodeId === node.id);
    expect(cell.status).toBe("mastered");
    expect(cell.quizScore).toBeGreaterThanOrEqual(0.9);
  });

  test("path summary returns total + completed counts", async () => {
    const { cookie } = await signup("path-summary");
    const res = await req("/me/knowledge-mri", {
      headers: cookieHeader(cookie),
    });
    const data = (await res.json()) as any;
    if (data.paths.length === 0) return;
    for (const p of data.paths as any[]) {
      expect(typeof p.summary.totalNodes).toBe("number");
      expect(p.summary.totalNodes).toBe(p.nodes.length);
      expect(p.summary.completedNodes).toBeLessThanOrEqual(
        p.summary.totalNodes,
      );
    }
  });
});

// Suppress unused-import lint warnings when no seeded paths exist in
// the test DB.
void masteryPaths;
void eq;
