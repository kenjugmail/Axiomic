import { Hono } from "hono";
import { desc, eq } from "drizzle-orm";
import { getDb, userAchievements, users } from "@axiomic/db";
import {
  ACHIEVEMENTS,
  activityHeatmap,
  currentStreak,
  getAchievement,
} from "../lib/achievements";
import type { Env } from "../env";

export const achievementsRouter = new Hono<Env>();

// Catalog: every achievement that exists, with its title/description/
// icon. Used by the profile UI to render locked rows alongside earned
// ones (greyed out).
achievementsRouter.get("/catalog", (c) => {
  return c.json({
    achievements: ACHIEVEMENTS.map((a) => ({
      slug: a.slug,
      title: a.title,
      description: a.description,
      icon: a.icon,
    })),
  });
});

// Per-user earned achievements + streak + activity heatmap (last 84
// days, i.e. 12 weeks).
achievementsRouter.get("/users/:username", (c) => {
  const username = c.req.param("username");
  const db = getDb();
  const user = db
    .select({ id: users.id, username: users.username })
    .from(users)
    .where(eq(users.username, username))
    .get();
  if (!user) return c.json({ error: "User not found" }, 404);

  const rows = db
    .select()
    .from(userAchievements)
    .where(eq(userAchievements.userId, user.id))
    .orderBy(desc(userAchievements.awardedAt))
    .all();

  const earned = rows.map((r) => {
    const meta = getAchievement(r.slug);
    return {
      slug: r.slug,
      awardedAt: r.awardedAt,
      title: meta?.title ?? r.slug,
      description: meta?.description ?? "",
      icon: meta?.icon ?? "🏆",
    };
  });

  return c.json({
    username: user.username,
    earned,
    streak: currentStreak(db, user.id),
    heatmap: activityHeatmap(user.id, 84, db),
  });
});
