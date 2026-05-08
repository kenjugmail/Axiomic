// Sprint 43 — Cohorts + mentor relationships.
//
// Cohorts: small named groups working through material together.
// Anyone can create one; visibility is 'open' (auto-join) or 'invite'
// (organizer approves). Mentor relationships: one-to-one outside of
// cohorts — a mentee requests, a mentor accepts.

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, desc, eq, ne, or, sql } from "drizzle-orm";
import { randomUUID } from "crypto";
import {
  capstones,
  cohortMembers,
  cohorts,
  getDb,
  mentorRelationships,
  users,
} from "@axiomic/db";
import { requireAuth, getSessionUser } from "../middleware/auth";
import type { Env } from "../env";

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
