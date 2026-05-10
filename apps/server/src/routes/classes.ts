// S86 — Classes router.
//
// A college-style class with an instructor, a roster, readings,
// homework, attendance, an XP-driven leaderboard, and a cosmetic
// grant flow. Instructors and TAs grant cosmetics to recognize
// students; students earn XP via reading + homework + attendance
// + the platform-wide engagement signals (lesson_completed etc.).
//
// Schema: see `packages/db/src/schema.ts` — `classes`,
// `class_enrollments`, `class_tasks`, `class_task_completions`,
// `class_attendance`. XP grants go through `apps/server/src/lib/xp.ts`.

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { randomUUID } from "crypto";
import {
  classAttendance,
  classCompetitions,
  classEnrollments,
  classQuestions,
  classQuestionAttempts,
  classTaskCompletions,
  classTasks,
  classes,
  petCosmetics,
  petInventory,
  pets,
  users,
  xpGrants,
  getDb,
} from "@axiomic/db";
import { requireAuth } from "../middleware/auth";
import {
  requireEnrolledInClass,
  requireInstructor,
  requireInstructorOrTa,
} from "../middleware/classAuth";
import { grantXp, classXpForUser, XP_AMOUNTS } from "../lib/xp";
import { notify } from "../lib/notifications";
import { emojiForSpeciesAtLevel } from "../lib/pets";
import type { Env } from "../env";

export const classesRouter = new Hono<Env>();

// --- helpers ---------------------------------------------------------

const slugSchema = z
  .string()
  .min(2)
  .max(80)
  .regex(/^[a-z0-9][a-z0-9-]*$/, "lowercase, digits, hyphens");

const dateOnlySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD");

const dueAtSchema = z
  .string()
  .max(40)
  .nullable()
  .optional();

const taskKindSchema = z.enum(["reading", "homework"]);
const attendanceStatusSchema = z.enum(["present", "absent", "late", "excused"]);
const enrollmentRoleSchema = z.enum(["student", "ta", "observer"]);

const createClassSchema = z.object({
  slug: slugSchema,
  title: z.string().min(1).max(200),
  term: z.string().max(40).optional().default(""),
  description: z.string().max(2000).optional().default(""),
  syllabusMd: z.string().max(50000).optional().default(""),
  // S99 — optional welcome message, markdown.
  welcomeMessageMd: z.string().max(10000).optional().default(""),
});

const updateClassSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  term: z.string().max(40).optional(),
  description: z.string().max(2000).optional(),
  syllabusMd: z.string().max(50000).optional(),
  welcomeMessageMd: z.string().max(10000).optional(),
  status: z.enum(["active", "archived"]).optional(),
});

const enrollSchema = z.object({
  joinCode: z.string().min(4).max(40),
});

const createTaskSchema = z.object({
  kind: taskKindSchema,
  title: z.string().min(1).max(200),
  descriptionMd: z.string().max(20000).optional().default(""),
  url: z.string().url().max(500).nullable().optional(),
  dueAt: dueAtSchema,
  xpReward: z.number().int().min(1).max(500).nullable().optional(),
});

const updateTaskSchema = createTaskSchema.partial().extend({
  kind: z.never().optional(),
});

const completeTaskSchema = z.object({
  // Reading completions can omit content. Homework requires it.
  content: z.string().max(20000).nullable().optional(),
});

const gradeTaskSchema = z.object({
  pass: z.boolean(),
  feedback: z.string().max(5000).optional().default(""),
});

const recordAttendanceSchema = z.object({
  sessionDate: dateOnlySchema,
  entries: z
    .array(
      z.object({
        userId: z.string().min(1),
        status: attendanceStatusSchema,
      }),
    )
    .min(1)
    .max(500),
});

const grantCosmeticSchema = z.object({
  userId: z.string().min(1),
  cosmeticSlug: slugSchema,
  note: z.string().max(500).optional().default(""),
});

const setEnrollmentRoleSchema = z.object({
  role: enrollmentRoleSchema,
});

// Compact alphanumeric join code (8 chars, no ambiguous 0/O 1/I).
function generateJoinCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 8; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

function defaultTaskXp(kind: "reading" | "homework"): number {
  return kind === "reading" ? XP_AMOUNTS["reading-done"] : XP_AMOUNTS["homework-submitted"];
}

function isDueLate(dueAt: string | null | undefined): boolean {
  if (!dueAt) return false;
  const due = Date.parse(dueAt);
  if (Number.isNaN(due)) return false;
  return Date.now() > due;
}

// --- routes ---------------------------------------------------------

// GET /classes — list classes I'm in (teaching or enrolled).
classesRouter.get("/", requireAuth, async (c) => {
  const user = c.get("user")!;
  const db = getDb();

  const teaching = db
    .select()
    .from(classes)
    .where(eq(classes.instructorId, user.id))
    .orderBy(desc(classes.createdAt))
    .all();

  const enrolledRows = db
    .select({
      classRow: classes,
      role: classEnrollments.role,
      joinedAt: classEnrollments.joinedAt,
    })
    .from(classEnrollments)
    .innerJoin(classes, eq(classEnrollments.classId, classes.id))
    .where(eq(classEnrollments.userId, user.id))
    .orderBy(desc(classEnrollments.joinedAt))
    .all();

  return c.json({
    teaching: teaching.map((cls) => ({ ...cls, role: "instructor" as const })),
    enrolled: enrolledRows.map((r) => ({ ...r.classRow, role: r.role })),
  });
});

// POST /classes — create. Caller becomes the instructor.
classesRouter.post("/", requireAuth, zValidator("json", createClassSchema), async (c) => {
  const user = c.get("user")!;
  const data = c.req.valid("json");
  const db = getDb();

  const collision = db
    .select({ id: classes.id })
    .from(classes)
    .where(eq(classes.slug, data.slug))
    .get();
  if (collision) return c.json({ error: "Slug already in use" }, 409);

  const id = randomUUID();
  // Retry up to 3 times on join-code collision.
  let joinCode = "";
  for (let i = 0; i < 3; i++) {
    joinCode = generateJoinCode();
    const dup = db
      .select({ id: classes.id })
      .from(classes)
      .where(eq(classes.joinCode, joinCode))
      .get();
    if (!dup) break;
    joinCode = "";
  }
  if (!joinCode) return c.json({ error: "Could not generate join code, retry" }, 500);

  db.insert(classes)
    .values({
      id,
      slug: data.slug,
      title: data.title.trim(),
      term: data.term ?? "",
      description: data.description ?? "",
      syllabusMd: data.syllabusMd ?? "",
      welcomeMessageMd: data.welcomeMessageMd ?? "",
      joinCode,
      instructorId: user.id,
    })
    .run();

  return c.json({ classId: id, slug: data.slug, joinCode }, 201);
});

// POST /classes/:slug/enroll — student joins via join code.
// The route reads the slug from the URL but the join code is the
// real authorizer. Using both means an attacker can't enumerate
// classes by slug — they need the code.
classesRouter.post(
  "/:slug/enroll",
  requireAuth,
  zValidator("json", enrollSchema),
  async (c) => {
    const slug = c.req.param("slug")!;
    const { joinCode } = c.req.valid("json");
    const user = c.get("user")!;
    const db = getDb();

    const cls = db
      .select()
      .from(classes)
      .where(and(eq(classes.slug, slug), eq(classes.joinCode, joinCode)))
      .get();
    if (!cls) return c.json({ error: "Class not found or join code invalid" }, 404);
    if (cls.status !== "active") {
      return c.json({ error: "Class is archived" }, 400);
    }
    if (cls.instructorId === user.id) {
      return c.json({ error: "Instructors cannot enroll in their own class" }, 400);
    }

    // Idempotent: a second enroll just returns the existing row.
    const existing = db
      .select()
      .from(classEnrollments)
      .where(
        and(
          eq(classEnrollments.classId, cls.id),
          eq(classEnrollments.userId, user.id),
        ),
      )
      .get();
    if (existing) {
      return c.json({ enrollmentId: existing.id, role: existing.role });
    }

    const id = randomUUID();
    db.insert(classEnrollments)
      .values({
        id,
        classId: cls.id,
        userId: user.id,
        role: "student",
      })
      .run();
    return c.json({ enrollmentId: id, role: "student" }, 201);
  },
);

// GET /classes/:slug — class detail. Roster + tasks + caller's
// own XP within the class. Full leaderboard is a separate endpoint.
classesRouter.get("/:slug", requireAuth, requireEnrolledInClass, async (c) => {
  const cls = c.get("classRow");
  const role = c.get("classRole");
  const user = c.get("user")!;
  const db = getDb();

  const instructor = db
    .select({ id: users.id, username: users.username, displayName: users.displayName })
    .from(users)
    .where(eq(users.id, cls.instructorId))
    .get();

  const enrollmentRows = db
    .select({
      userId: classEnrollments.userId,
      role: classEnrollments.role,
      joinedAt: classEnrollments.joinedAt,
      username: users.username,
      displayName: users.displayName,
    })
    .from(classEnrollments)
    .innerJoin(users, eq(classEnrollments.userId, users.id))
    .where(eq(classEnrollments.classId, cls.id))
    .all();

  const tasks = db
    .select()
    .from(classTasks)
    .where(eq(classTasks.classId, cls.id))
    .orderBy(asc(classTasks.dueAt), desc(classTasks.createdAt))
    .all();

  // Whether the caller has completed each task — UI uses this to
  // light up "done" badges next to assignments.
  const completedTaskIds = new Set(
    db
      .select({ taskId: classTaskCompletions.taskId })
      .from(classTaskCompletions)
      .where(eq(classTaskCompletions.userId, user.id))
      .all()
      .map((r) => r.taskId),
  );

  const myXp = classXpForUser(user.id, cls.id);

  // Hide the joinCode from non-instructors; surface it (so they can
  // share it with students) when the caller is teaching.
  const showJoinCode = role === "instructor" || role === "ta";

  return c.json({
    class: {
      id: cls.id,
      slug: cls.slug,
      title: cls.title,
      term: cls.term,
      description: cls.description,
      syllabusMd: cls.syllabusMd,
      welcomeMessageMd: cls.welcomeMessageMd,
      status: cls.status,
      instructor: instructor
        ? {
            id: instructor.id,
            username: instructor.username,
            displayName: instructor.displayName,
          }
        : null,
      joinCode: showJoinCode ? cls.joinCode : null,
      createdAt: cls.createdAt,
      updatedAt: cls.updatedAt,
    },
    myRole: role,
    myXp,
    roster: enrollmentRows.map((r) => ({
      userId: r.userId,
      username: r.username,
      displayName: r.displayName,
      role: r.role,
      joinedAt: r.joinedAt,
    })),
    tasks: tasks.map((t) => ({
      id: t.id,
      kind: t.kind as "reading" | "homework",
      title: t.title,
      descriptionMd: t.descriptionMd,
      url: t.url,
      dueAt: t.dueAt,
      xpReward: t.xpReward ?? defaultTaskXp(t.kind as "reading" | "homework"),
      createdAt: t.createdAt,
      myCompleted: completedTaskIds.has(t.id),
    })),
  });
});

// PUT /classes/:slug — instructor edit.
classesRouter.put(
  "/:slug",
  requireAuth,
  requireInstructor,
  zValidator("json", updateClassSchema),
  async (c) => {
    const cls = c.get("classRow");
    const data = c.req.valid("json");
    const db = getDb();

    const patch: Record<string, unknown> = {
      updatedAt: new Date().toISOString(),
    };
    if (data.title != null) patch.title = data.title.trim();
    if (data.term != null) patch.term = data.term;
    if (data.description != null) patch.description = data.description;
    if (data.syllabusMd != null) patch.syllabusMd = data.syllabusMd;
    if (data.welcomeMessageMd != null) patch.welcomeMessageMd = data.welcomeMessageMd;
    if (data.status != null) patch.status = data.status;

    db.update(classes).set(patch).where(eq(classes.id, cls.id)).run();
    return c.json({ ok: true });
  },
);

// POST /classes/:slug/rotate-code — instructor rotates the join code.
classesRouter.post("/:slug/rotate-code", requireAuth, requireInstructor, async (c) => {
  const cls = c.get("classRow");
  const db = getDb();
  let code = "";
  for (let i = 0; i < 3; i++) {
    code = generateJoinCode();
    const dup = db
      .select({ id: classes.id })
      .from(classes)
      .where(eq(classes.joinCode, code))
      .get();
    if (!dup) break;
    code = "";
  }
  if (!code) return c.json({ error: "Could not generate join code, retry" }, 500);
  db.update(classes)
    .set({ joinCode: code, updatedAt: new Date().toISOString() })
    .where(eq(classes.id, cls.id))
    .run();
  return c.json({ joinCode: code });
});

// PUT /classes/:slug/members/:userId/role — instructor can promote
// a student to TA (or back). Cannot demote yourself.
classesRouter.put(
  "/:slug/members/:userId/role",
  requireAuth,
  requireInstructor,
  zValidator("json", setEnrollmentRoleSchema),
  async (c) => {
    const cls = c.get("classRow");
    const targetUserId = c.req.param("userId")!;
    const { role } = c.req.valid("json");
    const db = getDb();

    if (targetUserId === cls.instructorId) {
      return c.json({ error: "Cannot change instructor's role" }, 400);
    }

    const updated = db
      .update(classEnrollments)
      .set({ role })
      .where(
        and(
          eq(classEnrollments.classId, cls.id),
          eq(classEnrollments.userId, targetUserId),
        ),
      )
      .run();
    if (((updated as unknown as { changes?: number }).changes ?? 0) === 0) {
      return c.json({ error: "Member not found in class" }, 404);
    }
    return c.json({ ok: true });
  },
);

// GET /classes/:slug/leaderboard — XP-ranked roster.
//
// S101 — accepts ?window=all|week|today. The "today" / "week"
// filters scope the XP sum to grants with awardedAt within the
// window so the leaderboard shows recency rather than just lifetime
// totals. Default is "all" (back-compat with the S86 behavior).
classesRouter.get(
  "/:slug/leaderboard",
  requireAuth,
  requireEnrolledInClass,
  async (c) => {
    const cls = c.get("classRow");
    const db = getDb();
    const windowParam = (c.req.query("window") ?? "all") as "all" | "week" | "today";
    // Map the window to a SQLite datetime cutoff. SQLite's
    // datetime('now', '-N days') normalizes to its own format; we
    // wrap awardedAt in datetime() to compare apples-to-apples since
    // grants may carry either ISO or YYYY-MM-DD HH:MM:SS strings.
    let xpWhere = eq(xpGrants.classId, cls.id);
    if (windowParam === "week") {
      xpWhere = and(
        xpWhere,
        sql`datetime(${xpGrants.awardedAt}) >= datetime('now', '-7 days')`,
      )!;
    } else if (windowParam === "today") {
      xpWhere = and(
        xpWhere,
        sql`date(${xpGrants.awardedAt}) = date('now')`,
      )!;
    }

    // Sum XP per user within this class for the requested window.
    const xpRows = db
      .select({
        userId: xpGrants.userId,
        xp: sql<number>`coalesce(sum(${xpGrants.amount}), 0)`,
      })
      .from(xpGrants)
      .where(xpWhere)
      .groupBy(xpGrants.userId)
      .all();
    const xpByUser = new Map(xpRows.map((r) => [r.userId, r.xp]));

    // Roster (instructor + enrolled).
    const memberRows = db
      .select({
        userId: classEnrollments.userId,
        role: classEnrollments.role,
        username: users.username,
        displayName: users.displayName,
      })
      .from(classEnrollments)
      .innerJoin(users, eq(classEnrollments.userId, users.id))
      .where(eq(classEnrollments.classId, cls.id))
      .all();

    // Pet + equipped cosmetics for each user — used by the UI to
    // render the leaderboard rows. One query each (simple, fine
    // for v1; can be a single join later if rosters get big).
    const userIds = memberRows.map((m) => m.userId);
    const petRows = userIds.length
      ? db.select().from(pets).where(inArray(pets.userId, userIds)).all()
      : [];
    const petByUser = new Map(petRows.map((p) => [p.userId, p]));

    const equippedRows = userIds.length
      ? db
          .select()
          .from(petInventory)
          .where(
            and(
              inArray(petInventory.userId, userIds),
              eq(petInventory.equipped, true),
            ),
          )
          .all()
      : [];
    const cosmeticSlugs = [...new Set(equippedRows.map((r) => r.cosmeticSlug))];
    const cosmeticRows = cosmeticSlugs.length
      ? db
          .select()
          .from(petCosmetics)
          .where(inArray(petCosmetics.slug, cosmeticSlugs))
          .all()
      : [];
    const cosmeticBySlug = new Map(cosmeticRows.map((r) => [r.slug, r]));
    const equippedByUser = new Map<string, Array<{ slot: string; emoji: string | null; slug: string }>>();
    for (const e of equippedRows) {
      const cos = cosmeticBySlug.get(e.cosmeticSlug);
      if (!cos) continue;
      const list = equippedByUser.get(e.userId) ?? [];
      list.push({ slot: cos.slot, emoji: cos.emoji, slug: cos.slug });
      equippedByUser.set(e.userId, list);
    }

    const entries = memberRows.map((m) => {
      const pet = petByUser.get(m.userId);
      return {
        userId: m.userId,
        username: m.username,
        displayName: m.displayName,
        role: m.role,
        xp: xpByUser.get(m.userId) ?? 0,
        pet: pet
          ? {
              species: pet.species,
              name: pet.name,
              equipped: equippedByUser.get(m.userId) ?? [],
              // S90 — evolution-aware emoji + level for the
              // leaderboard row's PetView.
              level: pet.level,
              levelEmoji: emojiForSpeciesAtLevel(pet.species, pet.level),
            }
          : null,
      };
    });

    entries.sort((a, b) => b.xp - a.xp);
    return c.json({ entries, window: windowParam });
  },
);

// --- tasks (readings + homework) -----------------------------------

// POST /classes/:slug/tasks — instructor or TA creates a task.
classesRouter.post(
  "/:slug/tasks",
  requireAuth,
  requireInstructorOrTa,
  zValidator("json", createTaskSchema),
  async (c) => {
    const cls = c.get("classRow");
    const user = c.get("user")!;
    const data = c.req.valid("json");
    if (cls.status !== "active") {
      return c.json({ error: "Class is archived" }, 400);
    }
    const db = getDb();
    const id = randomUUID();
    db.insert(classTasks)
      .values({
        id,
        classId: cls.id,
        kind: data.kind,
        title: data.title.trim(),
        descriptionMd: data.descriptionMd ?? "",
        url: data.url ?? null,
        dueAt: data.dueAt ?? null,
        xpReward: data.xpReward ?? null,
        createdById: user.id,
      })
      .run();
    return c.json({ taskId: id }, 201);
  },
);

// PUT /classes/:slug/tasks/:taskId — edit. Instructor or TA only.
classesRouter.put(
  "/:slug/tasks/:taskId",
  requireAuth,
  requireInstructorOrTa,
  zValidator("json", updateTaskSchema),
  async (c) => {
    const cls = c.get("classRow");
    const taskId = c.req.param("taskId")!;
    const data = c.req.valid("json");
    const db = getDb();

    const task = db
      .select()
      .from(classTasks)
      .where(eq(classTasks.id, taskId))
      .get();
    if (!task || task.classId !== cls.id) {
      return c.json({ error: "Task not found" }, 404);
    }

    const patch: Record<string, unknown> = {};
    if (data.title != null) patch.title = data.title.trim();
    if (data.descriptionMd != null) patch.descriptionMd = data.descriptionMd;
    if (data.url !== undefined) patch.url = data.url;
    if (data.dueAt !== undefined) patch.dueAt = data.dueAt;
    if (data.xpReward !== undefined) patch.xpReward = data.xpReward;
    if (Object.keys(patch).length === 0) return c.json({ ok: true });

    db.update(classTasks).set(patch).where(eq(classTasks.id, taskId)).run();
    return c.json({ ok: true });
  },
);

// DELETE /classes/:slug/tasks/:taskId — instructor or TA. Cascades
// to completions via the FK.
classesRouter.delete(
  "/:slug/tasks/:taskId",
  requireAuth,
  requireInstructorOrTa,
  async (c) => {
    const cls = c.get("classRow");
    const taskId = c.req.param("taskId")!;
    const db = getDb();
    const task = db
      .select({ id: classTasks.id, classId: classTasks.classId })
      .from(classTasks)
      .where(eq(classTasks.id, taskId))
      .get();
    if (!task || task.classId !== cls.id) {
      return c.json({ error: "Task not found" }, 404);
    }
    db.delete(classTasks).where(eq(classTasks.id, taskId)).run();
    return c.json({ ok: true });
  },
);

// POST /classes/:slug/tasks/:taskId/complete — student marks done.
// Reading: idempotent on (taskId, userId); content optional. XP
// granted on first completion only via the unique-index in xp_grants.
// Homework: same row pattern; content required + non-empty.
classesRouter.post(
  "/:slug/tasks/:taskId/complete",
  requireAuth,
  requireEnrolledInClass,
  zValidator("json", completeTaskSchema),
  async (c) => {
    const cls = c.get("classRow");
    const taskId = c.req.param("taskId")!;
    const user = c.get("user")!;
    const data = c.req.valid("json");
    const db = getDb();

    const task = db
      .select()
      .from(classTasks)
      .where(eq(classTasks.id, taskId))
      .get();
    if (!task || task.classId !== cls.id) {
      return c.json({ error: "Task not found" }, 404);
    }
    if (task.kind === "homework") {
      if (!data.content || data.content.trim().length < 5) {
        return c.json({ error: "Homework requires a writeup" }, 400);
      }
    }

    const wasLate = isDueLate(task.dueAt);

    // Upsert: (taskId, userId) is unique. Re-submission updates
    // content + clears prior grade so the instructor re-reviews.
    const existing = db
      .select()
      .from(classTaskCompletions)
      .where(
        and(
          eq(classTaskCompletions.taskId, taskId),
          eq(classTaskCompletions.userId, user.id),
        ),
      )
      .get();

    if (existing) {
      db.update(classTaskCompletions)
        .set({
          content: data.content ?? null,
          submittedAt: new Date().toISOString(),
          // Re-submission of a graded homework returns it to the
          // queue; instructor will re-grade.
          gradeJson: task.kind === "homework" ? null : existing.gradeJson,
          gradedAt: task.kind === "homework" ? null : existing.gradedAt,
        })
        .where(eq(classTaskCompletions.id, existing.id))
        .run();
    } else {
      db.insert(classTaskCompletions)
        .values({
          id: randomUUID(),
          taskId,
          userId: user.id,
          content: data.content ?? null,
          wasLate,
        })
        .run();
    }

    // XP grant. Idempotent on (userId, source, sourceRefId=taskId).
    const source = task.kind === "reading" ? "reading-done" : "homework-submitted";
    const result = grantXp({
      userId: user.id,
      classId: cls.id,
      source,
      sourceRefId: taskId,
      amount: task.xpReward ?? undefined,
    });

    return c.json({
      ok: true,
      xpGranted: result.granted ? result.amount : 0,
      petHatched: result.petHatched ?? null,
    });
  },
);

// POST /classes/:slug/tasks/:taskId/grade/:userId — instructor or
// TA grades a homework submission. Pass triggers a bonus XP grant.
classesRouter.post(
  "/:slug/tasks/:taskId/grade/:userId",
  requireAuth,
  requireInstructorOrTa,
  zValidator("json", gradeTaskSchema),
  async (c) => {
    const cls = c.get("classRow");
    const taskId = c.req.param("taskId")!;
    const targetUserId = c.req.param("userId")!;
    const { pass, feedback } = c.req.valid("json");
    const db = getDb();

    const task = db
      .select()
      .from(classTasks)
      .where(eq(classTasks.id, taskId))
      .get();
    if (!task || task.classId !== cls.id) {
      return c.json({ error: "Task not found" }, 404);
    }
    if (task.kind !== "homework") {
      return c.json({ error: "Only homework can be graded" }, 400);
    }

    const completion = db
      .select()
      .from(classTaskCompletions)
      .where(
        and(
          eq(classTaskCompletions.taskId, taskId),
          eq(classTaskCompletions.userId, targetUserId),
        ),
      )
      .get();
    if (!completion) {
      return c.json({ error: "No submission to grade" }, 404);
    }

    db.update(classTaskCompletions)
      .set({
        gradeJson: JSON.stringify({ pass, feedback }),
        gradedAt: new Date().toISOString(),
      })
      .where(eq(classTaskCompletions.id, completion.id))
      .run();

    let xpResult: ReturnType<typeof grantXp> | null = null;
    if (pass) {
      // Bonus XP keyed off (userId, 'homework-graded-pass', taskId)
      // so re-grading the same task with pass=true again is a no-op.
      xpResult = grantXp({
        userId: targetUserId,
        classId: cls.id,
        source: "homework-graded-pass",
        sourceRefId: taskId,
      });
    }
    return c.json({
      ok: true,
      xpGranted: xpResult?.granted ? xpResult.amount : 0,
    });
  },
);

// GET /classes/:slug/tasks/:taskId/submissions — instructor or TA
// view of all submissions for a task, with content + grade status.
classesRouter.get(
  "/:slug/tasks/:taskId/submissions",
  requireAuth,
  requireInstructorOrTa,
  async (c) => {
    const cls = c.get("classRow");
    const taskId = c.req.param("taskId")!;
    const db = getDb();
    const task = db
      .select()
      .from(classTasks)
      .where(eq(classTasks.id, taskId))
      .get();
    if (!task || task.classId !== cls.id) {
      return c.json({ error: "Task not found" }, 404);
    }
    const rows = db
      .select({
        id: classTaskCompletions.id,
        userId: classTaskCompletions.userId,
        username: users.username,
        displayName: users.displayName,
        content: classTaskCompletions.content,
        wasLate: classTaskCompletions.wasLate,
        gradeJson: classTaskCompletions.gradeJson,
        submittedAt: classTaskCompletions.submittedAt,
        gradedAt: classTaskCompletions.gradedAt,
      })
      .from(classTaskCompletions)
      .innerJoin(users, eq(classTaskCompletions.userId, users.id))
      .where(eq(classTaskCompletions.taskId, taskId))
      .orderBy(desc(classTaskCompletions.submittedAt))
      .all();
    return c.json({
      task: {
        id: task.id,
        kind: task.kind,
        title: task.title,
        descriptionMd: task.descriptionMd,
        url: task.url,
        dueAt: task.dueAt,
      },
      submissions: rows.map((r) => ({
        ...r,
        grade: r.gradeJson ? JSON.parse(r.gradeJson) : null,
      })),
    });
  },
);

// --- attendance ----------------------------------------------------

// POST /classes/:slug/attendance — instructor or TA records a session.
// Idempotent on (classId, userId, sessionDate); re-recording updates
// the prior status (e.g. someone shows up late after being marked
// absent). XP grants are still idempotent via xp_grants.unique so
// flipping absent→present a second time doesn't double-grant.
classesRouter.post(
  "/:slug/attendance",
  requireAuth,
  requireInstructorOrTa,
  zValidator("json", recordAttendanceSchema),
  async (c) => {
    const cls = c.get("classRow");
    const recorder = c.get("user")!;
    const { sessionDate, entries } = c.req.valid("json");
    const db = getDb();

    // Build a set of all user IDs that are valid members of this class
    // so we don't accept attendance for non-members.
    const memberIds = new Set([
      cls.instructorId,
      ...db
        .select({ userId: classEnrollments.userId })
        .from(classEnrollments)
        .where(eq(classEnrollments.classId, cls.id))
        .all()
        .map((r) => r.userId),
    ]);

    const grants: Array<{ userId: string; amount: number }> = [];
    for (const entry of entries) {
      if (!memberIds.has(entry.userId)) continue;
      const existing = db
        .select()
        .from(classAttendance)
        .where(
          and(
            eq(classAttendance.classId, cls.id),
            eq(classAttendance.userId, entry.userId),
            eq(classAttendance.sessionDate, sessionDate),
          ),
        )
        .get();
      if (existing) {
        db.update(classAttendance)
          .set({
            status: entry.status,
            recordedById: recorder.id,
            recordedAt: new Date().toISOString(),
          })
          .where(eq(classAttendance.id, existing.id))
          .run();
      } else {
        db.insert(classAttendance)
          .values({
            id: randomUUID(),
            classId: cls.id,
            userId: entry.userId,
            sessionDate,
            status: entry.status,
            recordedById: recorder.id,
          })
          .run();
      }
      // XP for present + late. The xp_grants unique index means
      // status changes can't double-count (sourceRefId encodes
      // the session, not the entry id).
      const source =
        entry.status === "present"
          ? "attendance-present"
          : entry.status === "late"
            ? "attendance-late"
            : null;
      if (source) {
        const refId = `${cls.id}|${entry.userId}|${sessionDate}`;
        const r = grantXp({
          userId: entry.userId,
          classId: cls.id,
          source,
          sourceRefId: refId,
        });
        if (r.granted) grants.push({ userId: entry.userId, amount: r.amount });
      }
    }
    return c.json({ ok: true, xpGrants: grants });
  },
);

// GET /classes/:slug/attendance?date=YYYY-MM-DD — instructor or TA view.
classesRouter.get(
  "/:slug/attendance",
  requireAuth,
  requireInstructorOrTa,
  async (c) => {
    const cls = c.get("classRow");
    const date = c.req.query("date");
    const db = getDb();

    const where = date
      ? and(eq(classAttendance.classId, cls.id), eq(classAttendance.sessionDate, date))
      : eq(classAttendance.classId, cls.id);

    const rows = db
      .select({
        id: classAttendance.id,
        userId: classAttendance.userId,
        username: users.username,
        displayName: users.displayName,
        sessionDate: classAttendance.sessionDate,
        status: classAttendance.status,
        recordedAt: classAttendance.recordedAt,
      })
      .from(classAttendance)
      .innerJoin(users, eq(classAttendance.userId, users.id))
      .where(where)
      .orderBy(desc(classAttendance.sessionDate), asc(users.username))
      .all();
    return c.json({ entries: rows });
  },
);

// --- cosmetic grants -----------------------------------------------

// POST /classes/:slug/grant-cosmetic — instructor or TA grants a
// cosmetic to a class member. Idempotent on (userId, cosmeticSlug)
// — granting the same cosmetic twice updates the note + leaves the
// inventory row alone.
classesRouter.post(
  "/:slug/grant-cosmetic",
  requireAuth,
  requireInstructorOrTa,
  zValidator("json", grantCosmeticSchema),
  async (c) => {
    const cls = c.get("classRow");
    const granter = c.get("user")!;
    const { userId, cosmeticSlug, note } = c.req.valid("json");
    const db = getDb();

    // Recipient must be a class member (instructor + enrolled).
    const isInstructor = userId === cls.instructorId;
    const enrollment = isInstructor
      ? null
      : db
          .select({ id: classEnrollments.id })
          .from(classEnrollments)
          .where(
            and(
              eq(classEnrollments.classId, cls.id),
              eq(classEnrollments.userId, userId),
            ),
          )
          .get();
    if (!isInstructor && !enrollment) {
      return c.json({ error: "Recipient is not a member of this class" }, 404);
    }

    const cosmetic = db
      .select()
      .from(petCosmetics)
      .where(eq(petCosmetics.slug, cosmeticSlug))
      .get();
    if (!cosmetic) return c.json({ error: "Cosmetic not found" }, 404);

    const existing = db
      .select()
      .from(petInventory)
      .where(
        and(
          eq(petInventory.userId, userId),
          eq(petInventory.cosmeticSlug, cosmeticSlug),
        ),
      )
      .get();
    if (existing) {
      // Already owned. Update the granted-by + note for record-keeping.
      db.update(petInventory)
        .set({
          grantedById: granter.id,
          grantedInClassId: cls.id,
          grantedNote: note ?? null,
        })
        .where(eq(petInventory.id, existing.id))
        .run();
      return c.json({ ok: true, alreadyOwned: true });
    }

    db.insert(petInventory)
      .values({
        id: randomUUID(),
        userId,
        cosmeticSlug,
        equipped: false,
        grantedById: granter.id,
        grantedInClassId: cls.id,
        grantedNote: note ?? null,
      })
      .run();

    // S88 — surface the grant in the recipient's notification bell.
    // Best-effort; notify() swallows errors so a failure here can't
    // block the grant.
    void notify({
      recipientId: userId,
      actorId: granter.id,
      kind: "cosmetic_granted",
      subjectType: "cosmetic",
      subjectId: cosmeticSlug,
      contextSlug: cls.slug,
      preview:
        (note?.trim() ? `${note.trim()} — ` : "") +
        `${cosmetic.emoji ?? ""} ${cosmetic.name}`.trim(),
    });

    return c.json({ ok: true, alreadyOwned: false }, 201);
  },
);

// --- competitions (S87) --------------------------------------------

// S87 added 'class-xp'. S88 adds 'reading-completions' — count of
// reading tasks the student finished during the window. Easy to
// extend: register the new value here, branch on it in
// computeStandings.
const competitionScoringRuleSchema = z.enum(["class-xp", "reading-completions"]);

const createCompetitionSchema = z
  .object({
    title: z.string().min(1).max(200),
    descriptionMd: z.string().max(20000).optional().default(""),
    startsAt: z.string().min(1),
    endsAt: z.string().min(1),
    scoringRule: competitionScoringRuleSchema.optional().default("class-xp"),
    prizeCosmeticSlug: slugSchema,
    prizeWinnerCount: z.number().int().min(1).max(20).optional().default(3),
  })
  .refine((d) => Date.parse(d.startsAt) < Date.parse(d.endsAt), {
    message: "endsAt must be after startsAt",
    path: ["endsAt"],
  });

const updateCompetitionSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  descriptionMd: z.string().max(20000).optional(),
  startsAt: z.string().min(1).optional(),
  endsAt: z.string().min(1).optional(),
  prizeCosmeticSlug: slugSchema.optional(),
  prizeWinnerCount: z.number().int().min(1).max(20).optional(),
});

// Compute standings for a competition based on its scoringRule.
// v1 supports 'class-xp': sum xp_grants in the class scope during
// [startsAt, endsAt]. New rules can plug in here without touching
// callers.
function computeStandings(comp: typeof classCompetitions.$inferSelect) {
  const db = getDb();
  if (comp.scoringRule === "class-xp") {
    // Normalize both sides through datetime() so the SQLite default
    // 'YYYY-MM-DD HH:MM:SS' format from xp_grants.awardedAt matches
    // the ISO 'YYYY-MM-DDTHH:MM:SS.sssZ' format used in startsAt /
    // endsAt. SQLite's datetime() coerces both to the canonical form.
    const rows = db
      .select({
        userId: xpGrants.userId,
        score: sql<number>`coalesce(sum(${xpGrants.amount}), 0)`,
      })
      .from(xpGrants)
      .where(
        and(
          eq(xpGrants.classId, comp.classId),
          sql`datetime(${xpGrants.awardedAt}) >= datetime(${comp.startsAt})`,
          sql`datetime(${xpGrants.awardedAt}) <= datetime(${comp.endsAt})`,
        ),
      )
      .groupBy(xpGrants.userId)
      .orderBy(desc(sql`coalesce(sum(${xpGrants.amount}), 0)`))
      .all();
    return rows.map((r) => ({ userId: r.userId, score: r.score }));
  }
  if (comp.scoringRule === "reading-completions") {
    // S88 — count completions of reading-kind tasks during the
    // window. Joining on tasks lets us filter by kind="reading".
    const rows = db
      .select({
        userId: classTaskCompletions.userId,
        score: sql<number>`count(*)`,
      })
      .from(classTaskCompletions)
      .innerJoin(classTasks, eq(classTasks.id, classTaskCompletions.taskId))
      .where(
        and(
          eq(classTasks.classId, comp.classId),
          eq(classTasks.kind, "reading"),
          sql`datetime(${classTaskCompletions.submittedAt}) >= datetime(${comp.startsAt})`,
          sql`datetime(${classTaskCompletions.submittedAt}) <= datetime(${comp.endsAt})`,
        ),
      )
      .groupBy(classTaskCompletions.userId)
      .orderBy(desc(sql`count(*)`))
      .all();
    return rows.map((r) => ({ userId: r.userId, score: r.score }));
  }
  return [];
}

// Distribute prizes: take top-N standings, INSERT OR IGNORE the
// prize cosmetic into each winner's inventory. Idempotent — a
// re-run grants nothing new because pet_inventory is unique on
// (userId, cosmeticSlug).
function distributePrizes(comp: typeof classCompetitions.$inferSelect): string[] {
  const db = getDb();
  const winners = computeStandings(comp).slice(0, comp.prizeWinnerCount);
  const winnerIds: string[] = [];
  // Resolve class slug once for notification context links.
  const cls = db
    .select({ slug: classes.slug })
    .from(classes)
    .where(eq(classes.id, comp.classId))
    .get();
  for (let i = 0; i < winners.length; i++) {
    const w = winners[i];
    const existing = db
      .select({ id: petInventory.id })
      .from(petInventory)
      .where(
        and(
          eq(petInventory.userId, w.userId),
          eq(petInventory.cosmeticSlug, comp.prizeCosmeticSlug),
        ),
      )
      .get();
    if (existing) {
      winnerIds.push(w.userId);
    } else {
      db.insert(petInventory)
        .values({
          id: randomUUID(),
          userId: w.userId,
          cosmeticSlug: comp.prizeCosmeticSlug,
          equipped: false,
          grantedById: comp.createdById,
          grantedInClassId: comp.classId,
          grantedNote: `Top ${comp.prizeWinnerCount} in "${comp.title}"`,
        })
        .run();
      winnerIds.push(w.userId);
    }
    // S88 — notify each winner. System-emitted (actorId=null) so
    // the message reads "You finished #N" rather than "Prof. X
    // sent you ...". The dedup index keys on actorId so a
    // re-distribution after re-publish would be allowed only if
    // the prior notification was already read — acceptable.
    void notify({
      recipientId: w.userId,
      actorId: null,
      kind: "competition_won",
      subjectType: "competition",
      subjectId: comp.id,
      contextSlug: cls?.slug ?? null,
      preview: `You finished #${i + 1} in "${comp.title}"`,
    });
  }
  db.update(classCompetitions)
    .set({
      status: "ended",
      prizesAwarded: true,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(classCompetitions.id, comp.id))
    .run();
  return winnerIds;
}

// Lazy end-and-distribute: called on every active-competition read.
// Flips status to 'ended' + grants prizes when wall-clock has
// crossed endsAt. Returns the (possibly mutated) row.
function maybeAutoEnd(
  comp: typeof classCompetitions.$inferSelect,
): typeof classCompetitions.$inferSelect {
  if (comp.status !== "active") return comp;
  if (comp.prizesAwarded) return comp;
  if (Date.now() < Date.parse(comp.endsAt)) return comp;
  distributePrizes(comp);
  return { ...comp, status: "ended", prizesAwarded: true };
}

function competitionDto(
  comp: typeof classCompetitions.$inferSelect,
  cosmeticEmoji: string | null,
  cosmeticName: string | null,
) {
  return {
    id: comp.id,
    classId: comp.classId,
    title: comp.title,
    descriptionMd: comp.descriptionMd,
    startsAt: comp.startsAt,
    endsAt: comp.endsAt,
    scoringRule: comp.scoringRule,
    prizeCosmeticSlug: comp.prizeCosmeticSlug,
    prizeCosmeticEmoji: cosmeticEmoji,
    prizeCosmeticName: cosmeticName,
    prizeWinnerCount: comp.prizeWinnerCount,
    status: comp.status,
    prizesAwarded: comp.prizesAwarded,
    createdAt: comp.createdAt,
    updatedAt: comp.updatedAt,
  };
}

// POST /classes/:slug/competitions — instructor or TA creates a
// draft competition. Validates that the prize cosmetic exists.
classesRouter.post(
  "/:slug/competitions",
  requireAuth,
  requireInstructorOrTa,
  zValidator("json", createCompetitionSchema),
  async (c) => {
    const cls = c.get("classRow");
    const user = c.get("user")!;
    const data = c.req.valid("json");
    if (cls.status !== "active") {
      return c.json({ error: "Class is archived" }, 400);
    }
    const db = getDb();
    const cosmetic = db
      .select({ id: petCosmetics.id })
      .from(petCosmetics)
      .where(eq(petCosmetics.slug, data.prizeCosmeticSlug))
      .get();
    if (!cosmetic) return c.json({ error: "Prize cosmetic not in catalog" }, 404);

    const id = randomUUID();
    db.insert(classCompetitions)
      .values({
        id,
        classId: cls.id,
        title: data.title.trim(),
        descriptionMd: data.descriptionMd ?? "",
        startsAt: data.startsAt,
        endsAt: data.endsAt,
        scoringRule: data.scoringRule,
        prizeCosmeticSlug: data.prizeCosmeticSlug,
        prizeWinnerCount: data.prizeWinnerCount,
        createdById: user.id,
      })
      .run();
    return c.json({ competitionId: id }, 201);
  },
);

// GET /classes/:slug/competitions — list, with each row's lazy
// auto-end applied so the UI sees the right status without
// requiring a per-row drill.
classesRouter.get(
  "/:slug/competitions",
  requireAuth,
  requireEnrolledInClass,
  async (c) => {
    const cls = c.get("classRow");
    const db = getDb();
    let rows = db
      .select()
      .from(classCompetitions)
      .where(eq(classCompetitions.classId, cls.id))
      .orderBy(desc(classCompetitions.createdAt))
      .all();
    rows = rows.map(maybeAutoEnd);

    // Attach prize cosmetic display data.
    const slugs = [...new Set(rows.map((r) => r.prizeCosmeticSlug))];
    const cosmeticRows = slugs.length
      ? db
          .select()
          .from(petCosmetics)
          .where(inArray(petCosmetics.slug, slugs))
          .all()
      : [];
    const cosmeticBySlug = new Map(cosmeticRows.map((r) => [r.slug, r]));
    return c.json({
      competitions: rows.map((r) => {
        const cos = cosmeticBySlug.get(r.prizeCosmeticSlug);
        return competitionDto(r, cos?.emoji ?? null, cos?.name ?? null);
      }),
    });
  },
);

// GET /classes/:slug/competitions/:competitionId — detail with
// current standings (top-N+5 entries so the UI can show "you placed
// 8th" context for non-winners).
classesRouter.get(
  "/:slug/competitions/:competitionId",
  requireAuth,
  requireEnrolledInClass,
  async (c) => {
    const cls = c.get("classRow");
    const competitionId = c.req.param("competitionId")!;
    const db = getDb();
    let comp = db
      .select()
      .from(classCompetitions)
      .where(eq(classCompetitions.id, competitionId))
      .get();
    if (!comp || comp.classId !== cls.id) {
      return c.json({ error: "Competition not found" }, 404);
    }
    comp = maybeAutoEnd(comp);

    const standings = computeStandings(comp);
    const userIds = standings.map((s) => s.userId);
    const userRows = userIds.length
      ? db
          .select({
            id: users.id,
            username: users.username,
            displayName: users.displayName,
          })
          .from(users)
          .where(inArray(users.id, userIds))
          .all()
      : [];
    const userById = new Map(userRows.map((u) => [u.id, u]));

    const cosmetic = db
      .select()
      .from(petCosmetics)
      .where(eq(petCosmetics.slug, comp.prizeCosmeticSlug))
      .get();

    return c.json({
      competition: competitionDto(comp, cosmetic?.emoji ?? null, cosmetic?.name ?? null),
      standings: standings.map((s, i) => ({
        rank: i + 1,
        userId: s.userId,
        username: userById.get(s.userId)?.username ?? null,
        displayName: userById.get(s.userId)?.displayName ?? null,
        score: s.score,
        isWinner: i < comp.prizeWinnerCount,
      })),
    });
  },
);

// PUT /classes/:slug/competitions/:competitionId — edit.
// Locked once status='ended'.
classesRouter.put(
  "/:slug/competitions/:competitionId",
  requireAuth,
  requireInstructorOrTa,
  zValidator("json", updateCompetitionSchema),
  async (c) => {
    const cls = c.get("classRow");
    const competitionId = c.req.param("competitionId")!;
    const data = c.req.valid("json");
    const db = getDb();

    const comp = db
      .select()
      .from(classCompetitions)
      .where(eq(classCompetitions.id, competitionId))
      .get();
    if (!comp || comp.classId !== cls.id) {
      return c.json({ error: "Competition not found" }, 404);
    }
    if (comp.status === "ended") {
      return c.json({ error: "Cannot edit an ended competition" }, 400);
    }

    if (data.prizeCosmeticSlug) {
      const cosmetic = db
        .select({ id: petCosmetics.id })
        .from(petCosmetics)
        .where(eq(petCosmetics.slug, data.prizeCosmeticSlug))
        .get();
      if (!cosmetic) return c.json({ error: "Prize cosmetic not in catalog" }, 404);
    }

    const patch: Record<string, unknown> = {
      updatedAt: new Date().toISOString(),
    };
    if (data.title != null) patch.title = data.title.trim();
    if (data.descriptionMd != null) patch.descriptionMd = data.descriptionMd;
    if (data.startsAt != null) patch.startsAt = data.startsAt;
    if (data.endsAt != null) patch.endsAt = data.endsAt;
    if (data.prizeCosmeticSlug != null) patch.prizeCosmeticSlug = data.prizeCosmeticSlug;
    if (data.prizeWinnerCount != null) patch.prizeWinnerCount = data.prizeWinnerCount;

    db.update(classCompetitions)
      .set(patch)
      .where(eq(classCompetitions.id, comp.id))
      .run();
    return c.json({ ok: true });
  },
);

// POST /classes/:slug/competitions/:competitionId/publish — flip
// draft → active.
classesRouter.post(
  "/:slug/competitions/:competitionId/publish",
  requireAuth,
  requireInstructorOrTa,
  async (c) => {
    const cls = c.get("classRow");
    const competitionId = c.req.param("competitionId")!;
    const db = getDb();
    const comp = db
      .select()
      .from(classCompetitions)
      .where(eq(classCompetitions.id, competitionId))
      .get();
    if (!comp || comp.classId !== cls.id) {
      return c.json({ error: "Competition not found" }, 404);
    }
    if (comp.status !== "draft") {
      return c.json({ error: `Already ${comp.status}` }, 400);
    }
    db.update(classCompetitions)
      .set({ status: "active", updatedAt: new Date().toISOString() })
      .where(eq(classCompetitions.id, comp.id))
      .run();
    return c.json({ ok: true });
  },
);

// POST /classes/:slug/competitions/:competitionId/end — manual end
// (e.g. instructor cuts an event short). Idempotent — a no-op if
// already ended.
classesRouter.post(
  "/:slug/competitions/:competitionId/end",
  requireAuth,
  requireInstructorOrTa,
  async (c) => {
    const cls = c.get("classRow");
    const competitionId = c.req.param("competitionId")!;
    const db = getDb();
    const comp = db
      .select()
      .from(classCompetitions)
      .where(eq(classCompetitions.id, competitionId))
      .get();
    if (!comp || comp.classId !== cls.id) {
      return c.json({ error: "Competition not found" }, 404);
    }
    if (comp.status === "ended") {
      return c.json({ ok: true, alreadyEnded: true });
    }
    if (comp.status === "draft") {
      return c.json({ error: "Publish before ending" }, 400);
    }
    const winners = distributePrizes(comp);
    return c.json({ ok: true, winners });
  },
);

// --- analytics (S93) -----------------------------------------------
//
// Instructor/TA-only dashboard surface. Aggregates the data already
// flowing into xp_grants, class_tasks, class_task_completions, and
// class_attendance into four widgets:
//
//   1. xpByDay: 30-day XP earned timeline (filled with zeros for
//      empty days so charts plot a continuous line).
//   2. taskCompletions: per-task submission + pass counts vs roster.
//   3. attendanceRate: per-session present/late/absent/excused.
//   4. stalledStudents: who hasn't earned XP in ≥7 days. Lets the
//      instructor reach out before a student fully disengages.
//
// All four read existing tables directly — no schema change. The
// queries are scoped to the class so an instructor of a 200-student
// class still gets a fast response.

const STALLED_THRESHOLD_DAYS = 7;
const ANALYTICS_DAY_WINDOW = 30;

classesRouter.get(
  "/:slug/analytics",
  requireAuth,
  requireInstructorOrTa,
  async (c) => {
    const cls = c.get("classRow");
    const db = getDb();

    // 1. xpByDay — sum xp_grants.amount per UTC day, last 30 days.
    // SQLite's strftime normalizes both ISO and 'YYYY-MM-DD HH:MM:SS'
    // timestamps to the same day key, so we don't need datetime()
    // wrappers like the competition-standings query did.
    const xpRows = db
      .select({
        day: sql<string>`strftime('%Y-%m-%d', ${xpGrants.awardedAt})`.as("day"),
        totalXp: sql<number>`coalesce(sum(${xpGrants.amount}), 0)`,
        distinctUserCount: sql<number>`count(distinct ${xpGrants.userId})`,
      })
      .from(xpGrants)
      .where(
        and(
          eq(xpGrants.classId, cls.id),
          sql`datetime(${xpGrants.awardedAt}) >= datetime('now', '-${sql.raw(String(ANALYTICS_DAY_WINDOW))} days')`,
        ),
      )
      .groupBy(sql`strftime('%Y-%m-%d', ${xpGrants.awardedAt})`)
      .all();
    const xpByDayMap = new Map(xpRows.map((r) => [r.day, r]));

    // Fill in zero rows so the chart shows the full window.
    const xpByDay: { day: string; totalXp: number; distinctUserCount: number }[] = [];
    const today = new Date();
    for (let i = ANALYTICS_DAY_WINDOW - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setUTCDate(d.getUTCDate() - i);
      const key = d.toISOString().slice(0, 10);
      const row = xpByDayMap.get(key);
      xpByDay.push({
        day: key,
        totalXp: Number(row?.totalXp ?? 0),
        distinctUserCount: Number(row?.distinctUserCount ?? 0),
      });
    }

    // Roster size for completion-rate denominators. Counts enrollments
    // including the instructor — close enough for a "x of y" chip.
    const enrolledRow = db
      .select({ n: sql<number>`count(*)` })
      .from(classEnrollments)
      .where(eq(classEnrollments.classId, cls.id))
      .get();
    const totalEnrolled = Number(enrolledRow?.n ?? 0);

    // 2. taskCompletions — per task, count submissions + passes.
    const tasksRows = db
      .select({
        id: classTasks.id,
        title: classTasks.title,
        kind: classTasks.kind,
        dueAt: classTasks.dueAt,
        createdAt: classTasks.createdAt,
      })
      .from(classTasks)
      .where(eq(classTasks.classId, cls.id))
      .orderBy(desc(classTasks.createdAt))
      .all();

    const taskIds = tasksRows.map((t) => t.id);
    const completionRows = taskIds.length
      ? db
          .select({
            taskId: classTaskCompletions.taskId,
            submittedCount: sql<number>`count(*)`,
            gradedPassCount: sql<number>`sum(case when ${classTaskCompletions.gradeJson} like '%"pass":true%' then 1 else 0 end)`,
          })
          .from(classTaskCompletions)
          .where(inArray(classTaskCompletions.taskId, taskIds))
          .groupBy(classTaskCompletions.taskId)
          .all()
      : [];
    const completionByTask = new Map(completionRows.map((r) => [r.taskId, r]));
    const taskCompletions = tasksRows.map((t) => {
      const c = completionByTask.get(t.id);
      return {
        taskId: t.id,
        title: t.title,
        kind: t.kind as "reading" | "homework",
        dueAt: t.dueAt,
        submittedCount: Number(c?.submittedCount ?? 0),
        gradedPassCount: Number(c?.gradedPassCount ?? 0),
        totalEnrolled,
      };
    });

    // 3. attendanceRate — per session, count statuses.
    const attendanceRows = db
      .select({
        sessionDate: classAttendance.sessionDate,
        status: classAttendance.status,
        n: sql<number>`count(*)`,
      })
      .from(classAttendance)
      .where(eq(classAttendance.classId, cls.id))
      .groupBy(classAttendance.sessionDate, classAttendance.status)
      .all();
    type AttendanceBucket = {
      sessionDate: string;
      presentCount: number;
      lateCount: number;
      absentCount: number;
      excusedCount: number;
    };
    const attendanceByDate = new Map<string, AttendanceBucket>();
    for (const r of attendanceRows) {
      const bucket = attendanceByDate.get(r.sessionDate) ?? {
        sessionDate: r.sessionDate,
        presentCount: 0,
        lateCount: 0,
        absentCount: 0,
        excusedCount: 0,
      };
      const n = Number(r.n);
      if (r.status === "present") bucket.presentCount = n;
      else if (r.status === "late") bucket.lateCount = n;
      else if (r.status === "absent") bucket.absentCount = n;
      else if (r.status === "excused") bucket.excusedCount = n;
      attendanceByDate.set(r.sessionDate, bucket);
    }
    const attendanceRate = [...attendanceByDate.values()].sort((a, b) =>
      a.sessionDate < b.sessionDate ? 1 : -1,
    );

    // 4. stalledStudents — per enrolled student, the most recent
    // xp_grants.awardedAt in this class. Anyone without a grant in
    // the last STALLED_THRESHOLD_DAYS days (or ever) is flagged.
    const memberRows = db
      .select({
        userId: classEnrollments.userId,
        username: users.username,
        displayName: users.displayName,
      })
      .from(classEnrollments)
      .innerJoin(users, eq(users.id, classEnrollments.userId))
      .where(eq(classEnrollments.classId, cls.id))
      .all();

    const memberIds = memberRows.map((m) => m.userId);
    const grantRows = memberIds.length
      ? db
          .select({
            userId: xpGrants.userId,
            lastAt: sql<string>`max(${xpGrants.awardedAt})`.as("lastAt"),
            totalXp: sql<number>`sum(${xpGrants.amount})`.as("totalXp"),
          })
          .from(xpGrants)
          .where(
            and(
              eq(xpGrants.classId, cls.id),
              inArray(xpGrants.userId, memberIds),
            ),
          )
          .groupBy(xpGrants.userId)
          .all()
      : [];
    const grantByUser = new Map(grantRows.map((g) => [g.userId, g]));
    const nowMs = Date.now();
    type Stalled = {
      userId: string;
      username: string;
      displayName: string | null;
      daysSinceLastActivity: number | null;
      totalXp: number;
    };
    const stalledStudents: Stalled[] = [];
    for (const m of memberRows) {
      const g = grantByUser.get(m.userId);
      if (!g) {
        // Never earned XP — implicitly stalled.
        stalledStudents.push({
          userId: m.userId,
          username: m.username,
          displayName: m.displayName,
          daysSinceLastActivity: null,
          totalXp: 0,
        });
        continue;
      }
      const lastMs = Date.parse(g.lastAt);
      const days = Math.floor((nowMs - lastMs) / 86_400_000);
      if (days >= STALLED_THRESHOLD_DAYS) {
        stalledStudents.push({
          userId: m.userId,
          username: m.username,
          displayName: m.displayName,
          daysSinceLastActivity: days,
          totalXp: Number(g.totalXp ?? 0),
        });
      }
    }
    // Most-stalled first; null (never-active) treated as the largest.
    stalledStudents.sort((a, b) => {
      const av = a.daysSinceLastActivity ?? Number.MAX_SAFE_INTEGER;
      const bv = b.daysSinceLastActivity ?? Number.MAX_SAFE_INTEGER;
      return bv - av;
    });

    return c.json({
      xpByDay,
      taskCompletions,
      attendanceRate,
      stalledStudents,
      totalEnrolled,
      stalledThresholdDays: STALLED_THRESHOLD_DAYS,
      windowDays: ANALYTICS_DAY_WINDOW,
    });
  },
);

// --- class question of the day (S96) -------------------------------
//
// Instructor-authored multiple-choice question scoped to one class.
// One question is "active" at a time per class — publishing a new
// one auto-closes the previous (sets endsAt = now). Students get
// one attempt; the right answer grants XP via the existing
// class-scoped grant flow so it shows up on the class leaderboard.

const createQuestionSchema = z.object({
  prompt: z.string().min(3).max(500),
  choices: z.array(z.string().min(1).max(200)).min(2).max(8),
  correctIndex: z.number().int().min(0).max(7),
}).refine((d) => d.correctIndex < d.choices.length, {
  message: "correctIndex must point to one of the choices",
  path: ["correctIndex"],
});

const answerQuestionSchema = z.object({
  answerIndex: z.number().int().min(0).max(7),
});

classesRouter.post(
  "/:slug/questions",
  requireAuth,
  requireInstructorOrTa,
  zValidator("json", createQuestionSchema),
  async (c) => {
    const cls = c.get("classRow");
    const author = c.get("user")!;
    const { prompt, choices, correctIndex } = c.req.valid("json");
    const db = getDb();

    db.update(classQuestions)
      .set({ endsAt: new Date().toISOString() })
      .where(and(eq(classQuestions.classId, cls.id), sql`${classQuestions.endsAt} is null`))
      .run();

    const id = randomUUID();
    db.insert(classQuestions)
      .values({
        id,
        classId: cls.id,
        authorId: author.id,
        prompt: prompt.trim(),
        choicesJson: JSON.stringify(choices),
        correctIndex,
      })
      .run();
    return c.json({ questionId: id }, 201);
  },
);

classesRouter.get(
  "/:slug/questions/active",
  requireAuth,
  requireEnrolledInClass,
  async (c) => {
    const cls = c.get("classRow");
    const me = c.get("user")!;
    const db = getDb();
    const q = db
      .select()
      .from(classQuestions)
      .where(and(eq(classQuestions.classId, cls.id), sql`${classQuestions.endsAt} is null`))
      .orderBy(desc(classQuestions.createdAt))
      .get();
    if (!q) return c.json({ question: null });

    const myAttempt = db
      .select()
      .from(classQuestionAttempts)
      .where(
        and(
          eq(classQuestionAttempts.questionId, q.id),
          eq(classQuestionAttempts.userId, me.id),
        ),
      )
      .get();

    return c.json({
      question: {
        id: q.id,
        prompt: q.prompt,
        choices: JSON.parse(q.choicesJson) as string[],
        startsAt: q.startsAt,
        myAttempt: myAttempt
          ? {
              answerIndex: myAttempt.answerIndex,
              correct: myAttempt.correct,
              correctIndex: q.correctIndex,
            }
          : null,
      },
    });
  },
);

classesRouter.post(
  "/:slug/questions/:questionId/answer",
  requireAuth,
  requireEnrolledInClass,
  zValidator("json", answerQuestionSchema),
  async (c) => {
    const cls = c.get("classRow");
    const me = c.get("user")!;
    const questionId = c.req.param("questionId")!;
    const { answerIndex } = c.req.valid("json");
    const db = getDb();

    const q = db
      .select()
      .from(classQuestions)
      .where(eq(classQuestions.id, questionId))
      .get();
    if (!q || q.classId !== cls.id) {
      return c.json({ error: "Question not found" }, 404);
    }
    if (q.endsAt) return c.json({ error: "Question is closed" }, 400);

    const choices = JSON.parse(q.choicesJson) as string[];
    if (answerIndex >= choices.length) {
      return c.json({ error: "answerIndex out of range" }, 400);
    }

    const existing = db
      .select({ id: classQuestionAttempts.id })
      .from(classQuestionAttempts)
      .where(
        and(
          eq(classQuestionAttempts.questionId, q.id),
          eq(classQuestionAttempts.userId, me.id),
        ),
      )
      .get();
    if (existing) return c.json({ error: "Already answered" }, 409);

    const correct = answerIndex === q.correctIndex;
    db.insert(classQuestionAttempts)
      .values({
        id: randomUUID(),
        questionId: q.id,
        userId: me.id,
        answerIndex,
        correct,
      })
      .run();

    let xpAwarded = 0;
    if (correct) {
      const r = grantXp({
        userId: me.id,
        classId: cls.id,
        source: "class-question-correct",
        sourceRefId: q.id,
      });
      xpAwarded = r.amount;
    }

    return c.json({
      correct,
      correctIndex: q.correctIndex,
      xpAwarded,
    });
  },
);

classesRouter.get(
  "/:slug/questions",
  requireAuth,
  requireInstructorOrTa,
  async (c) => {
    const cls = c.get("classRow");
    const db = getDb();
    const rows = db
      .select()
      .from(classQuestions)
      .where(eq(classQuestions.classId, cls.id))
      .orderBy(desc(classQuestions.createdAt))
      .all();

    const ids = rows.map((r) => r.id);
    const stats = ids.length
      ? db
          .select({
            questionId: classQuestionAttempts.questionId,
            attempts: sql<number>`count(*)`,
            correct: sql<number>`sum(case when ${classQuestionAttempts.correct} = 1 then 1 else 0 end)`,
          })
          .from(classQuestionAttempts)
          .where(inArray(classQuestionAttempts.questionId, ids))
          .groupBy(classQuestionAttempts.questionId)
          .all()
      : [];
    const statsByQ = new Map(stats.map((s) => [s.questionId, s]));

    return c.json({
      questions: rows.map((r) => {
        const s = statsByQ.get(r.id);
        return {
          id: r.id,
          prompt: r.prompt,
          choices: JSON.parse(r.choicesJson) as string[],
          correctIndex: r.correctIndex,
          startsAt: r.startsAt,
          endsAt: r.endsAt,
          attempts: Number(s?.attempts ?? 0),
          correctCount: Number(s?.correct ?? 0),
        };
      }),
    });
  },
);
