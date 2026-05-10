import { describe, test, expect, beforeAll } from "bun:test";
import { app } from "../index";

async function req(path: string, opts?: RequestInit): Promise<Response> {
  return await app.fetch(new Request(`http://localhost/api/v1${path}`, opts));
}

function cookieHeader(cookie: string): Record<string, string> {
  return { cookie: cookie.split(";")[0] };
}

const testRun = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

async function signup(suffix: string): Promise<{ cookie: string; userId: string; username: string }> {
  const username = `cls_${suffix}_${testRun}`.slice(0, 30);
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
  const cookie = res.headers.get("set-cookie") || "";
  return { cookie, userId: data.user.id, username };
}

async function createClass(cookie: string, slug: string): Promise<{ classId: string; joinCode: string }> {
  const res = await req("/classes", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...cookieHeader(cookie) },
    body: JSON.stringify({
      slug,
      title: "Intro to Test Class",
      term: "Fall 2026",
      description: "Smoke-test class for the engagement gamification stack.",
    }),
  });
  expect(res.status).toBe(201);
  return (await res.json()) as { classId: string; joinCode: string };
}

describe("classes (S86)", () => {
  test("create class -> student enrolls via join code -> roster includes them", async () => {
    const instructor = await signup("inst1");
    const student = await signup("stud1");
    const slug = `cls-enroll-${testRun}`;

    const created = await createClass(instructor.cookie, slug);

    // Wrong code rejected.
    const bad = await req(`/classes/${slug}/enroll`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(student.cookie) },
      body: JSON.stringify({ joinCode: "WRONG123" }),
    });
    expect(bad.status).toBe(404);

    // Correct code accepted.
    const ok = await req(`/classes/${slug}/enroll`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(student.cookie) },
      body: JSON.stringify({ joinCode: created.joinCode }),
    });
    expect(ok.status).toBe(201);

    // Re-enroll is idempotent.
    const again = await req(`/classes/${slug}/enroll`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(student.cookie) },
      body: JSON.stringify({ joinCode: created.joinCode }),
    });
    expect(again.status).toBe(200);

    // Instructor sees student in roster.
    const detail = await req(`/classes/${slug}`, { headers: cookieHeader(instructor.cookie) });
    const detailData = (await detail.json()) as { roster: Array<{ userId: string }>; class: { joinCode: string | null } };
    expect(detailData.roster.some((m) => m.userId === student.userId)).toBe(true);
    // Instructor sees join code.
    expect(detailData.class.joinCode).toBe(created.joinCode);

    // Student sees the class but join code is hidden.
    const studentView = await req(`/classes/${slug}`, { headers: cookieHeader(student.cookie) });
    const studentData = (await studentView.json()) as { class: { joinCode: string | null } };
    expect(studentData.class.joinCode).toBeNull();

    // Anonymous gets 401 (requires auth).
    const anon = await req(`/classes/${slug}`);
    expect(anon.status).toBe(401);
  });

  test("non-enrolled user gets 404 on detail (no class-existence leak)", async () => {
    const instructor = await signup("inst2");
    const stranger = await signup("stranger2");
    const slug = `cls-leak-${testRun}`;
    await createClass(instructor.cookie, slug);
    const res = await req(`/classes/${slug}`, { headers: cookieHeader(stranger.cookie) });
    expect(res.status).toBe(404);
  });

  test("reading task: instructor creates -> student marks done -> XP -> leaderboard", async () => {
    const instructor = await signup("inst3");
    const student = await signup("stud3");
    const slug = `cls-read-${testRun}`;
    const created = await createClass(instructor.cookie, slug);
    await req(`/classes/${slug}/enroll`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(student.cookie) },
      body: JSON.stringify({ joinCode: created.joinCode }),
    });

    const taskRes = await req(`/classes/${slug}/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(instructor.cookie) },
      body: JSON.stringify({
        kind: "reading",
        title: "Read chapter 1",
        url: "https://example.com/chapter-1",
      }),
    });
    expect(taskRes.status).toBe(201);
    const { taskId } = (await taskRes.json()) as { taskId: string };

    const completeRes = await req(`/classes/${slug}/tasks/${taskId}/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(student.cookie) },
      body: JSON.stringify({}),
    });
    expect(completeRes.status).toBe(200);
    const completeData = (await completeRes.json()) as { xpGranted: number };
    expect(completeData.xpGranted).toBeGreaterThan(0);

    // Re-marking done is a no-op for XP.
    const again = await req(`/classes/${slug}/tasks/${taskId}/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(student.cookie) },
      body: JSON.stringify({}),
    });
    expect(((await again.json()) as { xpGranted: number }).xpGranted).toBe(0);

    // Leaderboard reflects student XP.
    const lb = await req(`/classes/${slug}/leaderboard`, { headers: cookieHeader(instructor.cookie) });
    const lbData = (await lb.json()) as { entries: Array<{ userId: string; xp: number }> };
    const studentEntry = lbData.entries.find((e) => e.userId === student.userId);
    expect(studentEntry?.xp).toBeGreaterThan(0);
  });

  test("homework: submit -> instructor grades pass -> bonus XP", async () => {
    const instructor = await signup("inst4");
    const student = await signup("stud4");
    const slug = `cls-hw-${testRun}`;
    const created = await createClass(instructor.cookie, slug);
    await req(`/classes/${slug}/enroll`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(student.cookie) },
      body: JSON.stringify({ joinCode: created.joinCode }),
    });

    const taskRes = await req(`/classes/${slug}/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(instructor.cookie) },
      body: JSON.stringify({ kind: "homework", title: "Problem set 1" }),
    });
    const { taskId } = (await taskRes.json()) as { taskId: string };

    // Empty content rejected.
    const empty = await req(`/classes/${slug}/tasks/${taskId}/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(student.cookie) },
      body: JSON.stringify({ content: "" }),
    });
    expect(empty.status).toBe(400);

    // Submit with a writeup.
    const submit = await req(`/classes/${slug}/tasks/${taskId}/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(student.cookie) },
      body: JSON.stringify({ content: "Here is my work for problem set 1, with full derivations." }),
    });
    expect(submit.status).toBe(200);
    const submitData = (await submit.json()) as { xpGranted: number };
    expect(submitData.xpGranted).toBeGreaterThan(0);

    // Instructor grades pass.
    const grade = await req(`/classes/${slug}/tasks/${taskId}/grade/${student.userId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(instructor.cookie) },
      body: JSON.stringify({ pass: true, feedback: "Nice work" }),
    });
    expect(grade.status).toBe(200);
    const gradeData = (await grade.json()) as { xpGranted: number };
    expect(gradeData.xpGranted).toBeGreaterThan(0); // bonus

    // Re-grading with pass=true again is idempotent (no double-bonus).
    const reGrade = await req(`/classes/${slug}/tasks/${taskId}/grade/${student.userId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(instructor.cookie) },
      body: JSON.stringify({ pass: true, feedback: "Still good" }),
    });
    expect(((await reGrade.json()) as { xpGranted: number }).xpGranted).toBe(0);
  });

  test("attendance: present grants XP, absent doesn't, idempotent", async () => {
    const instructor = await signup("inst5");
    const student = await signup("stud5");
    const slug = `cls-att-${testRun}`;
    const created = await createClass(instructor.cookie, slug);
    await req(`/classes/${slug}/enroll`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(student.cookie) },
      body: JSON.stringify({ joinCode: created.joinCode }),
    });

    const recordPresent = await req(`/classes/${slug}/attendance`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(instructor.cookie) },
      body: JSON.stringify({
        sessionDate: "2026-09-01",
        entries: [{ userId: student.userId, status: "present" }],
      }),
    });
    expect(recordPresent.status).toBe(200);
    const r1 = (await recordPresent.json()) as { xpGrants: Array<{ userId: string }> };
    expect(r1.xpGrants.length).toBe(1);

    // Re-record same date: no double-XP.
    const recordAgain = await req(`/classes/${slug}/attendance`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(instructor.cookie) },
      body: JSON.stringify({
        sessionDate: "2026-09-01",
        entries: [{ userId: student.userId, status: "present" }],
      }),
    });
    expect(((await recordAgain.json()) as { xpGrants: unknown[] }).xpGrants.length).toBe(0);

    // Absent grants no XP.
    const absent = await req(`/classes/${slug}/attendance`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(instructor.cookie) },
      body: JSON.stringify({
        sessionDate: "2026-09-08",
        entries: [{ userId: student.userId, status: "absent" }],
      }),
    });
    expect(((await absent.json()) as { xpGrants: unknown[] }).xpGrants.length).toBe(0);

    // Student cannot record attendance.
    const studentTry = await req(`/classes/${slug}/attendance`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(student.cookie) },
      body: JSON.stringify({
        sessionDate: "2026-09-15",
        entries: [{ userId: student.userId, status: "present" }],
      }),
    });
    expect(studentTry.status).toBe(403);
  });

  test("cosmetic grant flow: instructor grants -> student equips -> one-per-slot enforced", async () => {
    const instructor = await signup("inst6");
    const student = await signup("stud6");
    const slug = `cls-cos-${testRun}`;
    const created = await createClass(instructor.cookie, slug);
    await req(`/classes/${slug}/enroll`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(student.cookie) },
      body: JSON.stringify({ joinCode: created.joinCode }),
    });

    // Earn XP so the student has a pet to dress up.
    const t = await req(`/classes/${slug}/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(instructor.cookie) },
      body: JSON.stringify({ kind: "homework", title: "PSet 1" }),
    });
    const { taskId } = (await t.json()) as { taskId: string };
    await req(`/classes/${slug}/tasks/${taskId}/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(student.cookie) },
      body: JSON.stringify({ content: "Submission with sufficient content for the validator to accept." }),
    });
    await req(`/classes/${slug}/tasks/${taskId}/grade/${student.userId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(instructor.cookie) },
      body: JSON.stringify({ pass: true }),
    });

    // Instructor grants a top hat (head slot).
    const grant1 = await req(`/classes/${slug}/grant-cosmetic`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(instructor.cookie) },
      body: JSON.stringify({
        userId: student.userId,
        cosmeticSlug: "top-hat",
        note: "Great work this week",
      }),
    });
    expect(grant1.status).toBe(201);

    // Student sees it in their inventory.
    const inv1 = await req("/me/pet", { headers: cookieHeader(student.cookie) });
    const inv1Data = (await inv1.json()) as {
      pet: { species: string } | null;
      inventory: Array<{ slug: string; equipped: boolean }>;
    };
    expect(inv1Data.pet).not.toBeNull();
    expect(inv1Data.inventory.some((c) => c.slug === "top-hat")).toBe(true);

    // Equip the top hat.
    const equipHat = await req("/me/pet/equip", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(student.cookie) },
      body: JSON.stringify({ cosmeticSlug: "top-hat" }),
    });
    expect(equipHat.status).toBe(200);

    // Grant a grad cap (also head slot).
    await req(`/classes/${slug}/grant-cosmetic`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(instructor.cookie) },
      body: JSON.stringify({ userId: student.userId, cosmeticSlug: "grad-cap" }),
    });
    // Equip the grad cap.
    await req("/me/pet/equip", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(student.cookie) },
      body: JSON.stringify({ cosmeticSlug: "grad-cap" }),
    });

    // One-per-slot: top hat auto-unequipped.
    const inv2 = await req("/me/pet", { headers: cookieHeader(student.cookie) });
    const inv2Data = (await inv2.json()) as {
      inventory: Array<{ slug: string; equipped: boolean; slot: string }>;
    };
    const headEquipped = inv2Data.inventory.filter((c) => c.slot === "head" && c.equipped);
    expect(headEquipped.length).toBe(1);
    expect(headEquipped[0].slug).toBe("grad-cap");
  });

  test("non-instructor cannot grant cosmetics or edit class", async () => {
    const instructor = await signup("inst7");
    const student = await signup("stud7");
    const slug = `cls-acl-${testRun}`;
    const created = await createClass(instructor.cookie, slug);
    await req(`/classes/${slug}/enroll`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(student.cookie) },
      body: JSON.stringify({ joinCode: created.joinCode }),
    });

    // Student cannot grant cosmetics.
    const grantTry = await req(`/classes/${slug}/grant-cosmetic`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(student.cookie) },
      body: JSON.stringify({ userId: student.userId, cosmeticSlug: "top-hat" }),
    });
    expect(grantTry.status).toBe(403);

    // Student cannot edit the class.
    const editTry = await req(`/classes/${slug}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...cookieHeader(student.cookie) },
      body: JSON.stringify({ title: "Hijacked" }),
    });
    expect(editTry.status).toBe(403);
  });

  test("rotate join code invalidates the old one", async () => {
    const instructor = await signup("inst8");
    const slug = `cls-rotate-${testRun}`;
    const created = await createClass(instructor.cookie, slug);

    const rotate = await req(`/classes/${slug}/rotate-code`, {
      method: "POST",
      headers: cookieHeader(instructor.cookie),
    });
    expect(rotate.status).toBe(200);
    const { joinCode: newCode } = (await rotate.json()) as { joinCode: string };
    expect(newCode).not.toBe(created.joinCode);

    // Old code no longer enrolls.
    const tryOld = await signup("stud8");
    const failed = await req(`/classes/${slug}/enroll`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(tryOld.cookie) },
      body: JSON.stringify({ joinCode: created.joinCode }),
    });
    expect(failed.status).toBe(404);

    // New code works.
    const works = await req(`/classes/${slug}/enroll`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(tryOld.cookie) },
      body: JSON.stringify({ joinCode: newCode }),
    });
    expect(works.status).toBe(201);
  });

  test("instructor cannot enroll in their own class; non-member cannot complete tasks", async () => {
    const instructor = await signup("inst9");
    const stranger = await signup("stranger9");
    const slug = `cls-misuse-${testRun}`;
    const created = await createClass(instructor.cookie, slug);

    // Instructor self-enroll blocked.
    const selfEnroll = await req(`/classes/${slug}/enroll`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(instructor.cookie) },
      body: JSON.stringify({ joinCode: created.joinCode }),
    });
    expect(selfEnroll.status).toBe(400);

    // Create a task as instructor.
    const taskRes = await req(`/classes/${slug}/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(instructor.cookie) },
      body: JSON.stringify({ kind: "reading", title: "X", url: "https://example.com" }),
    });
    const { taskId } = (await taskRes.json()) as { taskId: string };

    // Stranger (non-enrolled) cannot complete.
    const try1 = await req(`/classes/${slug}/tasks/${taskId}/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(stranger.cookie) },
      body: JSON.stringify({}),
    });
    // Reveal-as-not-found per the auth helper.
    expect(try1.status).toBe(404);
  });

  test("leaderboard ordering: descending by XP", async () => {
    const instructor = await signup("inst10");
    const studentA = await signup("studA10");
    const studentB = await signup("studB10");
    const slug = `cls-lb-${testRun}`;
    const created = await createClass(instructor.cookie, slug);
    for (const s of [studentA, studentB]) {
      await req(`/classes/${slug}/enroll`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...cookieHeader(s.cookie) },
        body: JSON.stringify({ joinCode: created.joinCode }),
      });
    }

    // Create two readings; both students complete one, only B completes both.
    const t1 = await req(`/classes/${slug}/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(instructor.cookie) },
      body: JSON.stringify({ kind: "reading", title: "R1", url: "https://example.com/1" }),
    });
    const t2 = await req(`/classes/${slug}/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(instructor.cookie) },
      body: JSON.stringify({ kind: "reading", title: "R2", url: "https://example.com/2" }),
    });
    const r1 = (await t1.json()) as { taskId: string };
    const r2 = (await t2.json()) as { taskId: string };

    await req(`/classes/${slug}/tasks/${r1.taskId}/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(studentA.cookie) },
      body: JSON.stringify({}),
    });
    await req(`/classes/${slug}/tasks/${r1.taskId}/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(studentB.cookie) },
      body: JSON.stringify({}),
    });
    await req(`/classes/${slug}/tasks/${r2.taskId}/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(studentB.cookie) },
      body: JSON.stringify({}),
    });

    const lb = await req(`/classes/${slug}/leaderboard`, {
      headers: cookieHeader(instructor.cookie),
    });
    const lbData = (await lb.json()) as { entries: Array<{ userId: string; xp: number }> };
    const aIdx = lbData.entries.findIndex((e) => e.userId === studentA.userId);
    const bIdx = lbData.entries.findIndex((e) => e.userId === studentB.userId);
    expect(bIdx).toBeLessThan(aIdx); // B has more XP, ranks higher
    expect(lbData.entries[bIdx].xp).toBeGreaterThan(lbData.entries[aIdx].xp);
  });
});

describe("class competitions (S87)", () => {
  test("create competition -> publish -> end -> top-N students get prize cosmetic", async () => {
    const instructor = await signup("compinst1");
    const studentA = await signup("compA1");
    const studentB = await signup("compB1");
    const studentC = await signup("compC1"); // 4th place; should NOT get prize
    const slug = `cls-comp-prize-${testRun}`;
    const created = await createClass(instructor.cookie, slug);
    for (const s of [studentA, studentB, studentC]) {
      await req(`/classes/${slug}/enroll`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...cookieHeader(s.cookie) },
        body: JSON.stringify({ joinCode: created.joinCode }),
      });
    }

    // Create a competition with prizeWinnerCount=2 (only top 2 win).
    const past = new Date(Date.now() - 60_000).toISOString();
    const future = new Date(Date.now() + 60_000).toISOString();
    const create = await req(`/classes/${slug}/competitions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(instructor.cookie) },
      body: JSON.stringify({
        title: "Spring Sprint",
        startsAt: past,
        endsAt: future,
        prizeCosmeticSlug: "trophy",
        prizeWinnerCount: 2,
      }),
    });
    expect(create.status).toBe(201);
    const { competitionId } = (await create.json()) as { competitionId: string };

    // Publish.
    const publish = await req(`/classes/${slug}/competitions/${competitionId}/publish`, {
      method: "POST",
      headers: cookieHeader(instructor.cookie),
    });
    expect(publish.status).toBe(200);

    // Earn class XP for each student (homework grants are class-scoped).
    // A: highest, B: middle, C: lowest.
    const taskRes = await req(`/classes/${slug}/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(instructor.cookie) },
      body: JSON.stringify({ kind: "homework", title: "Sprint PSet" }),
    });
    const { taskId } = (await taskRes.json()) as { taskId: string };
    for (const s of [studentA, studentB, studentC]) {
      await req(`/classes/${slug}/tasks/${taskId}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...cookieHeader(s.cookie) },
        body: JSON.stringify({ content: `Submission from ${s.username} for the spring sprint.` }),
      });
    }
    // Pass A + B; C remains unpassed (smaller XP).
    for (const s of [studentA, studentB]) {
      await req(`/classes/${slug}/tasks/${taskId}/grade/${s.userId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...cookieHeader(instructor.cookie) },
        body: JSON.stringify({ pass: true }),
      });
    }

    // Manually end the competition.
    const end = await req(`/classes/${slug}/competitions/${competitionId}/end`, {
      method: "POST",
      headers: cookieHeader(instructor.cookie),
    });
    expect(end.status).toBe(200);
    const endData = (await end.json()) as { winners: string[] };
    expect(endData.winners.length).toBe(2);
    // C didn't grade-pass, so they're 3rd and below the cutoff.
    expect(endData.winners).not.toContain(studentC.userId);

    // Winner inventory contains the prize cosmetic.
    const a = await req("/me/pet", { headers: cookieHeader(studentA.cookie) });
    const aData = (await a.json()) as { inventory: Array<{ slug: string }> };
    expect(aData.inventory.some((i) => i.slug === "trophy")).toBe(true);

    // Non-winner C does NOT have the prize.
    const cInv = await req("/me/pet", { headers: cookieHeader(studentC.cookie) });
    const cData = (await cInv.json()) as { inventory: Array<{ slug: string }> };
    expect(cData.inventory.some((i) => i.slug === "trophy")).toBe(false);
  });

  test("re-running distribution is idempotent (no double-grant)", async () => {
    const instructor = await signup("compinst2");
    const student = await signup("compstud2");
    const slug = `cls-comp-idemp-${testRun}`;
    const created = await createClass(instructor.cookie, slug);
    await req(`/classes/${slug}/enroll`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(student.cookie) },
      body: JSON.stringify({ joinCode: created.joinCode }),
    });
    const create = await req(`/classes/${slug}/competitions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(instructor.cookie) },
      body: JSON.stringify({
        title: "Idempotency Test",
        startsAt: new Date(Date.now() - 60_000).toISOString(),
        endsAt: new Date(Date.now() + 60_000).toISOString(),
        prizeCosmeticSlug: "gold-star",
        prizeWinnerCount: 1,
      }),
    });
    const { competitionId } = (await create.json()) as { competitionId: string };
    await req(`/classes/${slug}/competitions/${competitionId}/publish`, {
      method: "POST",
      headers: cookieHeader(instructor.cookie),
    });
    // Earn some class XP.
    const t = await req(`/classes/${slug}/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(instructor.cookie) },
      body: JSON.stringify({ kind: "reading", title: "R1", url: "https://example.com" }),
    });
    const { taskId } = (await t.json()) as { taskId: string };
    await req(`/classes/${slug}/tasks/${taskId}/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(student.cookie) },
      body: JSON.stringify({}),
    });

    // First end.
    await req(`/classes/${slug}/competitions/${competitionId}/end`, {
      method: "POST",
      headers: cookieHeader(instructor.cookie),
    });
    // Second end is a no-op.
    const second = await req(`/classes/${slug}/competitions/${competitionId}/end`, {
      method: "POST",
      headers: cookieHeader(instructor.cookie),
    });
    expect(second.status).toBe(200);
    const data = (await second.json()) as { alreadyEnded?: boolean };
    expect(data.alreadyEnded).toBe(true);

    // Inventory still has exactly one gold-star.
    const inv = await req("/me/pet", { headers: cookieHeader(student.cookie) });
    const invData = (await inv.json()) as { inventory: Array<{ slug: string }> };
    const goldStars = invData.inventory.filter((i) => i.slug === "gold-star");
    expect(goldStars.length).toBe(1);
  });

  test("non-instructor cannot create a competition (403)", async () => {
    const instructor = await signup("compinst3");
    const student = await signup("compstud3");
    const slug = `cls-comp-acl-${testRun}`;
    const created = await createClass(instructor.cookie, slug);
    await req(`/classes/${slug}/enroll`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(student.cookie) },
      body: JSON.stringify({ joinCode: created.joinCode }),
    });
    const tryCreate = await req(`/classes/${slug}/competitions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(student.cookie) },
      body: JSON.stringify({
        title: "Hostile",
        startsAt: new Date().toISOString(),
        endsAt: new Date(Date.now() + 60_000).toISOString(),
        prizeCosmeticSlug: "crown",
      }),
    });
    expect(tryCreate.status).toBe(403);
  });

  test("prize cosmetic must exist in catalog (404)", async () => {
    const instructor = await signup("compinst4");
    const slug = `cls-comp-noprize-${testRun}`;
    await createClass(instructor.cookie, slug);
    const res = await req(`/classes/${slug}/competitions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(instructor.cookie) },
      body: JSON.stringify({
        title: "Bad prize",
        startsAt: new Date().toISOString(),
        endsAt: new Date(Date.now() + 60_000).toISOString(),
        prizeCosmeticSlug: "made-up-cosmetic-not-in-seed",
      }),
    });
    expect(res.status).toBe(404);
  });

  test("lazy auto-end on GET past endsAt distributes prizes", async () => {
    const instructor = await signup("compinst5");
    const student = await signup("compstud5");
    const slug = `cls-comp-lazy-${testRun}`;
    const created = await createClass(instructor.cookie, slug);
    await req(`/classes/${slug}/enroll`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(student.cookie) },
      body: JSON.stringify({ joinCode: created.joinCode }),
    });
    // Already-past competition — startsAt in the past, endsAt also
    // already in the past (1s ago). The lazy-end branch runs on
    // first GET.
    const create = await req(`/classes/${slug}/competitions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(instructor.cookie) },
      body: JSON.stringify({
        title: "Past-tense",
        startsAt: new Date(Date.now() - 120_000).toISOString(),
        endsAt: new Date(Date.now() - 1_000).toISOString(),
        prizeCosmeticSlug: "rocket",
        prizeWinnerCount: 1,
      }),
    });
    const { competitionId } = (await create.json()) as { competitionId: string };
    await req(`/classes/${slug}/competitions/${competitionId}/publish`, {
      method: "POST",
      headers: cookieHeader(instructor.cookie),
    });
    // Earn some XP retroactively. xp_grants.awardedAt is "now" so
    // it falls between startsAt and endsAt? endsAt was 1s ago — race
    // condition possible but unlikely in test.
    const t = await req(`/classes/${slug}/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(instructor.cookie) },
      body: JSON.stringify({ kind: "reading", title: "R", url: "https://e.com" }),
    });
    const { taskId } = (await t.json()) as { taskId: string };
    await req(`/classes/${slug}/tasks/${taskId}/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(student.cookie) },
      body: JSON.stringify({}),
    });

    // GET should auto-end.
    const get = await req(`/classes/${slug}/competitions/${competitionId}`, {
      headers: cookieHeader(instructor.cookie),
    });
    expect(get.status).toBe(200);
    const data = (await get.json()) as {
      competition: { status: string; prizesAwarded: boolean };
    };
    expect(data.competition.status).toBe("ended");
    expect(data.competition.prizesAwarded).toBe(true);
  });

  test("edit blocked once status=ended", async () => {
    const instructor = await signup("compinst6");
    const slug = `cls-comp-locked-${testRun}`;
    const created = await createClass(instructor.cookie, slug);
    void created;
    const create = await req(`/classes/${slug}/competitions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(instructor.cookie) },
      body: JSON.stringify({
        title: "To be ended",
        startsAt: new Date(Date.now() - 60_000).toISOString(),
        endsAt: new Date(Date.now() + 60_000).toISOString(),
        prizeCosmeticSlug: "crown",
      }),
    });
    const { competitionId } = (await create.json()) as { competitionId: string };
    await req(`/classes/${slug}/competitions/${competitionId}/publish`, {
      method: "POST",
      headers: cookieHeader(instructor.cookie),
    });
    await req(`/classes/${slug}/competitions/${competitionId}/end`, {
      method: "POST",
      headers: cookieHeader(instructor.cookie),
    });
    const editTry = await req(`/classes/${slug}/competitions/${competitionId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...cookieHeader(instructor.cookie) },
      body: JSON.stringify({ title: "Renamed after end" }),
    });
    expect(editTry.status).toBe(400);
  });
});

describe("/users/:username/pet-display (S87)", () => {
  test("returns null pet for users without one", async () => {
    const u = await signup("nopet1");
    const res = await req(`/users/${u.username}/pet-display`);
    expect(res.status).toBe(200);
    const data = (await res.json()) as { pet: unknown };
    expect(data.pet).toBeNull();
  });

  test("returns species + equipped cosmetics when pet + equip exist", async () => {
    // Hatch a pet by stacking XP up to threshold + equip a cosmetic
    // through the class flow.
    const instructor = await signup("petinst1");
    const student = await signup("petstud1");
    const slug = `cls-petdisp-${testRun}`;
    const created = await createClass(instructor.cookie, slug);
    await req(`/classes/${slug}/enroll`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(student.cookie) },
      body: JSON.stringify({ joinCode: created.joinCode }),
    });
    // Submit + grade homework to push past the hatch threshold.
    const t = await req(`/classes/${slug}/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(instructor.cookie) },
      body: JSON.stringify({ kind: "homework", title: "PSet" }),
    });
    const { taskId } = (await t.json()) as { taskId: string };
    await req(`/classes/${slug}/tasks/${taskId}/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(student.cookie) },
      body: JSON.stringify({ content: "Submission with sufficient content for the validator." }),
    });
    await req(`/classes/${slug}/tasks/${taskId}/grade/${student.userId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(instructor.cookie) },
      body: JSON.stringify({ pass: true }),
    });
    await req(`/classes/${slug}/grant-cosmetic`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(instructor.cookie) },
      body: JSON.stringify({
        userId: student.userId,
        cosmeticSlug: "fire",
      }),
    });
    await req("/me/pet/equip", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(student.cookie) },
      body: JSON.stringify({ cosmeticSlug: "fire" }),
    });

    const res = await req(`/users/${student.username}/pet-display`);
    const data = (await res.json()) as {
      pet: {
        species: string;
        speciesEmoji: string;
        equipped: Array<{ slug: string; emoji: string | null }>;
      } | null;
    };
    expect(data.pet).not.toBeNull();
    expect(data.pet?.speciesEmoji).toBeTruthy();
    expect(data.pet?.equipped.some((e) => e.slug === "fire")).toBe(true);
  });
});

describe("S88 notification emissions", () => {
  test("grant-cosmetic emits cosmetic_granted notification to recipient", async () => {
    const instructor = await signup("noteinst1");
    const student = await signup("notestud1");
    const slug = `cls-note-grant-${testRun}`;
    const created = await createClass(instructor.cookie, slug);
    await req(`/classes/${slug}/enroll`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(student.cookie) },
      body: JSON.stringify({ joinCode: created.joinCode }),
    });
    await req(`/classes/${slug}/grant-cosmetic`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(instructor.cookie) },
      body: JSON.stringify({ userId: student.userId, cosmeticSlug: "crown", note: "Awesome work" }),
    });
    const list = await req("/notifications?unread=true", { headers: cookieHeader(student.cookie) });
    const data = (await list.json()) as {
      notifications: Array<{ kind: string; subjectType: string; subjectId: string; preview: string | null }>;
    };
    const cosmetic = data.notifications.find((n) => n.kind === "cosmetic_granted");
    expect(cosmetic).toBeDefined();
    expect(cosmetic?.subjectType).toBe("cosmetic");
    expect(cosmetic?.subjectId).toBe("crown");
    expect(cosmetic?.preview).toContain("Awesome work");
  });

  test("competition end emits competition_won notification to each winner", async () => {
    const instructor = await signup("noteinst2");
    const winner = await signup("notewinner");
    const loser = await signup("noteloser");
    const slug = `cls-note-comp-${testRun}`;
    const created = await createClass(instructor.cookie, slug);
    for (const s of [winner, loser]) {
      await req(`/classes/${slug}/enroll`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...cookieHeader(s.cookie) },
        body: JSON.stringify({ joinCode: created.joinCode }),
      });
    }
    const create = await req(`/classes/${slug}/competitions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(instructor.cookie) },
      body: JSON.stringify({
        title: "Weekly Sprint",
        startsAt: new Date(Date.now() - 60_000).toISOString(),
        endsAt: new Date(Date.now() + 60_000).toISOString(),
        prizeCosmeticSlug: "trophy",
        prizeWinnerCount: 1,
      }),
    });
    const { competitionId } = (await create.json()) as { competitionId: string };
    await req(`/classes/${slug}/competitions/${competitionId}/publish`, {
      method: "POST",
      headers: cookieHeader(instructor.cookie),
    });
    // Earn class XP only for winner.
    const t = await req(`/classes/${slug}/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(instructor.cookie) },
      body: JSON.stringify({ kind: "homework", title: "PSet" }),
    });
    const { taskId } = (await t.json()) as { taskId: string };
    await req(`/classes/${slug}/tasks/${taskId}/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(winner.cookie) },
      body: JSON.stringify({ content: "submission text long enough for the validator." }),
    });
    await req(`/classes/${slug}/tasks/${taskId}/grade/${winner.userId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(instructor.cookie) },
      body: JSON.stringify({ pass: true }),
    });
    await req(`/classes/${slug}/competitions/${competitionId}/end`, {
      method: "POST",
      headers: cookieHeader(instructor.cookie),
    });

    const winnerList = await req("/notifications?unread=true", { headers: cookieHeader(winner.cookie) });
    const winnerData = (await winnerList.json()) as {
      notifications: Array<{ kind: string; subjectType: string; subjectId: string; preview: string | null }>;
    };
    const won = winnerData.notifications.find((n) => n.kind === "competition_won");
    expect(won).toBeDefined();
    expect(won?.subjectId).toBe(competitionId);
    expect(won?.preview).toContain("Weekly Sprint");

    // Loser does NOT get a competition_won notification.
    const loserList = await req("/notifications?unread=true", { headers: cookieHeader(loser.cookie) });
    const loserData = (await loserList.json()) as {
      notifications: Array<{ kind: string }>;
    };
    expect(loserData.notifications.some((n) => n.kind === "competition_won")).toBe(false);
  });

  test("pet hatching emits pet_hatched notification", async () => {
    const instructor = await signup("notepetinst1");
    const student = await signup("notepetstud1");
    const slug = `cls-pethatch-${testRun}`;
    const created = await createClass(instructor.cookie, slug);
    await req(`/classes/${slug}/enroll`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(student.cookie) },
      body: JSON.stringify({ joinCode: created.joinCode }),
    });
    // Push past hatch threshold via a graded homework.
    const t = await req(`/classes/${slug}/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(instructor.cookie) },
      body: JSON.stringify({ kind: "homework", title: "PSet" }),
    });
    const { taskId } = (await t.json()) as { taskId: string };
    await req(`/classes/${slug}/tasks/${taskId}/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(student.cookie) },
      body: JSON.stringify({ content: "submission text long enough for the validator to accept." }),
    });
    await req(`/classes/${slug}/tasks/${taskId}/grade/${student.userId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(instructor.cookie) },
      body: JSON.stringify({ pass: true }),
    });
    const list = await req("/notifications?unread=true", { headers: cookieHeader(student.cookie) });
    const data = (await list.json()) as { notifications: Array<{ kind: string; subjectType: string; preview: string | null }> };
    const hatch = data.notifications.find((n) => n.kind === "pet_hatched");
    expect(hatch).toBeDefined();
    expect(hatch?.subjectType).toBe("pet");
    expect(hatch?.preview).toContain("hatched");
  });
});

describe("competition reading-completions scoring rule (S88)", () => {
  test("ranks students by reading completions in window", async () => {
    const instructor = await signup("readinst1");
    const heavyReader = await signup("heavyreader");
    const lightReader = await signup("lightreader");
    const slug = `cls-readcomp-${testRun}`;
    const created = await createClass(instructor.cookie, slug);
    for (const s of [heavyReader, lightReader]) {
      await req(`/classes/${slug}/enroll`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...cookieHeader(s.cookie) },
        body: JSON.stringify({ joinCode: created.joinCode }),
      });
    }
    // 3 reading tasks.
    const taskIds: string[] = [];
    for (let i = 0; i < 3; i++) {
      const t = await req(`/classes/${slug}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...cookieHeader(instructor.cookie) },
        body: JSON.stringify({ kind: "reading", title: `Reading ${i}`, url: `https://example.com/r${i}` }),
      });
      taskIds.push(((await t.json()) as { taskId: string }).taskId);
    }
    // heavy completes all 3; light completes 1.
    for (const id of taskIds) {
      await req(`/classes/${slug}/tasks/${id}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...cookieHeader(heavyReader.cookie) },
        body: JSON.stringify({}),
      });
    }
    await req(`/classes/${slug}/tasks/${taskIds[0]}/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(lightReader.cookie) },
      body: JSON.stringify({}),
    });

    const create = await req(`/classes/${slug}/competitions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(instructor.cookie) },
      body: JSON.stringify({
        title: "Read More",
        startsAt: new Date(Date.now() - 120_000).toISOString(),
        endsAt: new Date(Date.now() + 120_000).toISOString(),
        scoringRule: "reading-completions",
        prizeCosmeticSlug: "rocket",
        prizeWinnerCount: 1,
      }),
    });
    const { competitionId } = (await create.json()) as { competitionId: string };
    await req(`/classes/${slug}/competitions/${competitionId}/publish`, {
      method: "POST",
      headers: cookieHeader(instructor.cookie),
    });

    const detail = await req(`/classes/${slug}/competitions/${competitionId}`, {
      headers: cookieHeader(instructor.cookie),
    });
    const data = (await detail.json()) as {
      standings: Array<{ rank: number; userId: string; score: number }>;
    };
    expect(data.standings[0].userId).toBe(heavyReader.userId);
    expect(data.standings[0].score).toBe(3);
    expect(data.standings[1].userId).toBe(lightReader.userId);
    expect(data.standings[1].score).toBe(1);
  });
});

describe("S89 XP shop", () => {
  // Helper to push a user's class XP to a known amount via a graded
  // homework. One graded-pass is XP_AMOUNTS["homework-graded-pass"]
  // which is 50 in the seed; complete + grade-pass yields 50 + 5
  // = 55 XP per task. Tests compute expected balance directly from
  // observed grants rather than hard-coding so amount-table tweaks
  // don't break the suite.
  type TestUser = { cookie: string; userId: string; username: string };
  async function earnXpForBuyTest(slug: string, classData: { joinCode: string }, instructor: TestUser, student: TestUser, taskCount: number) {
    await req(`/classes/${slug}/enroll`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(student.cookie) },
      body: JSON.stringify({ joinCode: classData.joinCode }),
    });
    for (let i = 0; i < taskCount; i++) {
      const t = await req(`/classes/${slug}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...cookieHeader(instructor.cookie) },
        body: JSON.stringify({ kind: "homework", title: `PSet ${i}` }),
      });
      const { taskId } = (await t.json()) as { taskId: string };
      await req(`/classes/${slug}/tasks/${taskId}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...cookieHeader(student.cookie) },
        body: JSON.stringify({ content: `Submission for task ${i}, sufficient length to satisfy validator.` }),
      });
      await req(`/classes/${slug}/tasks/${taskId}/grade/${student.userId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...cookieHeader(instructor.cookie) },
        body: JSON.stringify({ pass: true }),
      });
    }
  }

  test("buy success: inventory grows + balance reduces by xpCost", async () => {
    const instructor = await signup("shopinst1");
    const student = await signup("shopstud1");
    const slug = `cls-shop-buy-${testRun}`;
    const created = await createClass(instructor.cookie, slug);
    await earnXpForBuyTest(slug, created, instructor, student, 3);

    const balBefore = await req("/me/pet/balance", { headers: cookieHeader(student.cookie) });
    const balData = (await balBefore.json()) as { balance: number };
    expect(balData.balance).toBeGreaterThan(75); // baseball-cap is 75

    const buy = await req("/me/pet/buy", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(student.cookie) },
      body: JSON.stringify({ cosmeticSlug: "baseball-cap" }),
    });
    expect(buy.status).toBe(201);
    const buyData = (await buy.json()) as { ok: true; balance: number; cosmeticSlug: string };
    expect(buyData.ok).toBe(true);
    expect(buyData.cosmeticSlug).toBe("baseball-cap");
    expect(buyData.balance).toBe(balData.balance - 75);

    // Inventory contains the cosmetic.
    const me = await req("/me/pet", { headers: cookieHeader(student.cookie) });
    const meData = (await me.json()) as { inventory: Array<{ slug: string }> };
    expect(meData.inventory.some((i) => i.slug === "baseball-cap")).toBe(true);

    // Balance probe matches.
    const balAfter = await req("/me/pet/balance", { headers: cookieHeader(student.cookie) });
    const balAfterData = (await balAfter.json()) as { balance: number; spentXp: number };
    expect(balAfterData.balance).toBe(buyData.balance);
    expect(balAfterData.spentXp).toBe(75);
  });

  test("insufficient balance returns 402", async () => {
    const student = await signup("shoppoor");
    // Brand-new user with 0 lifetime XP.
    const buy = await req("/me/pet/buy", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(student.cookie) },
      body: JSON.stringify({ cosmeticSlug: "baseball-cap" }),
    });
    expect(buy.status).toBe(402);
  });

  test("already-owned cosmetic rejected with 409", async () => {
    const instructor = await signup("shopinst2");
    const student = await signup("shopstud2");
    const slug = `cls-shop-dup-${testRun}`;
    const created = await createClass(instructor.cookie, slug);
    await earnXpForBuyTest(slug, created, instructor, student, 3);

    await req("/me/pet/buy", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(student.cookie) },
      body: JSON.stringify({ cosmeticSlug: "ribbon" }),
    });
    const dup = await req("/me/pet/buy", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(student.cookie) },
      body: JSON.stringify({ cosmeticSlug: "ribbon" }),
    });
    expect(dup.status).toBe(409);
  });

  test("non-purchasable cosmetic (xpCost null) rejected with 400", async () => {
    const instructor = await signup("shopinst3");
    const student = await signup("shopstud3");
    const slug = `cls-shop-no-${testRun}`;
    const created = await createClass(instructor.cookie, slug);
    await earnXpForBuyTest(slug, created, instructor, student, 30); // tons of XP

    const buy = await req("/me/pet/buy", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(student.cookie) },
      body: JSON.stringify({ cosmeticSlug: "crown" }), // legendary, no xpCost
    });
    expect(buy.status).toBe(400);
  });

  test("shop response includes balance + ownership flags", async () => {
    const instructor = await signup("shopinst4");
    const student = await signup("shopstud4");
    const slug = `cls-shop-list-${testRun}`;
    const created = await createClass(instructor.cookie, slug);
    await earnXpForBuyTest(slug, created, instructor, student, 3);
    await req("/me/pet/buy", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(student.cookie) },
      body: JSON.stringify({ cosmeticSlug: "rose" }),
    });

    const shop = await req("/me/pet/shop", { headers: cookieHeader(student.cookie) });
    expect(shop.status).toBe(200);
    const data = (await shop.json()) as {
      balance: number;
      items: Array<{ slug: string; xpCost: number; owned: boolean; affordable: boolean }>;
    };
    const rose = data.items.find((i) => i.slug === "rose");
    expect(rose?.owned).toBe(true);
    // Crown isn't in the shop at all (xpCost null).
    expect(data.items.some((i) => i.slug === "crown")).toBe(false);
    // Balance positive.
    expect(data.balance).toBeGreaterThan(0);
  });
});
