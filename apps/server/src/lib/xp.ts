// S86 — XP ledger + pet hatching.
//
// Centralized helper that all XP-granting paths must call. Writes
// into `xp_grants` with INSERT-OR-IGNORE semantics so the unique
// (userId, source, sourceRefId) index does the idempotency. After a
// successful grant, checks whether the user should hatch their first
// pet (and does so) — keeping the side effect close to the trigger
// so the pet appears immediately on the response that earned it.

import { randomUUID } from "crypto";
import { sql } from "drizzle-orm";
import { eq } from "drizzle-orm";
import { getDb, pets, xpGrants } from "@axiomic/db";
import { randomPetSpecies } from "./pets";
import { currentStreak } from "./achievements";
import { notify } from "./notifications";

// XP awarded for each engagement source. Tunable from one place;
// per-task overrides on `class_tasks.xp_reward` win when present.
export const XP_AMOUNTS = {
  "reading-done": 10,
  "homework-submitted": 30,
  "homework-graded-pass": 20,
  "attendance-present": 15,
  "attendance-late": 5,
  "lesson-completed": 8,
  "quiz-passed": 12,
  "code-question-passed": 12,
} as const;

// Sources with default amounts in XP_AMOUNTS.
export type XpSource = keyof typeof XP_AMOUNTS | "streak-day-bonus";

// Pet auto-hatches at this XP threshold. Low so the first homework
// or two reveals the pet — fast feedback.
export const PET_HATCH_THRESHOLD_XP = 50;

// S87 — Streak-day bonus tuning.
//
// Awarded once per UTC day on the user's first non-bonus XP grant
// of the day, IFF they have a streak of ≥2. Amount scales with
// streak length but caps so a 100-day streak doesn't dwarf an
// honest day's work. The bonus rides on the existing xp_grants
// uniqueness invariant (userId, source, sourceRefId) where
// sourceRefId is today's date, so a second activity on the same
// day silently no-ops.
export const STREAK_BONUS_PER_DAY = 3;
export const STREAK_BONUS_MAX = 30;

export interface GrantXpInput {
  userId: string;
  classId?: string | null;
  source: XpSource;
  sourceRefId: string;
  // Optional override; when omitted falls back to XP_AMOUNTS[source].
  amount?: number;
}

export interface GrantXpResult {
  granted: boolean;
  amount: number;
  petHatched?: { species: string; name: string };
}

// Insert an XP grant. Idempotent: a second call with the same
// (userId, source, sourceRefId) is a no-op (returns granted=false).
// On a successful first grant, also checks whether to hatch a pet.
//
// Streak side-effect: any non-bonus grant first attempts a streak
// bonus (idempotent on the user's date key, so subsequent grants
// the same day silently no-op). This means the user's first daily
// activity emits a single bonus XP grant alongside the triggering
// grant.
export function grantXp(input: GrantXpInput): GrantXpResult {
  const db = getDb();
  const isStreakBonus = input.source === "streak-day-bonus";
  // Look up default; bonus sources require an explicit amount.
  const defaultAmount = isStreakBonus
    ? undefined
    : XP_AMOUNTS[input.source as keyof typeof XP_AMOUNTS];
  const amount = input.amount ?? defaultAmount;
  if (typeof amount !== "number" || amount <= 0) {
    return { granted: false, amount: 0 };
  }

  // Streak bonus rides on the same grantXp idempotency. Run it
  // BEFORE the triggering grant so it's eligible when the streak
  // was already at 2 yesterday — i.e. the user picks up today.
  if (!isStreakBonus) {
    maybeGrantStreakBonus(input.userId);
  }

  // INSERT OR IGNORE keeps idempotency at the SQL layer. drizzle's
  // .onConflictDoNothing() emits the same SQL.
  const id = randomUUID();
  const res = db
    .insert(xpGrants)
    .values({
      id,
      userId: input.userId,
      classId: input.classId ?? null,
      source: input.source,
      sourceRefId: input.sourceRefId,
      amount,
    })
    .onConflictDoNothing()
    .run();

  // better-sqlite3 returns { changes }. 0 changes = unique-index hit
  // = duplicate grant suppressed.
  const granted = ((res as unknown as { changes?: number }).changes ?? 0) > 0;
  if (!granted) {
    return { granted: false, amount: 0 };
  }

  const hatched = maybeHatchPet(input.userId);
  return {
    granted: true,
    amount,
    ...(hatched ? { petHatched: hatched } : {}),
  };
}

// Sums the user's lifetime XP across all sources (class-scoped or
// not). Used by maybeHatchPet + the leaderboard's tie-break + the
// /me/pet response.
export function totalXpForUser(userId: string): number {
  const db = getDb();
  const row = db
    .select({ total: sql<number>`coalesce(sum(${xpGrants.amount}), 0)` })
    .from(xpGrants)
    .where(eq(xpGrants.userId, userId))
    .get();
  return row?.total ?? 0;
}

// Sums XP for a user within a specific class. Class leaderboard
// uses this directly via a GROUP BY; this single-user variant is
// for /me/pet + the user's own class-membership card.
export function classXpForUser(userId: string, classId: string): number {
  const db = getDb();
  const row = db
    .select({ total: sql<number>`coalesce(sum(${xpGrants.amount}), 0)` })
    .from(xpGrants)
    .where(sql`${xpGrants.userId} = ${userId} and ${xpGrants.classId} = ${classId}`)
    .get();
  return row?.total ?? 0;
}

// Hatch the user's first pet if they've crossed the XP threshold
// and don't yet have one. Idempotent — repeated calls are no-ops
// once a pet exists. Returns the hatched pet's species + name when
// a hatching happens, otherwise null.
export function maybeHatchPet(userId: string): { species: string; name: string } | null {
  const db = getDb();
  const existing = db
    .select({ id: pets.id })
    .from(pets)
    .where(eq(pets.userId, userId))
    .get();
  if (existing) return null;

  const totalXp = totalXpForUser(userId);
  if (totalXp < PET_HATCH_THRESHOLD_XP) return null;

  const species = randomPetSpecies();
  const petId = randomUUID();
  db.insert(pets)
    .values({
      id: petId,
      userId,
      species: species.slug,
      name: species.label,
    })
    .run();

  // S88 — surface the hatch event in the user's notification bell.
  // System-emitted (actorId=null) since it's an automatic milestone.
  void notify({
    recipientId: userId,
    actorId: null,
    kind: "pet_hatched",
    subjectType: "pet",
    subjectId: petId,
    contextSlug: null,
    preview: `Your egg hatched into a ${species.label}!`,
  });

  return { species: species.slug, name: species.label };
}

// S87 — Streak-day bonus.
//
// Awarded once per UTC day to users with an active streak (≥2 days
// of consecutive activity). Amount scales with streak length up to
// STREAK_BONUS_MAX. Idempotent: sourceRefId is today's UTC date so a
// second activity the same day silently no-ops at the SQL layer.
//
// Returns null when no bonus was granted (streak too short, or
// already claimed today). The caller is grantXp itself, which calls
// this BEFORE its own grant for any non-streak-bonus source.
export function maybeGrantStreakBonus(userId: string): GrantXpResult | null {
  const db = getDb();
  const streak = currentStreak(db, userId);
  if (streak < 2) return null;
  const today = new Date().toISOString().slice(0, 10);
  const amount = Math.min(streak * STREAK_BONUS_PER_DAY, STREAK_BONUS_MAX);
  // Calls grantXp recursively but tags as streak-day-bonus so the
  // recursion guard short-circuits — the inner call won't itself
  // trigger another streak bonus.
  return grantXp({
    userId,
    source: "streak-day-bonus",
    sourceRefId: today,
    amount,
  });
}
