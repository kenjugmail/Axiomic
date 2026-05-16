// Phase 32E — signed-proof skill-gap analyzer + external goal path.
//
// Seeds a path/node (→ concept slug) + userProgress + a
// userSkillIndex proof row, then asserts analyzeSkillGap splits a
// target set into proven / weak / missing with the right coverage;
// the /me/skill-gap route works for ad-hoc skills and a curated
// role (unknown role → 404); goalPlanner kind:'skills' is
// topologically valid + deterministic.

import { describe, test, expect } from "bun:test";
import { app } from "../index";
import { analyzeSkillGap } from "./skillGap";
import { buildGoalPath } from "./goalPlanner";

async function req(path: string, opts?: RequestInit): Promise<Response> {
  return await app.fetch(new Request(`http://localhost/api/v1${path}`, opts));
}
function cookieHeader(cookie: string): Record<string, string> {
  return { cookie: cookie.split(";")[0] };
}
const testRun = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

async function signup(suffix: string) {
  const username = `sg_${suffix}_${testRun}`.slice(0, 30);
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

describe("skill gap analyzer (Phase 32C)", () => {
  test("proven/weak/missing split + route + deterministic skills path", async () => {
    const {
      getDb,
      masteryPaths,
      masteryNodes,
      userProgress,
      userSkillIndex,
    } = await import("@axiomic/db");
    const { randomUUID } = await import("crypto");
    const db = getDb();
    const u = await signup("u");

    const provenSlug = `proven-${testRun}`;
    const weakSlug = `weak-${testRun}`;
    const missingSlug = `missing-${testRun}`;

    const pathId = randomUUID();
    db.insert(masteryPaths)
      .values({
        id: pathId,
        slug: `sgp-${testRun}`,
        title: "P",
        description: "d",
      })
      .run();
    const weakNode = randomUUID();
    db.insert(masteryNodes)
      .values({
        id: weakNode,
        pathId,
        slug: `sgn-${testRun}`,
        title: "Weak Concept",
        description: "d",
        order: 0,
        level: "apprentice",
        pageIds: JSON.stringify([weakSlug]),
        prerequisiteNodeIds: "[]",
      })
      .run();
    // In-progress (quizScore below mastery) → classified weak.
    db.insert(userProgress)
      .values({
        id: randomUUID(),
        userId: u.userId,
        nodeId: weakNode,
        completed: false,
        quizScore: 0.4,
        completedAt: null,
      })
      .run();
    // A signed-credential proof for provenSlug.
    db.insert(userSkillIndex)
      .values({
        id: randomUUID(),
        userId: u.userId,
        skillSlug: provenSlug,
        skillTitle: "Proven Skill",
        proofCount: 2,
        latestProofAt: new Date().toISOString(),
      })
      .run();

    const gap = analyzeSkillGap(u.userId, [
      provenSlug,
      weakSlug,
      missingSlug,
    ]);
    expect(gap.proven.map((p) => p.slug)).toContain(provenSlug);
    expect(gap.weak.map((w) => w.slug)).toContain(weakSlug);
    expect(gap.missing.map((m) => m.slug)).toContain(missingSlug);
    // coverage is rounded to 2 decimals by the analyzer.
    expect(gap.coverage).toBe(0.33);

    // Route — ad-hoc skills.
    const r = await req(
      `/me/skill-gap?skills=${provenSlug},${weakSlug},${missingSlug}`,
      { headers: cookieHeader(u.cookie) },
    );
    expect(r.status).toBe(200);
    const rb = (await r.json()) as {
      role: unknown;
      gap: { proven: unknown[]; coverage: number };
      path: { resolvable: boolean } | null;
    };
    expect(rb.role).toBe(null);
    expect(rb.gap.proven.length).toBe(1);
    expect(rb.path).not.toBe(null);

    // Route — curated role (catalog seeds lazily).
    const rr = await req("/me/skill-gap?role=ml-engineer", {
      headers: cookieHeader(u.cookie),
    });
    expect(rr.status).toBe(200);
    const rrb = (await rr.json()) as {
      role: { slug: string } | null;
      gap: { target: string[] };
    };
    expect(rrb.role?.slug).toBe("ml-engineer");
    expect(rrb.gap.target.length).toBeGreaterThan(0);

    // Unknown role → 404.
    const miss = await req(`/me/skill-gap?role=nope-${testRun}`, {
      headers: cookieHeader(u.cookie),
    });
    expect(miss.status).toBe(404);

    // goalPlanner kind:'skills' — resolvable + deterministic.
    const p1 = buildGoalPath(u.userId, { kind: "skills", slug: weakSlug });
    expect(p1.resolvable).toBe(true);
    expect(p1.steps.some((s) => s.nodeId === weakNode)).toBe(true);
    const p2 = buildGoalPath(u.userId, { kind: "skills", slug: weakSlug });
    expect(p2.steps.map((s) => s.nodeId)).toEqual(
      p1.steps.map((s) => s.nodeId),
    );

    // Public role catalog endpoint.
    const roles = (await (await req("/recruiter/roles")).json()) as {
      roles: Array<{ slug: string }>;
    };
    expect(roles.roles.some((x) => x.slug === "ml-engineer")).toBe(true);
  });
});
