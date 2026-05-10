import { describe, test, expect, beforeAll } from "bun:test";
import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { getDb, users, pets, classes } from "@axiomic/db";
import {
  grantXp,
  maybeHatchPet,
  totalXpForUser,
  classXpForUser,
  PET_HATCH_THRESHOLD_XP,
  XP_AMOUNTS,
} from "./xp";

const testRun = Date.now().toString(36);

function makeUser(suffix: string): string {
  const id = randomUUID();
  const username = `xpuser_${suffix}_${testRun}`.slice(0, 30);
  getDb()
    .insert(users)
    .values({
      id,
      username,
      email: `${username}@example.com`,
      passwordHash: "x",
    })
    .run();
  return id;
}

function makeClass(instructorId: string, suffix: string): string {
  const id = randomUUID();
  const slug = `xpclass-${suffix}-${testRun}`.slice(0, 60);
  getDb()
    .insert(classes)
    .values({
      id,
      slug,
      title: `XP test class ${suffix}`,
      joinCode: randomUUID().slice(0, 8),
      instructorId,
    })
    .run();
  return id;
}

describe("grantXp + maybeHatchPet", () => {
  let userId: string;

  beforeAll(() => {
    userId = makeUser("a");
  });

  test("first grant inserts a row and returns granted=true", () => {
    const r = grantXp({
      userId,
      source: "reading-done",
      sourceRefId: "task-1",
    });
    expect(r.granted).toBe(true);
    expect(r.amount).toBe(XP_AMOUNTS["reading-done"]);
  });

  test("repeating the same source+ref is a no-op (idempotent)", () => {
    const r = grantXp({
      userId,
      source: "reading-done",
      sourceRefId: "task-1",
    });
    expect(r.granted).toBe(false);
    expect(r.amount).toBe(0);
    // Total still reflects the single original grant.
    expect(totalXpForUser(userId)).toBe(XP_AMOUNTS["reading-done"]);
  });

  test("different sourceRefId grants again", () => {
    const r = grantXp({
      userId,
      source: "reading-done",
      sourceRefId: "task-2",
    });
    expect(r.granted).toBe(true);
    expect(totalXpForUser(userId)).toBe(2 * XP_AMOUNTS["reading-done"]);
  });

  test("class-scoped XP sums correctly", () => {
    const instructor = makeUser("instr");
    const classA = makeClass(instructor, "a");
    const classB = makeClass(instructor, "b");
    grantXp({ userId, classId: classA, source: "homework-submitted", sourceRefId: "ha-1" });
    grantXp({ userId, classId: classA, source: "attendance-present", sourceRefId: "att-1" });
    grantXp({ userId, classId: classB, source: "homework-submitted", sourceRefId: "hb-1" });

    expect(classXpForUser(userId, classA)).toBe(
      XP_AMOUNTS["homework-submitted"] + XP_AMOUNTS["attendance-present"],
    );
    expect(classXpForUser(userId, classB)).toBe(XP_AMOUNTS["homework-submitted"]);
  });

  test("pet auto-hatches at threshold; subsequent grants don't re-hatch", () => {
    const u = makeUser("b");
    // Stack up grants until we cross the threshold.
    grantXp({ userId: u, source: "homework-submitted", sourceRefId: "hh-1" }); // 30
    expect(totalXpForUser(u)).toBe(30);

    let r = grantXp({ userId: u, source: "homework-submitted", sourceRefId: "hh-2" }); // 60
    expect(r.granted).toBe(true);
    expect(r.petHatched).toBeDefined();
    expect(r.petHatched?.species).toBeTruthy();

    // A second grant past the threshold doesn't try to hatch again.
    r = grantXp({ userId: u, source: "reading-done", sourceRefId: "rr-1" });
    expect(r.granted).toBe(true);
    expect(r.petHatched).toBeUndefined();

    // DB state confirms one pet.
    const found = getDb().select().from(pets).where(eq(pets.userId, u)).all();
    expect(found.length).toBe(1);
  });

  test("maybeHatchPet does nothing below threshold", () => {
    const u = makeUser("c");
    grantXp({ userId: u, source: "reading-done", sourceRefId: "rr-2" });
    const r = maybeHatchPet(u);
    expect(r).toBeNull();
  });

  test("amount override beats default", () => {
    const u = makeUser("d");
    const r = grantXp({
      userId: u,
      source: "reading-done",
      sourceRefId: "rr-x",
      amount: 100,
    });
    expect(r.granted).toBe(true);
    expect(r.amount).toBe(100);
    expect(totalXpForUser(u)).toBe(100);
  });

  test("threshold constant matches expectation", () => {
    expect(PET_HATCH_THRESHOLD_XP).toBeGreaterThan(0);
    expect(PET_HATCH_THRESHOLD_XP).toBeLessThanOrEqual(100);
  });
});
