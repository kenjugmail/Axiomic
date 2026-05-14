// Sprint 43 — Cohorts + mentor relationships.
//
// Cohorts: small named groups working through material together.
// Anyone can create one; visibility is 'open' (auto-join) or 'invite'
// (organizer approves). Mentor relationships: one-to-one outside of
// cohorts — a mentee requests, a mentor accepts.

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, desc, eq, gt, inArray, ne, or, sql } from "drizzle-orm";
import { randomUUID } from "crypto";
import {
  capstoneEnrollments,
  capstoneMilestones,
  capstoneSubmissions,
  capstones,
  cohortInvitations,
  cohortMembers,
  cohorts,
  getDb,
  mentorRelationships,
  users,
} from "@axiomic/db";
import { requireAuth, getSessionUser } from "../middleware/auth";
import { notifyCohortInvitation } from "../lib/notifications";
import type { Env } from "../env";

// Sprint 52 — URL-safe token generator for cohort invitations.
function newInviteToken(): string {
  // 22 chars of base64url-ish randomness (~128 bits).
  return randomUUID().replace(/-/g, "") + randomUUID().replace(/-/g, "").slice(0, 6);
}

export const cohortsRouter = new Hono<Env>();
export const mentorsRouter = new Hono<Env>();

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// --- Cohorts -------------------------------------------------------

const createCohortSchema = z.object({
  slug: z.string().min(2).max(80).regex(SLUG_RE),
  name: z.string().min(2).max(120),
  description: z.string().max(2000).optional(),
  capstoneSlug: z.string().max(120).optional(),
  visibility: z.enum(["open", "invite"]).default("open"),
});

cohortsRouter.get("/", async (c) => {
  const db = getDb();
  const session = await getSessionUser(c);
  const rows = db
    .select({
      id: cohorts.id,
      slug: cohorts.slug,
      name: cohorts.name,
      description: cohorts.description,
      capstoneSlug: cohorts.capstoneSlug,
      visibility: cohorts.visibility,
      creatorId: cohorts.creatorId,
      creatorUsername: users.username,
      createdAt: cohorts.createdAt,
    })
    .from(cohorts)
    .innerJoin(users, eq(cohorts.creatorId, users.id))
    .orderBy(desc(cohorts.createdAt))
    .limit(50)
    .all();

  // Member counts per cohort — single GROUP BY.
  const memberCountRows = db
    .select({
      cohortId: cohortMembers.cohortId,
      n: sql<number>`COUNT(*)`,
    })
    .from(cohortMembers)
    .groupBy(cohortMembers.cohortId)
    .all();
  const countById = new Map(
    memberCountRows.map((r) => [r.cohortId, Number(r.n)]),
  );

  // The viewer's own membership rows so the list can show "you're in".
  let mineByCohort = new Map<string, string>();
  if (session) {
    const mine = db
      .select({
        cohortId: cohortMembers.cohortId,
        role: cohortMembers.role,
      })
      .from(cohortMembers)
      .where(eq(cohortMembers.userId, session.id))
      .all();
    mineByCohort = new Map(mine.map((m) => [m.cohortId, m.role]));
  }

  return c.json({
    cohorts: rows.map((r) => ({
      id: r.id,
      slug: r.slug,
      name: r.name,
      description: r.description,
      capstoneSlug: r.capstoneSlug,
      visibility: r.visibility,
      creatorUsername: r.creatorUsername,
      memberCount: countById.get(r.id) ?? 0,
      myRole: mineByCohort.get(r.id) ?? null,
      createdAt: r.createdAt,
    })),
  });
});

cohortsRouter.get("/:slug", async (c) => {
  const slug = c.req.param("slug")!;
  const db = getDb();
  const session = await getSessionUser(c);

  const row = db
    .select({
      id: cohorts.id,
      slug: cohorts.slug,
      name: cohorts.name,
      description: cohorts.description,
      capstoneSlug: cohorts.capstoneSlug,
      visibility: cohorts.visibility,
      creatorId: cohorts.creatorId,
      creatorUsername: users.username,
      createdAt: cohorts.createdAt,
    })
    .from(cohorts)
    .innerJoin(users, eq(cohorts.creatorId, users.id))
    .where(eq(cohorts.slug, slug))
    .get();
  if (!row) return c.json({ error: "Cohort not found" }, 404);

  const memberRows = db
    .select({
      role: cohortMembers.role,
      username: users.username,
      displayName: users.displayName,
      joinedAt: cohortMembers.joinedAt,
    })
    .from(cohortMembers)
    .innerJoin(users, eq(cohortMembers.userId, users.id))
    .where(eq(cohortMembers.cohortId, row.id))
    .orderBy(desc(cohortMembers.joinedAt))
    .all();

  let capstone: { slug: string; title: string; coverEmoji: string } | null =
    null;
  if (row.capstoneSlug) {
    const cap = db
      .select({
        slug: capstones.slug,
        title: capstones.title,
        coverEmoji: capstones.coverEmoji,
      })
      .from(capstones)
      .where(eq(capstones.slug, row.capstoneSlug))
      .get();
    if (cap) capstone = cap;
  }

  return c.json({
    cohort: {
      id: row.id,
      slug: row.slug,
      name: row.name,
      description: row.description,
      capstone,
      visibility: row.visibility,
      creatorUsername: row.creatorUsername,
      members: memberRows,
      memberCount: memberRows.length,
      myRole:
        session?.id === row.creatorId
          ? "organizer"
          : memberRows.find(
                (_, i) => session && memberRows[i].username === session.username,
              )
            ? memberRows.find((m) => m.username === session?.username)!.role
            : null,
      createdAt: row.createdAt,
    },
  });
});

// Phase 17C — Cohort activity feed. Aggregates "things members did"
// from existing tables (no new schema): recent cohort joins, recent
// capstone submissions, recent capstone completions. Sorted desc by
// timestamp, capped to 50 events.
//
// Phase 18A — privacy gate. Open cohorts stay public (the rest of
// the cohort surface is too). Invite-only cohorts require the
// caller to be a member; non-members and anonymous callers get 403.
// Without this, anyone with the slug could enumerate who's working
// on what inside a private cohort.
cohortsRouter.get("/:slug/activity", async (c) => {
  const slug = c.req.param("slug")!;
  const db = getDb();
  const cohort = db
    .select({ id: cohorts.id, visibility: cohorts.visibility })
    .from(cohorts)
    .where(eq(cohorts.slug, slug))
    .get();
  if (!cohort) return c.json({ error: "Cohort not found" }, 404);

  if (cohort.visibility !== "open") {
    const session = await getSessionUser(c);
    if (!session) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    const membership = db
      .select({ id: cohortMembers.id })
      .from(cohortMembers)
      .where(
        and(
          eq(cohortMembers.cohortId, cohort.id),
          eq(cohortMembers.userId, session.id),
        ),
      )
      .get();
    if (!membership) {
      return c.json({ error: "Member-only cohort" }, 403);
    }
  }

  const members = db
    .select({
      userId: cohortMembers.userId,
      joinedAt: cohortMembers.joinedAt,
      username: users.username,
    })
    .from(cohortMembers)
    .innerJoin(users, eq(cohortMembers.userId, users.id))
    .where(eq(cohortMembers.cohortId, cohort.id))
    .all();

  type ActivityEvent =
    | {
        kind: "joined";
        ts: string;
        actorUsername: string;
        refSlug: null;
        refTitle: null;
      }
    | {
        kind: "submitted_milestone" | "completed_capstone";
        ts: string;
        actorUsername: string;
        refSlug: string;
        refTitle: string;
      };

  const events: ActivityEvent[] = [];

  // Joins from this cohort, last 30 days.
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    .toISOString();
  for (const m of members) {
    if (m.joinedAt < thirtyDaysAgo) continue;
    events.push({
      kind: "joined",
      ts: m.joinedAt,
      actorUsername: m.username,
      refSlug: null,
      refTitle: null,
    });
  }

  // Capstone submissions + completions by these members. Bulk pull
  // each in one query keyed on userId set.
  const memberIds = members.map((m) => m.userId);
  const usernameByUserId = new Map(members.map((m) => [m.userId, m.username]));

  if (memberIds.length > 0) {
    // Completed capstones: capstoneEnrollments rows with completedAt
    // not null, joined to capstones for the title.
    const completions = db
      .select({
        userId: capstoneEnrollments.userId,
        completedAt: capstoneEnrollments.completedAt,
        capstoneSlug: capstones.slug,
        capstoneTitle: capstones.title,
      })
      .from(capstoneEnrollments)
      .innerJoin(capstones, eq(capstoneEnrollments.capstoneId, capstones.id))
      .where(
        and(
          inArray(capstoneEnrollments.userId, memberIds),
          sql`${capstoneEnrollments.completedAt} IS NOT NULL`,
          gt(capstoneEnrollments.completedAt, thirtyDaysAgo),
        ),
      )
      .all();
    for (const r of completions) {
      if (!r.completedAt) continue;
      const actor = usernameByUserId.get(r.userId);
      if (!actor) continue;
      events.push({
        kind: "completed_capstone",
        ts: r.completedAt,
        actorUsername: actor,
        refSlug: r.capstoneSlug,
        refTitle: r.capstoneTitle,
      });
    }

    // Passed milestone submissions: join through enrollments + capstones
    // + milestones to expose the milestone title.
    const submissions = db
      .select({
        userId: capstoneEnrollments.userId,
        submittedAt: capstoneSubmissions.submittedAt,
        capstoneSlug: capstones.slug,
        milestoneTitle: capstoneMilestones.title,
        status: capstoneSubmissions.status,
      })
      .from(capstoneSubmissions)
      .innerJoin(
        capstoneEnrollments,
        eq(capstoneSubmissions.enrollmentId, capstoneEnrollments.id),
      )
      .innerJoin(capstones, eq(capstoneEnrollments.capstoneId, capstones.id))
      .innerJoin(
        capstoneMilestones,
        eq(capstoneSubmissions.milestoneId, capstoneMilestones.id),
      )
      .where(
        and(
          inArray(capstoneEnrollments.userId, memberIds),
          eq(capstoneSubmissions.status, "passed"),
          gt(capstoneSubmissions.submittedAt, thirtyDaysAgo),
        ),
      )
      .all();
    for (const r of submissions) {
      const actor = usernameByUserId.get(r.userId);
      if (!actor) continue;
      events.push({
        kind: "submitted_milestone",
        ts: r.submittedAt,
        actorUsername: actor,
        refSlug: r.capstoneSlug,
        refTitle: r.milestoneTitle,
      });
    }
  }

  events.sort((a, b) => (a.ts < b.ts ? 1 : a.ts > b.ts ? -1 : 0));

  return c.json({ events: events.slice(0, 50) });
});

cohortsRouter.post(
  "/",
  requireAuth,
  zValidator("json", createCohortSchema),
  async (c) => {
    const user = c.get("user")!;
    const data = c.req.valid("json");
    const db = getDb();

    const collision = db
      .select({ id: cohorts.id })
      .from(cohorts)
      .where(eq(cohorts.slug, data.slug))
      .get();
    if (collision) return c.json({ error: "Slug already in use" }, 409);

    const id = randomUUID();
    db.insert(cohorts).values({
      id,
      slug: data.slug,
      name: data.name,
      description: data.description ?? "",
      capstoneSlug: data.capstoneSlug ?? null,
      visibility: data.visibility,
      creatorId: user.id,
    }).run();

    // Creator auto-joins as the organizer.
    db.insert(cohortMembers).values({
      id: randomUUID(),
      cohortId: id,
      userId: user.id,
      role: "organizer",
    }).run();

    return c.json({ id, slug: data.slug }, 201);
  },
);

cohortsRouter.post("/:slug/join", requireAuth, async (c) => {
  const user = c.get("user")!;
  const slug = c.req.param("slug")!;
  const db = getDb();
  const cohort = db
    .select({ id: cohorts.id, visibility: cohorts.visibility })
    .from(cohorts)
    .where(eq(cohorts.slug, slug))
    .get();
  if (!cohort) return c.json({ error: "Cohort not found" }, 404);
  if (cohort.visibility !== "open") {
    return c.json(
      { error: "This cohort is invite-only. Ask the organizer." },
      403,
    );
  }
  const existing = db
    .select({ id: cohortMembers.id })
    .from(cohortMembers)
    .where(
      and(
        eq(cohortMembers.cohortId, cohort.id),
        eq(cohortMembers.userId, user.id),
      ),
    )
    .get();
  if (existing) return c.json({ ok: true, alreadyMember: true });
  db.insert(cohortMembers).values({
    id: randomUUID(),
    cohortId: cohort.id,
    userId: user.id,
    role: "member",
  }).run();
  return c.json({ ok: true });
});

cohortsRouter.post("/:slug/leave", requireAuth, async (c) => {
  const user = c.get("user")!;
  const slug = c.req.param("slug")!;
  const db = getDb();
  const cohort = db
    .select({ id: cohorts.id, creatorId: cohorts.creatorId })
    .from(cohorts)
    .where(eq(cohorts.slug, slug))
    .get();
  if (!cohort) return c.json({ error: "Cohort not found" }, 404);
  if (cohort.creatorId === user.id) {
    return c.json(
      { error: "Organizers can't leave their own cohort." },
      400,
    );
  }
  db.delete(cohortMembers)
    .where(
      and(
        eq(cohortMembers.cohortId, cohort.id),
        eq(cohortMembers.userId, user.id),
      ),
    )
    .run();
  return c.json({ ok: true });
});

// --- Sprint 52: Cohort invitations (organizer-side) ----------------

const inviteSchema = z.object({
  emails: z.array(z.string().email()).min(1).max(50),
  message: z.string().max(2000).optional(),
});

cohortsRouter.post(
  "/:slug/invitations",
  requireAuth,
  zValidator("json", inviteSchema),
  async (c) => {
    const me = c.get("user")!;
    const slug = c.req.param("slug")!;
    const body = c.req.valid("json");
    const db = getDb();

    const cohort = db
      .select()
      .from(cohorts)
      .where(eq(cohorts.slug, slug))
      .get();
    if (!cohort) return c.json({ error: "Cohort not found" }, 404);

    // Only organizers can invite.
    const role = db
      .select({ role: cohortMembers.role })
      .from(cohortMembers)
      .where(
        and(eq(cohortMembers.cohortId, cohort.id), eq(cohortMembers.userId, me.id)),
      )
      .get();
    const isOrganizer = role?.role === "organizer" || cohort.creatorId === me.id;
    if (!isOrganizer) {
      return c.json({ error: "Only organizers can invite" }, 403);
    }

    // Dedup: skip emails that already have a pending or accepted invite
    // for this cohort. Returning the full set so the client knows what
    // happened.
    const lowered = body.emails.map((e) => e.toLowerCase());
    const existingRows = db
      .select()
      .from(cohortInvitations)
      .where(eq(cohortInvitations.cohortId, cohort.id))
      .all();
    const blocked = new Set(
      existingRows
        .filter(
          (r) => r.status === "pending" || r.status === "accepted",
        )
        .map((r) => r.email.toLowerCase()),
    );

    const created: Array<{ email: string; token: string; status: string }> = [];
    const skipped: Array<{ email: string; reason: string }> = [];

    // Phase K — single bulk INSERT instead of one INSERT per email.
    // Dedupe-and-filter pass first, then one .values([...]) call.
    // Notifications stay per-recipient — each invitee's notification
    // points at a distinct invitationId/token so notifyMany doesn't
    // apply (the shared metadata is different per row).
    const toInsert: Array<{
      id: string;
      email: string;
      token: string;
    }> = [];
    for (const email of lowered) {
      if (blocked.has(email)) {
        skipped.push({ email, reason: "already invited" });
        continue;
      }
      const id = randomUUID();
      const token = newInviteToken();
      toInsert.push({ id, email, token });
      blocked.add(email);
    }

    if (toInsert.length > 0) {
      const rows = toInsert.map((x) => ({
        id: x.id,
        cohortId: cohort.id,
        inviterId: me.id,
        email: x.email,
        token: x.token,
        message: body.message ?? "",
      }));
      const CHUNK = 100;
      for (let i = 0; i < rows.length; i += CHUNK) {
        const chunk = rows.slice(i, i + CHUNK);
        db.insert(cohortInvitations).values(chunk).run();
      }
    }

    // After the bulk insert, surface created rows + drop notifications
    // for any invitee who already has an account.
    for (const x of toInsert) {
      created.push({ email: x.email, token: x.token, status: "pending" });
      const existingUser = db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, x.email))
        .get();
      if (existingUser) {
        notifyCohortInvitation(existingUser.id, me.id, x.id, x.token, cohort.name);
      }
    }

    return c.json({ created, skipped });
  },
);

cohortsRouter.get("/:slug/invitations", requireAuth, async (c) => {
  const me = c.get("user")!;
  const slug = c.req.param("slug")!;
  const db = getDb();

  const cohort = db
    .select()
    .from(cohorts)
    .where(eq(cohorts.slug, slug))
    .get();
  if (!cohort) return c.json({ error: "Cohort not found" }, 404);

  const role = db
    .select({ role: cohortMembers.role })
    .from(cohortMembers)
    .where(
      and(eq(cohortMembers.cohortId, cohort.id), eq(cohortMembers.userId, me.id)),
    )
    .get();
  const isOrganizer = role?.role === "organizer" || cohort.creatorId === me.id;
  if (!isOrganizer) {
    return c.json({ error: "Only organizers can list invitations" }, 403);
  }

  const rows = db
    .select()
    .from(cohortInvitations)
    .where(eq(cohortInvitations.cohortId, cohort.id))
    .orderBy(desc(cohortInvitations.createdAt))
    .all();
  return c.json({
    invitations: rows.map((r) => ({
      id: r.id,
      email: r.email,
      token: r.token,
      status: r.status,
      message: r.message,
      createdAt: r.createdAt,
      decidedAt: r.decidedAt,
    })),
  });
});

cohortsRouter.post(
  "/:slug/invitations/:id/revoke",
  requireAuth,
  async (c) => {
    const me = c.get("user")!;
    const slug = c.req.param("slug")!;
    const id = c.req.param("id")!;
    const db = getDb();

    const cohort = db
      .select()
      .from(cohorts)
      .where(eq(cohorts.slug, slug))
      .get();
    if (!cohort) return c.json({ error: "Cohort not found" }, 404);

    const role = db
      .select({ role: cohortMembers.role })
      .from(cohortMembers)
      .where(
        and(eq(cohortMembers.cohortId, cohort.id), eq(cohortMembers.userId, me.id)),
      )
      .get();
    const isOrganizer = role?.role === "organizer" || cohort.creatorId === me.id;
    if (!isOrganizer) {
      return c.json({ error: "Only organizers can revoke invitations" }, 403);
    }

    const invite = db
      .select()
      .from(cohortInvitations)
      .where(eq(cohortInvitations.id, id))
      .get();
    if (!invite || invite.cohortId !== cohort.id) {
      return c.json({ error: "Invitation not found" }, 404);
    }
    if (invite.status !== "pending") {
      return c.json({ error: `Already ${invite.status}` }, 409);
    }
    db.update(cohortInvitations)
      .set({ status: "revoked", decidedAt: new Date().toISOString() })
      .where(eq(cohortInvitations.id, id))
      .run();
    return c.json({ ok: true });
  },
);

// --- Mentors -------------------------------------------------------

const requestMentorSchema = z.object({
  mentorUsername: z.string().min(1).max(80),
  scope: z.string().min(8).max(500),
});

const respondMentorSchema = z.object({
  status: z.enum(["accepted", "declined", "ended"]),
});

// Public endpoint — list users who have offered to mentor (heuristic
// v1: anyone with at least one accepted relationship surfaces).
mentorsRouter.get("/", async (c) => {
  const db = getDb();
  const rows = db
    .select({
      mentorId: mentorRelationships.mentorId,
      n: sql<number>`COUNT(*)`,
    })
    .from(mentorRelationships)
    .where(eq(mentorRelationships.status, "accepted"))
    .groupBy(mentorRelationships.mentorId)
    .orderBy(desc(sql`COUNT(*)`))
    .limit(30)
    .all();
  if (rows.length === 0) return c.json({ mentors: [] });
  const ids = rows.map((r) => r.mentorId);
  const userRows = db
    .select({
      id: users.id,
      username: users.username,
      displayName: users.displayName,
      bio: users.bio,
    })
    .from(users)
    .where(or(...ids.map((i) => eq(users.id, i))))
    .all();
  const byId = new Map(userRows.map((u) => [u.id, u]));
  return c.json({
    mentors: rows
      .map((r) => {
        const u = byId.get(r.mentorId);
        if (!u) return null;
        return {
          username: u.username,
          displayName: u.displayName,
          bio: u.bio,
          activeMentees: Number(r.n),
        };
      })
      .filter(Boolean),
  });
});

// The viewer's relationships in both directions.
mentorsRouter.get("/me", requireAuth, async (c) => {
  const user = c.get("user")!;
  const db = getDb();
  const asMentee = db
    .select({
      id: mentorRelationships.id,
      mentorId: mentorRelationships.mentorId,
      mentorUsername: users.username,
      status: mentorRelationships.status,
      scope: mentorRelationships.scope,
      requestedAt: mentorRelationships.requestedAt,
      respondedAt: mentorRelationships.respondedAt,
    })
    .from(mentorRelationships)
    .innerJoin(users, eq(mentorRelationships.mentorId, users.id))
    .where(eq(mentorRelationships.menteeId, user.id))
    .orderBy(desc(mentorRelationships.requestedAt))
    .all();
  const asMentor = db
    .select({
      id: mentorRelationships.id,
      menteeId: mentorRelationships.menteeId,
      menteeUsername: users.username,
      status: mentorRelationships.status,
      scope: mentorRelationships.scope,
      requestedAt: mentorRelationships.requestedAt,
      respondedAt: mentorRelationships.respondedAt,
    })
    .from(mentorRelationships)
    .innerJoin(users, eq(mentorRelationships.menteeId, users.id))
    .where(eq(mentorRelationships.mentorId, user.id))
    .orderBy(desc(mentorRelationships.requestedAt))
    .all();
  return c.json({ asMentee, asMentor });
});

mentorsRouter.post(
  "/request",
  requireAuth,
  zValidator("json", requestMentorSchema),
  async (c) => {
    const user = c.get("user")!;
    const data = c.req.valid("json");
    const db = getDb();
    const mentor = db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.username, data.mentorUsername))
      .get();
    if (!mentor) return c.json({ error: "Mentor not found" }, 404);
    if (mentor.id === user.id) {
      return c.json({ error: "You can't mentor yourself." }, 400);
    }
    const existing = db
      .select({ id: mentorRelationships.id, status: mentorRelationships.status })
      .from(mentorRelationships)
      .where(
        and(
          eq(mentorRelationships.mentorId, mentor.id),
          eq(mentorRelationships.menteeId, user.id),
        ),
      )
      .get();
    if (existing && existing.status !== "ended" && existing.status !== "declined") {
      return c.json(
        { error: "A mentorship with this mentor already exists." },
        409,
      );
    }
    if (existing) {
      db.update(mentorRelationships)
        .set({
          status: "pending",
          scope: data.scope,
          requestedAt: new Date().toISOString(),
          respondedAt: null,
        })
        .where(eq(mentorRelationships.id, existing.id))
        .run();
      return c.json({ id: existing.id });
    }
    const id = randomUUID();
    db.insert(mentorRelationships).values({
      id,
      mentorId: mentor.id,
      menteeId: user.id,
      status: "pending",
      scope: data.scope,
    }).run();
    return c.json({ id }, 201);
  },
);

mentorsRouter.post(
  "/:id/respond",
  requireAuth,
  zValidator("json", respondMentorSchema),
  async (c) => {
    const user = c.get("user")!;
    const id = c.req.param("id")!;
    const { status } = c.req.valid("json");
    const db = getDb();
    const row = db
      .select()
      .from(mentorRelationships)
      .where(eq(mentorRelationships.id, id))
      .get();
    if (!row) return c.json({ error: "Relationship not found" }, 404);
    // Mentor accepts/declines pending requests; either side can end
    // an accepted relationship.
    const isMentor = row.mentorId === user.id;
    const isMentee = row.menteeId === user.id;
    if (!isMentor && !isMentee) {
      return c.json(
        { error: "You're not part of this relationship." },
        403,
      );
    }
    if ((status === "accepted" || status === "declined") && !isMentor) {
      return c.json({ error: "Only the mentor can accept or decline." }, 403);
    }
    db.update(mentorRelationships)
      .set({ status, respondedAt: new Date().toISOString() })
      .where(eq(mentorRelationships.id, id))
      .run();
    return c.json({ ok: true });
  },
);

// Suppress unused-import — `ne` kept for future filter additions.
void ne;
