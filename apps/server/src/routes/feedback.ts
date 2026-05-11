// S108 — Beta feedback inbox.
//
// POST /feedback writes a row to feedback_reports. Anonymous reports
// are allowed (userId null). Rate-limited per IP to keep spam down.
// Admin reviews submissions at /admin/feedback (read-only).

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { feedbackReports, getDb } from "@axiomic/db";
import { desc } from "drizzle-orm";
import { randomUUID } from "crypto";
import { checkRateLimit, rateLimitIdentity } from "../lib/rateLimit";
import { getSessionUser, requireAuth } from "../middleware/auth";
import { requireAdmin } from "../middleware/requireAdmin";
import type { Env } from "../env";

export const feedbackRouter = new Hono<Env>();

const submitSchema = z.object({
  kind: z.enum(["bug", "idea", "praise"]),
  message: z.string().min(1).max(2000),
  currentUrl: z.string().max(500).optional(),
});

feedbackRouter.post("/", zValidator("json", submitSchema), async (c) => {
  const user = await getSessionUser(c);
  // 20 reports / minute / identity. Generous for legitimate users
  // (a heated bug-hunting session); tight enough to deter spam.
  const key = `feedback:${rateLimitIdentity(c, user?.id)}`;
  if (!checkRateLimit(key, 20, 60_000)) {
    return c.json({ error: "Too many feedback submissions. Slow down." }, 429);
  }
  const { kind, message, currentUrl } = c.req.valid("json");
  const browserUa = c.req.header("user-agent") ?? null;
  const db = getDb();
  db.insert(feedbackReports).values({
    id: randomUUID(),
    userId: user?.id ?? null,
    kind,
    message,
    currentUrl: currentUrl ?? null,
    browserUa,
  }).run();
  return c.json({ ok: true });
});

// Admin-only review surface. Returns the most recent 200 reports.
feedbackRouter.get("/admin", requireAuth, requireAdmin, async (c) => {
  const db = getDb();
  const rows = db
    .select()
    .from(feedbackReports)
    .orderBy(desc(feedbackReports.createdAt))
    .limit(200)
    .all();
  return c.json({ reports: rows });
});
