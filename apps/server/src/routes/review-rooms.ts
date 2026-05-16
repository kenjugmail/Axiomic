// Phase 29B — collaborative review rooms.
//
// A live discussion thread bolted onto a reproduction or a
// capstone submission so co-reviewers (or mentor + reviewee) can
// hash out a verdict together in realtime. Presence + append-only
// threaded messages — no OT/CRDT. The WebSocket fan-out reuses
// the liveBus room channel family (parallel to draft channels);
// this router only persists messages + publishes the event.

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, asc, eq, ne } from "drizzle-orm";
import { randomUUID } from "crypto";
import {
  capstoneEnrollments,
  capstoneSubmissions,
  capstonePeerReviews,
  getDb,
  reproductions,
  reviewRoomMessages,
  users,
} from "@axiomic/db";
import { requireAuth } from "../middleware/auth";
import { checkRateLimit } from "../lib/rateLimit";
import { env } from "../lib/envConfig";
import { notifyMany } from "../lib/notifications";
import { publishToRoom, type RoomKind } from "../lib/liveBus";
import type { Env } from "../env";

export const reviewRoomsRouter = new Hono<Env>();

const ROOM_KINDS = ["reproduction", "capstone_submission"] as const;

const postSchema = z.object({
  bodyMd: z.string().min(1).max(4000),
  parentId: z.string().min(1).max(64).optional(),
});

function isRoomKind(k: string): k is RoomKind {
  return (ROOM_KINDS as readonly string[]).includes(k);
}

// Stake check — only people involved in the review can read/post.
// Mirrors the platform's open peer-review model: a reproduction
// room is open to its reproducer + any authenticated user while
// it's reviewable (status==='success'), exactly like the review
// queue; a capstone room is the submission owner + its reviewers.
function canAccess(
  kind: RoomKind,
  roomId: string,
  userId: string,
): boolean {
  const db = getDb();
  if (kind === "reproduction") {
    const r = db
      .select({
        reproducerId: reproductions.reproducerId,
        status: reproductions.status,
      })
      .from(reproductions)
      .where(eq(reproductions.id, roomId))
      .get();
    if (!r) return false;
    return r.status === "success" || r.reproducerId === userId;
  }
  // capstone_submission
  const sub = db
    .select({ enrollmentId: capstoneSubmissions.enrollmentId })
    .from(capstoneSubmissions)
    .where(eq(capstoneSubmissions.id, roomId))
    .get();
  if (!sub) return false;
  const owner = db
    .select({ userId: capstoneEnrollments.userId })
    .from(capstoneEnrollments)
    .where(eq(capstoneEnrollments.id, sub.enrollmentId))
    .get();
  if (owner?.userId === userId) return true;
  const reviewed = db
    .select({ id: capstonePeerReviews.id })
    .from(capstonePeerReviews)
    .where(
      and(
        eq(capstonePeerReviews.submissionId, roomId),
        eq(capstonePeerReviews.reviewerId, userId),
      ),
    )
    .get();
  return !!reviewed;
}

// GET /review-rooms/:kind/:roomId/messages — full thread.
reviewRoomsRouter.get(
  "/:kind/:roomId/messages",
  requireAuth,
  async (c) => {
    const me = c.get("user")!;
    const kind = c.req.param("kind")!;
    const roomId = c.req.param("roomId")!;
    if (!isRoomKind(kind)) {
      return c.json({ error: "Unknown room kind" }, 400);
    }
    if (!canAccess(kind, roomId, me.id)) {
      return c.json({ error: "You're not part of this review." }, 403);
    }
    const db = getDb();
    const messages = db
      .select({
        id: reviewRoomMessages.id,
        authorId: reviewRoomMessages.authorId,
        authorUsername: users.username,
        bodyMd: reviewRoomMessages.bodyMd,
        parentId: reviewRoomMessages.parentId,
        createdAt: reviewRoomMessages.createdAt,
      })
      .from(reviewRoomMessages)
      .innerJoin(users, eq(reviewRoomMessages.authorId, users.id))
      .where(
        and(
          eq(reviewRoomMessages.roomKind, kind),
          eq(reviewRoomMessages.roomId, roomId),
        ),
      )
      .orderBy(asc(reviewRoomMessages.createdAt))
      .all();
    return c.json({ messages });
  },
);

// POST /review-rooms/:kind/:roomId/messages — append + fan out.
reviewRoomsRouter.post(
  "/:kind/:roomId/messages",
  requireAuth,
  zValidator("json", postSchema),
  async (c) => {
    const me = c.get("user")!;
    const kind = c.req.param("kind")!;
    const roomId = c.req.param("roomId")!;
    const { bodyMd, parentId } = c.req.valid("json");
    if (!isRoomKind(kind)) {
      return c.json({ error: "Unknown room kind" }, 400);
    }
    if (
      env.NODE_ENV !== "test" &&
      !checkRateLimit(`review-room-msg:${me.id}`, 30, 60_000)
    ) {
      return c.json({ error: "Rate limited. Slow down." }, 429);
    }
    if (!canAccess(kind, roomId, me.id)) {
      return c.json({ error: "You're not part of this review." }, 403);
    }
    const db = getDb();
    const id = randomUUID();
    const createdAt = new Date().toISOString();
    db.insert(reviewRoomMessages)
      .values({
        id,
        roomKind: kind,
        roomId,
        authorId: me.id,
        bodyMd,
        parentId: parentId ?? null,
      })
      .run();

    const message = {
      id,
      authorId: me.id,
      authorUsername: me.username,
      bodyMd,
      parentId: parentId ?? null,
      createdAt,
    };
    publishToRoom(kind, roomId, {
      type: "room_message",
      kind,
      roomId,
      message,
    });

    // Ping other people who've spoken in this room (best-effort,
    // idempotent, excludes the author).
    const others = db
      .select({ authorId: reviewRoomMessages.authorId })
      .from(reviewRoomMessages)
      .where(
        and(
          eq(reviewRoomMessages.roomKind, kind),
          eq(reviewRoomMessages.roomId, roomId),
          ne(reviewRoomMessages.authorId, me.id),
        ),
      )
      .all();
    const recipientIds = [...new Set(others.map((o) => o.authorId))];
    if (recipientIds.length > 0) {
      void notifyMany(recipientIds, {
        actorId: me.id,
        kind: "review_room_message",
        subjectType: "review_room",
        subjectId: `${kind}:${roomId}`,
        contextSlug: null,
        preview: `${me.username} replied in a review room`,
      });
    }

    return c.json({ ok: true, message }, 201);
  },
);
