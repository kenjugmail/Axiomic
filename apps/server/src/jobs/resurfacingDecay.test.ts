// Phase 32E — proactive decay-aware resurfacing.
//
// Seeds a stale minted reproduction credential + a long-resolved
// misconception, runs the job, and asserts: a `review_due`
// notification lands for each owner; re-running is idempotent
// (notify dedupe while unread → 0 new); the kind is muteable via
// the mastery toggle (a user with notifyMastery=false gets none).

import { describe, test, expect } from "bun:test";
import { app } from "../index";
import { registerJob, runJobNow } from "../lib/jobs";
import { resurfacingDecayJob, RESOLVED_DECAY_DAYS } from "./resurfacingDecay";
import { AGING_MAX_DAYS } from "../lib/freshness";

async function req(path: string, opts?: RequestInit): Promise<Response> {
  return await app.fetch(new Request(`http://localhost/api/v1${path}`, opts));
}
const testRun = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

async function signup(suffix: string) {
  const username = `rs_${suffix}_${testRun}`.slice(0, 30);
  const res = await req("/auth/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username,
      email: `${username}@example.com`,
      password: "testpass123",
    }),
  });
  const data = (await res.json()) as { user: { id: string } };
  return { userId: data.user.id, username };
}

function daysAgo(n: number): string {
  return new Date(Date.now() - n * 86_400_000).toISOString();
}

describe("resurfacing decay job (Phase 32D)", () => {
  test("nudges stale credentials + long-resolved misconceptions; idempotent; muteable", async () => {
    const {
      getDb,
      reproductions,
      misconceptionDiagnoses,
      notifications,
      users,
    } = await import("@axiomic/db");
    const { and, eq } = await import("drizzle-orm");
    const { randomUUID } = await import("crypto");
    const db = getDb();

    const a = await signup("a"); // stale reproduction credential
    const b = await signup("b"); // long-resolved misconception
    const m = await signup("m"); // resolved, but mastery muted
    db.update(users)
      .set({ notifyMastery: false })
      .where(eq(users.username, m.username))
      .run();

    db.insert(reproductions)
      .values({
        id: randomUUID(),
        articleId: null,
        targetKind: "research_paper",
        targetId: `paper-rs-${testRun}`,
        reproducerId: a.userId,
        status: "success",
        notes: "old",
        evidenceUrl: "https://example.com/x",
        credentialMintedAt: daysAgo(AGING_MAX_DAYS + 30), // stale
        credentialMintWeight: 3.0,
      })
      .run();

    for (const who of [b, m]) {
      db.insert(misconceptionDiagnoses)
        .values({
          id: randomUUID(),
          userId: who.userId,
          conceptSlug: `c-${who.username}`,
          misconceptionKey: `k-${who.username}`,
          label: "Confuses X with Y",
          status: "resolved",
          resolvedAt: daysAgo(RESOLVED_DECAY_DAYS + 10),
        })
        .run();
    }

    registerJob(resurfacingDecayJob);
    const r1 = await runJobNow("resurfacing_decay");
    expect((r1.itemsProcessed ?? 0)).toBeGreaterThanOrEqual(2);

    const dueFor = (uid: string) =>
      db
        .select({ id: notifications.id })
        .from(notifications)
        .where(
          and(
            eq(notifications.userId, uid),
            eq(notifications.kind, "review_due"),
          ),
        )
        .all();

    expect(dueFor(a.userId).length).toBe(1); // stale credential
    expect(dueFor(b.userId).length).toBe(1); // long-resolved
    expect(dueFor(m.userId).length).toBe(0); // muted via notifyMastery

    // Idempotent: dedupe-while-unread → no new notifications.
    const r2 = await runJobNow("resurfacing_decay");
    expect(r2.itemsProcessed ?? 0).toBe(0);
    expect(dueFor(a.userId).length).toBe(1);
    expect(dueFor(b.userId).length).toBe(1);
  });
});
