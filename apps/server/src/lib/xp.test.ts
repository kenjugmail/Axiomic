import { describe, test, expect, beforeAll } from "bun:test";
import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { getDb, users, pets, classes, activityEvents } from "@axiomic/db";
import {
  grantXp,
  maybeGrantStreakBonus,
  maybeHatchPet,
  maybeLevelUp,
  totalXpForUser,
  classXpForUser,
  PET_HATCH_THRESHOLD_XP,
  STREAK_BONUS_PER_DAY,
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

// S87 — Seed activity_events rows so currentStreak() reads back a
// streak of `days` (today + (days-1) prior days). Mirrors what
// recordActivity would do in production but writes directly so the
// tests don't depend on the achievements pipeline.
function seedActivityForDays(userId: string, days: number) {
  const cursor = new Date();
  for (let i = 0; i < days; i++) {
    const day = cursor.toISOString().slice(0, 10);
    getDb()
      .insert(activityEvents)
      .values({
        id: randomUUID(),
        userId,
        kind: "node_completed",
        day,
        // occurredAt defaults to now; that's fine — currentStreak
        // only looks at the day key.
      })
      .run();
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
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

describe("maybeGrantStreakBonus (S87)", () => {
  test("returns null when streak < 2 (no prior activity)", () => {
    const u = makeUser("streak1");
    const r = maybeGrantStreakBonus(u);
    expect(r).toBeNull();
  });

  test("grants once per day; second call same day is idempotent", () => {
    const u = makeUser("streak2");
    // Seed the streak by inserting activity for today + yesterday.
    seedActivityForDays(u, 2);

    const before = totalXpForUser(u);
    const first = maybeGrantStreakBonus(u);
    expect(first).not.toBeNull();
    expect(first?.granted).toBe(true);
    expect(first?.amount).toBeGreaterThanOrEqual(STREAK_BONUS_PER_DAY * 2);

    const middle = totalXpForUser(u);
    expect(middle - before).toBe(first!.amount);

    const second = maybeGrantStreakBonus(u);
    expect(second?.granted).toBe(false); // unique-index hit
    expect(totalXpForUser(u)).toBe(middle); // no new XP
  });

  test("grantXp triggers streak bonus inline on first daily grant", () => {
    const u = makeUser("streak3");
    seedActivityForDays(u, 3); // streak = 3

    const before = totalXpForUser(u);
    const r = grantXp({
      userId: u,
      source: "reading-done",
      sourceRefId: "morning-reading",
    });
    expect(r.granted).toBe(true);
    const after = totalXpForUser(u);
    // Triggering grant + a streak bonus arrived together: total
    // delta is reading-done amount + streak-bonus amount.
    expect(after - before).toBeGreaterThan(XP_AMOUNTS["reading-done"]);
  });
});

describe("maybeLevelUp (S90)", () => {
  // Helper: grant a target XP total via N grants of fixed amount.
  // Uses an explicit amount override so tests don't break if
  // XP_AMOUNTS is retuned.
  function grantTotalXp(userId: string, target: number) {
    const grantSize = 50;
    const grants = Math.ceil(target / grantSize);
    for (let i = 0; i < grants; i++) {
      grantXp({
        userId,
        source: "homework-graded-pass",
        sourceRefId: `seed-${i}`,
        amount: grantSize,
      });
    }
  }

  test("freshly-hatched pet is level 1 (above hatch, below level 2)", () => {
    const u = makeUser("level1");
    grantTotalXp(u, 100); // hatch=50, level-2=250 — sits at level 1
    const pet = getDb().select().from(pets).where(eq(pets.userId, u)).get();
    expect(pet).toBeDefined();
    expect(pet?.level).toBe(1);
  });

  test("pet levels up when total XP crosses a threshold", () => {
    const u = makeUser("level2");
    grantTotalXp(u, 300); // past level-2 threshold (250)
    const pet = getDb().select().from(pets).where(eq(pets.userId, u)).get();
    expect(pet?.level).toBe(2);
  });

  test("re-running maybeLevelUp at the same XP is a no-op", () => {
    const u = makeUser("level3");
    grantTotalXp(u, 300);
    const before = getDb().select().from(pets).where(eq(pets.userId, u)).get();
    expect(before?.level).toBe(2);
    const newLevel = maybeLevelUp(u);
    expect(newLevel).toBeNull();
    const after = getDb().select().from(pets).where(eq(pets.userId, u)).get();
    expect(after?.level).toBe(2);
  });

  test("level skips correctly when xp jumps past two thresholds", () => {
    const u = makeUser("level4");
    grantTotalXp(u, 800); // past level-3 threshold (750)
    const pet = getDb().select().from(pets).where(eq(pets.userId, u)).get();
    expect(pet?.level).toBe(3);
  });

  test("S-audit regression: emits one notification per crossed level (no skipped levels in the bell)", async () => {
    const { notifications } = await import("@axiomic/db");
    const u = makeUser("level5");
    // Jump from pre-hatch (no pet) to level 3 in one motion.
    grantTotalXp(u, 800);
    // notify() is invoked as `void notify(...)` from inside
    // maybeLevelUp — fire-and-forget. better-sqlite3's writes are
    // synchronous but the await on the wrapper's Promise schedules
    // a microtask. Drain the microtask queue before reading.
    await new Promise<void>((r) => setImmediate(r));
    const rows = getDb()
      .select()
      .from(notifications)
      .where(eq(notifications.userId, u))
      .all();
    const levelUpRows = rows.filter((r) => r.kind === "pet_leveled_up");
    // Pet hatched at level 1, then leveled to 2 then to 3 — the bell
    // should show TWO pet_leveled_up notifications (Lv 2 + Lv 3).
    // Pre-fix this was 1 (only the highest reached).
    expect(levelUpRows.length).toBe(2);
    const previews = levelUpRows.map((r) => r.preview ?? "").sort();
    expect(previews.some((p) => p.includes("level 2"))).toBe(true);
    expect(previews.some((p) => p.includes("level 3"))).toBe(true);
  });
});
