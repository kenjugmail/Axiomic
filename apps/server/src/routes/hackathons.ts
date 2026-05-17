// Phase 27 — Hackathons + engineering competitions.
//
// Tenant-level contests independent of classes. hostMode toggles
// gating: 'public' (anyone joins), 'class' (enrollees), 'cohort'
// (members). Each hackathon has its own teams, submissions,
// prize tiers, and reward fan-out (XP + cosmetic + skin + badge
// + notification per team member) — all idempotent so re-clicks
// are safe.

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, asc, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { randomUUID } from "crypto";
import {
  classEnrollments,
  classes,
  cohortMembers,
  cohorts,
  getDb,
  hackathonPrizeAwards,
  hackathonPrizes,
  hackathonSubmissions,
  hackathonTeamMembers,
  hackathonTeams,
  hackathons,
  petCosmetics,
  petInventory,
  petSkinInventory,
  userAchievements,
  users,
} from "@axiomic/db";
import { requireAuth, getSessionUser } from "../middleware/auth";
import { checkRateLimit } from "../lib/rateLimit";
import { env } from "../lib/envConfig";
import { notify, notifyMany } from "../lib/notifications";
import { grantXp } from "../lib/xp";
import { gradeEssay } from "../lib/essayGrader";
import type { Env } from "../env";

export const hackathonsRouter = new Hono<Env>();

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const HOST_MODES = ["public", "class", "cohort"] as const;
const STATUSES = [
  "draft",
  "registration",
  "active",
  "judging",
  "ended",
] as const;
const JUDGING_MODES = ["manual", "ai_rubric"] as const;

// ---------------- schemas ----------------

const rubricSchema = z.object({
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
});

const createHackathonSchema = z.object({
  slug: z.string().min(3).max(80).regex(SLUG_RE),
  title: z.string().min(1).max(200),
  descriptionMd: z.string().max(20000).optional().default(""),
  rulesMd: z.string().max(20000).optional().default(""),
  fieldTag: z.string().min(1).max(40).optional().default("other"),
  coverEmoji: z.string().min(1).max(8).optional().default("🏆"),
  hostMode: z.enum(HOST_MODES).optional().default("public"),
  hostClassSlug: z.string().min(1).max(120).nullable().optional(),
  hostCohortSlug: z.string().min(1).max(120).nullable().optional(),
  maxTeamSize: z.number().int().min(1).max(10).optional().default(4),
  judgingMode: z.enum(JUDGING_MODES).optional().default("manual"),
  rubric: rubricSchema.nullable().optional(),
  registrationOpensAt: z.string().datetime().nullable().optional(),
  registrationClosesAt: z.string().datetime().nullable().optional(),
  startsAt: z.string().datetime().nullable().optional(),
  endsAt: z.string().datetime().nullable().optional(),
});

const updateHackathonSchema = createHackathonSchema
  .partial()
  .extend({ slug: z.never().optional() });

const createPrizeSchema = z.object({
  rank: z.number().int().min(0).max(50).optional().default(0),
  title: z.string().min(1).max(200),
  descriptionMd: z.string().max(5000).optional().default(""),
  xpAmount: z.number().int().min(0).max(10000).optional().default(0),
  cosmeticSlug: z.string().min(1).max(120).nullable().optional(),
  skinSlug: z.string().min(1).max(120).nullable().optional(),
  badgeSlug: z.string().min(1).max(120).nullable().optional(),
  maxWinners: z.number().int().min(1).max(50).optional().default(1),
});

const updatePrizeSchema = createPrizeSchema.partial();

const createTeamSchema = z.object({
  name: z.string().min(1).max(120),
});

const submitProjectSchema = z.object({
  title: z.string().min(1).max(200),
  writeup: z.string().max(20000).optional().default(""),
  artifacts: z
    .array(
      z.object({
        kind: z.enum(["github", "colab", "demo", "paper", "other"]),
        url: z.string().url().max(500),
        label: z.string().min(1).max(120),
      }),
    )
    .max(10)
    .optional()
    .default([]),
});

const awardPrizeSchema = z.object({
  teamId: z.string().min(1),
});

// ---------------- helpers ----------------

function safeJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw);
    return parsed as T;
  } catch {
    return fallback;
  }
}

// Returns null when caller may access; otherwise the JSON error
// shape + status to return. Encapsulates the per-host-mode gate.
function checkHostAccess(
  hackathon: typeof hackathons.$inferSelect,
  userId: string | null,
): { error: string; status: 401 | 403 | 404 } | null {
  if (hackathon.hostMode === "public") return null;
  if (!userId) return { error: "Unauthorized", status: 401 };
  const db = getDb();
  if (hackathon.hostMode === "class") {
    if (!hackathon.hostClassId) return null;
    const cls = db
      .select({ instructorId: classes.instructorId })
      .from(classes)
      .where(eq(classes.id, hackathon.hostClassId))
      .get();
    if (cls?.instructorId === userId) return null;
    const enr = db
      .select({ id: classEnrollments.id })
      .from(classEnrollments)
      .where(
        and(
          eq(classEnrollments.classId, hackathon.hostClassId),
          eq(classEnrollments.userId, userId),
        ),
      )
      .get();
    if (!enr) return { error: "Class-scoped hackathon", status: 403 };
    return null;
  }
  if (hackathon.hostMode === "cohort" && hackathon.hostCohortId) {
    const m = db
      .select({ id: cohortMembers.id })
      .from(cohortMembers)
      .where(
        and(
          eq(cohortMembers.cohortId, hackathon.hostCohortId),
          eq(cohortMembers.userId, userId),
        ),
      )
      .get();
    if (!m) return { error: "Cohort-scoped hackathon", status: 403 };
  }
  return null;
}

// Bounded-concurrency pool — same pattern as Phase 22A bulk
// variant generation. Returns when every job finishes.
async function pool<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  if (items.length === 0) return;
  let cursor = 0;
  const run = async () => {
    while (cursor < items.length) {
      const i = cursor++;
      try {
        await worker(items[i]!);
      } catch {
        // worker swallows; pool keeps going
      }
    }
  };
  const n = Math.min(concurrency, items.length);
  await Promise.all(Array.from({ length: n }, () => run()));
}

// Fan out a prize's reward bundle to every team member. Each
// grant is idempotent on its own (unique indexes + grantXp's
// (userId, source, sourceRefId) dedup), so a re-click is safe.
async function distributePrize(opts: {
  prize: typeof hackathonPrizes.$inferSelect;
  hackathon: typeof hackathons.$inferSelect;
  teamId: string;
  awardedById: string;
}): Promise<void> {
  const db = getDb();
  const memberRows = db
    .select({ userId: hackathonTeamMembers.userId })
    .from(hackathonTeamMembers)
    .where(eq(hackathonTeamMembers.teamId, opts.teamId))
    .all();
  const recipients = memberRows.map((r) => r.userId);

  for (const uid of recipients) {
    // XP — falls back to the default 50 when prize.xpAmount is 0
    // and we still want a token grant; pass undefined to let
    // grantXp use XP_AMOUNTS["hackathon-prize"].
    grantXp({
      userId: uid,
      source: "hackathon-prize",
      sourceRefId: opts.prize.id,
      amount: opts.prize.xpAmount > 0 ? opts.prize.xpAmount : undefined,
    });

    if (opts.prize.cosmeticSlug) {
      // Mirror the classes.ts cosmetic grant: validate against
      // catalog, INSERT OR IGNORE on the inventory unique index,
      // notify on first acquisition.
      const cat = db
        .select({ slug: petCosmetics.slug })
        .from(petCosmetics)
        .where(eq(petCosmetics.slug, opts.prize.cosmeticSlug))
        .get();
      if (cat) {
        try {
          db.insert(petInventory)
            .values({
              id: randomUUID(),
              userId: uid,
              cosmeticSlug: opts.prize.cosmeticSlug,
            })
            .run();
        } catch {
          // already owned — unique-index conflict; harmless
        }
      }
    }

    if (opts.prize.skinSlug) {
      try {
        db.insert(petSkinInventory)
          .values({
            id: randomUUID(),
            userId: uid,
            skinSlug: opts.prize.skinSlug,
            grantedById: opts.awardedById,
          })
          .run();
      } catch {
        // already owned
      }
    }

    if (opts.prize.badgeSlug) {
      try {
        db.insert(userAchievements)
          .values({
            id: randomUUID(),
            userId: uid,
            slug: opts.prize.badgeSlug,
          })
          .run();
      } catch {
        // already earned
      }
    }
  }

  if (recipients.length > 0) {
    void notifyMany(recipients, {
      actorId: opts.awardedById === recipients[0] ? null : opts.awardedById,
      kind: "hackathon_prize_won",
      subjectType: "hackathon_prize",
      subjectId: opts.prize.id,
      contextSlug: opts.hackathon.slug,
      preview: `${opts.hackathon.title}: you won "${opts.prize.title}"!`,
    });
  }
}

// ---------------- routes ----------------

// GET /hackathons/discover — public listing.
hackathonsRouter.get("/discover", async (c) => {
  const db = getDb();
  const rows = db
    .select({
      id: hackathons.id,
      slug: hackathons.slug,
      title: hackathons.title,
      coverEmoji: hackathons.coverEmoji,
      fieldTag: hackathons.fieldTag,
      hostMode: hackathons.hostMode,
      status: hackathons.status,
      startsAt: hackathons.startsAt,
      endsAt: hackathons.endsAt,
      maxTeamSize: hackathons.maxTeamSize,
    })
    .from(hackathons)
    .where(
      and(
        eq(hackathons.discoverable, true),
        ne(hackathons.status, "draft"),
      ),
    )
    .orderBy(asc(hackathons.startsAt), desc(hackathons.createdAt))
    .limit(100)
    .all();
  return c.json({ hackathons: rows });
});

// GET /hackathons — mine (hosting + registered).
hackathonsRouter.get("/", requireAuth, async (c) => {
  const me = c.get("user")!;
  const db = getDb();

  const hosting = db
    .select()
    .from(hackathons)
    .where(eq(hackathons.createdById, me.id))
    .orderBy(desc(hackathons.createdAt))
    .all();

  const registeredRows = db
    .select({ hackathonId: hackathonTeamMembers.hackathonId })
    .from(hackathonTeamMembers)
    .where(eq(hackathonTeamMembers.userId, me.id))
    .all();
  const registeredIds = registeredRows
    .map((r) => r.hackathonId)
    .filter((id) => !hosting.find((h) => h.id === id));
  const registered =
    registeredIds.length > 0
      ? db
          .select()
          .from(hackathons)
          .where(inArray(hackathons.id, registeredIds))
          .all()
      : [];

  return c.json({
    hosting: hosting.map(toSummary),
    registered: registered.map(toSummary),
  });
});

function toSummary(h: typeof hackathons.$inferSelect) {
  return {
    id: h.id,
    slug: h.slug,
    title: h.title,
    coverEmoji: h.coverEmoji,
    fieldTag: h.fieldTag,
    hostMode: h.hostMode,
    status: h.status,
    startsAt: h.startsAt,
    endsAt: h.endsAt,
    maxTeamSize: h.maxTeamSize,
  };
}

// POST /hackathons — create. Rate-limited to discourage spam.
hackathonsRouter.post(
  "/",
  requireAuth,
  zValidator("json", createHackathonSchema),
  async (c) => {
    const me = c.get("user")!;
    if (
      env.NODE_ENV !== "test" &&
      !checkRateLimit(`hackathon-create:${me.id}`, 5, 60 * 60_000)
    ) {
      return c.json({ error: "Rate limited. Slow down." }, 429);
    }
    const data = c.req.valid("json");
    const db = getDb();

    // Resolve host class / cohort slugs to ids, validating
    // ownership/membership.
    let hostClassId: string | null = null;
    let hostCohortId: string | null = null;
    if (data.hostMode === "class") {
      if (!data.hostClassSlug) {
        return c.json({ error: "hostClassSlug required for class mode" }, 400);
      }
      const cls = db
        .select({ id: classes.id, instructorId: classes.instructorId })
        .from(classes)
        .where(eq(classes.slug, data.hostClassSlug))
        .get();
      if (!cls) return c.json({ error: "Class not found" }, 404);
      if (cls.instructorId !== me.id) {
        return c.json({ error: "You don't instruct that class" }, 403);
      }
      hostClassId = cls.id;
    }
    if (data.hostMode === "cohort") {
      if (!data.hostCohortSlug) {
        return c.json({ error: "hostCohortSlug required for cohort mode" }, 400);
      }
      const co = db
        .select({ id: cohorts.id, creatorId: cohorts.creatorId })
        .from(cohorts)
        .where(eq(cohorts.slug, data.hostCohortSlug))
        .get();
      if (!co) return c.json({ error: "Cohort not found" }, 404);
      if (co.creatorId !== me.id) {
        return c.json({ error: "You don't own that cohort" }, 403);
      }
      hostCohortId = co.id;
    }

    // Slug uniqueness check (the DB unique index would also
    // catch this, but a friendly error message helps the UI).
    const existing = db
      .select({ id: hackathons.id })
      .from(hackathons)
      .where(eq(hackathons.slug, data.slug))
      .get();
    if (existing) return c.json({ error: "Slug already taken" }, 409);

    if (data.judgingMode === "ai_rubric" && !data.rubric) {
      return c.json(
        { error: "rubric required when judgingMode is ai_rubric" },
        400,
      );
    }

    const id = randomUUID();
    const now = new Date().toISOString();
    db.insert(hackathons)
      .values({
        id,
        slug: data.slug,
        title: data.title,
        descriptionMd: data.descriptionMd ?? "",
        rulesMd: data.rulesMd ?? "",
        fieldTag: data.fieldTag ?? "other",
        coverEmoji: data.coverEmoji ?? "🏆",
        hostMode: data.hostMode ?? "public",
        hostClassId,
        hostCohortId,
        discoverable: false,
        status: "draft",
        maxTeamSize: data.maxTeamSize ?? 4,
        judgingMode: data.judgingMode ?? "manual",
        rubricJson: data.rubric ? JSON.stringify(data.rubric) : null,
        registrationOpensAt: data.registrationOpensAt ?? null,
        registrationClosesAt: data.registrationClosesAt ?? null,
        startsAt: data.startsAt ?? null,
        endsAt: data.endsAt ?? null,
        createdById: me.id,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    return c.json({ id, slug: data.slug }, 201);
  },
);

// GET /hackathons/:slug — detail.
hackathonsRouter.get("/:slug", async (c) => {
  const slug = c.req.param("slug")!;
  const db = getDb();
  const h = db
    .select()
    .from(hackathons)
    .where(eq(hackathons.slug, slug))
    .get();
  if (!h) return c.json({ error: "Hackathon not found" }, 404);

  const session = await getSessionUser(c);
  const access = checkHostAccess(h, session?.id ?? null);
  if (access) return c.json({ error: access.error }, access.status);

  // Resolve host context display info.
  let hostContext: { kind: "class" | "cohort"; slug: string; title: string } | null = null;
  if (h.hostMode === "class" && h.hostClassId) {
    const cls = db
      .select({ slug: classes.slug, title: classes.title })
      .from(classes)
      .where(eq(classes.id, h.hostClassId))
      .get();
    if (cls) hostContext = { kind: "class", slug: cls.slug, title: cls.title };
  }
  if (h.hostMode === "cohort" && h.hostCohortId) {
    const co = db
      .select({ slug: cohorts.slug, name: cohorts.name })
      .from(cohorts)
      .where(eq(cohorts.id, h.hostCohortId))
      .get();
    if (co) hostContext = { kind: "cohort", slug: co.slug, title: co.name };
  }

  // Prizes ordered by rank ascending (1st, 2nd, 3rd, then non-tier
  // 0s at the end).
  const prizes = db
    .select()
    .from(hackathonPrizes)
    .where(eq(hackathonPrizes.hackathonId, h.id))
    .orderBy(asc(hackathonPrizes.rank), asc(hackathonPrizes.createdAt))
    .all();

  // Teams + members.
  const teamRows = db
    .select()
    .from(hackathonTeams)
    .where(eq(hackathonTeams.hackathonId, h.id))
    .orderBy(asc(hackathonTeams.createdAt))
    .all();
  const teamIds = teamRows.map((t) => t.id);
  const memberRows =
    teamIds.length > 0
      ? db
          .select({
            teamId: hackathonTeamMembers.teamId,
            userId: hackathonTeamMembers.userId,
            role: hackathonTeamMembers.role,
            username: users.username,
            displayName: users.displayName,
          })
          .from(hackathonTeamMembers)
          .innerJoin(users, eq(hackathonTeamMembers.userId, users.id))
          .where(inArray(hackathonTeamMembers.teamId, teamIds))
          .all()
      : [];
  const membersByTeam = new Map<string, typeof memberRows>();
  for (const m of memberRows) {
    const arr = membersByTeam.get(m.teamId) ?? [];
    arr.push(m);
    membersByTeam.set(m.teamId, arr);
  }

  // Submissions (organizer sees all; participants see only their
  // team's). aiGradeJson surfaces only when status='ended'.
  const isOrganizer = session?.id === h.createdById;
  const myTeamId = session
    ? memberRows.find((m) => m.userId === session.id)?.teamId ?? null
    : null;
  const submissionRows = db
    .select()
    .from(hackathonSubmissions)
    .where(eq(hackathonSubmissions.hackathonId, h.id))
    .all();
  const visibleSubmissions = submissionRows
    .filter((s) => isOrganizer || s.teamId === myTeamId)
    .map((s) => ({
      id: s.id,
      teamId: s.teamId,
      title: s.title,
      writeup: s.writeup,
      artifacts: safeJson<unknown[]>(s.artifactsJson, []),
      submittedAt: s.submittedAt,
      // Only expose the grader's output after judging completes
      // so participants don't see partial in-flight scores.
      aiGrade:
        h.status === "ended" || isOrganizer
          ? safeJson<unknown | null>(s.aiGradeJson, null)
          : null,
      gradedAt: s.gradedAt,
    }));

  // Awards (so the detail page can render winners after 'ended').
  const prizeIds = prizes.map((p) => p.id);
  const awards =
    prizeIds.length > 0
      ? db
          .select()
          .from(hackathonPrizeAwards)
          .where(inArray(hackathonPrizeAwards.prizeId, prizeIds))
          .all()
      : [];

  return c.json({
    hackathon: {
      id: h.id,
      slug: h.slug,
      title: h.title,
      descriptionMd: h.descriptionMd,
      rulesMd: h.rulesMd,
      fieldTag: h.fieldTag,
      coverEmoji: h.coverEmoji,
      hostMode: h.hostMode,
      hostContext,
      discoverable: h.discoverable,
      status: h.status,
      maxTeamSize: h.maxTeamSize,
      judgingMode: h.judgingMode,
      rubric: safeJson<unknown | null>(h.rubricJson, null),
      registrationOpensAt: h.registrationOpensAt,
      registrationClosesAt: h.registrationClosesAt,
      startsAt: h.startsAt,
      endsAt: h.endsAt,
      createdAt: h.createdAt,
      updatedAt: h.updatedAt,
      isOrganizer,
    },
    prizes: prizes.map((p) => ({
      id: p.id,
      rank: p.rank,
      title: p.title,
      descriptionMd: p.descriptionMd,
      xpAmount: p.xpAmount,
      cosmeticSlug: p.cosmeticSlug,
      skinSlug: p.skinSlug,
      badgeSlug: p.badgeSlug,
      maxWinners: p.maxWinners,
    })),
    teams: teamRows.map((t) => ({
      id: t.id,
      name: t.name,
      captainId: t.captainId,
      createdAt: t.createdAt,
      members: (membersByTeam.get(t.id) ?? []).map((m) => ({
        userId: m.userId,
        username: m.username,
        displayName: m.displayName,
        role: m.role,
      })),
    })),
    submissions: visibleSubmissions,
    awards: awards.map((a) => ({
      id: a.id,
      prizeId: a.prizeId,
      teamId: a.teamId,
      awardedAt: a.awardedAt,
    })),
    myTeamId,
  });
});

// PUT /hackathons/:slug — organizer edit.
hackathonsRouter.put(
  "/:slug",
  requireAuth,
  zValidator("json", updateHackathonSchema),
  async (c) => {
    const me = c.get("user")!;
    const slug = c.req.param("slug")!;
    const data = c.req.valid("json");
    const db = getDb();
    const h = db.select().from(hackathons).where(eq(hackathons.slug, slug)).get();
    if (!h) return c.json({ error: "Hackathon not found" }, 404);
    if (h.createdById !== me.id) {
      return c.json({ error: "Organizer only" }, 403);
    }

    const patch: Record<string, unknown> = {
      updatedAt: new Date().toISOString(),
    };
    if (data.title !== undefined) patch.title = data.title;
    if (data.descriptionMd !== undefined) patch.descriptionMd = data.descriptionMd;
    if (data.rulesMd !== undefined) patch.rulesMd = data.rulesMd;
    if (data.fieldTag !== undefined) patch.fieldTag = data.fieldTag;
    if (data.coverEmoji !== undefined) patch.coverEmoji = data.coverEmoji;
    if (data.maxTeamSize !== undefined) patch.maxTeamSize = data.maxTeamSize;
    if (data.judgingMode !== undefined) patch.judgingMode = data.judgingMode;
    if (data.rubric !== undefined) {
      patch.rubricJson = data.rubric ? JSON.stringify(data.rubric) : null;
    }
    if (data.registrationOpensAt !== undefined)
      patch.registrationOpensAt = data.registrationOpensAt;
    if (data.registrationClosesAt !== undefined)
      patch.registrationClosesAt = data.registrationClosesAt;
    if (data.startsAt !== undefined) patch.startsAt = data.startsAt;
    if (data.endsAt !== undefined) patch.endsAt = data.endsAt;

    db.update(hackathons).set(patch).where(eq(hackathons.id, h.id)).run();
    return c.json({ ok: true });
  },
);

// POST /hackathons/:slug/publish — flip draft → registration +
// turn on discoverable.
hackathonsRouter.post("/:slug/publish", requireAuth, async (c) => {
  const me = c.get("user")!;
  const slug = c.req.param("slug")!;
  const db = getDb();
  const h = db.select().from(hackathons).where(eq(hackathons.slug, slug)).get();
  if (!h) return c.json({ error: "Hackathon not found" }, 404);
  if (h.createdById !== me.id) {
    return c.json({ error: "Organizer only" }, 403);
  }
  if (h.status !== "draft") {
    return c.json({ error: "Only draft hackathons can be published" }, 400);
  }
  db.update(hackathons)
    .set({
      status: "registration",
      discoverable: true,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(hackathons.id, h.id))
    .run();
  return c.json({ ok: true });
});

// DELETE /hackathons/:slug — organizer; draft only.
hackathonsRouter.delete("/:slug", requireAuth, async (c) => {
  const me = c.get("user")!;
  const slug = c.req.param("slug")!;
  const db = getDb();
  const h = db.select().from(hackathons).where(eq(hackathons.slug, slug)).get();
  if (!h) return c.json({ error: "Hackathon not found" }, 404);
  if (h.createdById !== me.id) {
    return c.json({ error: "Organizer only" }, 403);
  }
  if (h.status !== "draft") {
    return c.json(
      { error: "Only draft hackathons can be deleted" },
      400,
    );
  }
  db.delete(hackathons).where(eq(hackathons.id, h.id)).run();
  return c.json({ ok: true });
});

// ---------------- prizes (organizer) ----------------

hackathonsRouter.post(
  "/:slug/prizes",
  requireAuth,
  zValidator("json", createPrizeSchema),
  async (c) => {
    const me = c.get("user")!;
    const slug = c.req.param("slug")!;
    const data = c.req.valid("json");
    const db = getDb();
    const h = db.select().from(hackathons).where(eq(hackathons.slug, slug)).get();
    if (!h) return c.json({ error: "Hackathon not found" }, 404);
    if (h.createdById !== me.id) {
      return c.json({ error: "Organizer only" }, 403);
    }
    const id = randomUUID();
    db.insert(hackathonPrizes)
      .values({
        id,
        hackathonId: h.id,
        rank: data.rank ?? 0,
        title: data.title,
        descriptionMd: data.descriptionMd ?? "",
        xpAmount: data.xpAmount ?? 0,
        cosmeticSlug: data.cosmeticSlug ?? null,
        skinSlug: data.skinSlug ?? null,
        badgeSlug: data.badgeSlug ?? null,
        maxWinners: data.maxWinners ?? 1,
      })
      .run();
    return c.json({ id }, 201);
  },
);

hackathonsRouter.put(
  "/:slug/prizes/:prizeId",
  requireAuth,
  zValidator("json", updatePrizeSchema),
  async (c) => {
    const me = c.get("user")!;
    const slug = c.req.param("slug")!;
    const prizeId = c.req.param("prizeId")!;
    const data = c.req.valid("json");
    const db = getDb();
    const h = db.select().from(hackathons).where(eq(hackathons.slug, slug)).get();
    if (!h) return c.json({ error: "Hackathon not found" }, 404);
    if (h.createdById !== me.id) {
      return c.json({ error: "Organizer only" }, 403);
    }
    const prize = db
      .select()
      .from(hackathonPrizes)
      .where(eq(hackathonPrizes.id, prizeId))
      .get();
    if (!prize || prize.hackathonId !== h.id) {
      return c.json({ error: "Prize not found" }, 404);
    }
    const patch: Record<string, unknown> = {};
    if (data.rank !== undefined) patch.rank = data.rank;
    if (data.title !== undefined) patch.title = data.title;
    if (data.descriptionMd !== undefined) patch.descriptionMd = data.descriptionMd;
    if (data.xpAmount !== undefined) patch.xpAmount = data.xpAmount;
    if (data.cosmeticSlug !== undefined) patch.cosmeticSlug = data.cosmeticSlug;
    if (data.skinSlug !== undefined) patch.skinSlug = data.skinSlug;
    if (data.badgeSlug !== undefined) patch.badgeSlug = data.badgeSlug;
    if (data.maxWinners !== undefined) patch.maxWinners = data.maxWinners;
    if (Object.keys(patch).length === 0) return c.json({ ok: true });
    db.update(hackathonPrizes).set(patch).where(eq(hackathonPrizes.id, prize.id)).run();
    return c.json({ ok: true });
  },
);

hackathonsRouter.delete("/:slug/prizes/:prizeId", requireAuth, async (c) => {
  const me = c.get("user")!;
  const slug = c.req.param("slug")!;
  const prizeId = c.req.param("prizeId")!;
  const db = getDb();
  const h = db.select().from(hackathons).where(eq(hackathons.slug, slug)).get();
  if (!h) return c.json({ error: "Hackathon not found" }, 404);
  if (h.createdById !== me.id) {
    return c.json({ error: "Organizer only" }, 403);
  }
  const prize = db
    .select()
    .from(hackathonPrizes)
    .where(eq(hackathonPrizes.id, prizeId))
    .get();
  if (!prize || prize.hackathonId !== h.id) {
    return c.json({ error: "Prize not found" }, 404);
  }
  db.delete(hackathonPrizes).where(eq(hackathonPrizes.id, prize.id)).run();
  return c.json({ ok: true });
});

// ---------------- teams ----------------

hackathonsRouter.post(
  "/:slug/teams",
  requireAuth,
  zValidator("json", createTeamSchema),
  async (c) => {
    const me = c.get("user")!;
    const slug = c.req.param("slug")!;
    const { name } = c.req.valid("json");
    const db = getDb();
    const h = db.select().from(hackathons).where(eq(hackathons.slug, slug)).get();
    if (!h) return c.json({ error: "Hackathon not found" }, 404);
    if (h.status !== "registration") {
      return c.json({ error: "Registration is not open" }, 400);
    }
    const access = checkHostAccess(h, me.id);
    if (access) return c.json({ error: access.error }, access.status);

    // Caller can't be on another team in this hackathon.
    const existing = db
      .select({ id: hackathonTeamMembers.id })
      .from(hackathonTeamMembers)
      .where(
        and(
          eq(hackathonTeamMembers.hackathonId, h.id),
          eq(hackathonTeamMembers.userId, me.id),
        ),
      )
      .get();
    if (existing) {
      return c.json(
        { error: "You're already on a team in this hackathon" },
        409,
      );
    }

    const teamId = randomUUID();
    const now = new Date().toISOString();
    db.insert(hackathonTeams)
      .values({
        id: teamId,
        hackathonId: h.id,
        name,
        captainId: me.id,
        createdAt: now,
      })
      .run();
    db.insert(hackathonTeamMembers)
      .values({
        id: randomUUID(),
        teamId,
        hackathonId: h.id,
        userId: me.id,
        role: "captain",
        joinedAt: now,
      })
      .run();

    void notify({
      recipientId: me.id,
      actorId: null,
      kind: "hackathon_registered",
      subjectType: "hackathon_team",
      subjectId: teamId,
      contextSlug: h.slug,
      preview: `${h.title}: team "${name}" created`,
    });

    return c.json({ teamId }, 201);
  },
);

// POST /hackathons/:slug/register-solo — convenience for solo
// entrants. Creates a one-person team named after the user.
hackathonsRouter.post("/:slug/register-solo", requireAuth, async (c) => {
  const me = c.get("user")!;
  const slug = c.req.param("slug")!;
  const db = getDb();
  const h = db.select().from(hackathons).where(eq(hackathons.slug, slug)).get();
  if (!h) return c.json({ error: "Hackathon not found" }, 404);
  if (h.status !== "registration") {
    return c.json({ error: "Registration is not open" }, 400);
  }
  const access = checkHostAccess(h, me.id);
  if (access) return c.json({ error: access.error }, access.status);

  const existing = db
    .select({ id: hackathonTeamMembers.id })
    .from(hackathonTeamMembers)
    .where(
      and(
        eq(hackathonTeamMembers.hackathonId, h.id),
        eq(hackathonTeamMembers.userId, me.id),
      ),
    )
    .get();
  if (existing) {
    return c.json(
      { error: "You're already on a team in this hackathon" },
      409,
    );
  }

  const teamId = randomUUID();
  const now = new Date().toISOString();
  const teamName = `${me.username}'s entry`;
  db.insert(hackathonTeams)
    .values({
      id: teamId,
      hackathonId: h.id,
      name: teamName,
      captainId: me.id,
      createdAt: now,
    })
    .run();
  db.insert(hackathonTeamMembers)
    .values({
      id: randomUUID(),
      teamId,
      hackathonId: h.id,
      userId: me.id,
      role: "captain",
      joinedAt: now,
    })
    .run();
  void notify({
    recipientId: me.id,
    actorId: null,
    kind: "hackathon_registered",
    subjectType: "hackathon_team",
    subjectId: teamId,
    contextSlug: h.slug,
    preview: `${h.title}: registered solo`,
  });
  return c.json({ teamId }, 201);
});

hackathonsRouter.post("/:slug/teams/:teamId/join", requireAuth, async (c) => {
  const me = c.get("user")!;
  const slug = c.req.param("slug")!;
  const teamId = c.req.param("teamId")!;
  const db = getDb();
  const h = db.select().from(hackathons).where(eq(hackathons.slug, slug)).get();
  if (!h) return c.json({ error: "Hackathon not found" }, 404);
  if (h.status !== "registration") {
    return c.json({ error: "Registration is not open" }, 400);
  }
  const access = checkHostAccess(h, me.id);
  if (access) return c.json({ error: access.error }, access.status);

  const team = db
    .select()
    .from(hackathonTeams)
    .where(eq(hackathonTeams.id, teamId))
    .get();
  if (!team || team.hackathonId !== h.id) {
    return c.json({ error: "Team not found" }, 404);
  }

  // Caller can't be on another team here already.
  const otherTeam = db
    .select({ id: hackathonTeamMembers.id })
    .from(hackathonTeamMembers)
    .where(
      and(
        eq(hackathonTeamMembers.hackathonId, h.id),
        eq(hackathonTeamMembers.userId, me.id),
      ),
    )
    .get();
  if (otherTeam) {
    return c.json(
      { error: "You're already on a team in this hackathon" },
      409,
    );
  }

  // Size cap.
  const existing = db
    .select({ n: sql<number>`COUNT(*)` })
    .from(hackathonTeamMembers)
    .where(eq(hackathonTeamMembers.teamId, teamId))
    .get();
  const memberCount = Number(existing?.n ?? 0);
  if (memberCount >= h.maxTeamSize) {
    return c.json({ error: "Team is full" }, 400);
  }

  db.insert(hackathonTeamMembers)
    .values({
      id: randomUUID(),
      teamId,
      hackathonId: h.id,
      userId: me.id,
      role: "member",
      joinedAt: new Date().toISOString(),
    })
    .run();
  void notify({
    recipientId: me.id,
    actorId: null,
    kind: "hackathon_registered",
    subjectType: "hackathon_team",
    subjectId: teamId,
    contextSlug: h.slug,
    preview: `${h.title}: joined "${team.name}"`,
  });
  return c.json({ ok: true });
});

hackathonsRouter.post("/:slug/teams/:teamId/leave", requireAuth, async (c) => {
  const me = c.get("user")!;
  const slug = c.req.param("slug")!;
  const teamId = c.req.param("teamId")!;
  const db = getDb();
  const h = db.select().from(hackathons).where(eq(hackathons.slug, slug)).get();
  if (!h) return c.json({ error: "Hackathon not found" }, 404);
  const team = db
    .select()
    .from(hackathonTeams)
    .where(eq(hackathonTeams.id, teamId))
    .get();
  if (!team || team.hackathonId !== h.id) {
    return c.json({ error: "Team not found" }, 404);
  }
  const member = db
    .select()
    .from(hackathonTeamMembers)
    .where(
      and(
        eq(hackathonTeamMembers.teamId, teamId),
        eq(hackathonTeamMembers.userId, me.id),
      ),
    )
    .get();
  if (!member) return c.json({ error: "Not on this team" }, 404);

  db.delete(hackathonTeamMembers)
    .where(eq(hackathonTeamMembers.id, member.id))
    .run();

  if (team.captainId === me.id) {
    // Promote oldest remaining member, or delete the team if
    // none remain.
    const remaining = db
      .select()
      .from(hackathonTeamMembers)
      .where(eq(hackathonTeamMembers.teamId, teamId))
      .orderBy(asc(hackathonTeamMembers.joinedAt))
      .all();
    if (remaining.length === 0) {
      db.delete(hackathonTeams).where(eq(hackathonTeams.id, teamId)).run();
    } else {
      const newCaptain = remaining[0]!;
      db.update(hackathonTeams)
        .set({ captainId: newCaptain.userId })
        .where(eq(hackathonTeams.id, teamId))
        .run();
      db.update(hackathonTeamMembers)
        .set({ role: "captain" })
        .where(eq(hackathonTeamMembers.id, newCaptain.id))
        .run();
    }
  }
  return c.json({ ok: true });
});

// ---------------- submission ----------------

hackathonsRouter.post(
  "/:slug/teams/:teamId/submission",
  requireAuth,
  zValidator("json", submitProjectSchema),
  async (c) => {
    const me = c.get("user")!;
    const slug = c.req.param("slug")!;
    const teamId = c.req.param("teamId")!;
    const data = c.req.valid("json");
    const db = getDb();
    const h = db.select().from(hackathons).where(eq(hackathons.slug, slug)).get();
    if (!h) return c.json({ error: "Hackathon not found" }, 404);
    if (h.status !== "registration" && h.status !== "active") {
      return c.json({ error: "Submissions are not open" }, 400);
    }
    const team = db
      .select()
      .from(hackathonTeams)
      .where(eq(hackathonTeams.id, teamId))
      .get();
    if (!team || team.hackathonId !== h.id) {
      return c.json({ error: "Team not found" }, 404);
    }
    if (team.captainId !== me.id) {
      return c.json({ error: "Only the team captain can submit" }, 403);
    }

    const existing = db
      .select()
      .from(hackathonSubmissions)
      .where(eq(hackathonSubmissions.teamId, teamId))
      .get();
    const now = new Date().toISOString();
    if (existing) {
      // Re-submit overwrites in place. Reset graded state so a
      // post-re-submit judging pass picks it up again.
      db.update(hackathonSubmissions)
        .set({
          title: data.title,
          writeup: data.writeup ?? "",
          artifactsJson: JSON.stringify(data.artifacts ?? []),
          submittedAt: now,
          aiGradeJson: null,
          gradedAt: null,
        })
        .where(eq(hackathonSubmissions.id, existing.id))
        .run();
      return c.json({ id: existing.id });
    }
    const id = randomUUID();
    db.insert(hackathonSubmissions)
      .values({
        id,
        hackathonId: h.id,
        teamId,
        title: data.title,
        writeup: data.writeup ?? "",
        artifactsJson: JSON.stringify(data.artifacts ?? []),
        submittedAt: now,
      })
      .run();
    return c.json({ id }, 201);
  },
);

// ---------------- judging ----------------

hackathonsRouter.post("/:slug/judge", requireAuth, async (c) => {
  const me = c.get("user")!;
  const slug = c.req.param("slug")!;
  const db = getDb();
  const h = db.select().from(hackathons).where(eq(hackathons.slug, slug)).get();
  if (!h) return c.json({ error: "Hackathon not found" }, 404);
  if (h.createdById !== me.id) {
    return c.json({ error: "Organizer only" }, 403);
  }
  if (h.status !== "active" && h.status !== "registration") {
    return c.json(
      { error: "Hackathon must be active or in registration to judge" },
      400,
    );
  }

  // Flip status to 'judging' so the UI shows the right state.
  db.update(hackathons)
    .set({ status: "judging", updatedAt: new Date().toISOString() })
    .where(eq(hackathons.id, h.id))
    .run();

  let graded = 0;
  let errors = 0;
  if (h.judgingMode === "ai_rubric" && h.rubricJson) {
    const rubric = safeJson<{
      criteria: Array<{ id: string; description: string; weight?: number }>;
      passingScore: number;
    } | null>(h.rubricJson, null);
    if (rubric && rubric.criteria.length > 0) {
      const submissions = db
        .select()
        .from(hackathonSubmissions)
        .where(eq(hackathonSubmissions.hackathonId, h.id))
        .all();
      const totalWeight = rubric.criteria.reduce(
        (s, c) => s + (c.weight ?? 1),
        0,
      );
      const rubricMd = rubric.criteria
        .map((c) => `- (${c.weight ?? 1} pts) ${c.description}`)
        .join("\n");

      await pool(submissions, 5, async (sub) => {
        try {
          const result = await gradeEssay({
            promptMd: `${h.title}\n\n${h.descriptionMd}`,
            rubricMd,
            maxScore: totalWeight,
            essayResponse: `${sub.title}\n\n${sub.writeup}`,
            signal: AbortSignal.timeout(15_000),
          });
          db.update(hackathonSubmissions)
            .set({
              aiGradeJson: JSON.stringify({
                score: result.score,
                maxScore: totalWeight,
                feedbackMd: result.feedbackMd,
                gradedBy: result.gradedBy,
                pass: result.score / totalWeight >= rubric.passingScore,
              }),
              gradedAt: new Date().toISOString(),
            })
            .where(eq(hackathonSubmissions.id, sub.id))
            .run();
          graded++;
        } catch {
          errors++;
        }
      });
    }
  }

  // Once judging completes, flip to 'ended' and notify every team
  // captain so they know results are live.
  db.update(hackathons)
    .set({ status: "ended", updatedAt: new Date().toISOString() })
    .where(eq(hackathons.id, h.id))
    .run();

  const captains = db
    .select({ captainId: hackathonTeams.captainId })
    .from(hackathonTeams)
    .where(eq(hackathonTeams.hackathonId, h.id))
    .all()
    .map((r) => r.captainId);
  if (captains.length > 0) {
    void notifyMany(captains, {
      actorId: me.id,
      kind: "hackathon_judging_complete",
      subjectType: "hackathon",
      subjectId: h.id,
      contextSlug: h.slug,
      preview: `${h.title}: judging complete — check the results.`,
    });
  }

  return c.json({ graded, errors });
});

// ---------------- prize award ----------------

hackathonsRouter.post(
  "/:slug/prizes/:prizeId/award",
  requireAuth,
  zValidator("json", awardPrizeSchema),
  async (c) => {
    const me = c.get("user")!;
    const slug = c.req.param("slug")!;
    const prizeId = c.req.param("prizeId")!;
    const { teamId } = c.req.valid("json");
    const db = getDb();
    const h = db.select().from(hackathons).where(eq(hackathons.slug, slug)).get();
    if (!h) return c.json({ error: "Hackathon not found" }, 404);
    if (h.createdById !== me.id) {
      return c.json({ error: "Organizer only" }, 403);
    }
    if (h.status !== "ended") {
      return c.json(
        { error: "Hackathon must be ended before awarding prizes" },
        400,
      );
    }
    const prize = db
      .select()
      .from(hackathonPrizes)
      .where(eq(hackathonPrizes.id, prizeId))
      .get();
    if (!prize || prize.hackathonId !== h.id) {
      return c.json({ error: "Prize not found" }, 404);
    }
    const team = db
      .select()
      .from(hackathonTeams)
      .where(eq(hackathonTeams.id, teamId))
      .get();
    if (!team || team.hackathonId !== h.id) {
      return c.json({ error: "Team not found" }, 404);
    }

    // Enforce maxWinners cap.
    const existingAwards = db
      .select({ id: hackathonPrizeAwards.id })
      .from(hackathonPrizeAwards)
      .where(eq(hackathonPrizeAwards.prizeId, prize.id))
      .all();
    if (existingAwards.length >= prize.maxWinners) {
      return c.json({ error: "Prize already at maxWinners" }, 409);
    }

    // Insert the award (unique on prizeId+teamId — re-clicks are
    // safe and surface as 409).
    try {
      db.insert(hackathonPrizeAwards)
        .values({
          id: randomUUID(),
          prizeId: prize.id,
          teamId,
          awardedById: me.id,
        })
        .run();
    } catch {
      return c.json({ error: "Prize already awarded to that team" }, 409);
    }

    await distributePrize({
      prize,
      hackathon: h,
      teamId,
      awardedById: me.id,
    });
    return c.json({ ok: true });
  },
);
