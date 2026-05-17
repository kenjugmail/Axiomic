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
  classAnnouncements,
  classAttendance,
  classCompetitions,
  classEnrollments,
  classMaterials,
  classQuestions,
  classQuestionAttempts,
  classTaskCompletions,
  classTaskDiscussions,
  classTaskVariants,
  classTasks,
  classes,
  cohorts,
  petCosmetics,
  petInventory,
  petSkinInventory,
  pets,
  users,
  xpGrants,
  getDb,
} from "@axiomic/db";
import { requireAuth } from "../middleware/auth";
import { checkRateLimit } from "../lib/rateLimit";
import { env } from "../lib/envConfig";
import {
  buildWeaknessProfile,
  prebuildWeaknessContext,
} from "../lib/studentWeaknesses";
import {
  generateAssignmentVariant,
  variantSeed,
} from "../lib/generateAssignmentVariant";
import { gradeEssay } from "../lib/essayGrader";
import {
  requireEnrolledInClass,
  requireInstructor,
  requireInstructorOrTa,
} from "../middleware/classAuth";
import { grantXp, classXpForUser, XP_AMOUNTS } from "../lib/xp";
import { notify, notifyMany } from "../lib/notifications";
import { petSkinBySlug } from "../lib/pets";
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
  // S102 — opt-in to the public directory.
  discoverable: z.boolean().optional().default(false),
  // S106 — optional linked cohort. Caller must own the cohort at
  // the route layer (no schema FK).
  linkedCohortId: z.string().min(1).max(64).optional().nullable(),
});

const updateClassSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  term: z.string().max(40).optional(),
  description: z.string().max(2000).optional(),
  syllabusMd: z.string().max(50000).optional(),
  welcomeMessageMd: z.string().max(10000).optional(),
  discoverable: z.boolean().optional(),
  // S106 — set/clear the linked cohort. Pass null to unlink.
  linkedCohortId: z.string().min(1).max(64).nullable().optional(),
  status: z.enum(["active", "archived"]).optional(),
  // Phase 21 — class difficulty calibration + topic scope feeding
  // the AI variant generator. Null level + empty topic list = no
  // scoping; generator falls back to the base task body.
  level: z.enum(["intro", "undergrad", "grad"]).nullable().optional(),
  topicSlugs: z.array(z.string().min(1).max(120)).max(50).optional(),
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
  // Phase 23C — optional Classwork-tab grouping label.
  topic: z.string().min(1).max(80).nullable().optional(),
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

// Phase L — instructor skin grant (mirror of grantCosmeticSchema).
const grantSkinSchema = z.object({
  userId: z.string().min(1),
  skinSlug: slugSchema,
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
// GET /classes/discover — S102 public class directory. No auth
// required; returns active + discoverable classes with member
// counts so a logged-out visitor can browse what's available
// before signing up. MUST be registered before the /:slug route
// since Hono's path matching takes the literal path first when both
// are registered, but only when the literal route precedes — keep
// this above /:slug.
// S-audit fix — bound the directory at 100 entries so the public
// payload stays small as more instructors opt in.
const DISCOVER_LIMIT = 100;

classesRouter.get("/discover", async (c) => {
  const db = getDb();
  const rows = db
    .select({
      id: classes.id,
      slug: classes.slug,
      title: classes.title,
      term: classes.term,
      description: classes.description,
      welcomeMessageMd: classes.welcomeMessageMd,
      memberCount: sql<number>`(select count(*) from class_enrollments ce where ce.class_id = ${classes.id})`,
      instructorUsername: users.username,
      instructorDisplayName: users.displayName,
    })
    .from(classes)
    .innerJoin(users, eq(users.id, classes.instructorId))
    .where(and(eq(classes.discoverable, true), eq(classes.status, "active")))
    .orderBy(desc(classes.createdAt))
    .limit(DISCOVER_LIMIT)
    .all();
  return c.json({
    classes: rows.map((r) => ({
      slug: r.slug,
      title: r.title,
      term: r.term,
      description: r.description,
      welcomeMessageMd: r.welcomeMessageMd,
      memberCount: Number(r.memberCount),
      instructorUsername: r.instructorUsername,
      instructorDisplayName: r.instructorDisplayName,
    })),
  });
});

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

  // S106 — if a linkedCohortId is provided at create time, validate
  // that the caller owns that cohort. (Same check as on update.)
  if (data.linkedCohortId) {
    const cohort = db
      .select({ creatorId: cohorts.creatorId })
      .from(cohorts)
      .where(eq(cohorts.id, data.linkedCohortId))
      .get();
    if (!cohort) return c.json({ error: "Cohort not found" }, 404);
    if (cohort.creatorId !== user.id) {
      return c.json({ error: "You don't own that cohort" }, 403);
    }
  }

  db.insert(classes)
    .values({
      id,
      slug: data.slug,
      title: data.title.trim(),
      term: data.term ?? "",
      description: data.description ?? "",
      syllabusMd: data.syllabusMd ?? "",
      welcomeMessageMd: data.welcomeMessageMd ?? "",
      discoverable: data.discoverable ?? false,
      linkedCohortId: data.linkedCohortId ?? null,
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

  // Phase 21 — surface level + parsed topicSlugs so the edit page +
  // student-facing UI can read them. Empty array when the JSON is
  // malformed or absent.
  let topicSlugs: string[] = [];
  try {
    const parsed = JSON.parse(cls.topicSlugsJson);
    if (Array.isArray(parsed)) {
      topicSlugs = parsed.filter((s): s is string => typeof s === "string");
    }
  } catch {
    // ignore — empty list
  }

  return c.json({
    class: {
      id: cls.id,
      slug: cls.slug,
      title: cls.title,
      term: cls.term,
      description: cls.description,
      syllabusMd: cls.syllabusMd,
      welcomeMessageMd: cls.welcomeMessageMd,
      discoverable: cls.discoverable,
      linkedCohortId: cls.linkedCohortId,
      status: cls.status,
      level: cls.level,
      topicSlugs,
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
      // Phase 23C — null falls into the "(no topic)" bucket on the
      // Classwork tab.
      topic: t.topic,
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
    if (data.discoverable != null) patch.discoverable = data.discoverable;
    // S106 — linked cohort. null clears; a string sets. Validate
    // ownership at this layer (the schema has no FK).
    if (data.linkedCohortId !== undefined) {
      if (data.linkedCohortId === null) {
        patch.linkedCohortId = null;
      } else {
        const cohort = db
          .select({ creatorId: cohorts.creatorId })
          .from(cohorts)
          .where(eq(cohorts.id, data.linkedCohortId))
          .get();
        if (!cohort) return c.json({ error: "Cohort not found" }, 404);
        if (cohort.creatorId !== cls.instructorId) {
          return c.json({ error: "You don't own that cohort" }, 403);
        }
        patch.linkedCohortId = data.linkedCohortId;
      }
    }
    if (data.status != null) patch.status = data.status;
    // Phase 21 — accept null to clear level; an enum value to set.
    if (data.level !== undefined) patch.level = data.level;
    if (data.topicSlugs !== undefined) {
      patch.topicSlugsJson = JSON.stringify(data.topicSlugs);
    }

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
    //
    // S104 — fetch each member's ACTIVE pet (one of possibly many).
    // Join via users.activePetId so the leaderboard renders the
    // student's chosen public face, not whichever pet they hatched
    // first.
    const userIds = memberRows.map((m) => m.userId);
    const petRows = userIds.length
      ? db
          .select({
            petUserId: users.id,
            id: pets.id,
            userId: pets.userId,
            species: pets.species,
            name: pets.name,
            hatchedAt: pets.hatchedAt,
            level: pets.level,
          })
          .from(users)
          .innerJoin(pets, eq(pets.id, users.activePetId))
          .where(inArray(users.id, userIds))
          .all()
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
    const equippedByUser = new Map<string, Array<{ slot: string; slug: string; rarity: string; failSmall: boolean }>>();
    for (const e of equippedRows) {
      const cos = cosmeticBySlug.get(e.cosmeticSlug);
      if (!cos) continue;
      const list = equippedByUser.get(e.userId) ?? [];
      list.push({ slot: cos.slot, slug: cos.slug, rarity: cos.rarity, failSmall: cos.failSmall });
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
              // Phase M — levelEmoji removed; PetAvatar resolves
              // species visuals via the silhouette renderer.
              level: pet.level,
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
        topic: data.topic ?? null,
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
    if (data.topic !== undefined) patch.topic = data.topic;
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

// ---------- Phase 21 — AI-personalized assignment variants ----------

const generateVariantsSchema = z.object({
  regenerate: z.boolean().optional().default(false),
});

// POST /classes/:slug/tasks/:taskId/variants — instructor triggers
// bulk variant generation. One AI call per enrolled student.
// By default we skip students who already have a variant for this
// task; passing regenerate=true overwrites every existing row.
classesRouter.post(
  "/:slug/tasks/:taskId/variants",
  requireAuth,
  requireInstructor,
  zValidator("json", generateVariantsSchema),
  async (c) => {
    const cls = c.get("classRow");
    const user = c.get("user")!;
    const taskId = c.req.param("taskId")!;
    const { regenerate } = c.req.valid("json");

    if (
      env.NODE_ENV !== "test" &&
      !checkRateLimit(`variants-gen:${user.id}`, 10, 60_000)
    ) {
      return c.json({ error: "Rate limited. Slow down." }, 429);
    }

    const db = getDb();
    const task = db
      .select()
      .from(classTasks)
      .where(eq(classTasks.id, taskId))
      .get();
    if (!task || task.classId !== cls.id) {
      return c.json({ error: "Task not found" }, 404);
    }
    // Alias for the worker closure below — TypeScript can't preserve
    // the narrowing across the async boundary.
    const baseTask = task;

    // Pull every student enrollment (skip TAs and observers — they
    // don't submit homework). Instructor is implicit and also skipped.
    const students = db
      .select({ userId: classEnrollments.userId })
      .from(classEnrollments)
      .where(
        and(
          eq(classEnrollments.classId, cls.id),
          eq(classEnrollments.role, "student"),
        ),
      )
      .all();

    const existing = db
      .select({ studentId: classTaskVariants.studentId })
      .from(classTaskVariants)
      .where(eq(classTaskVariants.taskId, taskId))
      .all();
    const existingSet = new Set(existing.map((r) => r.studentId));

    let topicSlugs: string[] = [];
    try {
      const parsed = JSON.parse(cls.topicSlugsJson);
      if (Array.isArray(parsed)) {
        topicSlugs = parsed.filter((s): s is string => typeof s === "string");
      }
    } catch {
      // bad json — treat as empty
    }
    const level = (cls.level as "intro" | "undergrad" | "grad" | null) ?? null;

    // Phase 22A — partition into work + skipped up front so we
    // don't pay the AI cost for already-generated rows when
    // regenerate=false.
    const toProcess: Array<{ userId: string; alreadyExists: boolean }> = [];
    let skipped = 0;
    for (const s of students) {
      const alreadyExists = existingSet.has(s.userId);
      if (!regenerate && alreadyExists) {
        skipped++;
        continue;
      }
      toProcess.push({ userId: s.userId, alreadyExists });
    }

    // Phase 22A — hoist the masteryNodes/masteryPaths load out of
    // the per-student profile builder. The context is identical
    // across the batch; loading it once turns N table scans into
    // 1 and lets the inner profile build skip its own loader.
    const weaknessCtx = prebuildWeaknessContext();

    // Phase 22A — bounded-concurrency pool. AI providers can
    // handle a few concurrent requests cleanly but we don't want
    // to fire 30+ in parallel and trip their rate limits. 5 is
    // the sweet spot for our typical Ollama setup; tune via env
    // if a different ceiling matters.
    const concurrency = 5;
    const errors: Array<{ studentId: string; reason: string }> = [];
    let generated = 0;
    let cursor = 0;

    async function worker(): Promise<void> {
      while (cursor < toProcess.length) {
        const idx = cursor++;
        const item = toProcess[idx]!;
        try {
          const weakness = await buildWeaknessProfile(
            { userId: item.userId, topicSlugs, level },
            weaknessCtx,
          );
          const variant = await generateAssignmentVariant({
            baseTask: {
              title: baseTask.title,
              descriptionMd: baseTask.descriptionMd,
            },
            classMeta: { level, title: cls.title },
            weakness,
            seed: variantSeed(taskId, item.userId),
          });
          if (item.alreadyExists) {
            db.update(classTaskVariants)
              .set({
                promptMd: variant.promptMd,
                rubricJson: JSON.stringify(variant.rubric),
                weaknessSnapshotJson: JSON.stringify(weakness),
                generationSeed: variantSeed(taskId, item.userId),
                rationale: variant.rationale,
                generatedAt: new Date().toISOString(),
                generatedById: user.id,
              })
              .where(
                and(
                  eq(classTaskVariants.taskId, taskId),
                  eq(classTaskVariants.studentId, item.userId),
                ),
              )
              .run();
          } else {
            db.insert(classTaskVariants)
              .values({
                id: randomUUID(),
                taskId,
                studentId: item.userId,
                promptMd: variant.promptMd,
                rubricJson: JSON.stringify(variant.rubric),
                weaknessSnapshotJson: JSON.stringify(weakness),
                generationSeed: variantSeed(taskId, item.userId),
                rationale: variant.rationale,
                generatedById: user.id,
              })
              .run();
          }
          generated++;
        } catch (e) {
          const reason = e instanceof Error ? e.message : String(e);
          errors.push({ studentId: item.userId, reason });
        }
      }
    }

    const workerCount = Math.min(concurrency, Math.max(1, toProcess.length));
    await Promise.all(
      Array.from({ length: workerCount }, () => worker()),
    );

    return c.json({ generated, skipped, errors });
  },
);

// GET /classes/:slug/tasks/:taskId/variants — instructor list view.
// Returns each variant joined to the student's display info so the
// roster table can render without follow-up requests.
classesRouter.get(
  "/:slug/tasks/:taskId/variants",
  requireAuth,
  requireInstructorOrTa,
  async (c) => {
    const cls = c.get("classRow");
    const taskId = c.req.param("taskId")!;
    const db = getDb();
    const task = db
      .select({ classId: classTasks.classId })
      .from(classTasks)
      .where(eq(classTasks.id, taskId))
      .get();
    if (!task || task.classId !== cls.id) {
      return c.json({ error: "Task not found" }, 404);
    }
    const rows = db
      .select({
        id: classTaskVariants.id,
        studentId: classTaskVariants.studentId,
        studentUsername: users.username,
        studentDisplayName: users.displayName,
        promptMd: classTaskVariants.promptMd,
        rubricJson: classTaskVariants.rubricJson,
        rationale: classTaskVariants.rationale,
        generatedAt: classTaskVariants.generatedAt,
      })
      .from(classTaskVariants)
      .innerJoin(users, eq(classTaskVariants.studentId, users.id))
      .where(eq(classTaskVariants.taskId, taskId))
      .all();
    return c.json({
      variants: rows.map((r) => ({
        id: r.id,
        studentId: r.studentId,
        studentUsername: r.studentUsername,
        studentDisplayName: r.studentDisplayName,
        promptMd: r.promptMd,
        rubric: safeJson(r.rubricJson),
        rationale: r.rationale,
        generatedAt: r.generatedAt,
      })),
    });
  },
);

// GET /classes/:slug/tasks/:taskId/variant — any enrolled user gets
// their OWN variant (or null if no variant has been generated yet,
// in which case the UI falls back to the base task body).
classesRouter.get(
  "/:slug/tasks/:taskId/variant",
  requireAuth,
  requireEnrolledInClass,
  async (c) => {
    const cls = c.get("classRow");
    const me = c.get("user")!;
    const taskId = c.req.param("taskId")!;
    const db = getDb();
    const task = db
      .select({ classId: classTasks.classId })
      .from(classTasks)
      .where(eq(classTasks.id, taskId))
      .get();
    if (!task || task.classId !== cls.id) {
      return c.json({ error: "Task not found" }, 404);
    }
    const row = db
      .select()
      .from(classTaskVariants)
      .where(
        and(
          eq(classTaskVariants.taskId, taskId),
          eq(classTaskVariants.studentId, me.id),
        ),
      )
      .get();
    if (!row) return c.json({ variant: null });
    return c.json({
      variant: {
        id: row.id,
        promptMd: row.promptMd,
        rubric: safeJson(row.rubricJson),
        generatedAt: row.generatedAt,
      },
    });
  },
);

// Phase 22C — instructor inline-edit. The AI sometimes mis-targets;
// rather than re-burning a token on Regenerate, an instructor can
// hand-edit promptMd (or swap in a curated rubric) directly. The
// generatedAt bumps so the audit trail shows the manual touch.
const updateVariantSchema = z.object({
  promptMd: z.string().min(10).max(20_000).optional(),
  rubric: z
    .object({
      criteria: z
        .array(
          z.object({
            id: z.string().min(1).max(80),
            description: z.string().min(1).max(500),
            weight: z.number().positive().max(100).optional(),
          }),
        )
        .min(1)
        .max(10),
      passingScore: z.number().min(0).max(1),
    })
    .optional(),
  // Optional fresh rationale the instructor can leave for their
  // own future reference + the audit log.
  rationale: z.string().max(2000).optional(),
});

classesRouter.put(
  "/:slug/tasks/:taskId/variants/:studentId",
  requireAuth,
  requireInstructor,
  zValidator("json", updateVariantSchema),
  async (c) => {
    const cls = c.get("classRow");
    const user = c.get("user")!;
    const taskId = c.req.param("taskId")!;
    const studentId = c.req.param("studentId")!;
    const data = c.req.valid("json");
    const db = getDb();

    const task = db
      .select({ classId: classTasks.classId })
      .from(classTasks)
      .where(eq(classTasks.id, taskId))
      .get();
    if (!task || task.classId !== cls.id) {
      return c.json({ error: "Task not found" }, 404);
    }

    const existing = db
      .select({ id: classTaskVariants.id })
      .from(classTaskVariants)
      .where(
        and(
          eq(classTaskVariants.taskId, taskId),
          eq(classTaskVariants.studentId, studentId),
        ),
      )
      .get();
    if (!existing) {
      return c.json({ error: "Variant not found" }, 404);
    }

    if (
      data.promptMd === undefined &&
      data.rubric === undefined &&
      data.rationale === undefined
    ) {
      return c.json({ error: "Nothing to update" }, 400);
    }

    const patch: Record<string, unknown> = {
      generatedAt: new Date().toISOString(),
      generatedById: user.id,
    };
    if (data.promptMd !== undefined) patch.promptMd = data.promptMd;
    if (data.rubric !== undefined) patch.rubricJson = JSON.stringify(data.rubric);
    if (data.rationale !== undefined) patch.rationale = data.rationale;

    db.update(classTaskVariants)
      .set(patch)
      .where(eq(classTaskVariants.id, existing.id))
      .run();
    return c.json({ ok: true });
  },
);

function safeJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

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

    // Phase 21C — auto-grade homework variants. If the student has
    // a personalized variant with a structured rubric, run the AI
    // grader and write the result to gradeJson. Manual grades (via
    // /grade/:userId) still take precedence — that endpoint
    // overwrites gradeJson on its own. We skip auto-grading if the
    // homework has already been manually graded (existing.gradeJson
    // not null AND not aiGenerated).
    if (task.kind === "homework" && data.content) {
      const priorGrade = existing?.gradeJson
        ? (safeJson(existing.gradeJson) as { aiGenerated?: boolean } | null)
        : null;
      const manualGradeStands =
        priorGrade && priorGrade.aiGenerated !== true;
      if (!manualGradeStands) {
        const variant = db
          .select()
          .from(classTaskVariants)
          .where(
            and(
              eq(classTaskVariants.taskId, taskId),
              eq(classTaskVariants.studentId, user.id),
            ),
          )
          .get();
        if (variant) {
          // Phase 22B — fire-and-forget. The student gets an
          // immediate response; the AI-graded result lands on the
          // submission row when grading finishes (or never, if the
          // upstream times out — instructor falls back to manual).
          // The helper logs + swallows internally; the .catch is
          // defensive belt-and-suspenders to keep an unhandled
          // promise rejection from crashing the process.
          void autoGradeVariantSubmission({
            taskId,
            studentId: user.id,
            content: data.content,
            promptMd: variant.promptMd,
            rubricJson: variant.rubricJson,
          }).catch(() => {
            // already logged inside the helper
          });
        }
      }
    }

    return c.json({
      ok: true,
      xpGranted: result.granted ? result.amount : 0,
      petHatched: result.petHatched ?? null,
    });
  },
);

// Phase 21C — auto-grade a variant submission against its rubric.
// Stringifies the structured rubric as markdown so we can reuse the
// existing essay grader. Writes result back to
// classTaskCompletions.gradeJson with aiGenerated=true so a later
// manual grade can recognize + override it.
async function autoGradeVariantSubmission(opts: {
  taskId: string;
  studentId: string;
  content: string;
  promptMd: string;
  rubricJson: string;
}): Promise<void> {
  const db = getDb();
  let rubric: {
    criteria: Array<{ id: string; description: string; weight?: number }>;
    passingScore: number;
  } | null = null;
  try {
    rubric = JSON.parse(opts.rubricJson);
  } catch {
    // bad rubric — skip auto-grade entirely.
    return;
  }
  if (!rubric || !Array.isArray(rubric.criteria) || rubric.criteria.length === 0) {
    return;
  }
  // Convert structured rubric to a markdown checklist the existing
  // essay grader understands. maxScore = sum of weights (or count
  // when weights absent) so the returned score is comparable across
  // rubrics.
  const totalWeight = rubric.criteria.reduce(
    (s, c) => s + (c.weight ?? 1),
    0,
  );
  const rubricMd = rubric.criteria
    .map((c) => `- (${c.weight ?? 1} pts) ${c.description}`)
    .join("\n");

  try {
    // Phase 22B — 15 s ceiling on the upstream call so a stuck
    // provider doesn't pin the auto-grade helper forever. On
    // abort, gradeEssay's catch swallows the error and falls back
    // to its heuristic scorer; we still write a gradeJson so the
    // instructor sees something rather than null forever.
    const graded = await gradeEssay({
      promptMd: opts.promptMd,
      rubricMd,
      maxScore: totalWeight,
      essayResponse: opts.content,
      signal: AbortSignal.timeout(15_000),
    });
    const pass =
      graded.score / totalWeight >= rubric.passingScore;
    const gradeJson = JSON.stringify({
      score: graded.score,
      maxScore: totalWeight,
      pass,
      feedback: graded.feedbackMd,
      aiGenerated: true,
      gradedAt: new Date().toISOString(),
    });
    db.update(classTaskCompletions)
      .set({
        gradeJson,
        gradedAt: new Date().toISOString(),
      })
      .where(
        and(
          eq(classTaskCompletions.taskId, opts.taskId),
          eq(classTaskCompletions.userId, opts.studentId),
        ),
      )
      .run();
  } catch {
    // Auto-grade is best-effort. Failure leaves gradeJson null
    // and the instructor can grade manually.
  }
}

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

// POST /classes/:slug/tasks/:taskId/bulk-grade — S103. Grade many
// submissions in one request. Each entry { userId, pass, feedback? }
// applies the same logic as the per-user grade route + grants
// homework-graded-pass XP (idempotent on (userId, source, taskId)).
// Returns counts so the UI can flash a "graded N" toast.
const bulkGradeSchema = z.object({
  grades: z.array(
    z.object({
      userId: z.string().min(1),
      pass: z.boolean(),
      feedback: z.string().max(2000).optional().nullable(),
    }),
  ).min(1).max(200),
});

classesRouter.post(
  "/:slug/tasks/:taskId/bulk-grade",
  requireAuth,
  requireInstructorOrTa,
  zValidator("json", bulkGradeSchema),
  async (c) => {
    const cls = c.get("classRow");
    const taskId = c.req.param("taskId")!;
    const { grades } = c.req.valid("json");
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

    // S-audit fix — wrap the per-grade updates in a single
    // transaction so a failure half-way through can't leave the
    // class with some students graded and others not. grantXp is
    // called inside the transaction too — it does its own
    // INSERT-OR-IGNORE on xp_grants and is safe under nested
    // BEGIN/COMMIT in better-sqlite3 (savepoints).
    let appliedCount = 0;
    let skippedCount = 0;
    let xpAwardedTotal = 0;
    db.transaction((tx) => {
      for (const g of grades) {
        const completion = tx
          .select()
          .from(classTaskCompletions)
          .where(
            and(
              eq(classTaskCompletions.taskId, taskId),
              eq(classTaskCompletions.userId, g.userId),
            ),
          )
          .get();
        if (!completion) {
          // Skip users without a submission rather than 404'ing —
          // bulk ergonomics. UI can warn upfront.
          skippedCount++;
          continue;
        }
        tx.update(classTaskCompletions)
          .set({
            gradeJson: JSON.stringify({ pass: g.pass, feedback: g.feedback ?? null }),
            gradedAt: new Date().toISOString(),
          })
          .where(eq(classTaskCompletions.id, completion.id))
          .run();
        appliedCount++;
        if (g.pass) {
          // grantXp uses getDb() internally, not the tx handle, so
          // its writes commit independently. That's intentional —
          // even if a later iteration throws, already-applied XP
          // grants are idempotent and we don't want to roll them
          // back. The per-grade update inside tx will roll back
          // on throw, but the XP credit stands; on retry the
          // unique-on-(userId, source, sourceRefId) suppresses
          // duplicate grants.
          const r = grantXp({
            userId: g.userId,
            classId: cls.id,
            source: "homework-graded-pass",
            sourceRefId: taskId,
          });
          if (r.granted) xpAwardedTotal += r.amount;
        }
      }
    });
    return c.json({
      ok: true,
      appliedCount,
      skippedCount,
      xpAwardedTotal,
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
        `Earned the ${cosmetic.name} cosmetic`,
    });

    return c.json({ ok: true, alreadyOwned: false }, 201);
  },
);

// Phase L — POST /classes/:slug/grant-skin. Mirror of grant-cosmetic
// for the skin catalog. Same membership + idempotency rules.
classesRouter.post(
  "/:slug/grant-skin",
  requireAuth,
  requireInstructorOrTa,
  zValidator("json", grantSkinSchema),
  async (c) => {
    const cls = c.get("classRow");
    const granter = c.get("user")!;
    const { userId, skinSlug, note } = c.req.valid("json");
    const db = getDb();

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

    const skin = petSkinBySlug(skinSlug);
    if (!skin) return c.json({ error: "Skin not found" }, 404);

    const existing = db
      .select()
      .from(petSkinInventory)
      .where(
        and(
          eq(petSkinInventory.userId, userId),
          eq(petSkinInventory.skinSlug, skinSlug),
        ),
      )
      .get();
    if (existing) {
      db.update(petSkinInventory)
        .set({
          grantedById: granter.id,
          grantedInClassId: cls.id,
          grantedNote: note ?? null,
        })
        .where(eq(petSkinInventory.id, existing.id))
        .run();
      return c.json({ ok: true, alreadyOwned: true });
    }

    db.insert(petSkinInventory)
      .values({
        id: randomUUID(),
        userId,
        skinSlug,
        grantedById: granter.id,
        grantedInClassId: cls.id,
        grantedNote: note ?? null,
      })
      .run();

    void notify({
      recipientId: userId,
      actorId: granter.id,
      kind: "skin_granted",
      subjectType: "pet_skin",
      subjectId: skinSlug,
      contextSlug: cls.slug,
      preview:
        (note?.trim() ? `${note.trim()} — ` : "") +
        `Earned the ${skin.name} skin`,
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
            // S-audit fix — was a LIKE on the JSON string which
            // false-positives any feedback containing the literal
            // text '"pass":true'. Use SQLite's json_extract so we
            // read the actual boolean field. (json_extract returns
            // 1 for true, 0/null otherwise; we count rows where
            // it's 1.)
            gradedPassCount: sql<number>`sum(case when json_extract(${classTaskCompletions.gradeJson}, '$.pass') = 1 then 1 else 0 end)`,
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

// ---------- Phase 23A — class stream / announcements ----------

const createAnnouncementSchema = z.object({
  bodyMd: z.string().min(10).max(20_000),
  pinned: z.boolean().optional().default(false),
});

const updateAnnouncementSchema = z.object({
  bodyMd: z.string().min(10).max(20_000).optional(),
  pinned: z.boolean().optional(),
});

// GET /classes/:slug/announcements — any enrollee. Pinned-first,
// then newest. Capped at 50 because the stream isn't a paginated
// surface in v1.
classesRouter.get(
  "/:slug/announcements",
  requireAuth,
  requireEnrolledInClass,
  async (c) => {
    const cls = c.get("classRow");
    const db = getDb();
    const rows = db
      .select({
        id: classAnnouncements.id,
        authorId: classAnnouncements.authorId,
        authorUsername: users.username,
        authorDisplayName: users.displayName,
        bodyMd: classAnnouncements.bodyMd,
        pinned: classAnnouncements.pinned,
        createdAt: classAnnouncements.createdAt,
        updatedAt: classAnnouncements.updatedAt,
      })
      .from(classAnnouncements)
      .innerJoin(users, eq(classAnnouncements.authorId, users.id))
      .where(eq(classAnnouncements.classId, cls.id))
      .orderBy(desc(classAnnouncements.pinned), desc(classAnnouncements.createdAt))
      .limit(50)
      .all();
    return c.json({
      announcements: rows.map((r) => ({
        id: r.id,
        authorId: r.authorId,
        authorUsername: r.authorUsername,
        authorDisplayName: r.authorDisplayName,
        bodyMd: r.bodyMd,
        pinned: !!r.pinned,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      })),
    });
  },
);

// POST /classes/:slug/announcements — instructor or TA only.
// Throttled per author so a runaway script can't flood the stream.
classesRouter.post(
  "/:slug/announcements",
  requireAuth,
  requireInstructorOrTa,
  zValidator("json", createAnnouncementSchema),
  async (c) => {
    const cls = c.get("classRow");
    const user = c.get("user")!;
    const data = c.req.valid("json");
    if (
      env.NODE_ENV !== "test" &&
      !checkRateLimit(`class-announce:${user.id}`, 5, 60_000)
    ) {
      return c.json({ error: "Rate limited. Slow down." }, 429);
    }
    const id = randomUUID();
    const now = new Date().toISOString();
    const db = getDb();
    db.insert(classAnnouncements)
      .values({
        id,
        classId: cls.id,
        authorId: user.id,
        bodyMd: data.bodyMd,
        pinned: data.pinned ?? false,
        createdAt: now,
        updatedAt: now,
      })
      .run();

    // Phase 25A — fan out a notification to every enrollee except
    // the author. Best-effort: notifyMany swallows errors so a
    // notification failure can't break the post.
    const enrollees = db
      .select({ userId: classEnrollments.userId })
      .from(classEnrollments)
      .where(eq(classEnrollments.classId, cls.id))
      .all()
      .map((r) => r.userId)
      .filter((uid) => uid !== user.id);
    if (enrollees.length > 0) {
      const preview =
        data.bodyMd.length > 120
          ? data.bodyMd.slice(0, 117).trimEnd() + "…"
          : data.bodyMd;
      void notifyMany(enrollees, {
        actorId: user.id,
        kind: "class_announcement",
        subjectType: "class_announcement",
        subjectId: id,
        contextSlug: cls.slug,
        preview: `${cls.title}: ${preview}`,
      });
    }

    return c.json({ id }, 201);
  },
);

// PUT /classes/:slug/announcements/:id — author or instructor.
// TA-authored posts can be edited by the original author or by
// the instructor; non-author/non-instructor returns 403.
classesRouter.put(
  "/:slug/announcements/:id",
  requireAuth,
  requireInstructorOrTa,
  zValidator("json", updateAnnouncementSchema),
  async (c) => {
    const cls = c.get("classRow");
    const user = c.get("user")!;
    const id = c.req.param("id")!;
    const data = c.req.valid("json");
    if (data.bodyMd === undefined && data.pinned === undefined) {
      return c.json({ error: "Nothing to update" }, 400);
    }
    const db = getDb();
    const row = db
      .select()
      .from(classAnnouncements)
      .where(eq(classAnnouncements.id, id))
      .get();
    if (!row || row.classId !== cls.id) {
      return c.json({ error: "Announcement not found" }, 404);
    }
    if (row.authorId !== user.id && cls.instructorId !== user.id) {
      return c.json({ error: "Author or instructor only" }, 403);
    }
    const patch: Record<string, unknown> = {
      updatedAt: new Date().toISOString(),
    };
    if (data.bodyMd !== undefined) patch.bodyMd = data.bodyMd;
    if (data.pinned !== undefined) patch.pinned = data.pinned;
    db.update(classAnnouncements)
      .set(patch)
      .where(eq(classAnnouncements.id, id))
      .run();
    return c.json({ ok: true });
  },
);

// DELETE /classes/:slug/announcements/:id — author or instructor.
classesRouter.delete(
  "/:slug/announcements/:id",
  requireAuth,
  requireInstructorOrTa,
  async (c) => {
    const cls = c.get("classRow");
    const user = c.get("user")!;
    const id = c.req.param("id")!;
    const db = getDb();
    const row = db
      .select({
        id: classAnnouncements.id,
        classId: classAnnouncements.classId,
        authorId: classAnnouncements.authorId,
      })
      .from(classAnnouncements)
      .where(eq(classAnnouncements.id, id))
      .get();
    if (!row || row.classId !== cls.id) {
      return c.json({ error: "Announcement not found" }, 404);
    }
    if (row.authorId !== user.id && cls.instructorId !== user.id) {
      return c.json({ error: "Author or instructor only" }, 403);
    }
    db.delete(classAnnouncements)
      .where(eq(classAnnouncements.id, id))
      .run();
    return c.json({ ok: true });
  },
);

// ---------- Phase 23B — gradebook matrix ----------

// GET /classes/:slug/gradebook — instructor or TA only. Returns
// a students × tasks matrix the instructor can scan in one view.
// Computes per-student + per-task summaries server-side so the UI
// stays a thin renderer.
classesRouter.get(
  "/:slug/gradebook",
  requireAuth,
  requireInstructorOrTa,
  async (c) => {
    const cls = c.get("classRow");
    const db = getDb();

    const tasks = db
      .select({
        id: classTasks.id,
        title: classTasks.title,
        kind: classTasks.kind,
        dueAt: classTasks.dueAt,
        topic: classTasks.topic,
      })
      .from(classTasks)
      .where(eq(classTasks.classId, cls.id))
      .orderBy(asc(classTasks.dueAt), desc(classTasks.createdAt))
      .all();

    const studentsRows = db
      .select({
        userId: classEnrollments.userId,
        username: users.username,
        displayName: users.displayName,
        role: classEnrollments.role,
      })
      .from(classEnrollments)
      .innerJoin(users, eq(classEnrollments.userId, users.id))
      .where(
        and(
          eq(classEnrollments.classId, cls.id),
          eq(classEnrollments.role, "student"),
        ),
      )
      .orderBy(asc(users.username))
      .all();

    if (tasks.length === 0 || studentsRows.length === 0) {
      return c.json({
        tasks: tasks.map((t) => ({
          id: t.id,
          title: t.title,
          kind: t.kind,
          dueAt: t.dueAt,
          topic: t.topic,
        })),
        students: studentsRows.map((s) => ({
          userId: s.userId,
          username: s.username,
          displayName: s.displayName,
        })),
        cells: [],
      });
    }

    const taskIds = tasks.map((t) => t.id);
    const completions = db
      .select({
        taskId: classTaskCompletions.taskId,
        userId: classTaskCompletions.userId,
        gradeJson: classTaskCompletions.gradeJson,
        wasLate: classTaskCompletions.wasLate,
        submittedAt: classTaskCompletions.submittedAt,
        gradedAt: classTaskCompletions.gradedAt,
      })
      .from(classTaskCompletions)
      .where(inArray(classTaskCompletions.taskId, taskIds))
      .all();

    interface Cell {
      taskId: string;
      userId: string;
      status: "missing" | "submitted" | "passed" | "failed";
      score: number | null;
      maxScore: number | null;
      wasLate: boolean;
      submittedAt: string | null;
      aiGenerated: boolean;
    }
    const cells: Cell[] = [];
    const cellByPair = new Map<string, Cell>();
    for (const comp of completions) {
      let parsed: {
        score?: number;
        maxScore?: number;
        pass?: boolean;
        aiGenerated?: boolean;
      } | null = null;
      if (comp.gradeJson) {
        try {
          parsed = JSON.parse(comp.gradeJson);
        } catch {
          // ignore — treat as ungraded
        }
      }
      let status: Cell["status"] = "submitted";
      if (parsed && typeof parsed.pass === "boolean") {
        status = parsed.pass ? "passed" : "failed";
      }
      const cell: Cell = {
        taskId: comp.taskId,
        userId: comp.userId,
        status,
        score: parsed?.score ?? null,
        maxScore: parsed?.maxScore ?? null,
        wasLate: !!comp.wasLate,
        submittedAt: comp.submittedAt,
        aiGenerated: parsed?.aiGenerated === true,
      };
      cells.push(cell);
      cellByPair.set(`${cell.taskId}::${cell.userId}`, cell);
    }
    // Fill in missing cells so the client doesn't have to
    // cross-reference taskIds × userIds itself.
    for (const t of tasks) {
      for (const s of studentsRows) {
        const key = `${t.id}::${s.userId}`;
        if (!cellByPair.has(key)) {
          cells.push({
            taskId: t.id,
            userId: s.userId,
            status: "missing",
            score: null,
            maxScore: null,
            wasLate: false,
            submittedAt: null,
            aiGenerated: false,
          });
        }
      }
    }

    return c.json({
      tasks: tasks.map((t) => ({
        id: t.id,
        title: t.title,
        kind: t.kind,
        dueAt: t.dueAt,
        topic: t.topic,
      })),
      students: studentsRows.map((s) => ({
        userId: s.userId,
        username: s.username,
        displayName: s.displayName,
      })),
      cells,
    });
  },
);

// ---------- Phase 24A — per-task discussion threads ----------

const createDiscussionSchema = z.object({
  bodyMd: z.string().min(5).max(4000),
});
const updateDiscussionSchema = z.object({
  bodyMd: z.string().min(5).max(4000),
});

// GET /classes/:slug/tasks/:taskId/discussions — any enrollee.
// Returns last 100 posts newest-first with author display info.
classesRouter.get(
  "/:slug/tasks/:taskId/discussions",
  requireAuth,
  requireEnrolledInClass,
  async (c) => {
    const cls = c.get("classRow");
    const taskId = c.req.param("taskId")!;
    const db = getDb();
    const task = db
      .select({ classId: classTasks.classId })
      .from(classTasks)
      .where(eq(classTasks.id, taskId))
      .get();
    if (!task || task.classId !== cls.id) {
      return c.json({ error: "Task not found" }, 404);
    }
    const rows = db
      .select({
        id: classTaskDiscussions.id,
        userId: classTaskDiscussions.userId,
        username: users.username,
        displayName: users.displayName,
        bodyMd: classTaskDiscussions.bodyMd,
        createdAt: classTaskDiscussions.createdAt,
        updatedAt: classTaskDiscussions.updatedAt,
      })
      .from(classTaskDiscussions)
      .innerJoin(users, eq(classTaskDiscussions.userId, users.id))
      .where(eq(classTaskDiscussions.taskId, taskId))
      .orderBy(desc(classTaskDiscussions.createdAt))
      .limit(100)
      .all();
    return c.json({ posts: rows });
  },
);

// POST /classes/:slug/tasks/:taskId/discussions — any enrollee.
// Rate-limited per author to keep a stuck client from flooding.
classesRouter.post(
  "/:slug/tasks/:taskId/discussions",
  requireAuth,
  requireEnrolledInClass,
  zValidator("json", createDiscussionSchema),
  async (c) => {
    const cls = c.get("classRow");
    const user = c.get("user")!;
    const taskId = c.req.param("taskId")!;
    const data = c.req.valid("json");
    if (
      env.NODE_ENV !== "test" &&
      !checkRateLimit(`task-discuss:${user.id}`, 10, 60_000)
    ) {
      return c.json({ error: "Rate limited. Slow down." }, 429);
    }
    const db = getDb();
    const task = db
      .select({ classId: classTasks.classId })
      .from(classTasks)
      .where(eq(classTasks.id, taskId))
      .get();
    if (!task || task.classId !== cls.id) {
      return c.json({ error: "Task not found" }, 404);
    }
    const id = randomUUID();
    const now = new Date().toISOString();
    db.insert(classTaskDiscussions)
      .values({
        id,
        taskId,
        userId: user.id,
        bodyMd: data.bodyMd,
        createdAt: now,
        updatedAt: now,
      })
      .run();

    // Phase 25A — notify the instructor + anyone who has submitted
    // on this task (they care if someone's asking questions about
    // it). De-duplicate; exclude the poster. notifyMany handles
    // empty-set gracefully.
    const submitters = db
      .select({ userId: classTaskCompletions.userId })
      .from(classTaskCompletions)
      .where(eq(classTaskCompletions.taskId, taskId))
      .all()
      .map((r) => r.userId);
    const recipients = [...new Set([cls.instructorId, ...submitters])].filter(
      (uid) => uid !== user.id,
    );
    if (recipients.length > 0) {
      // Look up the task title once for a useful preview.
      const taskRow = db
        .select({ title: classTasks.title })
        .from(classTasks)
        .where(eq(classTasks.id, taskId))
        .get();
      const preview =
        data.bodyMd.length > 120
          ? data.bodyMd.slice(0, 117).trimEnd() + "…"
          : data.bodyMd;
      void notifyMany(recipients, {
        actorId: user.id,
        kind: "class_discussion_post",
        subjectType: "class_task_discussion",
        subjectId: id,
        contextSlug: cls.slug,
        preview: taskRow ? `${taskRow.title}: ${preview}` : preview,
      });
    }

    return c.json({ id }, 201);
  },
);

// PUT /classes/:slug/tasks/:taskId/discussions/:id — author only.
classesRouter.put(
  "/:slug/tasks/:taskId/discussions/:id",
  requireAuth,
  requireEnrolledInClass,
  zValidator("json", updateDiscussionSchema),
  async (c) => {
    const cls = c.get("classRow");
    const user = c.get("user")!;
    const taskId = c.req.param("taskId")!;
    const id = c.req.param("id")!;
    const data = c.req.valid("json");
    const db = getDb();
    const row = db
      .select()
      .from(classTaskDiscussions)
      .where(eq(classTaskDiscussions.id, id))
      .get();
    if (!row || row.taskId !== taskId) {
      return c.json({ error: "Post not found" }, 404);
    }
    // Belt-and-suspenders: the row belongs to a task in this class.
    const task = db
      .select({ classId: classTasks.classId })
      .from(classTasks)
      .where(eq(classTasks.id, row.taskId))
      .get();
    if (!task || task.classId !== cls.id) {
      return c.json({ error: "Post not found" }, 404);
    }
    if (row.userId !== user.id) {
      return c.json({ error: "Author only" }, 403);
    }
    db.update(classTaskDiscussions)
      .set({ bodyMd: data.bodyMd, updatedAt: new Date().toISOString() })
      .where(eq(classTaskDiscussions.id, id))
      .run();
    return c.json({ ok: true });
  },
);

// DELETE /classes/:slug/tasks/:taskId/discussions/:id — author OR
// instructor (moderation escape hatch).
classesRouter.delete(
  "/:slug/tasks/:taskId/discussions/:id",
  requireAuth,
  requireEnrolledInClass,
  async (c) => {
    const cls = c.get("classRow");
    const user = c.get("user")!;
    const taskId = c.req.param("taskId")!;
    const id = c.req.param("id")!;
    const db = getDb();
    const row = db
      .select()
      .from(classTaskDiscussions)
      .where(eq(classTaskDiscussions.id, id))
      .get();
    if (!row || row.taskId !== taskId) {
      return c.json({ error: "Post not found" }, 404);
    }
    const task = db
      .select({ classId: classTasks.classId })
      .from(classTasks)
      .where(eq(classTasks.id, row.taskId))
      .get();
    if (!task || task.classId !== cls.id) {
      return c.json({ error: "Post not found" }, 404);
    }
    const isAuthor = row.userId === user.id;
    const isInstructor = cls.instructorId === user.id;
    if (!isAuthor && !isInstructor) {
      return c.json({ error: "Author or instructor only" }, 403);
    }
    db.delete(classTaskDiscussions)
      .where(eq(classTaskDiscussions.id, id))
      .run();
    return c.json({ ok: true });
  },
);

// ---------- Phase 24B — non-graded class materials ----------

const createMaterialSchema = z.object({
  title: z.string().min(1).max(200),
  descriptionMd: z.string().max(5000).optional().default(""),
  url: z.string().url().max(500).nullable().optional(),
  kind: z.enum(["note", "link", "file"]).optional().default("note"),
  sortOrder: z.number().int().min(-9999).max(9999).optional(),
});

const updateMaterialSchema = createMaterialSchema.partial();

// GET /classes/:slug/materials — any enrollee.
classesRouter.get(
  "/:slug/materials",
  requireAuth,
  requireEnrolledInClass,
  async (c) => {
    const cls = c.get("classRow");
    const rows = getDb()
      .select()
      .from(classMaterials)
      .where(eq(classMaterials.classId, cls.id))
      .orderBy(asc(classMaterials.sortOrder), asc(classMaterials.createdAt))
      .all();
    return c.json({
      materials: rows.map((r) => ({
        id: r.id,
        title: r.title,
        descriptionMd: r.descriptionMd,
        url: r.url,
        kind: r.kind as "note" | "link" | "file",
        sortOrder: r.sortOrder,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      })),
    });
  },
);

// POST /classes/:slug/materials — instructor or TA.
classesRouter.post(
  "/:slug/materials",
  requireAuth,
  requireInstructorOrTa,
  zValidator("json", createMaterialSchema),
  async (c) => {
    const cls = c.get("classRow");
    const user = c.get("user")!;
    const data = c.req.valid("json");
    const db = getDb();
    // Default sortOrder = max+1 so new materials land at the end.
    let sortOrder = data.sortOrder ?? 0;
    if (data.sortOrder === undefined) {
      const max = db
        .select({ m: sql<number>`MAX(${classMaterials.sortOrder})` })
        .from(classMaterials)
        .where(eq(classMaterials.classId, cls.id))
        .get();
      sortOrder = Number(max?.m ?? 0) + 1;
    }
    const id = randomUUID();
    const now = new Date().toISOString();
    db.insert(classMaterials)
      .values({
        id,
        classId: cls.id,
        title: data.title.trim(),
        descriptionMd: data.descriptionMd ?? "",
        url: data.url ?? null,
        kind: data.kind ?? "note",
        sortOrder,
        createdById: user.id,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    return c.json({ id }, 201);
  },
);

// PUT /classes/:slug/materials/:id — instructor or TA.
classesRouter.put(
  "/:slug/materials/:id",
  requireAuth,
  requireInstructorOrTa,
  zValidator("json", updateMaterialSchema),
  async (c) => {
    const cls = c.get("classRow");
    const id = c.req.param("id")!;
    const data = c.req.valid("json");
    const db = getDb();
    const row = db
      .select()
      .from(classMaterials)
      .where(eq(classMaterials.id, id))
      .get();
    if (!row || row.classId !== cls.id) {
      return c.json({ error: "Material not found" }, 404);
    }
    const patch: Record<string, unknown> = {
      updatedAt: new Date().toISOString(),
    };
    if (data.title !== undefined) patch.title = data.title.trim();
    if (data.descriptionMd !== undefined) patch.descriptionMd = data.descriptionMd;
    if (data.url !== undefined) patch.url = data.url;
    if (data.kind !== undefined) patch.kind = data.kind;
    if (data.sortOrder !== undefined) patch.sortOrder = data.sortOrder;
    db.update(classMaterials).set(patch).where(eq(classMaterials.id, id)).run();
    return c.json({ ok: true });
  },
);

// DELETE /classes/:slug/materials/:id — instructor or TA.
classesRouter.delete(
  "/:slug/materials/:id",
  requireAuth,
  requireInstructorOrTa,
  async (c) => {
    const cls = c.get("classRow");
    const id = c.req.param("id")!;
    const db = getDb();
    const row = db
      .select({ classId: classMaterials.classId })
      .from(classMaterials)
      .where(eq(classMaterials.id, id))
      .get();
    if (!row || row.classId !== cls.id) {
      return c.json({ error: "Material not found" }, 404);
    }
    db.delete(classMaterials).where(eq(classMaterials.id, id)).run();
    return c.json({ ok: true });
  },
);

// ---------- Phase 24D — clone task across classes ----------

const cloneTaskSchema = z.object({
  targetClassSlug: z.string().min(1).max(120),
});

classesRouter.post(
  "/:slug/tasks/:taskId/clone",
  requireAuth,
  requireInstructor,
  zValidator("json", cloneTaskSchema),
  async (c) => {
    const cls = c.get("classRow");
    const user = c.get("user")!;
    const taskId = c.req.param("taskId")!;
    const { targetClassSlug } = c.req.valid("json");
    const db = getDb();

    const sourceTask = db
      .select()
      .from(classTasks)
      .where(eq(classTasks.id, taskId))
      .get();
    if (!sourceTask || sourceTask.classId !== cls.id) {
      return c.json({ error: "Task not found" }, 404);
    }

    const target = db
      .select()
      .from(classes)
      .where(eq(classes.slug, targetClassSlug))
      .get();
    if (!target) {
      return c.json({ error: "Target class not found" }, 404);
    }
    if (target.instructorId !== user.id) {
      return c.json({ error: "You don't own the target class" }, 403);
    }
    if (target.status !== "active") {
      return c.json({ error: "Target class is archived" }, 400);
    }

    // Copy the task body but reset dueAt — clone is typically used
    // term-over-term where the schedule shifts. Variants are NOT
    // copied; they're a per-class personalization that the
    // instructor regenerates after enrollment lands in the target.
    const newId = randomUUID();
    db.insert(classTasks)
      .values({
        id: newId,
        classId: target.id,
        kind: sourceTask.kind,
        title: sourceTask.title,
        descriptionMd: sourceTask.descriptionMd,
        url: sourceTask.url,
        dueAt: null,
        xpReward: sourceTask.xpReward,
        topic: sourceTask.topic,
        createdById: user.id,
      })
      .run();
    return c.json({ taskId: newId, targetClassSlug }, 201);
  },
);
