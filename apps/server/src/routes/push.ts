// S107a — Web Push subscription endpoints.
//
// The browser side calls these three routes:
//   1. GET /push/vapid-public-key — public so the SW + page can
//      pull the VAPID key on first load, before the user has opted
//      in. Returns null when push isn't configured for this env
//      so the client knows to hide the "enable" button.
//   2. POST /push/subscribe — registers a PushSubscription with
//      this user. Idempotent by endpoint (UNIQUE).
//   3. POST /push/unsubscribe — drop the subscription matching an
//      endpoint that the caller owns.

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { randomUUID } from "crypto";
import { and, eq } from "drizzle-orm";
import { getDb, pushSubscriptions } from "@axiomic/db";
import { requireAuth } from "../middleware/auth";
import { getVapidPublicKey } from "../lib/pushSender";
import type { Env } from "../env";

export const pushRouter = new Hono<Env>();

pushRouter.get("/vapid-public-key", (c) => {
  return c.json({ key: getVapidPublicKey() });
});

const subscribeSchema = z.object({
  endpoint: z.string().url().max(2000),
  p256dhKey: z.string().min(1).max(200),
  authKey: z.string().min(1).max(200),
  userAgent: z.string().max(500).optional(),
});

pushRouter.post(
  "/subscribe",
  requireAuth,
  zValidator("json", subscribeSchema),
  (c) => {
    const user = c.get("user")!;
    const data = c.req.valid("json");
    const db = getDb();

    // Idempotent on endpoint. If the same browser re-subscribes
    // (key rotation, permission re-grant), we re-bind it to this
    // user and refresh the keys. Note: ownership transfer — if
    // user A previously held the endpoint and user B subscribes
    // with the same endpoint, B wins. This matches what the
    // browser semantics imply (one PushSubscription per browser).
    const existing = db
      .select({ id: pushSubscriptions.id })
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.endpoint, data.endpoint))
      .get();
    if (existing) {
      db.update(pushSubscriptions)
        .set({
          userId: user.id,
          p256dhKey: data.p256dhKey,
          authKey: data.authKey,
          userAgent: data.userAgent ?? null,
          lastUsedAt: new Date().toISOString(),
        })
        .where(eq(pushSubscriptions.id, existing.id))
        .run();
    } else {
      db.insert(pushSubscriptions)
        .values({
          id: randomUUID(),
          userId: user.id,
          endpoint: data.endpoint,
          p256dhKey: data.p256dhKey,
          authKey: data.authKey,
          userAgent: data.userAgent ?? null,
        })
        .run();
    }
    return c.json({ ok: true });
  },
);

const unsubscribeSchema = z.object({
  endpoint: z.string().url().max(2000),
});

pushRouter.post(
  "/unsubscribe",
  requireAuth,
  zValidator("json", unsubscribeSchema),
  (c) => {
    const user = c.get("user")!;
    const { endpoint } = c.req.valid("json");
    const db = getDb();
    db.delete(pushSubscriptions)
      .where(
        and(
          eq(pushSubscriptions.endpoint, endpoint),
          eq(pushSubscriptions.userId, user.id),
        ),
      )
      .run();
    return c.json({ ok: true });
  },
);
