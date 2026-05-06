import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { getDb, users } from "@axiomic/db";
import { requireAuth } from "../middleware/auth";
import type { Env } from "../env";

export const settingsRouter = new Hono<Env>();

const themeSchema = z.enum([
  "light",
  "dark",
  "system",
  "sepia",
  "dim",
  "high-contrast",
]);

const updateSchema = z.object({
  theme: themeSchema.optional(),
  notifyMentions: z.boolean().optional(),
  notifyReplies: z.boolean().optional(),
  notifyMastery: z.boolean().optional(),
  displayName: z.string().max(80).nullable().optional(),
  bio: z.string().max(2000).nullable().optional(),
});

settingsRouter.get("/", requireAuth, async (c) => {
  const user = c.get("user")!;
  const db = getDb();

  const row = db
    .select({
      username: users.username,
      email: users.email,
      displayName: users.displayName,
      bio: users.bio,
      theme: users.theme,
      notifyMentions: users.notifyMentions,
      notifyReplies: users.notifyReplies,
      notifyMastery: users.notifyMastery,
    })
    .from(users)
    .where(eq(users.id, user.id))
    .get();

  if (!row) return c.json({ error: "User not found" }, 404);

  return c.json({
    settings: {
      ...row,
      theme: row.theme as z.infer<typeof themeSchema>,
    },
  });
});

settingsRouter.put(
  "/",
  requireAuth,
  zValidator("json", updateSchema),
  async (c) => {
    const user = c.get("user")!;
    const patch = c.req.valid("json");
    const db = getDb();

    const fields: Record<string, unknown> = {};
    if (patch.theme !== undefined) fields.theme = patch.theme;
    if (patch.notifyMentions !== undefined) fields.notifyMentions = patch.notifyMentions;
    if (patch.notifyReplies !== undefined) fields.notifyReplies = patch.notifyReplies;
    if (patch.notifyMastery !== undefined) fields.notifyMastery = patch.notifyMastery;
    if (patch.displayName !== undefined) fields.displayName = patch.displayName;
    if (patch.bio !== undefined) fields.bio = patch.bio;

    if (Object.keys(fields).length > 0) {
      fields.updatedAt = new Date().toISOString();
      db.update(users).set(fields).where(eq(users.id, user.id)).run();
    }

    const row = db
      .select({
        username: users.username,
        email: users.email,
        displayName: users.displayName,
        bio: users.bio,
        theme: users.theme,
        notifyMentions: users.notifyMentions,
        notifyReplies: users.notifyReplies,
      })
      .from(users)
      .where(eq(users.id, user.id))
      .get();

    return c.json({
      settings: {
        ...row,
        theme: row?.theme as z.infer<typeof themeSchema>,
      },
    });
  },
);
