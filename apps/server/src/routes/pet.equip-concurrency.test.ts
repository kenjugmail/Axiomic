// Phase 14A — concurrent equip safety.
//
// /equip wraps its read+write block in db.transaction(...) so two
// concurrent requests against the same slot can't both pass the
// "clear other-equipped-in-slot" read and both succeed in flipping
// the equipped flag. better-sqlite3 serializes write transactions,
// so the second request sees the first's writes.
//
// This test fires two concurrent equips against the same slot
// (head: study-cap then top-hat) and asserts the final inventory
// state has exactly one equipped item in that slot.

import { describe, test, expect } from "bun:test";
import { randomUUID } from "crypto";
import { and, eq } from "drizzle-orm";
import {
  getDb,
  petCosmetics,
  petInventory,
  pets,
  users,
} from "@axiomic/db";
import { app } from "../index";

async function req(path: string, opts?: RequestInit): Promise<Response> {
  return await app.fetch(new Request(`http://localhost/api/v1${path}`, opts));
}

function cookieHeader(cookie: string): Record<string, string> {
  return { cookie: cookie.split(";")[0] };
}

const testId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

async function signup(suffix: string) {
  const username = `eqc_${suffix}_${testId}`.slice(0, 30);
  const res = await req("/auth/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username,
      email: `${username}@example.com`,
      password: "testpass123",
    }),
  });
  const cookie = res.headers.get("set-cookie") || "";
  return { cookie, username };
}

function ensurePetWithItems(username: string, slugs: string[]): void {
  const db = getDb();
  const userRow = db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.username, username))
    .get();
  if (!userRow) throw new Error(`user not found: ${username}`);
  const petId = randomUUID();
  db.insert(pets)
    .values({
      id: petId,
      userId: userRow.id,
      species: "cat",
      level: 1,
      activeSkinSlug: "default",
    })
    .run();
  db.update(users).set({ activePetId: petId }).where(eq(users.id, userRow.id)).run();
  for (const slug of slugs) {
    db.insert(petInventory)
      .values({
        id: randomUUID(),
        userId: userRow.id,
        cosmeticSlug: slug,
        equipped: false,
      })
      .onConflictDoNothing()
      .run();
  }
}

describe("Phase 14A — /equip concurrency", () => {
  test("two concurrent equips on the same slot leave exactly one equipped", async () => {
    const me = await signup("conc");
    // study-cap + top-hat are both head-slot cosmetics shipped
    // by the seed catalog. Ensure they exist before issuing the
    // requests; the catalog auto-seeds on first /me/pet read.
    await req("/me/pet", { headers: cookieHeader(me.cookie) });
    ensurePetWithItems(me.username, ["study-cap", "top-hat"]);

    // Verify the cosmetics are both head-slot. If the seed JSON
    // ever splits them apart this test should fail loudly.
    const db = getDb();
    const headSlugs = db
      .select({ slug: petCosmetics.slug })
      .from(petCosmetics)
      .where(eq(petCosmetics.slot, "head"))
      .all()
      .map((r) => r.slug);
    expect(headSlugs).toContain("study-cap");
    expect(headSlugs).toContain("top-hat");

    const userRow = db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.username, me.username))
      .get()!;

    const equipA = req("/me/pet/equip", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(me.cookie) },
      body: JSON.stringify({ cosmeticSlug: "study-cap" }),
    });
    const equipB = req("/me/pet/equip", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(me.cookie) },
      body: JSON.stringify({ cosmeticSlug: "top-hat" }),
    });

    const [resA, resB] = await Promise.all([equipA, equipB]);
    expect(resA.status).toBe(200);
    expect(resB.status).toBe(200);

    // After both resolve, query the inventory directly. Exactly
    // one head-slot item should be equipped.
    const equippedHead = db
      .select({ slug: petInventory.cosmeticSlug })
      .from(petInventory)
      .innerJoin(petCosmetics, eq(petCosmetics.slug, petInventory.cosmeticSlug))
      .where(
        and(
          eq(petInventory.userId, userRow.id),
          eq(petCosmetics.slot, "head"),
          eq(petInventory.equipped, true),
        ),
      )
      .all();
    expect(equippedHead.length).toBe(1);
    // The winner is whichever transaction committed second — both
    // valid. Just assert it's one of the two we requested.
    expect(["study-cap", "top-hat"]).toContain(equippedHead[0]!.slug);
  });

  test("/equip with an unowned slug returns 404 (transaction rolls back)", async () => {
    const me = await signup("noown");
    ensurePetWithItems(me.username, []);
    // wizard-hat is in the seed catalog but NOT in the starter
    // pack auto-grant, so the user genuinely doesn't own it.
    const res = await req("/me/pet/equip", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(me.cookie) },
      body: JSON.stringify({ cosmeticSlug: "wizard-hat" }),
    });
    expect(res.status).toBe(404);
  });
});
