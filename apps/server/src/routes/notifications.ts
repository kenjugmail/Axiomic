import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, count, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { aliasedTable } from "drizzle-orm";
import { getDb, notifications, users } from "@axiomic/db";
import { requireAuth } from "../middleware/auth";
import type { Env } from "../env";

export const notificationsRouter = new Hono<Env>();

// --- List notifications -------------------------------------------------

const listSchema = z.object({
  unread: z
    .union([z.literal("true"), z.literal("false")])
    .optional()
    .transform((v) => v === "true"),
  limit: z
    .string()
    .optional()
    .transform((v) => Math.min(50, Math.max(1, parseInt(v ?? "20", 10) || 20))),
  offset: z
    .string()
    .optional()
    .transform((v) => Math.max(0, parseInt(v ?? "0", 10) || 0)),
});

notificationsRouter.get(
  "/",
  requireAuth,
  zValidator("query", listSchema),
  async (c) => {
    const user = c.get("user")!;
    const { unread, limit, offset } = c.req.valid("query");
    const db = getDb();

    const actor = aliasedTable(users, "actor");

    const where = unread
      ? and(eq(notifications.userId, user.id), isNull(notifications.readAt))
      : eq(notifications.userId, user.id);

    const rows = await db
      .select({
        id: notifications.id,
        kind: notifications.kind,
        subjectType: notifications.subjectType,
        subjectId: notifications.subjectId,
        contextSlug: notifications.contextSlug,
        preview: notifications.preview,
        readAt: notifications.readAt,
        createdAt: notifications.createdAt,
        actorId: actor.id,
        actorUsername: actor.username,
      })
      .from(notifications)
      .leftJoin(actor, eq(notifications.actorId, actor.id))
      .where(where)
      .orderBy(desc(notifications.createdAt))
      .limit(limit)
      .offset(offset)
      .all();

    const totalRow = await db
      .select({ n: count() })
      .from(notifications)
      .where(where)
      .get();

    return c.json({
      notifications: rows.map((r) => ({
        id: r.id,
        kind: r.kind as "mention" | "topic_reply" | "post_reply" | "comment_reply",
        subjectType: r.subjectType as "topic" | "post" | "comment",
        subjectId: r.subjectId,
        contextSlug: r.contextSlug,
        preview: r.preview,
        readAt: r.readAt,
        createdAt: r.createdAt,
        actor:
          r.actorId && r.actorUsername
            ? { id: r.actorId, username: r.actorUsername }
            : null,
      })),
      total: totalRow?.n ?? 0,
    });
  },
);

// --- Unread count -------------------------------------------------------

notificationsRouter.get("/unread-count", requireAuth, async (c) => {
  const user = c.get("user")!;
  const db = getDb();

  const row = await db
    .select({ n: count() })
    .from(notifications)
    .where(
      and(eq(notifications.userId, user.id), isNull(notifications.readAt)),
    )
    .get();

  return c.json({ count: row?.n ?? 0 });
});

// --- Mark read ----------------------------------------------------------

const markReadSchema = z
  .object({
    ids: z.array(z.string().min(1)).min(1).max(200).optional(),
    all: z.boolean().optional(),
  })
  .refine((v) => (v.all === true) !== (Array.isArray(v.ids) && v.ids.length > 0), {
    message: "Provide exactly one of { all: true } or { ids: [...] }",
  });

notificationsRouter.post(
  "/mark-read",
  requireAuth,
  zValidator("json", markReadSchema),
  async (c) => {
    const user = c.get("user")!;
    const body = c.req.valid("json");
    const db = getDb();

    if (body.all === true) {
      db.update(notifications)
        .set({ readAt: sql`COALESCE(${notifications.readAt}, datetime('now'))` })
        .where(
          and(
            eq(notifications.userId, user.id),
            isNull(notifications.readAt),
          ),
        )
        .run();
    } else {
      const ids = body.ids ?? [];
      if (ids.length > 0) {
        db.update(notifications)
          .set({ readAt: sql`COALESCE(${notifications.readAt}, datetime('now'))` })
          .where(
            and(
              eq(notifications.userId, user.id),
              inArray(notifications.id, ids),
            ),
          )
          .run();
      }
    }

    return c.json({ ok: true });
  },
);

// --- Delete one ---------------------------------------------------------

notificationsRouter.delete("/:id", requireAuth, async (c) => {
  const user = c.get("user")!;
  const id = c.req.param("id");
  if (!id) return c.json({ error: "Missing id" }, 400);
  const db = getDb();

  db.delete(notifications)
    .where(and(eq(notifications.id, id), eq(notifications.userId, user.id)))
    .run();

  return c.json({ ok: true });
});
