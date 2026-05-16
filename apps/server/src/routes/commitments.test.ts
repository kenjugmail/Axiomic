// Phase 34E — signed learning commitments.
//
// Create validates resolvable (bad slug → 404); complete is
// gated on the goal actually being met (steps remain → 400),
// then mints a signed commitment_kept credential + a transparency
// leaf; abandon; the lapse job flips a past-deadline commitment.

import { describe, test, expect } from "bun:test";
import { app } from "../index";
import { registerJob, runJobNow } from "../lib/jobs";
import { lapseCommitmentsJob } from "../jobs/lapseCommitments";

async function req(path: string, opts?: RequestInit): Promise<Response> {
  return await app.fetch(new Request(`http://localhost/api/v1${path}`, opts));
}
function cookieHeader(cookie: string): Record<string, string> {
  return { cookie: cookie.split(";")[0] };
}
const testRun = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

async function signup(suffix: string) {
  const username = `cm_${suffix}_${testRun}`.slice(0, 30);
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
  };
}

describe("learning commitments (Phase 34D)", () => {
  test("validate, complete-gate, sign + transparency, abandon, lapse", async () => {
    const {
      getDb,
      masteryPaths,
      masteryNodes,
      userProgress,
      learningCommitments,
      notifications,
    } = await import("@axiomic/db");
    const { and, eq } = await import("drizzle-orm");
    const { randomUUID } = await import("crypto");
    const u = await signup("u");
    const db = getDb();

    const wikiSlug = `cmw-${testRun}`;
    const pathId = randomUUID();
    db.insert(masteryPaths)
      .values({
        id: pathId,
        slug: `cmp-${testRun}`,
        title: "P",
        description: "d",
      })
      .run();
    const nodeId = randomUUID();
    db.insert(masteryNodes)
      .values({
        id: nodeId,
        pathId,
        slug: `cmn-${testRun}`,
        title: "Node",
        description: "d",
        order: 0,
        level: "apprentice",
        pageIds: JSON.stringify([wikiSlug]),
        prerequisiteNodeIds: "[]",
      })
      .run();

    const future = new Date(Date.now() + 30 * 86_400_000).toISOString();

    // Bad slug → not resolvable → 404.
    const bad = await req("/me/commitments", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...cookieHeader(u.cookie),
      },
      body: JSON.stringify({
        goalKind: "skills",
        goalSlug: `nope-${testRun}`,
        deadlineAt: future,
      }),
    });
    expect(bad.status).toBe(404);

    // Resolvable commitment.
    const mk = await req("/me/commitments", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...cookieHeader(u.cookie),
      },
      body: JSON.stringify({
        goalKind: "skills",
        goalSlug: wikiSlug,
        deadlineAt: future,
      }),
    });
    expect(mk.status).toBe(201);
    const cmId = ((await mk.json()) as { id: string }).id;

    // Goal not met (node untouched → a step remains) → 400.
    const early = await req(`/me/commitments/${cmId}/complete`, {
      method: "POST",
      headers: cookieHeader(u.cookie),
    });
    expect(early.status).toBe(400);

    // Master the node → goal-path empties → complete succeeds.
    db.insert(userProgress)
      .values({
        id: randomUUID(),
        userId: u.userId,
        nodeId,
        completed: true,
        quizScore: 0.95,
        completedAt: new Date().toISOString(),
      })
      .run();
    const done = await req(`/me/commitments/${cmId}/complete`, {
      method: "POST",
      headers: cookieHeader(u.cookie),
    });
    expect(done.status).toBe(200);
    const db2 = (await done.json()) as {
      status: string;
      credential: { manifest: { kind: string } };
    };
    expect(db2.status).toBe("completed");
    expect(db2.credential.manifest.kind).toBe("commitment_kept");

    // Transparency leaf for the kept commitment.
    const inc = (await (
      await req(
        `/public/transparency/inclusion?kind=commitment&ref=${cmId}`,
      )
    ).json()) as { events: unknown[] };
    expect(inc.events.length).toBeGreaterThanOrEqual(1);

    // Abandon a fresh commitment.
    const mk2 = await req("/me/commitments", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...cookieHeader(u.cookie),
      },
      body: JSON.stringify({
        goalKind: "skills",
        goalSlug: wikiSlug,
        deadlineAt: future,
      }),
    });
    const cm2 = ((await mk2.json()) as { id: string }).id;
    const ab = await req(`/me/commitments/${cm2}/abandon`, {
      method: "POST",
      headers: cookieHeader(u.cookie),
    });
    expect(ab.status).toBe(200);

    // Lapse job flips a past-deadline active commitment.
    const lapseId = randomUUID();
    db.insert(learningCommitments)
      .values({
        id: lapseId,
        userId: u.userId,
        goalKind: "skills",
        goalSlug: wikiSlug,
        goalTitle: "Past due",
        deadlineAt: new Date(Date.now() - 86_400_000).toISOString(),
        status: "active",
      })
      .run();
    registerJob(lapseCommitmentsJob);
    const r = await runJobNow("lapse_commitments");
    expect((r.itemsProcessed ?? 0)).toBeGreaterThanOrEqual(1);
    const row = db
      .select({ status: learningCommitments.status })
      .from(learningCommitments)
      .where(eq(learningCommitments.id, lapseId))
      .get();
    expect(row?.status).toBe("lapsed");
    const note = db
      .select({ id: notifications.id })
      .from(notifications)
      .where(
        and(
          eq(notifications.userId, u.userId),
          eq(notifications.kind, "commitment_lapsed"),
        ),
      )
      .all();
    expect(note.length).toBeGreaterThanOrEqual(1);
  });
});
