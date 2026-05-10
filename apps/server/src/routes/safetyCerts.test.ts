// Sprint 80 — Safety certifications tests.

import { describe, test, expect } from "bun:test";
import { app } from "../index";

async function req(path: string, opts?: RequestInit): Promise<Response> {
  return await app.fetch(new Request(`http://localhost/api/v1${path}`, opts));
}

function cookieHeader(cookie: string): Record<string, string> {
  return { cookie: cookie.split(";")[0] };
}

const testId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

async function signup(suffix: string): Promise<{ cookie: string; username: string }> {
  const username = `sc_${suffix}_${testId}`.slice(0, 30);
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

interface CertOpts {
  validityDays?: number | null;
  passingScore?: number;
  questions?: Array<{
    id: string;
    kind?: string;
    question: string;
    options: string[];
    correctIndex: number;
  }>;
}

const DEFAULT_QUESTIONS = [
  {
    id: "q1",
    kind: "multiple_choice",
    question: "Which is BSL-2?",
    options: ["Bunsen", "BSC II", "Coffee maker"],
    correctIndex: 1,
  },
  {
    id: "q2",
    kind: "multiple_choice",
    question: "Where do sharps go?",
    options: ["Bin", "Sharps container", "Pocket"],
    correctIndex: 1,
  },
];

async function createCert(
  cookie: string,
  slug: string,
  opts: CertOpts = {},
): Promise<Response> {
  return await req("/lab/safety-certs", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...cookieHeader(cookie) },
    body: JSON.stringify({
      slug,
      title: `Cert ${slug}`,
      discipline: "biology",
      description: "Test cert",
      quizData: opts.questions ?? DEFAULT_QUESTIONS,
      passingScore: opts.passingScore ?? 0.7,
      validityDays:
        opts.validityDays === undefined ? 730 : opts.validityDays,
    }),
  });
}

describe("safety certifications — CRUD + grading + grants (Sprint 80)", () => {
  test("requires auth to create", async () => {
    const res = await req("/lab/safety-certs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        slug: `sc-anon-${testId}`,
        title: "Anon",
        discipline: "biology",
        quizData: DEFAULT_QUESTIONS,
      }),
    });
    expect(res.status).toBe(401);
  });

  test("create + catalog + slug collision", async () => {
    const { cookie } = await signup("crud");
    const slug = `sc-crud-${testId}`;
    expect((await createCert(cookie, slug)).status).toBe(201);

    const list = await req("/lab/safety-certs");
    const lb = (await list.json()) as { certs: any[] };
    expect(lb.certs.some((c) => c.slug === slug)).toBe(true);

    expect((await createCert(cookie, slug)).status).toBe(409);
  });

  test("get strips correct-answer fields", async () => {
    const { cookie } = await signup("strip");
    const slug = `sc-strip-${testId}`;
    await createCert(cookie, slug);
    const res = await req(`/lab/safety-certs/${slug}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { questions: any[] };
    expect(body.questions.length).toBe(2);
    for (const q of body.questions) {
      expect(q.correctIndex).toBeUndefined();
      expect(q.options).toBeDefined();
      expect(q.id).toBeDefined();
    }
  });

  test("attempt with wrong answers does not pass and grants no row", async () => {
    const { cookie } = await signup("wrong");
    const slug = `sc-wrong-${testId}`;
    await createCert(cookie, slug);
    const res = await req(`/lab/safety-certs/${slug}/attempt`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(cookie) },
      body: JSON.stringify({ answers: { q1: "0", q2: "0" } }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { passed: boolean; score: number };
    expect(body.passed).toBe(false);
    expect(body.score).toBe(0);

    const mine = await req("/me/safety-certs", {
      headers: cookieHeader(cookie),
    });
    const mb = (await mine.json()) as { certs: any[] };
    expect(mb.certs.some((c) => c.certSlug === slug)).toBe(false);
  });

  test("passing attempt grants a row with expiresAt = passedAt + validityDays", async () => {
    const { cookie } = await signup("pass");
    const slug = `sc-pass-${testId}`;
    await createCert(cookie, slug, { validityDays: 730 });

    const res = await req(`/lab/safety-certs/${slug}/attempt`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(cookie) },
      body: JSON.stringify({ answers: { q1: "1", q2: "1" } }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      passed: boolean;
      score: number;
      expiresAt: string | null;
      passedAt: string;
    };
    expect(body.passed).toBe(true);
    expect(body.score).toBe(1);
    expect(body.expiresAt).not.toBeNull();
    const passedAt = Date.parse(body.passedAt);
    const expiresAt = Date.parse(body.expiresAt!);
    const diffDays = Math.round((expiresAt - passedAt) / 86400_000);
    expect(diffDays).toBeGreaterThanOrEqual(729);
    expect(diffDays).toBeLessThanOrEqual(731);

    const mine = await req("/me/safety-certs", {
      headers: cookieHeader(cookie),
    });
    const mb = (await mine.json()) as { certs: any[] };
    expect(mb.certs.some((c) => c.certSlug === slug)).toBe(true);
  });

  test("non-expiring cert grants null expiresAt", async () => {
    const { cookie } = await signup("never");
    const slug = `sc-never-${testId}`;
    await createCert(cookie, slug, { validityDays: null });
    const res = await req(`/lab/safety-certs/${slug}/attempt`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(cookie) },
      body: JSON.stringify({ answers: { q1: "1", q2: "1" } }),
    });
    const body = (await res.json()) as { expiresAt: string | null };
    expect(body.expiresAt).toBeNull();
  });

  test("attempt requires auth", async () => {
    const { cookie } = await signup("auth_owner");
    const slug = `sc-anonatt-${testId}`;
    await createCert(cookie, slug);
    const res = await req(`/lab/safety-certs/${slug}/attempt`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answers: { q1: "1", q2: "1" } }),
    });
    expect(res.status).toBe(401);
  });

  test("404 on unknown slug", async () => {
    const res = await req(`/lab/safety-certs/does-not-exist-${testId}`);
    expect(res.status).toBe(404);
  });

  test("repeated passing attempts are idempotent (no duplicate grants)", async () => {
    const { cookie } = await signup("idemp");
    const slug = `sc-idemp-${testId}`;
    await createCert(cookie, slug);
    const first = await req(`/lab/safety-certs/${slug}/attempt`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(cookie) },
      body: JSON.stringify({ answers: { q1: "1", q2: "1" } }),
    });
    const fb = (await first.json()) as { passed: boolean; passedAt: string };
    expect(fb.passed).toBe(true);

    const second = await req(`/lab/safety-certs/${slug}/attempt`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(cookie) },
      body: JSON.stringify({ answers: { q1: "1", q2: "1" } }),
    });
    const sb = (await second.json()) as {
      passed: boolean;
      passedAt: string;
      alreadyHeld?: boolean;
    };
    expect(sb.passed).toBe(true);
    // Second call returns the original grant unchanged.
    expect(sb.alreadyHeld).toBe(true);
    expect(sb.passedAt).toBe(fb.passedAt);

    // Verify only one grant row exists for this user+cert.
    const mine = await req("/me/safety-certs", {
      headers: cookieHeader(cookie),
    });
    const mb = (await mine.json()) as { certs: any[] };
    const matches = mb.certs.filter((c) => c.certSlug === slug);
    expect(matches.length).toBe(1);
  });
});
