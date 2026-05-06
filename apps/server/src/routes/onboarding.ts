import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq, and, asc, sql } from "drizzle-orm";
import {
  getDb,
  users,
  masteryPaths,
  masteryNodes,
  lessonProgress,
} from "@axiomic/db";
import { requireAuth } from "../middleware/auth";
import type { Env } from "../env";

export const onboardingRouter = new Hono<Env>();

const bodySchema = z.object({
  // Slug of the path the user picked. Optional so the user can skip the
  // wizard without committing to a path; we still mark onboardedAt to
  // stop re-prompting.
  pathSlug: z.string().min(1).max(120).optional(),
});

// GET /api/v1/onboarding/status — has the current user already
// onboarded? Cheap check used by the client to decide whether to
// surface the wizard.
onboardingRouter.get("/status", requireAuth, async (c) => {
  const user = c.get("user")!;
  const db = getDb();
  const row = db
    .select({
      onboardedAt: users.onboardedAt,
      startingPathSlug: users.startingPathSlug,
    })
    .from(users)
    .where(eq(users.id, user.id))
    .get();
  return c.json({
    onboarded: !!row?.onboardedAt,
    startingPathSlug: row?.startingPathSlug ?? null,
  });
});

// POST /api/v1/onboarding — finalize the wizard. Idempotent: a second
// call with no pathSlug is a no-op once onboardedAt is set; a second
// call WITH a pathSlug is allowed (let users change their mind from
// settings later).
onboardingRouter.post(
  "/",
  requireAuth,
  zValidator("json", bodySchema),
  async (c) => {
    const user = c.get("user")!;
    const { pathSlug } = c.req.valid("json");
    const db = getDb();

    // Resolve the path slug to an id when present. Reject unknown slugs
    // so the client can't write garbage into the column.
    let pathId: string | null = null;
    if (pathSlug) {
      const path = db
        .select({ id: masteryPaths.id, slug: masteryPaths.slug })
        .from(masteryPaths)
        .where(eq(masteryPaths.slug, pathSlug))
        .get();
      if (!path) return c.json({ error: "Unknown path" }, 400);
      pathId = path.id;
    }

    db.update(users)
      .set({
        onboardedAt: new Date().toISOString(),
        startingPathSlug: pathSlug ?? null,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(users.id, user.id))
      .run();

    // Seed a lessonProgress row at the path's first node so the
    // dashboard's "Continue learning" tile lights up immediately. We
    // use INSERT OR IGNORE semantics: if the user already has progress
    // on that node (re-running the wizard), we don't clobber it.
    let firstNodeSlug: string | null = null;
    if (pathId) {
      const firstNode = db
        .select({ id: masteryNodes.id, slug: masteryNodes.slug })
        .from(masteryNodes)
        .where(eq(masteryNodes.pathId, pathId))
        .orderBy(asc(masteryNodes.order))
        .limit(1)
        .get();
      if (firstNode) {
        firstNodeSlug = firstNode.slug;
        // INSERT OR IGNORE: don't overwrite existing progress on rerun.
        db.run(sql`
          INSERT OR IGNORE INTO lesson_progress (id, user_id, node_id, slide_idx, updated_at)
          VALUES (${crypto.randomUUID()}, ${user.id}, ${firstNode.id}, 0, ${new Date().toISOString()})
        `);
      }
    }

    return c.json({
      onboarded: true,
      startingPathSlug: pathSlug ?? null,
      firstNodeSlug,
    });
  },
);
