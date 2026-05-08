// Sprint 52 — Admin bootstrap. On cold start, if no user has
// role='admin' and BOOTSTRAP_ADMIN_USERNAME points at an existing
// account, promote that account. This guarantees a fresh deploy has
// at least one approver without manual SQL.
import { eq } from "drizzle-orm";
import { getDb, users } from "@axiomic/db";

export function bootstrapAdmin(envUsername: string | undefined): void {
  if (!envUsername) return;
  const db = getDb();
  const existing = db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.role, "admin"))
    .limit(1)
    .all();
  if (existing.length > 0) return;

  const target = db
    .select({ id: users.id, username: users.username })
    .from(users)
    .where(eq(users.username, envUsername))
    .get();
  if (!target) {
    console.warn(
      `[bootstrap-admin] BOOTSTRAP_ADMIN_USERNAME=${envUsername} but no user with that username — skipping promotion.`,
    );
    return;
  }

  db.update(users)
    .set({ role: "admin" })
    .where(eq(users.id, target.id))
    .run();
  console.log(`[bootstrap-admin] Promoted ${target.username} to admin.`);
}
