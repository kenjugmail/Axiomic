// Sprint 82 — Lab assignments + playbook + roster + skill MRI tests.

import { describe, test, expect } from "bun:test";
import { randomUUID } from "crypto";
import { app } from "../index";
import { cohortMembers, getDb } from "@axiomic/db";

async function req(path: string, opts?: RequestInit): Promise<Response> {
  return await app.fetch(new Request(`http://localhost/api/v1${path}`, opts));
}

function cookieHeader(cookie: string): Record<string, string> {
  return { cookie: cookie.split(";")[0] };
}

const testId =
  Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

async function signup(suffix: string): Promise<{
  cookie: string;
  username: string;
}> {
  const username = `la_${suffix}_${testId}`.slice(0, 30);
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

async function userIdFromCookie(cookie: string): Promise<string> {
  const res = await req("/auth/me", { headers: cookieHeader(cookie) });
  const body = (await res.json()) as { user: { id: string } };
  return body.user.id;
}

async function createCohort(
  cookie: string,
  slug: string,
): Promise<string> {
  const res = await req("/cohorts", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...cookieHeader(cookie) },
    body: JSON.stringify({
      slug,
      name: `Cohort ${slug}`,
      visibility: "open",
    }),
  });
  expect(res.status).toBe(201);
  const body = (await res.json()) as { id: string };
  return body.id;
}

function seedMember(
  cohortId: string,
  userId: string,
  role: "member" | "mentor" | "organizer",
): void {
  getDb()
    .insert(cohortMembers)
    .values({ id: randomUUID(), cohortId, userId, role })
    .run();
}

async function createProtocol(
  cookie: string,
  slug: string,
  opts: { requiredCerts?: string[]; status?: "draft" | "published" } = {},
): Promise<void> {
  const res = await req("/lab/protocols", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...cookieHeader(cookie) },
    body: JSON.stringify({
      slug,
      title: `Protocol ${slug}`,
      discipline: "biology",
      summary: "Test",
      contentUndergrad: "Body",
      requiredCerts: opts.requiredCerts ?? [],
      steps: [{ title: "Setup", instructionMd: "Do." }],
      status: opts.status ?? "published",
    }),
  });
  expect(res.status).toBe(201);
}

async function createCert(
  cookie: string,
  slug: string,
  validityDays: number | null = 730,
): Promise<void> {
  const res = await req("/lab/safety-certs", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...cookieHeader(cookie) },
    body: JSON.stringify({
      slug,
      title: `Cert ${slug}`,
      discipline: "biology",
      quizData: [
        {
          id: "q1",
          kind: "multiple_choice",
          question: "Q?",
          options: ["A", "B"],
          correctIndex: 1,
        },
      ],
      passingScore: 0.5,
      validityDays,
    }),
  });
  expect(res.status).toBe(201);
}

async function passCert(cookie: string, slug: string): Promise<void> {
  const res = await req(`/lab/safety-certs/${slug}/attempt`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...cookieHeader(cookie) },
    body: JSON.stringify({ answers: { q1: "1" } }),
  });
  expect(res.status).toBe(200);
}

describe("lab assignments + playbook + roster + MRI (Sprint 82)", () => {
  test("assign requires mentor/organizer role", async () => {
    const author = await signup("aua");
    const cohortSlug = `co-aua-${testId}`;
    await createCohort(author.cookie, cohortSlug);
    await createProtocol(author.cookie, `pa-aua-${testId}`);

    const stranger = await signup("aus");
    const internId = await userIdFromCookie(stranger.cookie);
    // Add stranger as a plain member (not mentor) so the cohort
    // member-id check passes but the role check refuses.
    seedMember(
      // Re-fetch cohort id via a quick lookup — easiest path is to
      // hit the roster endpoint via author and read it back.
      (await getCohortId(author.cookie, cohortSlug)),
      internId,
      "member",
    );

    const res = await req(`/lab-groups/${cohortSlug}/assign`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...cookieHeader(stranger.cookie),
      },
      body: JSON.stringify({
        assignedToUserIds: [internId],
        protocolSlug: `pa-aua-${testId}`,
      }),
    });
    expect(res.status).toBe(403);
  });

  test("assign rejects when no member matches", async () => {
    const author = await signup("ama");
    const cohortSlug = `co-ama-${testId}`;
    await createCohort(author.cookie, cohortSlug);
    await createProtocol(author.cookie, `pa-ama-${testId}`);
    const res = await req(`/lab-groups/${cohortSlug}/assign`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...cookieHeader(author.cookie),
      },
      body: JSON.stringify({
        assignedToUserIds: ["does-not-exist"],
        protocolSlug: `pa-ama-${testId}`,
      }),
    });
    expect(res.status).toBe(400);
  });

  test("assign requires exactly one of protocol/cert/path", async () => {
    const author = await signup("amk");
    const cohortSlug = `co-amk-${testId}`;
    await createCohort(author.cookie, cohortSlug);
    const res = await req(`/lab-groups/${cohortSlug}/assign`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...cookieHeader(author.cookie),
      },
      body: JSON.stringify({
        assignedToUserIds: [await userIdFromCookie(author.cookie)],
        protocolSlug: `pa-amk-${testId}`,
        certSlug: `c-amk-${testId}`,
      }),
    });
    expect(res.status).toBe(400);
  });

  test("end-to-end: assign protocol → playbook → completion bubbles after sign-off", async () => {
    const pi = await signup("e2e_pi");
    const intern = await signup("e2e_int");
    const mentor = await signup("e2e_men");
    const cohortSlug = `co-e2e-${testId}`;
    const cohortId = await createCohort(pi.cookie, cohortSlug);
    const internId = await userIdFromCookie(intern.cookie);
    const mentorId = await userIdFromCookie(mentor.cookie);
    seedMember(cohortId, internId, "member");
    seedMember(cohortId, mentorId, "mentor");

    const protoSlug = `p-e2e-${testId}`;
    await createProtocol(pi.cookie, protoSlug);

    const assign = await req(`/lab-groups/${cohortSlug}/assign`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(pi.cookie) },
      body: JSON.stringify({
        assignedToUserIds: [internId],
        protocolSlug: protoSlug,
        notesMd: "Please run.",
      }),
    });
    expect(assign.status).toBe(201);

    // Playbook reflects the assignment as pending.
    const playbookBefore = await req("/me/lab/playbook", {
      headers: cookieHeader(intern.cookie),
    });
    const pbb = (await playbookBefore.json()) as { assignments: any[] };
    const mine = pbb.assignments.find(
      (a) => a.kind === "protocol" && a.targetSlug === protoSlug,
    );
    expect(mine).toBeDefined();
    expect(mine.status).toBe("pending");

    // Intern starts the run, completes step, requests sign-off, mentor approves.
    const start = await req("/lab/runs/start", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(intern.cookie) },
      body: JSON.stringify({ protocolSlug: protoSlug }),
    });
    const { runId } = (await start.json()) as { runId: string };
    await req(`/lab/runs/${runId}/steps/1`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...cookieHeader(intern.cookie) },
      body: JSON.stringify({ done: true }),
    });
    await req(`/lab/runs/${runId}/request-signoff`, {
      method: "POST",
      headers: cookieHeader(intern.cookie),
    });
    await req(`/lab/runs/${runId}/sign-off`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(mentor.cookie) },
      body: JSON.stringify({ notesMd: "lgtm" }),
    });

    // Touching skill-MRI flips assignment status (side-effect on the
    // skill-MRI route bumps assignments to 'completed' when the
    // signed-off run is observable).
    await req("/me/lab/skill-mri", { headers: cookieHeader(intern.cookie) });

    const playbookAfter = await req("/me/lab/playbook", {
      headers: cookieHeader(intern.cookie),
    });
    const pba = (await playbookAfter.json()) as { assignments: any[] };
    const mineAfter = pba.assignments.find(
      (a) => a.kind === "protocol" && a.targetSlug === protoSlug,
    );
    expect(mineAfter.status).toBe("completed");
  });

  test("playbook recommended skips protocols with missing certs", async () => {
    const pi = await signup("rec_pi");
    const intern = await signup("rec_int");
    await createCert(pi.cookie, `c-rec-${testId}`);
    await createProtocol(pi.cookie, `p-rec-blocked-${testId}`, {
      requiredCerts: [`c-rec-${testId}`],
    });
    await createProtocol(pi.cookie, `p-rec-open-${testId}`);

    const res = await req("/me/lab/playbook?limit=2000", {
      headers: cookieHeader(intern.cookie),
    });
    const body = (await res.json()) as { recommended: any[] };
    const slugs = body.recommended.map((r) => r.slug);
    expect(slugs).toContain(`p-rec-open-${testId}`);
    expect(slugs).not.toContain(`p-rec-blocked-${testId}`);

    // After passing the gating cert it appears.
    await passCert(intern.cookie, `c-rec-${testId}`);
    const res2 = await req("/me/lab/playbook?limit=2000", {
      headers: cookieHeader(intern.cookie),
    });
    const body2 = (await res2.json()) as { recommended: any[] };
    const slugs2 = body2.recommended.map((r) => r.slug);
    expect(slugs2).toContain(`p-rec-blocked-${testId}`);
  });

  test("roster shows intern counts + awaiting queue; non-mentor blocked", async () => {
    const pi = await signup("ro_pi");
    const intern = await signup("ro_int");
    const stranger = await signup("ro_str");
    const cohortSlug = `co-ro-${testId}`;
    const cohortId = await createCohort(pi.cookie, cohortSlug);
    const internId = await userIdFromCookie(intern.cookie);
    seedMember(cohortId, internId, "member");

    const protoSlug = `p-ro-${testId}`;
    await createProtocol(pi.cookie, protoSlug);
    const start = await req("/lab/runs/start", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(intern.cookie) },
      body: JSON.stringify({ protocolSlug: protoSlug }),
    });
    const { runId } = (await start.json()) as { runId: string };
    await req(`/lab/runs/${runId}/steps/1`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...cookieHeader(intern.cookie) },
      body: JSON.stringify({ done: true }),
    });
    await req(`/lab/runs/${runId}/request-signoff`, {
      method: "POST",
      headers: cookieHeader(intern.cookie),
    });

    const roster = await req(`/lab-groups/${cohortSlug}/roster`, {
      headers: cookieHeader(pi.cookie),
    });
    expect(roster.status).toBe(200);
    const body = (await roster.json()) as {
      members: any[];
      awaitingSignoffQueue: any[];
    };
    expect(body.members.some((m) => m.userId === internId)).toBe(true);
    expect(body.awaitingSignoffQueue.some((q) => q.id === runId)).toBe(true);

    const blocked = await req(`/lab-groups/${cohortSlug}/roster`, {
      headers: cookieHeader(stranger.cookie),
    });
    expect(blocked.status).toBe(403);
  });

  test("skill MRI groups by discipline; cert-gated equipment is uncertified until passed", async () => {
    const pi = await signup("mri_pi");
    const intern = await signup("mri_int");
    await createCert(pi.cookie, `c-mri-${testId}`);
    // Author equipment that requires the cert.
    await req("/lab/equipment", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(pi.cookie) },
      body: JSON.stringify({
        slug: `eq-mri-${testId}`,
        title: `Eq ${testId}`,
        discipline: "biology",
        trainingCertSlug: `c-mri-${testId}`,
      }),
    });
    await createProtocol(pi.cookie, `p-mri-${testId}`);

    const before = await req("/me/lab/skill-mri", {
      headers: cookieHeader(intern.cookie),
    });
    const bb = (await before.json()) as { disciplines: any[] };
    const bio = bb.disciplines.find((d) => d.discipline === "biology");
    expect(bio).toBeDefined();
    const eq = bio.equipment.find((e: any) => e.slug === `eq-mri-${testId}`);
    expect(eq.certified).toBe(false);

    await passCert(intern.cookie, `c-mri-${testId}`);
    const after = await req("/me/lab/skill-mri", {
      headers: cookieHeader(intern.cookie),
    });
    const ab = (await after.json()) as { disciplines: any[] };
    const bio2 = ab.disciplines.find((d) => d.discipline === "biology");
    const eq2 = bio2.equipment.find((e: any) => e.slug === `eq-mri-${testId}`);
    expect(eq2.certified).toBe(true);
  });
});

// Helper used by the auth-required test. Looks up the cohort id by
// hitting the public cohort detail endpoint (which doesn't expose
// ids — so we resolve via roster as the creator).
async function getCohortId(cookie: string, slug: string): Promise<string> {
  const res = await req(`/lab-groups/${slug}/roster`, {
    headers: cookieHeader(cookie),
  });
  const body = (await res.json()) as { cohort: { id: string } };
  return body.cohort.id;
}

describe("lab assignments — slug validation (post-review fix)", () => {
  test("assign rejects unknown protocol slug with 400", async () => {
    const author = await signup("av_pi");
    const intern = await signup("av_int");
    const cohortSlug = `co-av-${testId}`;
    const cohortId = await createCohort(author.cookie, cohortSlug);
    const internId = await userIdFromCookie(intern.cookie);
    seedMember(cohortId, internId, "member");
    const res = await req(`/lab-groups/${cohortSlug}/assign`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(author.cookie) },
      body: JSON.stringify({
        assignedToUserIds: [internId],
        protocolSlug: `does-not-exist-${testId}`,
      }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("Unknown protocol");
  });

  test("assign rejects draft (non-published) protocol with 400", async () => {
    const author = await signup("avd_pi");
    const intern = await signup("avd_int");
    const cohortSlug = `co-avd-${testId}`;
    const cohortId = await createCohort(author.cookie, cohortSlug);
    const internId = await userIdFromCookie(intern.cookie);
    seedMember(cohortId, internId, "member");
    const draftSlug = `pa-avd-${testId}`;
    await createProtocol(author.cookie, draftSlug, { status: "draft" });
    const res = await req(`/lab-groups/${cohortSlug}/assign`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(author.cookie) },
      body: JSON.stringify({
        assignedToUserIds: [internId],
        protocolSlug: draftSlug,
      }),
    });
    expect(res.status).toBe(400);
  });

  test("assign rejects unknown cert slug with 400", async () => {
    const author = await signup("avc_pi");
    const intern = await signup("avc_int");
    const cohortSlug = `co-avc-${testId}`;
    const cohortId = await createCohort(author.cookie, cohortSlug);
    const internId = await userIdFromCookie(intern.cookie);
    seedMember(cohortId, internId, "member");
    const res = await req(`/lab-groups/${cohortSlug}/assign`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(author.cookie) },
      body: JSON.stringify({
        assignedToUserIds: [internId],
        certSlug: `phantom-cert-${testId}`,
      }),
    });
    expect(res.status).toBe(400);
  });
});
