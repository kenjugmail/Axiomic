// S92 — Achievement → cosmetic auto-grant.
//
// evaluateAchievements is HTTP-fronted via /achievements + called as
// a side effect from various route handlers. The S92 addition is the
// `rewardCosmeticSlug` field — this file unit-tests the grant-on-
// award path directly to keep the spec close to the code.

import { describe, test, expect, beforeAll } from "bun:test";
import { randomUUID } from "crypto";
import { eq, sql } from "drizzle-orm";
import {
  getDb,
  users,
  petInventory,
  petCosmetics,
  activityEvents,
  forumTopics,
} from "@axiomic/db";
import { evaluateAchievements, recordActivity } from "./achievements";

let testRun = "";
beforeAll(() => {
  testRun = Date.now().toString(36);
  // Make sure the catalog has the cosmetics we expect to grant. The
  // db seeder normally populates these; if it didn't (e.g. a fresh
  // test DB), inject minimal rows so the FK / lookup succeeds.
  const db = getDb();
  for (const slug of ["rose", "book", "gold-star", "grad-cap", "ribbon"]) {
    const existing = db.select({ id: petCosmetics.id }).from(petCosmetics).where(eq(petCosmetics.slug, slug)).get();
    if (!existing) {
      db.insert(petCosmetics).values({
        id: randomUUID(),
        slug,
        name: slug,
        slot: "accessory",
        renderKind: "emoji",
        emoji: null,
        rarity: "common",
        grantOnly: true,
        description: "",
        xpCost: null,
      }).run();
    }
  }
});

function makeUser(suffix: string): string {
  const id = randomUUID();
  const usernameBase = `s92ach_${suffix}_${testRun}`.toLowerCase();
  // Truncate to fit the 32-char username constraint while keeping uniqueness.
  const username = usernameBase.slice(0, 32);
  getDb().insert(users).values({
    id,
    username,
    email: `${id}@example.test`,
    passwordHash: "x",
  }).run();
  return id;
}

// Seed N consecutive activity-event rows ending today so currentStreak
// returns >= N.
function seedActivityForDays(userId: string, days: number) {
  const cursor = new Date();
  const db = getDb();
  for (let i = 0; i < days; i++) {
    const day = cursor.toISOString().slice(0, 10);
    db.insert(activityEvents).values({
      id: randomUUID(),
      userId,
      kind: "node_completed",
      day,
    }).run();
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
}

describe("evaluateAchievements grants cosmetic rewards (S92)", () => {
  test("streak_3 grants the book cosmetic", () => {
    const u = makeUser("streak3");
    seedActivityForDays(u, 3);
    const newly = evaluateAchievements(u);
    expect(newly).toContain("streak_3");
    const inv = getDb().select().from(petInventory).where(eq(petInventory.userId, u)).all();
    expect(inv.some((i) => i.cosmeticSlug === "book")).toBe(true);
  });

  test("re-evaluation doesn't double-grant (idempotent)", () => {
    const u = makeUser("idemp");
    seedActivityForDays(u, 3);
    evaluateAchievements(u);
    const before = getDb().select().from(petInventory).where(eq(petInventory.userId, u)).all().length;
    evaluateAchievements(u);
    const after = getDb().select().from(petInventory).where(eq(petInventory.userId, u)).all().length;
    expect(after).toBe(before);
  });

  test("achievement without rewardCosmeticSlug doesn't grant anything", () => {
    const u = makeUser("noreward");
    // first_steps requires one node_completed; recordActivity makes
    // sure that's true.
    recordActivity(u, "node_completed");
    const newly = evaluateAchievements(u);
    expect(newly).toContain("first_steps");
    const inv = getDb().select().from(petInventory).where(eq(petInventory.userId, u)).all();
    // first_steps has no rewardCosmeticSlug — inventory stays empty.
    expect(inv.length).toBe(0);
  });

  test("first_topic grants rose cosmetic", () => {
    const u = makeUser("topic");
    // Bypass the route layer — write a forum_topics row directly with
    // the minimum NOT NULL columns the schema requires. The
    // achievement predicate just counts authored topics.
    const db = getDb();
    // Pick any seeded domain to satisfy the FK constraint.
    const anyDomain = db.select({ id: sql<string>`id` }).from(sql`domains`).get() as { id: string } | undefined;
    if (!anyDomain) return; // domain table empty in this test DB
    db.insert(forumTopics).values({
      id: randomUUID(),
      slug: `topic-${u}-${randomUUID().slice(0, 8)}`,
      title: "test topic",
      body: "body",
      postType: "discussion",
      domainId: anyDomain.id,
      authorId: u,
    }).run();
    evaluateAchievements(u);
    const inv = db.select().from(petInventory).where(eq(petInventory.userId, u)).all();
    expect(inv.some((i) => i.cosmeticSlug === "rose")).toBe(true);
  });
});
