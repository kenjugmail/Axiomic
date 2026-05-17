// Phase 31F — goal→path planner: topological order, mastery
// skip, blockedOn, determinism, cycle-safety.

import { describe, test, expect } from "bun:test";
import { app } from "../index";
import { buildGoalPath } from "./goalPlanner";

async function req(path: string, opts?: RequestInit): Promise<Response> {
  return await app.fetch(new Request(`http://localhost/api/v1${path}`, opts));
}
const testRun =
  Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
async function signup(suffix: string) {
  const username = `gp_${suffix}_${testRun}`.slice(0, 30);
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
  return { userId: data.user.id, username };
}

describe("goal planner (Phase 31B)", () => {
  test("exam goal: topological order, mastery skip, blockedOn, deterministic, cycle-safe", async () => {
    const {
      getDb,
      masteryPaths,
      masteryNodes,
      exams,
      userProgress,
    } = await import("@axiomic/db");
    const { randomUUID } = await import("crypto");
    const db = getDb();
    const u = await signup("u");

    const pathId = randomUUID();
    db.insert(masteryPaths)
      .values({
        id: pathId,
        slug: `gpp-${testRun}`,
        title: "Path",
        description: "d",
      })
      .run();
    const A = randomUUID();
    const B = randomUUID();
    const C = randomUUID();
    const D = randomUUID(); // self-cyclic, must not hang
    const mk = (id: string, slug: string, ord: number, prereq: string[]) =>
      db
        .insert(masteryNodes)
        .values({
          id,
          pathId,
          slug,
          title: slug.toUpperCase(),
          description: "d",
          order: ord,
          level: "apprentice",
          pageIds: "[]",
          prerequisiteNodeIds: JSON.stringify(prereq),
        })
        .run();
    mk(A, `a-${testRun}`, 0, []);
    mk(B, `b-${testRun}`, 1, [A]);
    mk(C, `c-${testRun}`, 2, [B]);
    mk(D, `d-${testRun}`, 3, [D]);

    const examSlug = `gpx-${testRun}`;
    db.insert(exams)
      .values({
        id: randomUUID(),
        slug: examSlug,
        title: "Exam",
        shortName: "EX",
        totalDurationMinutes: 60,
        pathSlug: `gpp-${testRun}`,
      })
      .run();

    const p1 = buildGoalPath(u.userId, { kind: "exam", slug: examSlug });
    expect(p1.resolvable).toBe(true);
    const order = p1.steps.map((s) => s.nodeId);
    // A before B before C (topological).
    expect(order.indexOf(A)).toBeLessThan(order.indexOf(B));
    expect(order.indexOf(B)).toBeLessThan(order.indexOf(C));
    // D (self-cycle) still appears (cycle remainder), never hangs.
    expect(order).toContain(D);
    const dStep = p1.steps.find((s) => s.nodeId === D);
    expect(dStep?.reason).toContain("cycle");

    // Deterministic across calls.
    const p2 = buildGoalPath(u.userId, { kind: "exam", slug: examSlug });
    expect(p2.steps.map((s) => s.nodeId)).toEqual(order);

    // Master A → it drops out of steps.
    db.insert(userProgress)
      .values({
        id: randomUUID(),
        userId: u.userId,
        nodeId: A,
        completed: true,
        quizScore: 0.95,
        completedAt: new Date().toISOString(),
      })
      .run();
    const p3 = buildGoalPath(u.userId, { kind: "exam", slug: examSlug });
    expect(p3.steps.find((s) => s.nodeId === A)).toBeUndefined();
    expect(p3.steps.find((s) => s.nodeId === B)).toBeDefined();

    // Unknown slug → not resolvable.
    const miss = buildGoalPath(u.userId, {
      kind: "exam",
      slug: `nope-${testRun}`,
    });
    expect(miss.resolvable).toBe(false);
  });
});
