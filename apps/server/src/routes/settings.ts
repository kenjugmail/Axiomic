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

// ORCID is 16 digits with hyphens after every 4 (last group can end
// in X). Validate strictly so we don't store junk that breaks the
// S72 author-claim flow downstream.
const ORCID_REGEX = /^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/;
const orcidSchema = z
  .string()
  .max(19)
  .regex(ORCID_REGEX, "ORCID must be in 0000-0000-0000-0000 format")
  .nullable();

const blueskyHandleSchema = z
  .string()
  .max(80)
  .regex(/^@?[a-z0-9.\-]{1,80}$/i, "Bluesky handle must be alphanumeric")
  .nullable();

const twitterHandleSchema = z
  .string()
  .max(40)
  .regex(/^@?[a-z0-9_]{1,40}$/i, "Twitter handle must be alphanumeric")
  .nullable();

const updateSchema = z.object({
  theme: themeSchema.optional(),
  notifyMentions: z.boolean().optional(),
  notifyReplies: z.boolean().optional(),
  notifyMastery: z.boolean().optional(),
  displayName: z.string().max(80).nullable().optional(),
  bio: z.string().max(2000).nullable().optional(),
  // Sprint 69 — researcher profile fields. Settings is the single
  // source-of-truth for these; ProfilePage just renders them. URL
  // fields are validated for shape but not for liveness — we don't
  // want to fail a save because the user's institution server is
  // down.
  orcid: orcidSchema.optional(),
  scholarUrl: z
    .string()
    .url("Must be a valid URL")
    .max(500)
    .nullable()
    .optional(),
  blueskyHandle: blueskyHandleSchema.optional(),
  twitterHandle: twitterHandleSchema.optional(),
  institution: z.string().max(200).nullable().optional(),
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
      orcid: users.orcid,
      scholarUrl: users.scholarUrl,
      blueskyHandle: users.blueskyHandle,
      twitterHandle: users.twitterHandle,
      institution: users.institution,
      hIndex: users.hIndex,
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
    if (patch.orcid !== undefined) fields.orcid = patch.orcid;
    if (patch.scholarUrl !== undefined) fields.scholarUrl = patch.scholarUrl;
    if (patch.blueskyHandle !== undefined) {
      // Strip a leading @ so storage is canonical.
      fields.blueskyHandle = patch.blueskyHandle?.replace(/^@/, "") ?? null;
    }
    if (patch.twitterHandle !== undefined) {
      fields.twitterHandle = patch.twitterHandle?.replace(/^@/, "") ?? null;
    }
    if (patch.institution !== undefined) fields.institution = patch.institution;

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
        notifyMastery: users.notifyMastery,
        orcid: users.orcid,
        scholarUrl: users.scholarUrl,
        blueskyHandle: users.blueskyHandle,
        twitterHandle: users.twitterHandle,
        institution: users.institution,
        hIndex: users.hIndex,
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
