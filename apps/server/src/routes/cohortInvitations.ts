// Sprint 52 — Cohort invitations router (token-based accept/decline).
//
// The organizer issues invites by email via POST /cohorts/:slug/invitations
// (in cohorts.ts); each invite carries a URL-safe token. This router
// exposes the public-by-token endpoints used by the accept page:
//
//   GET  /cohort-invitations/:token        — public peek
//   POST /cohort-invitations/:token/accept — auth required
//   POST /cohort-invitations/:token/decline — auth or anon

import { Hono } from "hono";
import { and, eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import {
  cohortInvitations,
  cohortMembers,
  cohorts,
  getDb,
  users,
} from "@axiomic/db";
import { requireAuth, getSessionUser } from "../middleware/auth";
import type { Env } from "../env";

export const cohortInvitationsRouter = new Hono<Env>();

cohortInvitationsRouter.get("/:token", async (c) => {
  const token = c.req.param("token");
  if (!token) return c.json({ error: "Invalid token" }, 400);
  const db = getDb();

  const invite = db
    .select()
    .from(cohortInvitations)
    .where(eq(cohortInvitations.token, token))
    .get();
  if (!invite) return c.json({ error: "Invitation not found" }, 404);

  const cohort = db
    .select()
    .from(cohorts)
    .where(eq(cohorts.id, invite.cohortId))
    .get();
  const inviter = db
    .select({ username: users.username, displayName: users.displayName })
    .from(users)
    .where(eq(users.id, invite.inviterId))
    .get();

  if (!cohort || !inviter) {
    return c.json({ error: "Invitation orphaned" }, 410);
  }

  return c.json({
    invitation: {
      id: invite.id,
      status: invite.status,
      email: invite.email,
      message: invite.message,
      createdAt: invite.createdAt,
      decidedAt: invite.decidedAt,
    },
    cohort: {
      slug: cohort.slug,
      name: cohort.name,
      description: cohort.description,
      visibility: cohort.visibility,
      capstoneSlug: cohort.capstoneSlug,
    },
    inviter: {
      username: inviter.username,
      displayName: inviter.displayName,
    },
  });
});

cohortInvitationsRouter.post("/:token/accept", requireAuth, async (c) => {
  const me = c.get("user");
  const token = c.req.param("token");
  if (!token) return c.json({ error: "Invalid token" }, 400);
  const db = getDb();

  const invite = db
    .select()
    .from(cohortInvitations)
    .where(eq(cohortInvitations.token, token))
    .get();
  if (!invite) return c.json({ error: "Invitation not found" }, 404);
  if (invite.status !== "pending") {
    return c.json({ error: `Invitation already ${invite.status}` }, 409);
  }

  // The invitee must be the matching email (case-insensitive). This
  // protects against a forwarded URL being claimed by a different
  // user.
  if (me.email.toLowerCase() !== invite.email.toLowerCase()) {
    return c.json(
      { error: "Invitation was issued to a different email" },
      403,
    );
  }

  const now = new Date().toISOString();
  db.update(cohortInvitations)
    .set({ status: "accepted", acceptedUserId: me.id, decidedAt: now })
    .where(eq(cohortInvitations.id, invite.id))
    .run();

  // Idempotent membership insert.
  const existing = db
    .select()
    .from(cohortMembers)
    .where(
      and(
        eq(cohortMembers.cohortId, invite.cohortId),
        eq(cohortMembers.userId, me.id),
      ),
    )
    .get();
  if (!existing) {
    db.insert(cohortMembers)
      .values({
        id: randomUUID(),
        cohortId: invite.cohortId,
        userId: me.id,
        role: "member",
      })
      .run();
  }

  const cohort = db
    .select({ slug: cohorts.slug })
    .from(cohorts)
    .where(eq(cohorts.id, invite.cohortId))
    .get();
  return c.json({ ok: true, cohortSlug: cohort?.slug ?? null });
});

cohortInvitationsRouter.post("/:token/decline", async (c) => {
  const token = c.req.param("token");
  if (!token) return c.json({ error: "Invalid token" }, 400);
  const db = getDb();

  const invite = db
    .select()
    .from(cohortInvitations)
    .where(eq(cohortInvitations.token, token))
    .get();
  if (!invite) return c.json({ error: "Invitation not found" }, 404);
  if (invite.status !== "pending") {
    return c.json({ error: `Invitation already ${invite.status}` }, 409);
  }

  const me = await getSessionUser(c);
  // If the user is signed in, only allow decline when the email
  // matches; otherwise (anonymous) accept the decline at face value.
  if (me && me.email.toLowerCase() !== invite.email.toLowerCase()) {
    return c.json(
      { error: "Invitation was issued to a different email" },
      403,
    );
  }

  db.update(cohortInvitations)
    .set({
      status: "declined",
      decidedAt: new Date().toISOString(),
    })
    .where(eq(cohortInvitations.id, invite.id))
    .run();

  return c.json({ ok: true });
});
