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

export type XpSource = keyof typeof XP_AMOUNTS;

// Pet auto-hatches at this XP threshold. Low so the first homework
// or two reveals the pet — fast feedback.
export const PET_HATCH_THRESHOLD_XP = 50;

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
export function grantXp(input: GrantXpInput): GrantXpResult {
  const db = getDb();
  const amount = input.amount ?? XP_AMOUNTS[input.source];
  if (typeof amount !== "number" || amount <= 0) {
    return { granted: false, amount: 0 };
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
  db.insert(pets)
    .values({
      id: randomUUID(),
      userId,
      species: species.slug,
      name: species.label,
    })
    .run();

  return { species: species.slug, name: species.label };
}
