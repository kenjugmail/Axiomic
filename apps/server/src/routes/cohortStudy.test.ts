// Phase 30F — cohort study groups (sessions + progress + notify).

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
  const username = `cg_${suffix}_${testRun}`.slice(0, 30);
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

describe("cohort study groups (Phase 30B)", () => {
  test("organizer schedules a session; members see it + get one notification; non-member gated; progress lists members", async () => {
    const { getDb, notifications } = await import("@axiomic/db");
    const { and, eq } = await import("drizzle-orm");
    const organizer = await signup("org");
    const member = await signup("mem");
    const outsider = await signup("out");

    // Create an invite-only cohort.
    const slug = `cg-${testRun}`;
    const mk = await req("/cohorts", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...cookieHeader(organizer.cookie),
      },
      body: JSON.stringify({
        slug,
        name: `Study group ${testRun}`,
        description: "x",
        visibility: "invite",
      }),
    });
    expect(mk.status).toBe(201);

    // Add `member` directly as a cohort member.
    const { cohorts, cohortMembers } = await import("@axiomic/db");
    const { randomUUID } = await import("crypto");
    const cohortRow = getDb()
      .select({ id: cohorts.id })
      .from(cohorts)
      .where(eq(cohorts.slug, slug))
      .get();
    getDb()
      .insert(cohortMembers)
      .values({
        id: randomUUID(),
        cohortId: cohortRow!.id,
        userId: member.userId,
        role: "member",
      })
      .run();

    // Member can't schedule (organizer/mentor only).
    const denied = await req(`/cohorts/${slug}/sessions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...cookieHeader(member.cookie),
      },
      body: JSON.stringify({
        title: "no",
        scheduledAt: new Date(Date.now() + 86400000).toISOString(),
      }),
    });
    expect(denied.status).toBe(403);

    // Organizer schedules.
    const sched = await req(`/cohorts/${slug}/sessions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...cookieHeader(organizer.cookie),
      },
      body: JSON.stringify({
        title: "Week 1 jam",
        scheduledAt: new Date(Date.now() + 86400000).toISOString(),
      }),
    });
    expect(sched.status).toBe(201);

    // Member sees it; outsider is gated (invite-only).
    const list = await req(`/cohorts/${slug}/sessions`, {
      headers: cookieHeader(member.cookie),
    });
    expect(list.status).toBe(200);
    const lb = (await list.json()) as { sessions: Array<{ title: string }> };
    expect(lb.sessions.find((s) => s.title === "Week 1 jam")).toBeDefined();

    const outsiderList = await req(`/cohorts/${slug}/sessions`, {
      headers: cookieHeader(outsider.cookie),
    });
    expect(outsiderList.status).toBe(403);

    // Progress lists members.
    const prog = await req(`/cohorts/${slug}/progress`, {
      headers: cookieHeader(organizer.cookie),
    });
    expect(prog.status).toBe(200);
    const pb = (await prog.json()) as {
      members: Array<{ username: string }>;
      milestonesCleared: number;
    };
    expect(pb.members.length).toBeGreaterThanOrEqual(1);
    expect(typeof pb.milestonesCleared).toBe("number");

    // Member got exactly one cohort_session_scheduled notification.
    await new Promise((r) => setTimeout(r, 100));
    const notifs = getDb()
      .select()
      .from(notifications)
      .where(
        and(
          eq(notifications.userId, member.userId),
          eq(notifications.kind, "cohort_session_scheduled"),
        ),
      )
      .all();
    expect(notifs.length).toBe(1);
  });
});
