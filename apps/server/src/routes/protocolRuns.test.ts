// Sprint 80 — Protocol-runs tests: cert gate, sign-off chain, RBAC.

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
  const username = `pr_${suffix}_${testId}`.slice(0, 30);
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

interface ProtocolOpts {
  status?: "draft" | "published";
  requiredCerts?: string[];
}

async function createProtocol(
  cookie: string,
  slug: string,
  opts: ProtocolOpts = {},
): Promise<Response> {
  return await req("/lab/protocols", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...cookieHeader(cookie) },
    body: JSON.stringify({
      slug,
      title: `Protocol ${slug}`,
      discipline: "biology",
      summary: "Test",
      contentUndergrad: "## Body",
      requiredCerts: opts.requiredCerts ?? [],
      steps: [
        { title: "Setup", instructionMd: "Do setup." },
        { title: "Run", instructionMd: "Run procedure." },
      ],
      status: opts.status ?? "published",
    }),
  });
}

async function createCohortViaApi(
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
    .values({
      id: randomUUID(),
      cohortId,
      userId,
      role,
    })
    .run();
}

async function createSafetyCert(
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
  const body = (await res.json()) as { passed: boolean };
  expect(body.passed).toBe(true);
}

describe("protocol runs — cert gate + sign-offs (Sprint 80)", () => {
  test("start requires auth", async () => {
    const res = await req("/lab/runs/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ protocolSlug: "anything" }),
    });
    expect(res.status).toBe(401);
  });

  test("start fails 404 for unknown protocol", async () => {
    const { cookie } = await signup("unknown");
    const res = await req("/lab/runs/start", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(cookie) },
      body: JSON.stringify({ protocolSlug: `pr-unknown-${testId}` }),
    });
    expect(res.status).toBe(404);
  });

  test("start fails 400 on draft protocol", async () => {
    const { cookie } = await signup("draftstart");
    const slug = `pr-draftstart-${testId}`;
    expect(
      (await createProtocol(cookie, slug, { status: "draft" })).status,
    ).toBe(201);
    const res = await req("/lab/runs/start", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(cookie) },
      body: JSON.stringify({ protocolSlug: slug }),
    });
    expect(res.status).toBe(400);
  });

  test("start succeeds when no certs required + pins to current version", async () => {
    const { cookie } = await signup("nocert");
    const slug = `pr-nocert-${testId}`;
    expect((await createProtocol(cookie, slug)).status).toBe(201);
    const res = await req("/lab/runs/start", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(cookie) },
      body: JSON.stringify({ protocolSlug: slug }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { runId: string; protocolVersion: number };
    expect(body.protocolVersion).toBe(1);
  });

  test("start returns 412 with missingCerts when intern lacks required cert", async () => {
    const author = await signup("gateauthor");
    const certSlug = `pr-cert-gate-${testId}`;
    await createSafetyCert(author.cookie, certSlug);

    const protoSlug = `pr-gate-${testId}`;
    expect(
      (await createProtocol(author.cookie, protoSlug, {
        requiredCerts: [certSlug],
      })).status,
    ).toBe(201);

    const intern = await signup("gateintern");
    const res = await req("/lab/runs/start", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...cookieHeader(intern.cookie),
      },
      body: JSON.stringify({ protocolSlug: protoSlug }),
    });
    expect(res.status).toBe(412);
    const body = (await res.json()) as { missingCerts: string[] };
    expect(body.missingCerts).toEqual([certSlug]);
  });

  test("start succeeds after intern passes the required cert", async () => {
    const author = await signup("passauthor");
    const certSlug = `pr-cert-pass-${testId}`;
    await createSafetyCert(author.cookie, certSlug);
    const protoSlug = `pr-passgate-${testId}`;
    await createProtocol(author.cookie, protoSlug, {
      requiredCerts: [certSlug],
    });

    const intern = await signup("passintern");
    await passCert(intern.cookie, certSlug);

    const res = await req("/lab/runs/start", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...cookieHeader(intern.cookie),
      },
      body: JSON.stringify({ protocolSlug: protoSlug }),
    });
    expect(res.status).toBe(201);
  });

  test("step update is owner-only (403 for stranger)", async () => {
    const intern = await signup("stepowner");
    const slug = `pr-stepauth-${testId}`;
    await createProtocol(intern.cookie, slug);
    const start = await req("/lab/runs/start", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...cookieHeader(intern.cookie),
      },
      body: JSON.stringify({ protocolSlug: slug }),
    });
    const { runId } = (await start.json()) as { runId: string };

    const stranger = await signup("stepstr");
    const res = await req(`/lab/runs/${runId}/steps/1`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        ...cookieHeader(stranger.cookie),
      },
      body: JSON.stringify({ done: true }),
    });
    expect(res.status).toBe(403);
  });

  test("full sign-off chain: intern marks step → request → mentor signs off", async () => {
    const author = await signup("chainauthor");
    const protoSlug = `pr-chain-${testId}`;
    await createProtocol(author.cookie, protoSlug);

    // Build a cohort. Author is organizer (auto). Mentor + intern join.
    const cohortSlug = `co-chain-${testId}`;
    const cohortId = await createCohortViaApi(author.cookie, cohortSlug);

    const mentor = await signup("chainmentor");
    const intern = await signup("chainintern");
    const mentorId = await userIdFromCookie(mentor.cookie);
    const internId = await userIdFromCookie(intern.cookie);
    seedMember(cohortId, mentorId, "mentor");
    seedMember(cohortId, internId, "member");

    // Intern starts the run.
    const start = await req("/lab/runs/start", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...cookieHeader(intern.cookie),
      },
      body: JSON.stringify({ protocolSlug: protoSlug }),
    });
    expect(start.status).toBe(201);
    const { runId } = (await start.json()) as { runId: string };

    // Cannot request sign-off with no steps done.
    const earlyReq = await req(`/lab/runs/${runId}/request-signoff`, {
      method: "POST",
      headers: cookieHeader(intern.cookie),
    });
    expect(earlyReq.status).toBe(400);

    // Mark step 1 done.
    const stepRes = await req(`/lab/runs/${runId}/steps/1`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        ...cookieHeader(intern.cookie),
      },
      body: JSON.stringify({
        done: true,
        observation: "Bands clear",
      }),
    });
    expect(stepRes.status).toBe(200);

    // Request sign-off.
    const reqRes = await req(`/lab/runs/${runId}/request-signoff`, {
      method: "POST",
      headers: cookieHeader(intern.cookie),
    });
    expect(reqRes.status).toBe(200);
    const reqBody = (await reqRes.json()) as { mentorsNotified: number };
    // Author + mentor are both eligible (both are mentor/organizer in
    // the cohort, intern excluded).
    expect(reqBody.mentorsNotified).toBeGreaterThanOrEqual(1);

    // Stranger cannot sign off.
    const stranger = await signup("chainstr");
    const stStr = await req(`/lab/runs/${runId}/sign-off`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...cookieHeader(stranger.cookie),
      },
      body: JSON.stringify({ notesMd: "Hi" }),
    });
    expect(stStr.status).toBe(403);

    // Mentor signs off.
    const so = await req(`/lab/runs/${runId}/sign-off`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...cookieHeader(mentor.cookie),
      },
      body: JSON.stringify({ notesMd: "Looks good." }),
    });
    expect(so.status).toBe(200);

    // Intern's run is now signed_off.
    const detail = await req(`/lab/runs/${runId}`, {
      headers: cookieHeader(intern.cookie),
    });
    const dBody = (await detail.json()) as { run: { status: string } };
    expect(dBody.run.status).toBe("signed_off");

    // A second sign-off attempt is rejected (status guard).
    const second = await req(`/lab/runs/${runId}/sign-off`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...cookieHeader(mentor.cookie),
      },
      body: JSON.stringify({ notesMd: "Again" }),
    });
    expect(second.status).toBe(400);
  });

  test("reject moves run back to in_progress", async () => {
    const author = await signup("rejauthor");
    const protoSlug = `pr-rej-${testId}`;
    await createProtocol(author.cookie, protoSlug);
    const cohortSlug = `co-rej-${testId}`;
    const cohortId = await createCohortViaApi(author.cookie, cohortSlug);

    const mentor = await signup("rejmentor");
    const intern = await signup("rejintern");
    seedMember(cohortId, await userIdFromCookie(mentor.cookie), "mentor");
    seedMember(cohortId, await userIdFromCookie(intern.cookie), "member");

    const start = await req("/lab/runs/start", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...cookieHeader(intern.cookie),
      },
      body: JSON.stringify({ protocolSlug: protoSlug }),
    });
    const { runId } = (await start.json()) as { runId: string };
    await req(`/lab/runs/${runId}/steps/1`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        ...cookieHeader(intern.cookie),
      },
      body: JSON.stringify({ done: true }),
    });
    await req(`/lab/runs/${runId}/request-signoff`, {
      method: "POST",
      headers: cookieHeader(intern.cookie),
    });

    const reject = await req(`/lab/runs/${runId}/reject`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...cookieHeader(mentor.cookie),
      },
      body: JSON.stringify({ notesMd: "Redo step 2." }),
    });
    expect(reject.status).toBe(200);

    const detail = await req(`/lab/runs/${runId}`, {
      headers: cookieHeader(intern.cookie),
    });
    const body = (await detail.json()) as {
      run: { status: string; signOffNotesMd: string | null };
    };
    expect(body.run.status).toBe("in_progress");
    expect(body.run.signOffNotesMd).toContain("Redo");
  });

  test("/me/lab/runs returns only own runs; status filter works", async () => {
    const a = await signup("mra");
    const b = await signup("mrb");
    const aSlug = `pr-mra-${testId}`;
    const bSlug = `pr-mrb-${testId}`;
    await createProtocol(a.cookie, aSlug);
    await createProtocol(b.cookie, bSlug);
    await req("/lab/runs/start", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(a.cookie) },
      body: JSON.stringify({ protocolSlug: aSlug }),
    });
    await req("/lab/runs/start", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(b.cookie) },
      body: JSON.stringify({ protocolSlug: bSlug }),
    });
    const aMine = await req("/me/lab/runs", { headers: cookieHeader(a.cookie) });
    const ab = (await aMine.json()) as { runs: any[] };
    expect(ab.runs.some((r) => r.protocolSlug === aSlug)).toBe(true);
    expect(ab.runs.some((r) => r.protocolSlug === bSlug)).toBe(false);

    const aActive = await req("/me/lab/runs?status=in_progress", {
      headers: cookieHeader(a.cookie),
    });
    const aab = (await aActive.json()) as { runs: any[] };
    expect(aab.runs.every((r) => r.status === "in_progress")).toBe(true);
  });

  test("awaiting-signoff lists only runs from cohorts where caller is mentor/organizer", async () => {
    const author = await signup("qauthor");
    const slug = `pr-q-${testId}`;
    await createProtocol(author.cookie, slug);
    const cohortId = await createCohortViaApi(
      author.cookie,
      `co-q-${testId}`,
    );

    const mentor = await signup("qmentor");
    const intern = await signup("qintern");
    seedMember(cohortId, await userIdFromCookie(mentor.cookie), "mentor");
    seedMember(cohortId, await userIdFromCookie(intern.cookie), "member");

    const start = await req("/lab/runs/start", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...cookieHeader(intern.cookie),
      },
      body: JSON.stringify({ protocolSlug: slug }),
    });
    const { runId } = (await start.json()) as { runId: string };
    await req(`/lab/runs/${runId}/steps/1`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        ...cookieHeader(intern.cookie),
      },
      body: JSON.stringify({ done: true }),
    });
    await req(`/lab/runs/${runId}/request-signoff`, {
      method: "POST",
      headers: cookieHeader(intern.cookie),
    });

    const queue = await req("/lab/runs/awaiting-signoff", {
      headers: cookieHeader(mentor.cookie),
    });
    const qb = (await queue.json()) as { runs: any[] };
    expect(qb.runs.some((r) => r.id === runId)).toBe(true);

    // A bystander not in the cohort sees an empty queue.
    const bystander = await signup("qbystander");
    const empty = await req("/lab/runs/awaiting-signoff", {
      headers: cookieHeader(bystander.cookie),
    });
    const eb = (await empty.json()) as { runs: any[] };
    expect(eb.runs.some((r) => r.id === runId)).toBe(false);
  });
});

// Regression coverage for the post-S80 review fixes.
describe("protocol runs — post-review fixes", () => {
  test("step list is read from the pinned snapshot, not live edits", async () => {
    const author = await signup("vp_author");
    const intern = await signup("vp_intern");
    const slug = `pr-vpin-${testId}`;
    // Author publishes v1 with two steps.
    expect((await createProtocol(author.cookie, slug)).status).toBe(201);
    // Intern starts a run pinned to v1.
    const start = await req("/lab/runs/start", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(intern.cookie) },
      body: JSON.stringify({ protocolSlug: slug }),
    });
    const { runId, protocolVersion } = (await start.json()) as {
      runId: string;
      protocolVersion: number;
    };
    expect(protocolVersion).toBe(1);

    // Author rewrites the step list (and republishes via PUT to bump
    // the version snapshot). The intern's run should keep showing
    // the v1 procedure.
    await req(`/lab/protocols/${slug}/steps`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...cookieHeader(author.cookie) },
      body: JSON.stringify({
        steps: [
          { title: "WHOLE NEW STEP", instructionMd: "Different procedure entirely." },
        ],
      }),
    });
    await req(`/lab/protocols/${slug}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...cookieHeader(author.cookie) },
      body: JSON.stringify({ summary: "Bumped" }),
    });

    const detail = await req(`/lab/runs/${runId}`, {
      headers: cookieHeader(intern.cookie),
    });
    const body = (await detail.json()) as { steps: any[] };
    // Pinned snapshot still shows the original two-step procedure.
    expect(body.steps.length).toBe(2);
    expect(body.steps.map((s) => s.title)).not.toContain("WHOLE NEW STEP");
  });

  test("re-requesting sign-off when already awaiting returns 400", async () => {
    const author = await signup("rsa_pi");
    const intern = await signup("rsa_int");
    const mentor = await signup("rsa_men");
    const cohortSlug = `co-rsa-${testId}`;
    const cohortId = await createCohortViaApi(author.cookie, cohortSlug);
    seedMember(cohortId, await userIdFromCookie(intern.cookie), "member");
    seedMember(cohortId, await userIdFromCookie(mentor.cookie), "mentor");
    const slug = `pr-rsa-${testId}`;
    await createProtocol(author.cookie, slug);
    const start = await req("/lab/runs/start", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(intern.cookie) },
      body: JSON.stringify({ protocolSlug: slug }),
    });
    const { runId } = (await start.json()) as { runId: string };
    await req(`/lab/runs/${runId}/steps/1`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...cookieHeader(intern.cookie) },
      body: JSON.stringify({ done: true }),
    });
    const first = await req(`/lab/runs/${runId}/request-signoff`, {
      method: "POST",
      headers: cookieHeader(intern.cookie),
    });
    expect(first.status).toBe(200);
    const second = await req(`/lab/runs/${runId}/request-signoff`, {
      method: "POST",
      headers: cookieHeader(intern.cookie),
    });
    expect(second.status).toBe(400);
  });

  test("second sign-off attempt (sequential, after first succeeded) is refused", async () => {
    // For sequential calls the early status guard catches it with 400
    // ("Run is not awaiting sign-off"). The conditional UPDATE in the
    // route is the defense-in-depth path for the truly-concurrent case
    // (both reads observe awaiting_signoff before either UPDATE
    // commits) — that path returns 409, but it's not exercisable in
    // single-threaded test code.
    const author = await signup("css_pi");
    const intern = await signup("css_int");
    const mentor1 = await signup("css_m1");
    const mentor2 = await signup("css_m2");
    const cohortSlug = `co-css-${testId}`;
    const cohortId = await createCohortViaApi(author.cookie, cohortSlug);
    seedMember(cohortId, await userIdFromCookie(intern.cookie), "member");
    seedMember(cohortId, await userIdFromCookie(mentor1.cookie), "mentor");
    seedMember(cohortId, await userIdFromCookie(mentor2.cookie), "mentor");
    const slug = `pr-css-${testId}`;
    await createProtocol(author.cookie, slug);
    const start = await req("/lab/runs/start", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(intern.cookie) },
      body: JSON.stringify({ protocolSlug: slug }),
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
    const first = await req(`/lab/runs/${runId}/sign-off`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(mentor1.cookie) },
      body: JSON.stringify({ notesMd: "lgtm" }),
    });
    const second = await req(`/lab/runs/${runId}/sign-off`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(mentor2.cookie) },
      body: JSON.stringify({ notesMd: "also lgtm" }),
    });
    expect(first.status).toBe(200);
    expect(second.status).toBe(400);
  });
});
