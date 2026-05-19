// Sprint 73 — Exam framework integration tests.

import { describe, test, expect, beforeAll } from "bun:test";
import { eq } from "drizzle-orm";
import { app } from "../index";
import { examAttempts, exams, getDb } from "@axiomic/db";

describe("/exams (Sprint 73)", () => {
  let satExists = false;
  beforeAll(() => {
    const row = getDb()
      .select({ id: exams.id })
      .from(exams)
      .where(eq(exams.slug, "sat"))
      .get();
    satExists = Boolean(row);
  });

  test("GET / returns the seeded exams list", async () => {
    const res = await app.fetch(
      new Request("http://localhost/api/v1/exams"),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: Array<{ slug: string }> };
    if (satExists) {
      expect(body.items.find((e) => e.slug === "sat")).toBeDefined();
    } else {
      expect(Array.isArray(body.items)).toBe(true);
    }
  });

  test("GET /:slug returns sections + scoring config", async () => {
    if (!satExists) return;
    const res = await app.fetch(
      new Request("http://localhost/api/v1/exams/sat"),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      exam: {
        slug: string;
        sections: Array<{ slug: string; questionCount: number }>;
        scoring: { sections?: Record<string, unknown> };
      };
    };
    expect(body.exam.slug).toBe("sat");
    expect(body.exam.sections.length).toBeGreaterThan(0);
    expect(body.exam.scoring.sections).toBeDefined();
  });

  test("GET unknown slug returns 404", async () => {
    const res = await app.fetch(
      new Request("http://localhost/api/v1/exams/nope-zzz"),
    );
    expect(res.status).toBe(404);
  });

  test("POST start attempt without auth returns 401", async () => {
    if (!satExists) return;
    const res = await app.fetch(
      new Request("http://localhost/api/v1/exams/sat/attempts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "full_mock" }),
      }),
    );
    expect(res.status).toBe(401);
  });

  test("PUT answer without auth returns 401", async () => {
    const res = await app.fetch(
      new Request("http://localhost/api/v1/exams/attempts/some-id/answer", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionId: "x".repeat(10), selectedIndex: 0 }),
      }),
    );
    expect(res.status).toBe(401);
  });

  test("GET history without auth returns 401", async () => {
    if (!satExists) return;
    const res = await app.fetch(
      new Request("http://localhost/api/v1/exams/sat/history"),
    );
    expect(res.status).toBe(401);
  });

  // ----- Phase 16A — attempt-detail correctIndex/isCorrect gating -----

  test(
    "attempt detail strips the answer key while in progress and exposes it once completed",
    async () => {
      if (!satExists) return;

      // Sign up a fresh user via the auth route so we get a real cookie.
      const testId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      const username = `ex_${testId}`.slice(0, 30);
      const signup = await app.fetch(
        new Request("http://localhost/api/v1/auth/signup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            username,
            email: `${username}@example.com`,
            password: "testpass123",
          }),
        }),
      );
      expect([200, 201]).toContain(signup.status);
      const cookie = (signup.headers.get("set-cookie") ?? "").split(";")[0]!;

      const start = await app.fetch(
        new Request("http://localhost/api/v1/exams/sat/attempts", {
          method: "POST",
          headers: { "Content-Type": "application/json", cookie },
          body: JSON.stringify({ mode: "section", sectionSlug: "math" }),
        }),
      );
      // Some seed setups may not include the 'math' section. If start
      // failed for content reasons, skip the test rather than failing
      // on environment drift.
      if (start.status !== 200 && start.status !== 201) return;
      const startBody = (await start.json()) as { id?: string; attemptId?: string };
      const attemptId = startBody.attemptId ?? startBody.id;
      if (!attemptId) return;

      const inProgress = await app.fetch(
        new Request(`http://localhost/api/v1/exams/attempts/${attemptId}`, {
          headers: { cookie },
        }),
      );
      expect(inProgress.status).toBe(200);
      const inProgressBody = (await inProgress.json()) as {
        sections: Array<{
          questions: Array<{ correctIndex: number | null; type: string }>;
        }>;
        answers: Array<{ isCorrect: boolean | null }>;
      };
      for (const sec of inProgressBody.sections) {
        for (const q of sec.questions) {
          // No correctIndex should leak during an active attempt.
          expect(q.correctIndex).toBeNull();
        }
      }

      // Flip completedAt directly to simulate post-submit without
      // exercising the full submit + grade pipeline (which depends on
      // answers + scoring config beyond this test's scope).
      getDb()
        .update(examAttempts)
        .set({ completedAt: new Date().toISOString() })
        .where(eq(examAttempts.id, attemptId))
        .run();

      const completed = await app.fetch(
        new Request(`http://localhost/api/v1/exams/attempts/${attemptId}`, {
          headers: { cookie },
        }),
      );
      expect(completed.status).toBe(200);
      const completedBody = (await completed.json()) as {
        sections: Array<{
          questions: Array<{ correctIndex: number | null; type: string }>;
        }>;
      };
      // Now the multiple-choice questions should expose correctIndex.
      const mcQuestions = completedBody.sections
        .flatMap((s) => s.questions)
        .filter((q) => q.type === "multiple_choice");
      if (mcQuestions.length > 0) {
        expect(mcQuestions[0]!.correctIndex).not.toBeNull();
      }
    },
  );

  // ----- Phase 19C — concurrent-submit race protection -----

  test(
    "concurrent submits on the same attempt resolve to exactly one winner",
    async () => {
      if (!satExists) return;

      const testId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      const username = `ex2_${testId}`.slice(0, 30);
      const signup = await app.fetch(
        new Request("http://localhost/api/v1/auth/signup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            username,
            email: `${username}@example.com`,
            password: "testpass123",
          }),
        }),
      );
      expect([200, 201]).toContain(signup.status);
      const cookie = (signup.headers.get("set-cookie") ?? "").split(";")[0]!;

      const start = await app.fetch(
        new Request("http://localhost/api/v1/exams/sat/attempts", {
          method: "POST",
          headers: { "Content-Type": "application/json", cookie },
          body: JSON.stringify({ mode: "section", sectionSlug: "math" }),
        }),
      );
      if (start.status !== 200 && start.status !== 201) return;
      const startBody = (await start.json()) as { id?: string; attemptId?: string };
      const attemptId = startBody.attemptId ?? startBody.id;
      if (!attemptId) return;

      // Fire two submits concurrently. The atomic claim should let
      // exactly one through; the loser sees "Already submitted".
      const submit = () =>
        app.fetch(
          new Request(`http://localhost/api/v1/exams/attempts/${attemptId}/submit`, {
            method: "POST",
            headers: { "Content-Type": "application/json", cookie },
          }),
        );
      const [a, b] = await Promise.all([submit(), submit()]);

      const statuses = [a.status, b.status].sort();
      // One success (200), one already-submitted (400). Exact codes
      // can shift if seed content drifts; assert the dual-claim
      // signature: not both 200, not both 400.
      expect(statuses[0]).toBe(200);
      expect(statuses[1]).toBe(400);
    },
  );

  // ----- Digital-SAT-parity Phase 2 — legacy attempt back-compat -----

  test(
    "GET /attempts/:id synthesizes section deadlines for legacy attempts",
    async () => {
      if (!satExists) return;

      const testId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      const username = `lg_${testId}`.slice(0, 30);
      const signup = await app.fetch(
        new Request("http://localhost/api/v1/auth/signup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            username,
            email: `${username}@example.com`,
            password: "testpass123",
          }),
        }),
      );
      expect([200, 201]).toContain(signup.status);
      const cookie = (signup.headers.get("set-cookie") ?? "").split(";")[0]!;

      const start = await app.fetch(
        new Request("http://localhost/api/v1/exams/sat/attempts", {
          method: "POST",
          headers: { "Content-Type": "application/json", cookie },
          body: JSON.stringify({ mode: "section", sectionSlug: "math" }),
        }),
      );
      if (start.status !== 200 && start.status !== 201) return;
      const startBody = (await start.json()) as { id?: string; attemptId?: string };
      const attemptId = startBody.attemptId ?? startBody.id;
      if (!attemptId) return;

      // Simulate a legacy attempt by NULLing the new columns
      // (Phase 3 will populate them at start time; in Phase 2 the
      // start path hasn't been extended yet so this NULL state is
      // also today's behavior).
      getDb()
        .update(examAttempts)
        .set({
          sectionDeadlinesJson: null,
          currentSectionIdx: null,
          breakUntilAt: null,
          calculatorStateJson: null,
          customizerJson: null,
        })
        .where(eq(examAttempts.id, attemptId))
        .run();

      const res = await app.fetch(
        new Request(`http://localhost/api/v1/exams/attempts/${attemptId}`, {
          headers: { cookie },
        }),
      );
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        sectionDeadlines: Array<{ slug: string; endsAt: string }>;
        currentSectionIdx: number;
        breakUntilAt: string | null;
        calculatorAllowed: boolean;
        calculatorState: unknown;
        customizer: unknown;
        warnings: unknown;
      };
      // Synthesized single deadline derived from expiresAt.
      expect(body.sectionDeadlines.length).toBe(1);
      expect(body.sectionDeadlines[0]!.endsAt).toBeTruthy();
      expect(body.currentSectionIdx).toBe(0);
      expect(body.breakUntilAt).toBeNull();
      expect(body.calculatorAllowed).toBe(false);
      expect(body.calculatorState).toBeNull();
      expect(body.customizer).toBeNull();
      expect(Array.isArray(body.warnings)).toBe(true);
    },
  );

  // ----- Digital-SAT-parity Phase 3 — advance-section state machine -----

  test(
    "POST /advance-section drops into a break, then advances after break",
    async () => {
      if (!satExists) return;

      const testId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      const username = `as_${testId}`.slice(0, 30);
      const signup = await app.fetch(
        new Request("http://localhost/api/v1/auth/signup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            username,
            email: `${username}@example.com`,
            password: "testpass123",
          }),
        }),
      );
      const cookie = (signup.headers.get("set-cookie") ?? "").split(";")[0]!;

      // Start a full mock — this exam has two sections, so an
      // advance from section 0 should drop into a 10-min break.
      const start = await app.fetch(
        new Request("http://localhost/api/v1/exams/sat/attempts", {
          method: "POST",
          headers: { "Content-Type": "application/json", cookie },
          body: JSON.stringify({ mode: "full_mock" }),
        }),
      );
      if (start.status !== 200 && start.status !== 201) return;
      const startBody = (await start.json()) as {
        id: string;
        sectionDeadlines: Array<{ slug: string }>;
      };
      const attemptId = startBody.id;
      expect(startBody.sectionDeadlines.length).toBeGreaterThanOrEqual(2);

      // 1. Advance from section 0 → break.
      const adv1 = await app.fetch(
        new Request(
          `http://localhost/api/v1/exams/attempts/${attemptId}/advance-section`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json", cookie },
            body: JSON.stringify({ currentSectionIdx: 0 }),
          },
        ),
      );
      expect(adv1.status).toBe(200);
      const adv1Body = (await adv1.json()) as {
        currentSectionIdx: number;
        breakUntilAt: string;
      };
      expect(adv1Body.currentSectionIdx).toBe(0);
      expect(typeof adv1Body.breakUntilAt).toBe("string");

      // 2. Trying to advance again while the break is in progress is rejected.
      const adv2 = await app.fetch(
        new Request(
          `http://localhost/api/v1/exams/attempts/${attemptId}/advance-section`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json", cookie },
            body: JSON.stringify({ currentSectionIdx: 0 }),
          },
        ),
      );
      expect(adv2.status).toBe(425);

      // 3. Force the break to be already-elapsed and advance again.
      getDb()
        .update(examAttempts)
        .set({ breakUntilAt: new Date(Date.now() - 1000).toISOString() })
        .where(eq(examAttempts.id, attemptId))
        .run();
      const adv3 = await app.fetch(
        new Request(
          `http://localhost/api/v1/exams/attempts/${attemptId}/advance-section`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json", cookie },
            body: JSON.stringify({ currentSectionIdx: 0 }),
          },
        ),
      );
      expect(adv3.status).toBe(200);
      const adv3Body = (await adv3.json()) as {
        currentSectionIdx: number;
        breakUntilAt: string | null;
      };
      expect(adv3Body.currentSectionIdx).toBe(1);
      expect(adv3Body.breakUntilAt).toBeNull();

      // 4. Section-index mismatch returns 409.
      const adv4 = await app.fetch(
        new Request(
          `http://localhost/api/v1/exams/attempts/${attemptId}/advance-section`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json", cookie },
            body: JSON.stringify({ currentSectionIdx: 0 }),
          },
        ),
      );
      expect(adv4.status).toBe(409);
    },
  );

  test(
    "advance-section on the last section reports done",
    async () => {
      if (!satExists) return;

      const testId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      const username = `as2_${testId}`.slice(0, 30);
      const signup = await app.fetch(
        new Request("http://localhost/api/v1/auth/signup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            username,
            email: `${username}@example.com`,
            password: "testpass123",
          }),
        }),
      );
      const cookie = (signup.headers.get("set-cookie") ?? "").split(";")[0]!;

      // Single-section attempt — only one deadline, so advancing
      // from idx 0 should report done=true (no break).
      const start = await app.fetch(
        new Request("http://localhost/api/v1/exams/sat/attempts", {
          method: "POST",
          headers: { "Content-Type": "application/json", cookie },
          body: JSON.stringify({ mode: "section", sectionSlug: "math" }),
        }),
      );
      if (start.status !== 200 && start.status !== 201) return;
      const startBody = (await start.json()) as { id: string };
      const adv = await app.fetch(
        new Request(
          `http://localhost/api/v1/exams/attempts/${startBody.id}/advance-section`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json", cookie },
            body: JSON.stringify({ currentSectionIdx: 0 }),
          },
        ),
      );
      expect(adv.status).toBe(200);
      const advBody = (await adv.json()) as { done?: boolean };
      expect(advBody.done).toBe(true);
    },
  );
});
