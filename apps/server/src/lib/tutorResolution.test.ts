// Phase 31F — loop-closing tutor resolution.

import { describe, test, expect } from "bun:test";
import { eq } from "drizzle-orm";
import { app } from "../index";
import { resolveMisconceptionIfProven } from "./tutorResolution";

async function req(path: string, opts?: RequestInit): Promise<Response> {
  return await app.fetch(new Request(`http://localhost/api/v1${path}`, opts));
}
function cookieHeader(cookie: string): Record<string, string> {
  return { cookie: cookie.split(";")[0] };
}
const testRun =
  Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
async function signup(suffix: string) {
  const username = `tr_${suffix}_${testRun}`.slice(0, 30);
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
  return {
    cookie: res.headers.get("set-cookie") || "",
    userId: data.user.id,
    username,
  };
}

describe("tutor resolution (Phase 31A)", () => {
  test("quiz-proof branch + idempotency + ownership (unit)", async () => {
    const {
      getDb,
      misconceptionDiagnoses,
      masteryPaths,
      masteryNodes,
      userProgress,
    } = await import("@axiomic/db");
    const { randomUUID } = await import("crypto");
    const u = await signup("u");
    const db = getDb();

    const pathId = randomUUID();
    db.insert(masteryPaths)
      .values({
        id: pathId,
        slug: `trp-${testRun}`,
        title: "P",
        description: "d",
      })
      .run();
    const nodeId = randomUUID();
    db.insert(masteryNodes)
      .values({
        id: nodeId,
        pathId,
        slug: `trn-${testRun}`,
        title: "N",
        description: "d",
        order: 0,
        level: "apprentice",
        pageIds: "[]",
      })
      .run();
    const diagId = randomUUID();
    db.insert(misconceptionDiagnoses)
      .values({
        id: diagId,
        userId: u.userId,
        conceptSlug: `c-${testRun}`,
        misconceptionKey: `k-${testRun}`,
        label: "Confuses X with Y",
        status: "active",
      })
      .run();

    // No proof yet → not resolved.
    let r = resolveMisconceptionIfProven(u.userId, diagId, {
      kind: "quiz",
      nodeId,
    });
    expect(r.resolved).toBe(false);

    // Strong quiz score on the node → resolves.
    db.insert(userProgress)
      .values({
        id: randomUUID(),
        userId: u.userId,
        nodeId,
        completed: true,
        quizScore: 0.9,
        completedAt: new Date().toISOString(),
      })
      .run();
    r = resolveMisconceptionIfProven(u.userId, diagId, {
      kind: "quiz",
      nodeId,
    });
    expect(r.resolved).toBe(true);
    const row = db
      .select()
      .from(misconceptionDiagnoses)
      .where(eq(misconceptionDiagnoses.id, diagId))
      .get();
    expect(row?.status).toBe("resolved");
    expect(row?.resolvedAt).toBeTruthy();

    // Idempotent — already terminal.
    r = resolveMisconceptionIfProven(u.userId, diagId, {
      kind: "essay",
      score: 1,
    });
    expect(r.resolved).toBe(false);
    expect(r.alreadyTerminal).toBe(true);

    // Ownership: another user can't resolve it.
    const other = await signup("o");
    const r2 = resolveMisconceptionIfProven(other.userId, diagId, {
      kind: "essay",
      score: 1,
    });
    expect(r2.notFound).toBe(true);
  });

  test("POST /me/weak-concepts/:id/prove grades + returns shape; 404 for non-owner", async () => {
    const { getDb, misconceptionDiagnoses } = await import("@axiomic/db");
    const { randomUUID } = await import("crypto");
    const u = await signup("p");
    const diagId = randomUUID();
    getDb()
      .insert(misconceptionDiagnoses)
      .values({
        id: diagId,
        userId: u.userId,
        conceptSlug: `cc-${testRun}`,
        misconceptionKey: `kk-${testRun}`,
        label: "Thinks gradient descent maximizes loss",
        status: "active",
      })
      .run();

    const ok = await req(`/me/weak-concepts/${diagId}/prove`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...cookieHeader(u.cookie),
      },
      body: JSON.stringify({
        answer:
          "Gradient descent minimizes the loss by stepping against the gradient; it does not maximize it.",
      }),
    });
    expect(ok.status).toBe(200);
    const body = (await ok.json()) as {
      resolved: boolean;
      score: number | null;
      feedbackMd: string;
    };
    expect(typeof body.resolved).toBe("boolean");
    expect("feedbackMd" in body).toBe(true);

    const other = await signup("p2");
    const denied = await req(`/me/weak-concepts/${diagId}/prove`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...cookieHeader(other.cookie),
      },
      body: JSON.stringify({ answer: "x" }),
    });
    expect(denied.status).toBe(404);
  });
});
