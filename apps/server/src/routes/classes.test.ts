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
