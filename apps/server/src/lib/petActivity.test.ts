// Phase 14D — recordPetActivity wraps recordActivity and writes a
// row into activity_events with the corresponding kind. Routes call
// it after a successful pet mutation so the heatmap reflects pet
// engagement alongside study events.

import { describe, test, expect } from "bun:test";
import { randomUUID } from "crypto";
import { and, eq } from "drizzle-orm";
import {
  activityEvents,
  getDb,
  users,
} from "@axiomic/db";
import { recordPetActivity } from "./petActivity";

function seedUser(): string {
  const db = getDb();
  const id = randomUUID();
  const username = `pa_${id.slice(0, 6)}`;
  db.insert(users)
    .values({
      id,
      username,
      email: `${username}@example.com`,
      passwordHash: "x",
    })
    .run();
  return id;
}

function countActivity(userId: string, kind: string): number {
  const db = getDb();
  return db
    .select({ id: activityEvents.id })
    .from(activityEvents)
    .where(and(eq(activityEvents.userId, userId), eq(activityEvents.kind, kind)))
    .all()
    .length;
}

describe("Phase 14D — recordPetActivity", () => {
  test("writes a pet_equip event for the user", () => {
    const userId = seedUser();
    expect(countActivity(userId, "pet_equip")).toBe(0);
    recordPetActivity(userId, "pet_equip", "study-cap");
    expect(countActivity(userId, "pet_equip")).toBe(1);
  });

  test("each call appends a new row (not idempotent)", () => {
    const userId = seedUser();
    recordPetActivity(userId, "pet_buy_cosmetic", "top-hat");
    recordPetActivity(userId, "pet_buy_cosmetic", "top-hat");
    expect(countActivity(userId, "pet_buy_cosmetic")).toBe(2);
  });

  test("distinct kinds count independently", () => {
    const userId = seedUser();
    recordPetActivity(userId, "pet_equip", "x");
    recordPetActivity(userId, "pet_unequip", "x");
    recordPetActivity(userId, "pet_rename", "p1");
    recordPetActivity(userId, "pet_hatch_another", "p2");
    expect(countActivity(userId, "pet_equip")).toBe(1);
    expect(countActivity(userId, "pet_unequip")).toBe(1);
    expect(countActivity(userId, "pet_rename")).toBe(1);
    expect(countActivity(userId, "pet_hatch_another")).toBe(1);
  });

  test("failures in the underlying insert don't throw", () => {
    // Passing a non-existent userId trips the FK constraint on
    // activity_events.user_id, but recordActivity catches + logs.
    // Behavior contract: the caller is never interrupted.
    expect(() =>
      recordPetActivity("nonexistent-user-id", "pet_equip", "x"),
    ).not.toThrow();
  });
});
