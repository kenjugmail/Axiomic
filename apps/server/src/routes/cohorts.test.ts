// Sprint 43 — cohorts + mentor relationship tests.

import { describe, test, expect } from "bun:test";
import { app } from "../index";

async function req(path: string, opts?: RequestInit): Promise<Response> {
  return await app.fetch(new Request(`http://localhost/api/v1${path}`, opts));
}

function cookieHeader(cookie: string): Record<string, string> {
  return { cookie: cookie.split(";")[0] };
}

const testId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

async function signup(suffix: string) {
  const username = `co_${suffix}_${testId}`.slice(0, 30);
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
  return { cookie, username };
}

describe("Sprint 43 — cohorts", () => {
  test("anon create is 401", async () => {
    const res = await req("/cohorts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        slug: "anon-cohort",
        name: "Anon",
      }),
    });
    expect(res.status).toBe(401);
  });

  test("create + join + leave + duplicate-join idempotent", async () => {
    const me = await signup("crud");
    const slug = `co-crud-${testId}`;

    const create = await req("/cohorts", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(me.cookie) },
      body: JSON.stringify({
        slug,
        name: "Cohort CRUD",
        description: "Test",
        visibility: "open",
      }),
    });
    expect(create.status).toBe(201);

    // Creator gets the 'organizer' role automatically.
    const detail = await req(`/cohorts/${slug}`);
    expect(detail.status).toBe(200);
    const dData = (await detail.json()) as any;
    expect(dData.cohort.memberCount).toBe(1);
    expect(dData.cohort.members[0].role).toBe("organizer");

    // Other user joins the open cohort.
    const other = await signup("other");
    const join = await req(`/cohorts/${slug}/join`, {
      method: "POST",
      headers: cookieHeader(other.cookie),
    });
    expect(join.status).toBe(200);

    // Duplicate join is idempotent.
    const join2 = await req(`/cohorts/${slug}/join`, {
      method: "POST",
      headers: cookieHeader(other.cookie),
    });
    expect(join2.status).toBe(200);
    expect(((await join2.json()) as any).alreadyMember).toBe(true);

    // Leave.
    const leave = await req(`/cohorts/${slug}/leave`, {
      method: "POST",
      headers: cookieHeader(other.cookie),
    });
    expect(leave.status).toBe(200);

    // Organizer cannot leave their own cohort.
    const orgLeave = await req(`/cohorts/${slug}/leave`, {
      method: "POST",
      headers: cookieHeader(me.cookie),
    });
    expect(orgLeave.status).toBe(400);
  });

  test("invite-only cohort rejects open join", async () => {
    const me = await signup("invite");
    const slug = `co-invite-${testId}`;
    await req("/cohorts", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(me.cookie) },
      body: JSON.stringify({
        slug,
        name: "Invite-only cohort",
        visibility: "invite",
      }),
    });
    const other = await signup("invite-other");
    const join = await req(`/cohorts/${slug}/join`, {
      method: "POST",
      headers: cookieHeader(other.cookie),
    });
    expect(join.status).toBe(403);
  });

  test("duplicate slug is 409", async () => {
    const me = await signup("dup");
    const slug = `co-dup-${testId}`;
    const r1 = await req("/cohorts", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(me.cookie) },
      body: JSON.stringify({ slug, name: "First" }),
    });
    expect(r1.status).toBe(201);
    const r2 = await req("/cohorts", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(me.cookie) },
      body: JSON.stringify({ slug, name: "Second" }),
    });
    expect(r2.status).toBe(409);
  });

  // ----- Phase 17C — activity feed -----

  test("activity endpoint 404s on unknown cohort", async () => {
    const r = await req("/cohorts/totally-not-a-real-cohort-slug/activity");
    expect(r.status).toBe(404);
  });

  // Phase 18A — invite-only cohorts gate the activity feed by
  // membership. Open cohorts stay public.
  test("invite-only activity feed rejects non-members + anonymous", async () => {
    const owner = await signup("priv-own");
    const slug = `cohort-priv-${testId}`;
    const create = await req("/cohorts", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(owner.cookie) },
      body: JSON.stringify({
        slug,
        name: "Invite-only activity test",
        visibility: "invite",
      }),
    });
    expect(create.status).toBe(201);

    // Anonymous caller → 401.
    const anon = await req(`/cohorts/${slug}/activity`);
    expect(anon.status).toBe(401);

    // Signed-in but not a member → 403.
    const stranger = await signup("priv-str");
    const denied = await req(`/cohorts/${slug}/activity`, {
      headers: cookieHeader(stranger.cookie),
    });
    expect(denied.status).toBe(403);

    // Owner is the implicit organizer member → 200.
    const allowed = await req(`/cohorts/${slug}/activity`, {
      headers: cookieHeader(owner.cookie),
    });
    expect(allowed.status).toBe(200);
  });

  test("activity endpoint surfaces recent member joins", async () => {
    const owner = await signup("ac1");
    const slug = `cohort-ac1-${testId}`;
    const create = await req("/cohorts", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(owner.cookie) },
      body: JSON.stringify({
        slug,
        name: "Activity feed test cohort",
        description: "for testing the activity feed",
        visibility: "open",
      }),
    });
    expect(create.status).toBe(201);

    const joiner = await signup("ac2");
    const joinRes = await req(`/cohorts/${slug}/join`, {
      method: "POST",
      headers: cookieHeader(joiner.cookie),
    });
    expect([200, 201]).toContain(joinRes.status);

    const activity = await req(`/cohorts/${slug}/activity`);
    expect(activity.status).toBe(200);
    const body = (await activity.json()) as {
      events: Array<{ kind: string; actorUsername: string }>;
    };
    // Both creator and joiner produce "joined" rows when created within
    // the 30-day window.
    const joins = body.events.filter((e) => e.kind === "joined");
    const usernames = new Set(joins.map((e) => e.actorUsername));
    expect(usernames.has(joiner.username)).toBe(true);
  });
});

describe("Sprint 43 — mentor relationships", () => {
  test("request → accept flow", async () => {
    const mentor = await signup("ment-m");
    const mentee = await signup("ment-e");

    const requestRes = await req("/mentors/request", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(mentee.cookie) },
      body: JSON.stringify({
        mentorUsername: mentor.username,
        scope: "Working on transformer interpretability research.",
      }),
    });
    expect(requestRes.status).toBe(201);
    const { id } = (await requestRes.json()) as any;

    // Mentee can't accept their own request.
    const selfAccept = await req(`/mentors/${id}/respond`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(mentee.cookie) },
      body: JSON.stringify({ status: "accepted" }),
    });
    expect(selfAccept.status).toBe(403);

    const accept = await req(`/mentors/${id}/respond`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(mentor.cookie) },
      body: JSON.stringify({ status: "accepted" }),
    });
    expect(accept.status).toBe(200);

    // Mentor /me shows the relationship.
    const meRes = await req("/mentors/me", { headers: cookieHeader(mentor.cookie) });
    const data = (await meRes.json()) as any;
    expect(data.asMentor.length).toBeGreaterThanOrEqual(1);
    expect(data.asMentor[0].status).toBe("accepted");
  });

  test("self-mentor is rejected", async () => {
    const me = await signup("self");
    const res = await req("/mentors/request", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(me.cookie) },
      body: JSON.stringify({
        mentorUsername: me.username,
        scope: "Trying to mentor myself, surely that's fine.",
      }),
    });
    expect(res.status).toBe(400);
  });

  test("duplicate active request is 409", async () => {
    const m = await signup("dup-m");
    const e = await signup("dup-e");
    const first = await req("/mentors/request", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(e.cookie) },
      body: JSON.stringify({
        mentorUsername: m.username,
        scope: "First mentorship request scope description.",
      }),
    });
    expect(first.status).toBe(201);
    const second = await req("/mentors/request", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(e.cookie) },
      body: JSON.stringify({
        mentorUsername: m.username,
        scope: "Second request while first is still pending.",
      }),
    });
    expect(second.status).toBe(409);
  });
});
