import { randomUUID } from "crypto";
import { and, count, eq, gte, sql } from "drizzle-orm";
import {
  activityEvents,
  flashcards,
  forumTopics,
  getDb,
  masteryNodes,
  petInventory,
  userAchievements,
  userProgress,
  type Db,
} from "@axiomic/db";
// S92 — local lazy reference to the notification helper so an
// achievement reward grant surfaces in the user's bell.
import { notify } from "./notifications";

// Hardcoded achievement catalog. Adding one is one entry here + one
// `predicate` that knows how to detect when it's earned. We deliberately
// avoid a DB-backed catalog so tweaks don't require a migration.

export type ActivityKind =
  | "node_completed"
  | "quiz_passed"
  | "lesson_completed"
  | "lesson_edit"
  | "flashcard_saved"
  | "flashcard_reviewed"
  | "forum_topic_created"
  | "code_question_passed"
  // S91 — counts as activity for streak bonuses (S87) and gives
  // users a low-friction way to keep their streak alive on quiet
  // days.
  | "daily_challenge";

export interface Achievement {
  slug: string;
  title: string;
  description: string;
  icon: string;          // emoji shown in the UI
  // Returns true iff this user has earned the achievement right now.
  predicate: (db: Db, userId: string) => boolean;
  // S92 — when set, the named pet cosmetic is granted to the user
  // (idempotent on (userId, cosmeticSlug)) the first time the
  // achievement is awarded. Cosmetic-granted notification fires too,
  // tagged with the achievement's title in the note.
  rewardCosmeticSlug?: string;
}

function countActivity(db: Db, userId: string, kind: ActivityKind | "any"): number {
  const where = kind === "any"
    ? eq(activityEvents.userId, userId)
    : and(eq(activityEvents.userId, userId), eq(activityEvents.kind, kind));
  const row = db.select({ n: count() }).from(activityEvents).where(where).get();
  return Number(row?.n ?? 0);
}

function countCompletedAtLevel(db: Db, userId: string, pathSlug: string, level: string): { done: number; total: number } {
  const total = db
    .select({ n: count() })
    .from(masteryNodes)
    .innerJoin(
      sql`mastery_paths`,
      sql`${masteryNodes.pathId} = mastery_paths.id`,
    )
    .where(
      sql`mastery_paths.slug = ${pathSlug} AND ${masteryNodes.level} = ${level}`,
    )
    .get();
  const done = db
    .select({ n: count() })
    .from(userProgress)
    .innerJoin(masteryNodes, eq(userProgress.nodeId, masteryNodes.id))
    .innerJoin(
      sql`mastery_paths`,
      sql`${masteryNodes.pathId} = mastery_paths.id`,
    )
    .where(
      sql`mastery_paths.slug = ${pathSlug} AND ${masteryNodes.level} = ${level} AND ${userProgress.userId} = ${userId} AND ${userProgress.completed} = 1`,
    )
    .get();
  return { done: Number(done?.n ?? 0), total: Number(total?.n ?? 0) };
}

// Compute today's streak length in days for a user. A streak is the
// number of consecutive trailing days (today, yesterday, ...) on which
// the user logged at least one activity event. We compute it by reading
// the distinct day keys and walking backward from today's UTC date.
export function currentStreak(db: Db, userId: string): number {
  const rows = db
    .selectDistinct({ day: activityEvents.day })
    .from(activityEvents)
    .where(eq(activityEvents.userId, userId))
    .all();
  const days = new Set(rows.map((r) => r.day));
  let streak = 0;
  const cursor = new Date();
  // Operate in UTC so we match the day-key formatter.
  for (;;) {
    const key = cursor.toISOString().slice(0, 10);
    if (!days.has(key)) {
      // Allow today to be empty without breaking the streak — a user who
      // hasn't logged in yet today still has yesterday's streak intact.
      if (streak === 0 && key === new Date().toISOString().slice(0, 10)) {
        cursor.setUTCDate(cursor.getUTCDate() - 1);
        continue;
      }
      break;
    }
    streak++;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return streak;
}

export const ACHIEVEMENTS: Achievement[] = [
  {
    slug: "first_steps",
    title: "First Steps",
    description: "Completed your first mastery node",
    icon: "🚶",
    predicate: (db, uid) => countActivity(db, uid, "node_completed") >= 1,
  },
  {
    slug: "first_quiz",
    title: "Quiz Passed",
    description: "Passed your first quiz",
    icon: "✅",
    predicate: (db, uid) => countActivity(db, uid, "quiz_passed") >= 1,
  },
  {
    slug: "first_lesson",
    title: "Brilliant Beginnings",
    description: "Finished your first interactive lesson",
    icon: "💡",
    predicate: (db, uid) => countActivity(db, uid, "lesson_completed") >= 1,
  },
  {
    slug: "code_warrior",
    title: "Code Warrior",
    description: "Passed your first Python code challenge",
    icon: "🐍",
    predicate: (db, uid) => countActivity(db, uid, "code_question_passed") >= 1,
  },
  {
    slug: "first_topic",
    title: "Voice Heard",
    description: "Started your first forum topic",
    icon: "📣",
    rewardCosmeticSlug: "rose",
    predicate: (db, uid) => {
      const row = db
        .select({ n: count() })
        .from(forumTopics)
        .where(eq(forumTopics.authorId, uid))
        .get();
      return Number(row?.n ?? 0) >= 1;
    },
  },
  {
    slug: "deck_builder",
    title: "Deck Builder",
    description: "Saved 5 flashcards to your deck",
    icon: "🃏",
    predicate: (db, uid) => {
      const row = db
        .select({ n: count() })
        .from(flashcards)
        .where(eq(flashcards.userId, uid))
        .get();
      return Number(row?.n ?? 0) >= 5;
    },
  },
  {
    slug: "apprentice_ml",
    title: "ML Apprentice",
    description: "Completed every Apprentice node on the ML Engineer path",
    icon: "🎓",
    rewardCosmeticSlug: "grad-cap",
    predicate: (db, uid) => {
      const r = countCompletedAtLevel(db, uid, "ml-engineer", "apprentice");
      return r.total > 0 && r.done >= r.total;
    },
  },
  {
    slug: "streak_3",
    title: "Three-Day Streak",
    description: "Three consecutive days of learning activity",
    icon: "🔥",
    rewardCosmeticSlug: "book",
    predicate: (db, uid) => currentStreak(db, uid) >= 3,
  },
  {
    slug: "streak_7",
    title: "Week-Long Streak",
    description: "Seven consecutive days of learning activity",
    icon: "🌟",
    rewardCosmeticSlug: "gold-star",
    predicate: (db, uid) => currentStreak(db, uid) >= 7,
  },
  // Authoring achievements — wiki-style open editing means every signed-in
  // user can rewrite a lesson. Recognize the contributors who do.
  {
    slug: "lesson_first_edit",
    title: "Author",
    description: "Edited your first lesson",
    icon: "✏️",
    predicate: (db, uid) => countActivity(db, uid, "lesson_edit") >= 1,
  },
  {
    slug: "lesson_5_edits",
    title: "Curator",
    description: "Edited five lessons",
    icon: "✨",
    predicate: (db, uid) => countActivity(db, uid, "lesson_edit") >= 5,
  },
  {
    slug: "lesson_25_edits",
    title: "Editor-in-chief",
    description: "Edited twenty-five lessons",
    icon: "🏆",
    rewardCosmeticSlug: "ribbon",
    predicate: (db, uid) => countActivity(db, uid, "lesson_edit") >= 25,
  },
];

const BY_SLUG = new Map(ACHIEVEMENTS.map((a) => [a.slug, a]));

export function getAchievement(slug: string): Achievement | undefined {
  return BY_SLUG.get(slug);
}

// Append a single activity event. Best-effort — failures are logged
// but don't break the calling request. The day key uses UTC so
// streak boundaries are consistent across timezones.
export function recordActivity(
  userId: string,
  kind: ActivityKind,
  db: Db = getDb(),
): void {
  try {
    db.insert(activityEvents).values({
      id: randomUUID(),
      userId,
      kind,
      day: new Date().toISOString().slice(0, 10),
    }).run();
  } catch (err) {
    console.error("recordActivity failed", { userId, kind, err });
  }
}

// Evaluate every achievement against the current state of `userId`,
// inserting `user_achievements` rows for any that are now true and
// haven't been awarded before. Returns the list of newly-awarded
// achievement slugs so the caller can surface a celebration UI.
export function evaluateAchievements(userId: string, db: Db = getDb()): string[] {
  const earned = new Set(
    db
      .select({ slug: userAchievements.slug })
      .from(userAchievements)
      .where(eq(userAchievements.userId, userId))
      .all()
      .map((r) => r.slug),
  );

  const newly: string[] = [];
  for (const a of ACHIEVEMENTS) {
    if (earned.has(a.slug)) continue;
    let won = false;
    try {
      won = a.predicate(db, userId);
    } catch (err) {
      console.error("achievement predicate failed", a.slug, err);
      continue;
    }
    if (!won) continue;
    try {
      db.insert(userAchievements).values({
        id: randomUUID(),
        userId,
        slug: a.slug,
      }).onConflictDoNothing().run();
      newly.push(a.slug);
      // S92 — auto-grant the linked cosmetic, if any. Idempotent
      // on (userId, cosmeticSlug) — pet_inventory's UNIQUE index
      // does the dedup. We also fire a cosmetic_granted notification
      // so the user sees the reward in their bell. Both calls are
      // best-effort: failures are logged but don't unwind the
      // achievement insert.
      if (a.rewardCosmeticSlug) {
        try {
          db.insert(petInventory).values({
            id: randomUUID(),
            userId,
            cosmeticSlug: a.rewardCosmeticSlug,
            equipped: false,
            grantedNote: `Earned for the ${a.title} achievement`,
          }).onConflictDoNothing().run();
          void notify({
            recipientId: userId,
            actorId: null,
            kind: "cosmetic_granted",
            subjectType: "cosmetic",
            subjectId: a.rewardCosmeticSlug,
            contextSlug: null,
            preview: `${a.icon} ${a.title} — earned a cosmetic`,
          });
        } catch (err) {
          console.error("achievement cosmetic grant failed", a.slug, err);
        }
      }
    } catch (err) {
      console.error("achievement insert failed", a.slug, err);
    }
  }
  return newly;
}

// Convenience: record an activity event and immediately evaluate. Used
// by route hooks. Returns newly-awarded slugs.
export function recordActivityAndEvaluate(
  userId: string,
  kind: ActivityKind,
  db: Db = getDb(),
): string[] {
  recordActivity(userId, kind, db);
  return evaluateAchievements(userId, db);
}

// Aggregate activity-event counts per day for the last `days` days
// (inclusive of today). Returns rows even for days with zero events
// (the heatmap renders all cells).
export function activityHeatmap(userId: string, days: number, db: Db = getDb()): { day: string; count: number }[] {
  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - (days - 1));
  const cutoffKey = cutoff.toISOString().slice(0, 10);

  const rows = db
    .select({ day: activityEvents.day, n: count() })
    .from(activityEvents)
    .where(
      and(eq(activityEvents.userId, userId), gte(activityEvents.day, cutoffKey)),
    )
    .groupBy(activityEvents.day)
    .all();

  const byDay = new Map(rows.map((r) => [r.day, Number(r.n)]));

  const out: { day: string; count: number }[] = [];
  const cursor = new Date(cutoff);
  for (let i = 0; i < days; i++) {
    const k = cursor.toISOString().slice(0, 10);
    out.push({ day: k, count: byDay.get(k) ?? 0 });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}
