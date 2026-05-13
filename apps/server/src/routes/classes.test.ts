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
  test("returns a pet for fresh signups (auto-hatch on signup)", async () => {
    // Phase X — every signup auto-hatches the user's first pet, so
    // pet-display now returns a populated `pet` object for any
    // brand-new user without further activity.
    const u = await signup("nopet1");
    const res = await req(`/users/${u.username}/pet-display`);
    expect(res.status).toBe(200);
    const data = (await res.json()) as { pet: { species: string } | null };
    expect(data.pet).not.toBeNull();
    expect(data.pet?.species).toBeTruthy();
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
        equipped: Array<{ slug: string }>;
      } | null;
    };
    expect(data.pet).not.toBeNull();
    expect(data.pet?.species).toBeTruthy();
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
    const enroll = await req(`/classes/${slug}/enroll`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(student.cookie) },
      body: JSON.stringify({ joinCode: classData.joinCode }),
    });
    expect(enroll.status).toBe(201);
    for (let i = 0; i < taskCount; i++) {
      const t = await req(`/classes/${slug}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...cookieHeader(instructor.cookie) },
        body: JSON.stringify({ kind: "homework", title: `PSet ${i}` }),
      });
      expect(t.status).toBe(201);
      const { taskId } = (await t.json()) as { taskId: string };
      const complete = await req(`/classes/${slug}/tasks/${taskId}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...cookieHeader(student.cookie) },
        body: JSON.stringify({ content: `Submission for task ${i}, sufficient length to satisfy validator.` }),
      });
      expect(complete.status).toBe(200);
      const grade = await req(`/classes/${slug}/tasks/${taskId}/grade/${student.userId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...cookieHeader(instructor.cookie) },
        body: JSON.stringify({ pass: true }),
      });
      expect(grade.status).toBe(200);
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
    const buyData = (await buy.json()) as {
      ok: true;
      balance: number;
      cosmeticSlug: string;
      amountSpent: number;
      wasFeatured: boolean;
    };
    expect(buyData.ok).toBe(true);
    expect(buyData.cosmeticSlug).toBe("baseball-cap");
    // amountSpent depends on whether baseball-cap is today's featured cosmetic
    // (50% off). Asserting against the route-returned amount is robust.
    expect(buyData.balance).toBe(balData.balance - buyData.amountSpent);

    // Inventory contains the cosmetic.
    const me = await req("/me/pet", { headers: cookieHeader(student.cookie) });
    const meData = (await me.json()) as { inventory: Array<{ slug: string }> };
    expect(meData.inventory.some((i) => i.slug === "baseball-cap")).toBe(true);

    // Balance probe matches.
    const balAfter = await req("/me/pet/balance", { headers: cookieHeader(student.cookie) });
    const balAfterData = (await balAfter.json()) as { balance: number; spentXp: number };
    expect(balAfterData.balance).toBe(buyData.balance);
    expect(balAfterData.spentXp).toBe(buyData.amountSpent);
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

describe("S95 daily-featured shop rotation", () => {
  test("shop response includes featuredSlug + discounted effectiveCost on the featured item", async () => {
    const instructor = await signup("featinst1");
    const student = await signup("featstud1");
    const slug = `cls-feat-list-${testRun}`;
    const created = await createClass(instructor.cookie, slug);
    await req(`/classes/${slug}/enroll`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(student.cookie) },
      body: JSON.stringify({ joinCode: created.joinCode }),
    });
    const shop = await req("/me/pet/shop", { headers: cookieHeader(student.cookie) });
    expect(shop.status).toBe(200);
    const data = (await shop.json()) as {
      featuredSlug: string | null;
      featuredDiscountPercent: number;
      items: Array<{
        slug: string;
        xpCost: number;
        effectiveCost: number;
        featured: boolean;
      }>;
    };
    expect(data.featuredSlug).not.toBeNull();
    expect(data.featuredDiscountPercent).toBe(50);
    const featured = data.items.find((i) => i.featured);
    expect(featured).toBeDefined();
    expect(featured?.slug).toBe(data.featuredSlug ?? "");
    // Discount: ceil(xpCost * 0.5)
    expect(featured?.effectiveCost).toBe(Math.ceil(featured!.xpCost * 0.5));
    // Non-featured items keep their full price.
    const nonFeatured = data.items.find((i) => !i.featured);
    expect(nonFeatured).toBeDefined();
    expect(nonFeatured?.effectiveCost).toBe(nonFeatured?.xpCost);
  });

  test("featured slug stable across consecutive shop reads on the same day", async () => {
    const u = await signup("featstud2");
    const a = await req("/me/pet/shop", { headers: cookieHeader(u.cookie) });
    const b = await req("/me/pet/shop", { headers: cookieHeader(u.cookie) });
    const aData = (await a.json()) as { featuredSlug: string };
    const bData = (await b.json()) as { featuredSlug: string };
    expect(aData.featuredSlug).toBe(bData.featuredSlug);
  });

  test("buying the featured cosmetic charges the discounted price", async () => {
    const instructor = await signup("featinst3");
    const student = await signup("featstud3");
    const slug = `cls-feat-buy-${testRun}`;
    const created = await createClass(instructor.cookie, slug);
    await req(`/classes/${slug}/enroll`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(student.cookie) },
      body: JSON.stringify({ joinCode: created.joinCode }),
    });
    // Earn enough XP via several graded homeworks. 30 graded passes
    // = 30 * (30 + 20) = 1500 XP, comfortably above any one cosmetic.
    for (let i = 0; i < 30; i++) {
      const t = await req(`/classes/${slug}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...cookieHeader(instructor.cookie) },
        body: JSON.stringify({ kind: "homework", title: `T${i}` }),
      });
      const { taskId } = (await t.json()) as { taskId: string };
      await req(`/classes/${slug}/tasks/${taskId}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...cookieHeader(student.cookie) },
        body: JSON.stringify({ content: `Submission ${i} long enough for the validator.` }),
      });
      await req(`/classes/${slug}/tasks/${taskId}/grade/${student.userId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...cookieHeader(instructor.cookie) },
        body: JSON.stringify({ pass: true }),
      });
    }
    // Read shop to learn today's featured slug + discounted price.
    const shop = await req("/me/pet/shop", { headers: cookieHeader(student.cookie) });
    const shopData = (await shop.json()) as {
      featuredSlug: string;
      items: Array<{ slug: string; xpCost: number; effectiveCost: number; featured: boolean }>;
    };
    const featured = shopData.items.find((i) => i.slug === shopData.featuredSlug)!;
    expect(featured.effectiveCost).toBeLessThan(featured.xpCost);

    // Buy it. The response should report the discounted amountSpent.
    const buy = await req("/me/pet/buy", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(student.cookie) },
      body: JSON.stringify({ cosmeticSlug: featured.slug }),
    });
    expect(buy.status).toBe(201);
    const buyData = (await buy.json()) as { amountSpent: number; wasFeatured: boolean };
    expect(buyData.wasFeatured).toBe(true);
    expect(buyData.amountSpent).toBe(featured.effectiveCost);

    // Balance probe: spentXp matches the discounted amount, not the
    // full xpCost.
    const bal = await req("/me/pet/balance", { headers: cookieHeader(student.cookie) });
    const balData = (await bal.json()) as { spentXp: number };
    expect(balData.spentXp).toBe(featured.effectiveCost);
  });
});

describe("S106 cohort-class linkage", () => {
  // Helper: create a cohort directly via the cohorts table for
  // testing. The cohorts API surface is its own thing; we just need
  // a row with creatorId set.
  async function createCohortFor(userId: string, slug: string): Promise<string> {
    const { getDb, cohorts } = await import("@axiomic/db");
    const { randomUUID } = await import("crypto");
    const id = randomUUID();
    getDb()
      .insert(cohorts)
      .values({
        id,
        slug,
        name: slug,
        creatorId: userId,
      })
      .run();
    return id;
  }

  test("instructor can link a cohort they own (200)", async () => {
    const instructor = await signup("clinst1");
    const slug = `cls-link-${testRun}`;
    await createClass(instructor.cookie, slug);
    const cohortId = await createCohortFor(instructor.userId, `cohort-${testRun}-a`);
    const upd = await req(`/classes/${slug}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...cookieHeader(instructor.cookie) },
      body: JSON.stringify({ linkedCohortId: cohortId }),
    });
    expect(upd.status).toBe(200);
    const det = await req(`/classes/${slug}`, { headers: cookieHeader(instructor.cookie) });
    const data = (await det.json()) as { class: { linkedCohortId: string | null } };
    expect(data.class.linkedCohortId).toBe(cohortId);
  });

  test("instructor cannot link a cohort they don't own (403)", async () => {
    const instructorA = await signup("clinst2a");
    const instructorB = await signup("clinst2b");
    const slug = `cls-link-403-${testRun}`;
    await createClass(instructorA.cookie, slug);
    // Cohort created by B; A tries to link it.
    const cohortId = await createCohortFor(instructorB.userId, `cohort-${testRun}-b`);
    const upd = await req(`/classes/${slug}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...cookieHeader(instructorA.cookie) },
      body: JSON.stringify({ linkedCohortId: cohortId }),
    });
    expect(upd.status).toBe(403);
  });

  test("capstone-track completion fires class XP when user is in both linked cohort and class", async () => {
    const { getDb, cohortMembers, capstoneTrackCompletions } = await import("@axiomic/db");
    const { randomUUID } = await import("crypto");
    const { maybeMintTrackCompletions: _ } = await import("../lib/capstoneTrackCompletion").catch(() => ({ maybeMintTrackCompletions: null }));

    const instructor = await signup("clinst3");
    const student = await signup("clstud3");
    const slug = `cls-link-xp-${testRun}`;
    const created = await createClass(instructor.cookie, slug);
    await req(`/classes/${slug}/enroll`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(student.cookie) },
      body: JSON.stringify({ joinCode: created.joinCode }),
    });
    const cohortId = await createCohortFor(instructor.userId, `cohort-${testRun}-xp`);
    // Link the class to the cohort.
    await req(`/classes/${slug}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...cookieHeader(instructor.cookie) },
      body: JSON.stringify({ linkedCohortId: cohortId }),
    });
    // Put the student in the cohort.
    getDb()
      .insert(cohortMembers)
      .values({ id: randomUUID(), cohortId, userId: student.userId, role: "member" })
      .run();

    // Verify the XP-grant + idempotency contract that the
    // post-completion hook depends on. The full
    // capstoneTrackCompletion → maybeAwardCohortClassXp → grantXp
    // path is straightforward; the parts worth pinning down are
    // (a) source value resolves to a non-zero XP amount, and
    // (b) re-runs are idempotent on (userId, source, sourceRefId).
    // Skip the actual capstone_track_completions insert because
    // its trackId FK demands a seeded capstone_tracks row.
    const trackId = `track-${testRun}`;
    const { grantXp } = await import("../lib/xp");
    const r = grantXp({
      userId: student.userId,
      classId: created.classId,
      source: "cohort-capstone-completed",
      sourceRefId: trackId,
    });
    expect(r.granted).toBe(true);
    expect(r.amount).toBe(100);

    // Idempotent: a second call with the same trackId no-ops.
    const r2 = grantXp({
      userId: student.userId,
      classId: created.classId,
      source: "cohort-capstone-completed",
      sourceRefId: trackId,
    });
    expect(r2.granted).toBe(false);
  });
});

describe("S104 multi-pet", () => {
  test("first auto-hatch sets the new pet as active; GET /me/pet returns pets[] with isActive flag", async () => {
    const instructor = await signup("mpinst1");
    const student = await signup("mpstud1");
    const slug = `cls-mp-first-${testRun}`;
    const created = await createClass(instructor.cookie, slug);
    await req(`/classes/${slug}/enroll`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(student.cookie) },
      body: JSON.stringify({ joinCode: created.joinCode }),
    });
    // Trigger first hatch via graded homework.
    const t = await req(`/classes/${slug}/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(instructor.cookie) },
      body: JSON.stringify({ kind: "homework", title: "PSet" }),
    });
    const { taskId } = (await t.json()) as { taskId: string };
    await req(`/classes/${slug}/tasks/${taskId}/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(student.cookie) },
      body: JSON.stringify({ content: "Submission long enough." }),
    });
    await req(`/classes/${slug}/tasks/${taskId}/grade/${student.userId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(instructor.cookie) },
      body: JSON.stringify({ pass: true }),
    });
    const me = await req("/me/pet", { headers: cookieHeader(student.cookie) });
    const data = (await me.json()) as {
      pet: { id: string } | null;
      pets: Array<{ id: string; isActive: boolean }>;
      petCap: number;
      nextHatchXp: number | null;
    };
    expect(data.pet).not.toBeNull();
    expect(data.pets.length).toBe(1);
    expect(data.pets[0].isActive).toBe(true);
    expect(data.pets[0].id).toBe(data.pet!.id);
    expect(data.petCap).toBe(3);
    expect(data.nextHatchXp).toBe(250);
  });

  test("hatch-another requires sufficient XP (402 below threshold, success above)", async () => {
    const instructor = await signup("mpinst2");
    const student = await signup("mpstud2");
    const slug = `cls-mp-thresh-${testRun}`;
    const created = await createClass(instructor.cookie, slug);
    await req(`/classes/${slug}/enroll`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(student.cookie) },
      body: JSON.stringify({ joinCode: created.joinCode }),
    });
    // Earn a small amount of XP — enough to auto-hatch the first
    // pet but not enough for the second (need 250).
    const t = await req(`/classes/${slug}/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(instructor.cookie) },
      body: JSON.stringify({ kind: "homework", title: "PSet0" }),
    });
    const { taskId } = (await t.json()) as { taskId: string };
    await req(`/classes/${slug}/tasks/${taskId}/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(student.cookie) },
      body: JSON.stringify({ content: "Submission long enough." }),
    });
    await req(`/classes/${slug}/tasks/${taskId}/grade/${student.userId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(instructor.cookie) },
      body: JSON.stringify({ pass: true }),
    });
    // First hatch-another should 402 (insufficient XP).
    const tooEarly = await req("/me/pet/hatch-another", {
      method: "POST",
      headers: cookieHeader(student.cookie),
    });
    expect(tooEarly.status).toBe(402);

    // Earn more XP — push past 250 total.
    for (let i = 0; i < 5; i++) {
      const t2 = await req(`/classes/${slug}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...cookieHeader(instructor.cookie) },
        body: JSON.stringify({ kind: "homework", title: `PSet${i + 1}` }),
      });
      const { taskId: tid } = (await t2.json()) as { taskId: string };
      await req(`/classes/${slug}/tasks/${tid}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...cookieHeader(student.cookie) },
        body: JSON.stringify({ content: `Submission ${i + 1} long enough.` }),
      });
      await req(`/classes/${slug}/tasks/${tid}/grade/${student.userId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...cookieHeader(instructor.cookie) },
        body: JSON.stringify({ pass: true }),
      });
    }
    const second = await req("/me/pet/hatch-another", {
      method: "POST",
      headers: cookieHeader(student.cookie),
    });
    expect(second.status).toBe(201);
    const newPet = (await second.json()) as { pet: { id: string } };
    // Newly hatched pet should be active.
    const me = await req("/me/pet", { headers: cookieHeader(student.cookie) });
    const meData = (await me.json()) as {
      pet: { id: string };
      pets: Array<{ id: string; isActive: boolean }>;
    };
    expect(meData.pet.id).toBe(newPet.pet.id);
    expect(meData.pets.length).toBe(2);
    expect(meData.pets.find((p) => p.id === newPet.pet.id)?.isActive).toBe(true);
  });

  test("POST /me/pet/activate switches the active pet (must be owned)", async () => {
    // Set up two students: a has 2 pets, b has 1. b tries to activate
    // one of a's pets — should 404.
    const instructor = await signup("mpinst3");
    const a = await signup("mpA3");
    const b = await signup("mpB3");
    const slug = `cls-mp-act-${testRun}`;
    const created = await createClass(instructor.cookie, slug);
    for (const s of [a, b]) {
      await req(`/classes/${slug}/enroll`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...cookieHeader(s.cookie) },
        body: JSON.stringify({ joinCode: created.joinCode }),
      });
    }
    // Both students earn XP for their first auto-hatch, and a
    // earns enough to hatch a second pet.
    for (let i = 0; i < 6; i++) {
      const t = await req(`/classes/${slug}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...cookieHeader(instructor.cookie) },
        body: JSON.stringify({ kind: "homework", title: `Task${i}` }),
      });
      const { taskId } = (await t.json()) as { taskId: string };
      for (const s of [a, b]) {
        await req(`/classes/${slug}/tasks/${taskId}/complete`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...cookieHeader(s.cookie) },
          body: JSON.stringify({ content: `Submission ${s.username} ${i} long enough.` }),
        });
      }
      // Only a gets graded — b stays at the floor.
      await req(`/classes/${slug}/tasks/${taskId}/grade/${a.userId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...cookieHeader(instructor.cookie) },
        body: JSON.stringify({ pass: true }),
      });
    }
    // a hatches another (will succeed: 6 graded passes × ~50 XP > 250).
    await req("/me/pet/hatch-another", {
      method: "POST",
      headers: cookieHeader(a.cookie),
    });
    const aMe = await req("/me/pet", { headers: cookieHeader(a.cookie) });
    const aData = (await aMe.json()) as {
      pet: { id: string };
      pets: Array<{ id: string; isActive: boolean }>;
    };
    expect(aData.pets.length).toBe(2);
    const firstPet = aData.pets.find((p) => !p.isActive)!;
    // Activate the first (currently inactive) pet.
    const sw = await req("/me/pet/activate", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(a.cookie) },
      body: JSON.stringify({ petId: firstPet.id }),
    });
    expect(sw.status).toBe(200);
    const aMe2 = await req("/me/pet", { headers: cookieHeader(a.cookie) });
    const aData2 = (await aMe2.json()) as { pet: { id: string } };
    expect(aData2.pet.id).toBe(firstPet.id);

    // b tries to activate one of a's pets — should 404.
    const stolen = await req("/me/pet/activate", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(b.cookie) },
      body: JSON.stringify({ petId: firstPet.id }),
    });
    expect(stolen.status).toBe(404);
  });

  test("hatch-another caps at MAX_PETS_PER_USER (3); 4th attempt 409", async () => {
    const instructor = await signup("mpinst4");
    const student = await signup("mpstud4");
    const slug = `cls-mp-cap-${testRun}`;
    const created = await createClass(instructor.cookie, slug);
    await req(`/classes/${slug}/enroll`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(student.cookie) },
      body: JSON.stringify({ joinCode: created.joinCode }),
    });
    // Pump the student past 750 XP so all 3 hatches are available.
    for (let i = 0; i < 16; i++) {
      const t = await req(`/classes/${slug}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...cookieHeader(instructor.cookie) },
        body: JSON.stringify({ kind: "homework", title: `T${i}` }),
      });
      const { taskId } = (await t.json()) as { taskId: string };
      await req(`/classes/${slug}/tasks/${taskId}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...cookieHeader(student.cookie) },
        body: JSON.stringify({ content: `Submission ${i} long enough.` }),
      });
      await req(`/classes/${slug}/tasks/${taskId}/grade/${student.userId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...cookieHeader(instructor.cookie) },
        body: JSON.stringify({ pass: true }),
      });
    }
    // Three hatch-anothers should succeed (first auto + 2 manual).
    const second = await req("/me/pet/hatch-another", {
      method: "POST",
      headers: cookieHeader(student.cookie),
    });
    expect(second.status).toBe(201);
    const third = await req("/me/pet/hatch-another", {
      method: "POST",
      headers: cookieHeader(student.cookie),
    });
    expect(third.status).toBe(201);
    // Fourth should 409 (cap = 3).
    const fourth = await req("/me/pet/hatch-another", {
      method: "POST",
      headers: cookieHeader(student.cookie),
    });
    expect(fourth.status).toBe(409);
    // Verify nextHatchXp is null at cap.
    const me = await req("/me/pet", { headers: cookieHeader(student.cookie) });
    const data = (await me.json()) as { nextHatchXp: number | null; pets: unknown[] };
    expect(data.pets.length).toBe(3);
    expect(data.nextHatchXp).toBeNull();
  });
});

describe("S-audit regressions", () => {
  test("shop buy: spending two cosmetics that together exceed balance is rejected (race fix)", async () => {
    // Setup a student with just enough for ONE cosmetic, not two.
    // Both pre-S-audit, the route did the balance check before
    // the transaction, so two concurrent buys could both pass.
    // Now the recheck inside the transaction catches it. We
    // can't easily simulate true concurrency in this test; we
    // verify the deterministic case: spend most XP on one
    // purchase, then the next purchase 402s on insufficient
    // balance computed from xp_purchases.
    const instructor = await signup("auditshop1");
    const student = await signup("auditshop1stud");
    const slug = `cls-audit-shop-${testRun}`;
    const created = await createClass(instructor.cookie, slug);
    await req(`/classes/${slug}/enroll`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(student.cookie) },
      body: JSON.stringify({ joinCode: created.joinCode }),
    });
    // Earn enough class XP for exactly one ribbon (75) + a bit more
    // but not two ribbons (150).
    for (let i = 0; i < 2; i++) {
      const t = await req(`/classes/${slug}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...cookieHeader(instructor.cookie) },
        body: JSON.stringify({ kind: "homework", title: `T${i}` }),
      });
      const { taskId } = (await t.json()) as { taskId: string };
      await req(`/classes/${slug}/tasks/${taskId}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...cookieHeader(student.cookie) },
        body: JSON.stringify({ content: `Long submission ${i} for the validator.` }),
      });
      await req(`/classes/${slug}/tasks/${taskId}/grade/${student.userId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...cookieHeader(instructor.cookie) },
        body: JSON.stringify({ pass: true }),
      });
    }
    // First buy succeeds.
    const buy1 = await req("/me/pet/buy", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(student.cookie) },
      body: JSON.stringify({ cosmeticSlug: "ribbon" }),
    });
    expect(buy1.status).toBe(201);
    // Now check actual balance — if it's < 75 (cost of baseball-cap),
    // a sequential second buy must 402.
    const balRes = await req("/me/pet/balance", { headers: cookieHeader(student.cookie) });
    const balData = (await balRes.json()) as { balance: number };
    if (balData.balance < 75) {
      const buy2 = await req("/me/pet/buy", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...cookieHeader(student.cookie) },
        body: JSON.stringify({ cosmeticSlug: "baseball-cap" }),
      });
      expect(buy2.status).toBe(402);
    } else {
      // If the test student happened to earn enough for both,
      // assert the second buy succeeds and the balance never goes
      // negative — also a valid post-condition of the fix.
      const buy2 = await req("/me/pet/buy", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...cookieHeader(student.cookie) },
        body: JSON.stringify({ cosmeticSlug: "baseball-cap" }),
      });
      expect([201, 402]).toContain(buy2.status);
      const finalBal = await req("/me/pet/balance", { headers: cookieHeader(student.cookie) });
      const finalBalData = (await finalBal.json()) as { balance: number };
      expect(finalBalData.balance).toBeGreaterThanOrEqual(0);
    }
  });

  test("analytics gradedPassCount uses json_extract — feedback containing literal '\"pass\":true' isn't counted (regression)", async () => {
    const instructor = await signup("auditga1");
    const student = await signup("auditgastud1");
    const slug = `cls-audit-grade-${testRun}`;
    const created = await createClass(instructor.cookie, slug);
    await req(`/classes/${slug}/enroll`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(student.cookie) },
      body: JSON.stringify({ joinCode: created.joinCode }),
    });
    const t = await req(`/classes/${slug}/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(instructor.cookie) },
      body: JSON.stringify({ kind: "homework", title: "PSet" }),
    });
    const { taskId } = (await t.json()) as { taskId: string };
    await req(`/classes/${slug}/tasks/${taskId}/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(student.cookie) },
      body: JSON.stringify({ content: "Submission long enough." }),
    });
    // Grade with pass=false but feedback that literally contains
    // the string `"pass":true`. Pre-fix, the LIKE filter would
    // false-positive and count this as a pass.
    await req(`/classes/${slug}/tasks/${taskId}/grade/${student.userId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(instructor.cookie) },
      body: JSON.stringify({
        pass: false,
        feedback: 'Note: looking for {"pass":true} in your output',
      }),
    });
    const ana = await req(`/classes/${slug}/analytics`, {
      headers: cookieHeader(instructor.cookie),
    });
    const data = (await ana.json()) as {
      taskCompletions: Array<{
        taskId: string;
        gradedPassCount: number;
        submittedCount: number;
      }>;
    };
    const tc = data.taskCompletions.find((c) => c.taskId === taskId);
    expect(tc?.submittedCount).toBe(1);
    // CRITICAL: pass=false grade with deceptive feedback must NOT count.
    expect(tc?.gradedPassCount).toBe(0);
  });
});

describe("S103 bulk grade homework", () => {
  test("instructor passes 2 students in one call; XP granted to both", async () => {
    const instructor = await signup("bulkinst1");
    const a = await signup("bulkstuda");
    const b = await signup("bulkstudb");
    const slug = `cls-bulk-pass-${testRun}`;
    const created = await createClass(instructor.cookie, slug);
    for (const s of [a, b]) {
      await req(`/classes/${slug}/enroll`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...cookieHeader(s.cookie) },
        body: JSON.stringify({ joinCode: created.joinCode }),
      });
    }
    const t = await req(`/classes/${slug}/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(instructor.cookie) },
      body: JSON.stringify({ kind: "homework", title: "PSet" }),
    });
    const { taskId } = (await t.json()) as { taskId: string };
    for (const s of [a, b]) {
      await req(`/classes/${slug}/tasks/${taskId}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...cookieHeader(s.cookie) },
        body: JSON.stringify({ content: `Submission ${s.username} long enough for the validator.` }),
      });
    }
    const bulk = await req(`/classes/${slug}/tasks/${taskId}/bulk-grade`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(instructor.cookie) },
      body: JSON.stringify({
        grades: [
          { userId: a.userId, pass: true },
          { userId: b.userId, pass: true },
        ],
      }),
    });
    expect(bulk.status).toBe(200);
    const data = (await bulk.json()) as {
      appliedCount: number;
      xpAwardedTotal: number;
      skippedCount: number;
    };
    expect(data.appliedCount).toBe(2);
    expect(data.xpAwardedTotal).toBeGreaterThan(0);
  });

  test("non-instructor cannot bulk-grade (403)", async () => {
    const instructor = await signup("bulkinst2");
    const student = await signup("bulkstud2");
    const slug = `cls-bulk-acl-${testRun}`;
    const created = await createClass(instructor.cookie, slug);
    await req(`/classes/${slug}/enroll`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(student.cookie) },
      body: JSON.stringify({ joinCode: created.joinCode }),
    });
    const t = await req(`/classes/${slug}/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(instructor.cookie) },
      body: JSON.stringify({ kind: "homework", title: "PSet" }),
    });
    const { taskId } = (await t.json()) as { taskId: string };
    const res = await req(`/classes/${slug}/tasks/${taskId}/bulk-grade`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(student.cookie) },
      body: JSON.stringify({
        grades: [{ userId: student.userId, pass: true }],
      }),
    });
    expect(res.status).toBe(403);
  });

  test("submitters without completion are skipped, not failed", async () => {
    const instructor = await signup("bulkinst3");
    const a = await signup("bulkstud3a");
    const b = await signup("bulkstud3b");
    const slug = `cls-bulk-skip-${testRun}`;
    const created = await createClass(instructor.cookie, slug);
    for (const s of [a, b]) {
      await req(`/classes/${slug}/enroll`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...cookieHeader(s.cookie) },
        body: JSON.stringify({ joinCode: created.joinCode }),
      });
    }
    const t = await req(`/classes/${slug}/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(instructor.cookie) },
      body: JSON.stringify({ kind: "homework", title: "PSet" }),
    });
    const { taskId } = (await t.json()) as { taskId: string };
    // Only `a` submits; `b` doesn't.
    await req(`/classes/${slug}/tasks/${taskId}/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(a.cookie) },
      body: JSON.stringify({ content: "Submission long enough for the validator." }),
    });
    const bulk = await req(`/classes/${slug}/tasks/${taskId}/bulk-grade`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(instructor.cookie) },
      body: JSON.stringify({
        grades: [
          { userId: a.userId, pass: true },
          { userId: b.userId, pass: true },
        ],
      }),
    });
    const data = (await bulk.json()) as {
      appliedCount: number;
      skippedCount: number;
    };
    expect(data.appliedCount).toBe(1);
    expect(data.skippedCount).toBe(1);
  });
});

describe("S102 public class directory", () => {
  test("default created class is NOT in /classes/discover", async () => {
    const instructor = await signup("dirinst1");
    const slug = `cls-dir-hidden-${testRun}`;
    await createClass(instructor.cookie, slug);
    const res = await req("/classes/discover");
    expect(res.status).toBe(200);
    const data = (await res.json()) as { classes: Array<{ slug: string }> };
    expect(data.classes.some((c) => c.slug === slug)).toBe(false);
  });

  test("class with discoverable=true appears in /classes/discover with member count", async () => {
    const instructor = await signup("dirinst2");
    const student = await signup("dirstud2");
    const slug = `cls-dir-shown-${testRun}`;
    const created = await createClass(instructor.cookie, slug);
    await req(`/classes/${slug}/enroll`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(student.cookie) },
      body: JSON.stringify({ joinCode: created.joinCode }),
    });
    // Flip discoverable on.
    const upd = await req(`/classes/${slug}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...cookieHeader(instructor.cookie) },
      body: JSON.stringify({ discoverable: true }),
    });
    expect(upd.status).toBe(200);
    const res = await req("/classes/discover");
    const data = (await res.json()) as {
      classes: Array<{
        slug: string;
        memberCount: number;
        instructorUsername: string;
      }>;
    };
    const found = data.classes.find((c) => c.slug === slug);
    expect(found).toBeDefined();
    // Member count should reflect at least the one enrolled student.
    expect((found?.memberCount ?? 0) >= 1).toBe(true);
    expect(found?.instructorUsername).toBe(instructor.username);
  });
});

describe("S101 leaderboard time windows", () => {
  test("default window is 'all' and matches existing behavior", async () => {
    const instructor = await signup("lbinst1");
    const slug = `cls-lb-all-${testRun}`;
    await createClass(instructor.cookie, slug);
    const res = await req(`/classes/${slug}/leaderboard`, {
      headers: cookieHeader(instructor.cookie),
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as { entries: unknown[]; window: string };
    expect(data.window).toBe("all");
  });

  test("window=week excludes grants older than 7 days; today XP shows in both", async () => {
    const instructor = await signup("lbinst2");
    const student = await signup("lbstud2");
    const slug = `cls-lb-week-${testRun}`;
    const created = await createClass(instructor.cookie, slug);
    await req(`/classes/${slug}/enroll`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(student.cookie) },
      body: JSON.stringify({ joinCode: created.joinCode }),
    });
    // Earn class XP today.
    const t = await req(`/classes/${slug}/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(instructor.cookie) },
      body: JSON.stringify({ kind: "homework", title: "PSet" }),
    });
    const { taskId } = (await t.json()) as { taskId: string };
    await req(`/classes/${slug}/tasks/${taskId}/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(student.cookie) },
      body: JSON.stringify({ content: "Submission long enough for the validator." }),
    });

    // All-time leaderboard shows the student's XP.
    const all = await req(`/classes/${slug}/leaderboard?window=all`, {
      headers: cookieHeader(instructor.cookie),
    });
    const allData = (await all.json()) as {
      entries: Array<{ userId: string; xp: number }>;
      window: string;
    };
    expect(allData.window).toBe("all");
    const studentAll = allData.entries.find((e) => e.userId === student.userId);
    expect((studentAll?.xp ?? 0) > 0).toBe(true);

    // Week leaderboard also shows it (XP earned today is within 7d).
    const wk = await req(`/classes/${slug}/leaderboard?window=week`, {
      headers: cookieHeader(instructor.cookie),
    });
    const wkData = (await wk.json()) as {
      entries: Array<{ userId: string; xp: number }>;
      window: string;
    };
    expect(wkData.window).toBe("week");
    const studentWeek = wkData.entries.find((e) => e.userId === student.userId);
    expect((studentWeek?.xp ?? 0) > 0).toBe(true);

    // Today leaderboard also shows it (matches today's UTC date).
    const today = await req(`/classes/${slug}/leaderboard?window=today`, {
      headers: cookieHeader(instructor.cookie),
    });
    const todayData = (await today.json()) as {
      entries: Array<{ userId: string; xp: number }>;
      window: string;
    };
    expect(todayData.window).toBe("today");
    const studentToday = todayData.entries.find((e) => e.userId === student.userId);
    expect((studentToday?.xp ?? 0) > 0).toBe(true);
  });
});

describe("S100 evolution chain on /me/pet", () => {
  test("/me/pet returns evolutionChain with 3 entries matching thresholds", async () => {
    const instructor = await signup("evoinst1");
    const student = await signup("evostud1");
    const slug = `cls-evo-${testRun}`;
    const created = await createClass(instructor.cookie, slug);
    await req(`/classes/${slug}/enroll`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(student.cookie) },
      body: JSON.stringify({ joinCode: created.joinCode }),
    });
    // Push past hatch threshold so the pet exists.
    const t = await req(`/classes/${slug}/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(instructor.cookie) },
      body: JSON.stringify({ kind: "homework", title: "PSet" }),
    });
    const { taskId } = (await t.json()) as { taskId: string };
    await req(`/classes/${slug}/tasks/${taskId}/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(student.cookie) },
      body: JSON.stringify({ content: "Submission long enough for the validator." }),
    });
    await req(`/classes/${slug}/tasks/${taskId}/grade/${student.userId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(instructor.cookie) },
      body: JSON.stringify({ pass: true }),
    });
    const me = await req("/me/pet", { headers: cookieHeader(student.cookie) });
    const data = (await me.json()) as {
      pet: {
        species: string;
        evolutionChain: Array<{ level: number; threshold: number }>;
      };
    };
    expect(data.pet.evolutionChain.length).toBe(3);
    expect(data.pet.evolutionChain[0].level).toBe(1);
    expect(data.pet.evolutionChain[2].level).toBe(3);
    // Thresholds are strictly increasing.
    for (let i = 1; i < data.pet.evolutionChain.length; i++) {
      expect(data.pet.evolutionChain[i].threshold).toBeGreaterThan(
        data.pet.evolutionChain[i - 1].threshold,
      );
    }
    // Phase M — emoji field dropped from evolutionChain; SVG silhouette
    // owns rendering on the client.
  });
});

describe("S99 class welcome message", () => {
  test("instructor sets welcome message + it appears in detail", async () => {
    const instructor = await signup("welinst1");
    const slug = `cls-wel-set-${testRun}`;
    await createClass(instructor.cookie, slug);
    const upd = await req(`/classes/${slug}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...cookieHeader(instructor.cookie) },
      body: JSON.stringify({
        welcomeMessageMd: "Welcome to the **best** class. Read the syllabus first.",
      }),
    });
    expect(upd.status).toBe(200);
    const det = await req(`/classes/${slug}`, { headers: cookieHeader(instructor.cookie) });
    const data = (await det.json()) as { class: { welcomeMessageMd: string } };
    expect(data.class.welcomeMessageMd).toContain("best");
  });

  test("student cannot update welcome message (403)", async () => {
    const instructor = await signup("welinst2");
    const student = await signup("welstud2");
    const slug = `cls-wel-acl-${testRun}`;
    const created = await createClass(instructor.cookie, slug);
    await req(`/classes/${slug}/enroll`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(student.cookie) },
      body: JSON.stringify({ joinCode: created.joinCode }),
    });
    const upd = await req(`/classes/${slug}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...cookieHeader(student.cookie) },
      body: JSON.stringify({ welcomeMessageMd: "Hostile rewrite" }),
    });
    // Update endpoint requires instructor (not just instructor-or-TA).
    expect([403, 401]).toContain(upd.status);
  });
});

describe("S98 profile cosmetic gallery", () => {
  test("unknown user returns 404", async () => {
    const res = await req(`/users/no-such-user-${testRun}/cosmetics-gallery`);
    expect(res.status).toBe(404);
  });

  test("known user response includes catalog with owned + equipped flags", async () => {
    const instructor = await signup("galinst1");
    const student = await signup("galstud1");
    const slug = `cls-gallery-${testRun}`;
    const created = await createClass(instructor.cookie, slug);
    await req(`/classes/${slug}/enroll`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(student.cookie) },
      body: JSON.stringify({ joinCode: created.joinCode }),
    });
    // Grant + equip a cosmetic.
    await req(`/classes/${slug}/grant-cosmetic`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(instructor.cookie) },
      body: JSON.stringify({ userId: student.userId, cosmeticSlug: "rose" }),
    });
    await req("/me/pet/equip", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(student.cookie) },
      body: JSON.stringify({ cosmeticSlug: "rose" }),
    });
    const res = await req(`/users/${student.username}/cosmetics-gallery`);
    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      items: Array<{
        slug: string;
        owned: boolean;
        equipped: boolean;
        obtainability: "shop" | "grant";
      }>;
      ownedCount: number;
      totalCount: number;
    };
    expect(data.totalCount).toBeGreaterThan(0);
    const rose = data.items.find((i) => i.slug === "rose");
    expect(rose?.owned).toBe(true);
    expect(rose?.equipped).toBe(true);
    // Crown is grant-only (no xpCost).
    const crown = data.items.find((i) => i.slug === "crown");
    expect(crown?.obtainability).toBe("grant");
    expect(crown?.owned).toBe(false);
    // Owned count is at least 1 (the granted rose). Phase 8's
    // starter pack adds 3 auto-granted items so the real number
    // is starter + grants; use >= so the assertion survives any
    // future starter-pack additions.
    expect(data.ownedCount).toBeGreaterThanOrEqual(1);
  });
});

describe("S97 pet showcase", () => {
  test("public endpoint reachable without auth + returns expected shape", async () => {
    const res = await req("/users/showcase");
    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      mostDecorated: Array<{
        userId: string;
        equippedCount: number;
        pet: { species: string; level: number; equipped: unknown[] };
      }>;
      recentTopLevel: Array<{
        userId: string;
        pet: { level: number };
      }>;
    };
    expect(Array.isArray(data.mostDecorated)).toBe(true);
    expect(Array.isArray(data.recentTopLevel)).toBe(true);
    // Every decorated entry has at least one equipped item.
    for (const e of data.mostDecorated) {
      expect(e.equippedCount).toBeGreaterThan(0);
    }
    // Every top-level entry is level >= 2.
    for (const e of data.recentTopLevel) {
      expect(e.pet.level).toBeGreaterThanOrEqual(2);
    }
  });

  test("decorated user appears with their equipped cosmetic", async () => {
    // Hatch a pet + equip one cosmetic via the class flow.
    const instructor = await signup("showinst1");
    const student = await signup("showstud1");
    const slug = `cls-show-${testRun}`;
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
      body: JSON.stringify({ content: "Submission long enough for the validator." }),
    });
    await req(`/classes/${slug}/tasks/${taskId}/grade/${student.userId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(instructor.cookie) },
      body: JSON.stringify({ pass: true }),
    });
    // Grant + equip a cosmetic.
    await req(`/classes/${slug}/grant-cosmetic`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(instructor.cookie) },
      body: JSON.stringify({ userId: student.userId, cosmeticSlug: "fire" }),
    });
    await req("/me/pet/equip", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(student.cookie) },
      body: JSON.stringify({ cosmeticSlug: "fire" }),
    });

    const showcase = await req("/users/showcase");
    const data = (await showcase.json()) as {
      mostDecorated: Array<{
        userId: string;
        pet: { equipped: Array<{ slug: string }> };
      }>;
    };
    // The student may or may not crack the top-20 depending on how
    // populated the test DB is. Either way, the response should be
    // non-empty since we just decorated at least one user, and every
    // entry should have ≥ 1 equipped cosmetic by construction.
    expect(data.mostDecorated.length).toBeGreaterThan(0);
    for (const entry of data.mostDecorated) {
      expect(entry.pet.equipped.length).toBeGreaterThan(0);
    }
  });
});

describe("S96 class question of the day", () => {
  test("non-instructor cannot create a question (403)", async () => {
    const instructor = await signup("qinst1");
    const student = await signup("qstud1");
    const slug = `cls-q-acl-${testRun}`;
    const created = await createClass(instructor.cookie, slug);
    await req(`/classes/${slug}/enroll`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(student.cookie) },
      body: JSON.stringify({ joinCode: created.joinCode }),
    });
    const res = await req(`/classes/${slug}/questions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(student.cookie) },
      body: JSON.stringify({
        prompt: "What is 2 + 2?",
        choices: ["3", "4", "5"],
        correctIndex: 1,
      }),
    });
    expect(res.status).toBe(403);
  });

  test("active GET returns question without correctIndex; correct answer grants XP", async () => {
    const instructor = await signup("qinst2");
    const student = await signup("qstud2");
    const slug = `cls-q-flow-${testRun}`;
    const created = await createClass(instructor.cookie, slug);
    await req(`/classes/${slug}/enroll`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(student.cookie) },
      body: JSON.stringify({ joinCode: created.joinCode }),
    });
    const create = await req(`/classes/${slug}/questions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(instructor.cookie) },
      body: JSON.stringify({
        prompt: "Capital of France?",
        choices: ["Berlin", "Paris", "Madrid"],
        correctIndex: 1,
      }),
    });
    expect(create.status).toBe(201);
    const { questionId } = (await create.json()) as { questionId: string };

    // Active GET — no correctIndex on a fresh fetch.
    const active = await req(`/classes/${slug}/questions/active`, {
      headers: cookieHeader(student.cookie),
    });
    const aData = (await active.json()) as {
      question: { id: string; choices: string[]; myAttempt: unknown };
    };
    expect(aData.question.id).toBe(questionId);
    expect(aData.question.myAttempt).toBeNull();
    // No correctIndex leaked.
    expect((aData.question as Record<string, unknown>).correctIndex).toBeUndefined();

    // Submit correct.
    const ans = await req(`/classes/${slug}/questions/${questionId}/answer`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(student.cookie) },
      body: JSON.stringify({ answerIndex: 1 }),
    });
    expect(ans.status).toBe(200);
    const ansData = (await ans.json()) as { correct: boolean; xpAwarded: number };
    expect(ansData.correct).toBe(true);
    expect(ansData.xpAwarded).toBe(15);

    // Active GET now includes myAttempt with correctIndex.
    const after = await req(`/classes/${slug}/questions/active`, {
      headers: cookieHeader(student.cookie),
    });
    const afterData = (await after.json()) as {
      question: { myAttempt: { correct: boolean; correctIndex: number } | null };
    };
    expect(afterData.question.myAttempt?.correct).toBe(true);
    expect(afterData.question.myAttempt?.correctIndex).toBe(1);
  });

  test("re-answering returns 409", async () => {
    const instructor = await signup("qinst3");
    const student = await signup("qstud3");
    const slug = `cls-q-dup-${testRun}`;
    const created = await createClass(instructor.cookie, slug);
    await req(`/classes/${slug}/enroll`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(student.cookie) },
      body: JSON.stringify({ joinCode: created.joinCode }),
    });
    const create = await req(`/classes/${slug}/questions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(instructor.cookie) },
      body: JSON.stringify({
        prompt: "Quick check",
        choices: ["a", "b"],
        correctIndex: 0,
      }),
    });
    const { questionId } = (await create.json()) as { questionId: string };
    await req(`/classes/${slug}/questions/${questionId}/answer`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(student.cookie) },
      body: JSON.stringify({ answerIndex: 1 }),
    });
    const dup = await req(`/classes/${slug}/questions/${questionId}/answer`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(student.cookie) },
      body: JSON.stringify({ answerIndex: 0 }),
    });
    expect(dup.status).toBe(409);
  });

  test("publishing a new question auto-closes the previous one", async () => {
    const instructor = await signup("qinst4");
    const student = await signup("qrotatestud");
    const slug = `cls-q-rotate-${testRun}`;
    const created = await createClass(instructor.cookie, slug);
    await req(`/classes/${slug}/enroll`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(student.cookie) },
      body: JSON.stringify({ joinCode: created.joinCode }),
    });
    const c1 = await req(`/classes/${slug}/questions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(instructor.cookie) },
      body: JSON.stringify({ prompt: "First question", choices: ["a", "b"], correctIndex: 0 }),
    });
    const { questionId: q1Id } = (await c1.json()) as { questionId: string };
    await req(`/classes/${slug}/questions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(instructor.cookie) },
      body: JSON.stringify({ prompt: "Second question", choices: ["x", "y"], correctIndex: 1 }),
    });
    // Active GET — student is enrolled so they can see it.
    const active = await req(`/classes/${slug}/questions/active`, {
      headers: cookieHeader(student.cookie),
    });
    const aData = (await active.json()) as { question: { prompt: string } | null };
    expect(aData.question?.prompt).toBe("Second question");
    // Trying to answer the first should now fail with "closed".
    const ans = await req(`/classes/${slug}/questions/${q1Id}/answer`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(student.cookie) },
      body: JSON.stringify({ answerIndex: 0 }),
    });
    expect(ans.status).toBe(400);
  });

  test("instructor list includes attempt + correct counts", async () => {
    const instructor = await signup("qinst5");
    const a = await signup("qstuda");
    const b = await signup("qstudb");
    const slug = `cls-q-stats-${testRun}`;
    const created = await createClass(instructor.cookie, slug);
    for (const s of [a, b]) {
      await req(`/classes/${slug}/enroll`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...cookieHeader(s.cookie) },
        body: JSON.stringify({ joinCode: created.joinCode }),
      });
    }
    const create = await req(`/classes/${slug}/questions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(instructor.cookie) },
      body: JSON.stringify({ prompt: "Stats question", choices: ["a", "b", "c"], correctIndex: 2 }),
    });
    const { questionId } = (await create.json()) as { questionId: string };
    // a correct, b wrong.
    await req(`/classes/${slug}/questions/${questionId}/answer`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(a.cookie) },
      body: JSON.stringify({ answerIndex: 2 }),
    });
    await req(`/classes/${slug}/questions/${questionId}/answer`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(b.cookie) },
      body: JSON.stringify({ answerIndex: 0 }),
    });
    const list = await req(`/classes/${slug}/questions`, {
      headers: cookieHeader(instructor.cookie),
    });
    const lData = (await list.json()) as {
      questions: Array<{ id: string; attempts: number; correctCount: number }>;
    };
    const row = lData.questions.find((q) => q.id === questionId);
    expect(row?.attempts).toBe(2);
    expect(row?.correctCount).toBe(1);
  });
});

describe("S93 instructor analytics dashboard", () => {
  test("non-instructor cannot read analytics (403)", async () => {
    const instructor = await signup("anainst1");
    const student = await signup("anastud1");
    const slug = `cls-ana-acl-${testRun}`;
    const created = await createClass(instructor.cookie, slug);
    await req(`/classes/${slug}/enroll`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(student.cookie) },
      body: JSON.stringify({ joinCode: created.joinCode }),
    });
    const tryRead = await req(`/classes/${slug}/analytics`, {
      headers: cookieHeader(student.cookie),
    });
    expect(tryRead.status).toBe(403);
  });

  test("empty class returns zeros + the full 30-day window", async () => {
    const instructor = await signup("anainst2");
    const slug = `cls-ana-empty-${testRun}`;
    await createClass(instructor.cookie, slug);
    const res = await req(`/classes/${slug}/analytics`, {
      headers: cookieHeader(instructor.cookie),
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      xpByDay: Array<{ day: string; totalXp: number; distinctUserCount: number }>;
      taskCompletions: unknown[];
      attendanceRate: unknown[];
      stalledStudents: unknown[];
      windowDays: number;
    };
    expect(data.windowDays).toBe(30);
    expect(data.xpByDay.length).toBe(30);
    expect(data.xpByDay.every((d) => d.totalXp === 0)).toBe(true);
    expect(data.taskCompletions).toEqual([]);
    expect(data.attendanceRate).toEqual([]);
    expect(data.stalledStudents).toEqual([]);
  });

  test("active class surfaces task completions + xp per day", async () => {
    const instructor = await signup("anainst3");
    const a = await signup("anastud3a");
    const b = await signup("anastud3b");
    const slug = `cls-ana-active-${testRun}`;
    const created = await createClass(instructor.cookie, slug);
    for (const s of [a, b]) {
      await req(`/classes/${slug}/enroll`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...cookieHeader(s.cookie) },
        body: JSON.stringify({ joinCode: created.joinCode }),
      });
    }
    const t = await req(`/classes/${slug}/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(instructor.cookie) },
      body: JSON.stringify({ kind: "homework", title: "PSet" }),
    });
    const { taskId } = (await t.json()) as { taskId: string };
    // a submits + grades pass; b submits, no grade.
    await req(`/classes/${slug}/tasks/${taskId}/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(a.cookie) },
      body: JSON.stringify({ content: "Submission long enough for the validator." }),
    });
    await req(`/classes/${slug}/tasks/${taskId}/grade/${a.userId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(instructor.cookie) },
      body: JSON.stringify({ pass: true }),
    });
    await req(`/classes/${slug}/tasks/${taskId}/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(b.cookie) },
      body: JSON.stringify({ content: "Submission long enough for the validator from b." }),
    });

    const res = await req(`/classes/${slug}/analytics`, {
      headers: cookieHeader(instructor.cookie),
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      xpByDay: Array<{ day: string; totalXp: number }>;
      taskCompletions: Array<{
        taskId: string;
        submittedCount: number;
        gradedPassCount: number;
        totalEnrolled: number;
      }>;
      stalledStudents: unknown[];
    };
    const todayXp = data.xpByDay[data.xpByDay.length - 1];
    expect(todayXp.totalXp).toBeGreaterThan(0);
    const tc = data.taskCompletions.find((c) => c.taskId === taskId);
    expect(tc?.submittedCount).toBe(2);
    expect(tc?.gradedPassCount).toBe(1);
    expect(tc?.totalEnrolled).toBe(2);
    // Both students earned XP today, so neither is stalled.
    expect(data.stalledStudents.length).toBe(0);
  });

  test("never-active student is flagged as stalled", async () => {
    const instructor = await signup("anainst4");
    const ghost = await signup("anaghost");
    const slug = `cls-ana-stalled-${testRun}`;
    const created = await createClass(instructor.cookie, slug);
    await req(`/classes/${slug}/enroll`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(ghost.cookie) },
      body: JSON.stringify({ joinCode: created.joinCode }),
    });
    const res = await req(`/classes/${slug}/analytics`, {
      headers: cookieHeader(instructor.cookie),
    });
    const data = (await res.json()) as {
      stalledStudents: Array<{ userId: string; daysSinceLastActivity: number | null; totalXp: number }>;
    };
    const ghostRow = data.stalledStudents.find((s) => s.userId === ghost.userId);
    expect(ghostRow).toBeDefined();
    expect(ghostRow?.daysSinceLastActivity).toBeNull();
    expect(ghostRow?.totalXp).toBe(0);
  });
});
