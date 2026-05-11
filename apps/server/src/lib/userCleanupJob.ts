// S108 — Hard-delete users that have been soft-deleted for 30+ days.
//
// On self-service account deletion the route flips `users.deletedAt`
// instead of deleting the row immediately. That gives the user a
// 30-day window to recover (by contacting support, which then nulls
// the flag). After 30 days this job hard-deletes the row; the
// FK chain (onDelete: cascade) handles content cleanup.
//
// Also expires the auth_login_attempts ring buffer (24h retention)
// so the lockout query stays bounded as login traffic grows.

import { and, eq, isNotNull, lt, sql } from "drizzle-orm";
import { authLoginAttempts, getDb, users } from "@axiomic/db";
import type { JobDefinition } from "./jobs";

const DELETE_GRACE_DAYS = 30;
const LOGIN_ATTEMPT_RETENTION_HOURS = 24;

export const hardDeleteSoftDeletedUsersJob: JobDefinition = {
  name: "hard-delete-soft-deleted-users",
  intervalMs: 6 * 60 * 60 * 1000, // every 6 hours
  run: async () => {
    const db = getDb();
    const cutoff = new Date(
      Date.now() - DELETE_GRACE_DAYS * 24 * 60 * 60 * 1000,
    ).toISOString();
    const toDelete = db
      .select({ id: users.id })
      .from(users)
      .where(and(isNotNull(users.deletedAt), lt(users.deletedAt, cutoff)))
      .all();
    let removed = 0;
    for (const u of toDelete) {
      try {
        db.delete(users).where(eq(users.id, u.id)).run();
        removed++;
      } catch {
        // Row may be referenced by a not-yet-cascading FK; skip and
        // try next pass. We don't throw because that aborts the job
        // run and the user-facing impact is just "row still around."
      }
    }
    return { itemsProcessed: removed };
  },
};

export const cleanupOldLoginAttemptsJob: JobDefinition = {
  name: "cleanup-old-login-attempts",
  intervalMs: 60 * 60 * 1000, // hourly
  run: async () => {
    const db = getDb();
    const cutoff = new Date(
      Date.now() - LOGIN_ATTEMPT_RETENTION_HOURS * 60 * 60 * 1000,
    ).toISOString();
    // drizzle's run() doesn't expose row counts in a typesafe way
    // here; count first, then delete.
    const before = db
      .select({ n: sql<number>`count(*)` })
      .from(authLoginAttempts)
      .where(lt(authLoginAttempts.attemptedAt, cutoff))
      .get();
    db.delete(authLoginAttempts)
      .where(lt(authLoginAttempts.attemptedAt, cutoff))
      .run();
    return { itemsProcessed: Number(before?.n ?? 0) };
  },
};
