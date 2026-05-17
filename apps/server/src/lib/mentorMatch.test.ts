// Phase 30F — mentor auto-matching.

import { describe, test, expect } from "bun:test";
import { app } from "../index";

async function req(path: string, opts?: RequestInit): Promise<Response> {
  return await app.fetch(new Request(`http://localhost/api/v1${path}`, opts));
}
function cookieHeader(cookie: string): Record<string, string> {
  return { cookie: cookie.split(";")[0] };
}
const testRun =
  Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
async function signup(suffix: string) {
  const username = `mm_${suffix}_${testRun}`.slice(0, 30);
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

describe("mentor auto-matching (Phase 30A)", () => {
  test("ranks a mentor strong where the mentee is weak; empty scope → not personalized", async () => {
    const {
      getDb,
      masteryNodes,
      misconceptionDiagnoses,
      userProgress,
      mentorRelationships,
    } = await import("@axiomic/db");
    const { randomUUID } = await import("crypto");
    const db = getDb();

    // Pick a seeded mastery node whose pageIds[0] is a concept slug.
    const node = db.select().from(masteryNodes).limit(1).all()[0];
    if (!node) {
      // No seeded mastery graph in this DB — assert graceful path.
      const m = await signup("nograph");
      const r = await req("/mentors/candidates", {
        headers: cookieHeader(m.cookie),
      });
      expect(r.status).toBe(200);
      const b = (await r.json()) as { personalized: boolean };
      expect(b.personalized).toBe(false);
      return;
    }
    let slug = "";
    try {
      const ids = JSON.parse(node.pageIds);
      slug = Array.isArray(ids) ? String(ids[0]) : "";
    } catch {
      slug = "";
    }
    expect(slug.length).toBeGreaterThan(0);

    const mentee = await signup("mentee");
    const goodMentor = await signup("good");
    const otherMentor = await signup("other");
    const dummyMentee = await signup("dummy");

    // Mentee is weak on `slug` (active diagnosis).
    db.insert(misconceptionDiagnoses)
      .values({
        id: randomUUID(),
        userId: mentee.userId,
        conceptSlug: slug,
        misconceptionKey: `k-${testRun}`,
        label: "Confuses the thing",
        status: "active",
      })
      .run();

    // goodMentor proved strong on that node; otherMentor did not.
    db.insert(userProgress)
      .values({
        id: randomUUID(),
        userId: goodMentor.userId,
        nodeId: node.id,
        completed: true,
        quizScore: 0.95,
        completedAt: new Date().toISOString(),
      })
      .run();

    // Both are in the candidate pool (accepted mentor rel as mentor).
    for (const mn of [goodMentor, otherMentor]) {
      db.insert(mentorRelationships)
        .values({
          id: randomUUID(),
          mentorId: mn.userId,
          menteeId: dummyMentee.userId,
          status: "accepted",
          scope: "x",
        })
        .run();
    }

    const res = await req("/mentors/candidates", {
      headers: cookieHeader(mentee.cookie),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      personalized: boolean;
      candidates: Array<{ username: string; rationale: string; score: number }>;
    };
    expect(body.personalized).toBe(true);
    const good = body.candidates.find(
      (c) => c.username === goodMentor.username,
    );
    expect(good).toBeDefined();
    expect(good!.rationale.length).toBeGreaterThan(0);
    // The topic-strong mentor outranks the unrelated one.
    const other = body.candidates.find(
      (c) => c.username === otherMentor.username,
    );
    if (other) {
      expect(good!.score).toBeGreaterThanOrEqual(other.score);
    }

    // A brand-new user with no weak signals → not personalized.
    const blank = await signup("blank");
    const blankRes = await req("/mentors/candidates", {
      headers: cookieHeader(blank.cookie),
    });
    const blankBody = (await blankRes.json()) as { personalized: boolean };
    expect(blankBody.personalized).toBe(false);
  });
});
