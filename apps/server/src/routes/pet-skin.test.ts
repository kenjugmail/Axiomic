// Phase L — pet skin endpoint tests.
//
// Covers the new skin lifecycle: autoprovision-default on first
// GET, equip an owned skin, equip an unowned skin (403), buy a
// skin (XP debit + inventory insert), and unequip (back to default).

import { describe, test, expect } from "bun:test";
import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { getDb, pets, users, xpGrants } from "@axiomic/db";
import { app } from "../index";

async function req(path: string, opts?: RequestInit): Promise<Response> {
  return await app.fetch(new Request(`http://localhost/api/v1${path}`, opts));
}

function cookieHeader(cookie: string): Record<string, string> {
  return { cookie: cookie.split(";")[0] };
}

const testId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

async function signup(suffix: string) {
  const username = `sk_${suffix}_${testId}`.slice(0, 30);
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

// Direct-DB helper: give the user a pet at species/level with the
// 'default' skin equipped. Sets users.activePetId so subsequent
// /me/pet/skin/equip calls find an active pet.
function ensurePet(username: string, species = "cat", level = 1): string {
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
      species,
      level,
      activeSkinSlug: "default",
    })
    .run();
  db.update(users).set({ activePetId: petId }).where(eq(users.id, userRow.id)).run();
  return petId;
}

// Direct-DB helper: grant the user N XP so buy-skin can debit it.
function grantXp(username: string, amount: number): void {
  const db = getDb();
  const userRow = db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.username, username))
    .get();
  if (!userRow) throw new Error(`user not found: ${username}`);
  db.insert(xpGrants)
    .values({
      id: randomUUID(),
      userId: userRow.id,
      classId: null,
      source: "test-seed",
      sourceRefId: randomUUID(),
      amount,
    })
    .run();
}

describe("Phase L — pet skin endpoints", () => {
  test("GET /me/pet autoprovisions default skin + returns it as activeSkin", async () => {
    const me = await signup("autoprov");
    const res = await req("/me/pet", { headers: cookieHeader(me.cookie) });
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.activeSkin).toBeTruthy();
    expect(data.activeSkin.slug).toBe("default");
    expect(Array.isArray(data.ownedSkins)).toBe(true);
    const slugs = data.ownedSkins.map((s: any) => s.slug);
    expect(slugs).toContain("default");
  });

  test("POST /me/pet/skin/equip with default succeeds idempotently", async () => {
    const me = await signup("equipdef");
    ensurePet(me.username);
    const r1 = await req("/me/pet/skin/equip", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(me.cookie) },
      body: JSON.stringify({ skinSlug: "default" }),
    });
    expect(r1.status).toBe(200);
    const r2 = await req("/me/pet/skin/equip", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(me.cookie) },
      body: JSON.stringify({ skinSlug: "default" }),
    });
    expect(r2.status).toBe(200);
  });

  test("POST /me/pet/skin/equip with an unowned skin returns 403", async () => {
    const me = await signup("noown");
    ensurePet(me.username);
    const res = await req("/me/pet/skin/equip", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(me.cookie) },
      body: JSON.stringify({ skinSlug: "midnight" }),
    });
    expect(res.status).toBe(403);
    const body = (await res.json()) as any;
    expect(body.error).toBeTruthy();
  });

  test("POST /me/pet/skin/equip with a non-existent skin returns 404", async () => {
    const me = await signup("nosk");
    ensurePet(me.username);
    const res = await req("/me/pet/skin/equip", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(me.cookie) },
      body: JSON.stringify({ skinSlug: "does-not-exist" }),
    });
    expect(res.status).toBe(404);
  });

  test("POST /me/pet/buy-skin debits XP, inserts inventory, allows equip", async () => {
    const me = await signup("buyflow");
    ensurePet(me.username);
    grantXp(me.username, 500);

    const buy = await req("/me/pet/buy-skin", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(me.cookie) },
      body: JSON.stringify({ skinSlug: "verdant" }), // 280 XP
    });
    expect(buy.status).toBe(201);
    const buyData = (await buy.json()) as any;
    expect(buyData.balance).toBe(500 - 280);
    expect(buyData.amountSpent).toBe(280);

    // Now equip succeeds.
    const equip = await req("/me/pet/skin/equip", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(me.cookie) },
      body: JSON.stringify({ skinSlug: "verdant" }),
    });
    expect(equip.status).toBe(200);
    const equipData = (await equip.json()) as any;
    expect(equipData.activeSkin.slug).toBe("verdant");

    // GET /me/pet reflects the equipped state.
    const getRes = await req("/me/pet", { headers: cookieHeader(me.cookie) });
    const getData = (await getRes.json()) as any;
    expect(getData.activeSkin.slug).toBe("verdant");
    expect(getData.pet.activeSkinSlug).toBe("verdant");
  });

  test("POST /me/pet/buy-skin returns 402 on insufficient balance", async () => {
    const me = await signup("poor");
    ensurePet(me.username);
    // No XP granted.
    const res = await req("/me/pet/buy-skin", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(me.cookie) },
      body: JSON.stringify({ skinSlug: "midnight" }), // 340 XP
    });
    expect(res.status).toBe(402);
  });

  test("POST /me/pet/buy-skin returns 409 on already-owned", async () => {
    const me = await signup("dupbuy");
    ensurePet(me.username);
    grantXp(me.username, 2000);
    const first = await req("/me/pet/buy-skin", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(me.cookie) },
      body: JSON.stringify({ skinSlug: "verdant" }),
    });
    expect(first.status).toBe(201);
    const second = await req("/me/pet/buy-skin", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(me.cookie) },
      body: JSON.stringify({ skinSlug: "verdant" }),
    });
    expect(second.status).toBe(409);
  });

  test("POST /me/pet/skin/unequip resets to default", async () => {
    const me = await signup("uneq");
    ensurePet(me.username);
    grantXp(me.username, 1000);
    await req("/me/pet/buy-skin", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(me.cookie) },
      body: JSON.stringify({ skinSlug: "verdant" }),
    });
    await req("/me/pet/skin/equip", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(me.cookie) },
      body: JSON.stringify({ skinSlug: "verdant" }),
    });
    const uneq = await req("/me/pet/skin/unequip", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(me.cookie) },
      body: JSON.stringify({}),
    });
    expect(uneq.status).toBe(200);
    const uneqData = (await uneq.json()) as any;
    expect(uneqData.activeSkin.slug).toBe("default");
  });

  test("GET /pet-skins (public) returns the catalog", async () => {
    const res = await req("/pet-skins");
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(Array.isArray(data.skins)).toBe(true);
    expect(data.skins.length).toBeGreaterThanOrEqual(12);
    const slugs = data.skins.map((s: any) => s.slug);
    expect(slugs).toContain("default");
    expect(slugs).toContain("aurora");
    expect(slugs).toContain("crystalline");
  });

  test("GET /me/pet/skin-shop lists purchasable skins with ownership flags", async () => {
    const me = await signup("shop");
    ensurePet(me.username);
    grantXp(me.username, 400);
    const res = await req("/me/pet/skin-shop", { headers: cookieHeader(me.cookie) });
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.balance).toBe(400);
    expect(Array.isArray(data.items)).toBe(true);
    // 'default' (no xpCost) and 'aurora'/'crystalline' (grant/comp) are excluded;
    // shop only includes xp-purchasable.
    const slugs = data.items.map((it: any) => it.slug);
    expect(slugs).not.toContain("default");
    expect(slugs).not.toContain("aurora");
    expect(slugs).toContain("verdant");
    // Affordability flag is correct for our budget.
    const verdant = data.items.find((it: any) => it.slug === "verdant");
    expect(verdant.affordable).toBe(true);
    const cosmic = data.items.find((it: any) => it.slug === "cosmic");
    expect(cosmic.affordable).toBe(false); // 1450 > 400
  });

  // ─── Phase N — public showcase catalog ───────────────────────────

  test("GET /pet-skins/catalog (anon) returns owned=null for every skin", async () => {
    const res = await req("/pet-skins/catalog");
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.authenticated).toBe(false);
    expect(Array.isArray(data.skins)).toBe(true);
    expect(data.skins.length).toBeGreaterThanOrEqual(12);
    for (const s of data.skins) {
      expect(s.owned).toBeNull();
      expect(s.equippedOnPetIds).toEqual([]);
    }
  });

  test("GET /pet-skins/catalog tags sources from the obtain field", async () => {
    const res = await req("/pet-skins/catalog");
    const data = (await res.json()) as any;
    const bySlug = new Map<string, any>(
      data.skins.map((s: any) => [s.slug, s]),
    );
    expect(bySlug.get("default").source).toBe("starter");
    expect(bySlug.get("midnight").source).toBe("xp");
    expect(bySlug.get("midnight").sourceDetail.xpCost).toBe(340);
    expect(bySlug.get("aurora").source).toBe("achievement");
    expect(bySlug.get("aurora").sourceDetail.achievementSlug).toBe(
      "apprentice_ml",
    );
    expect(bySlug.get("aurora").sourceDetail.achievementLabel).toBe(
      "ML Apprentice",
    );
    expect(bySlug.get("crystalline").source).toBe("competition");
  });

  test("GET /pet-skins/catalog (authed) reports ownership + equipped pet ids", async () => {
    const me = await signup("showcase");
    const petId = ensurePet(me.username);
    // Hit /me/pet once to autoprovision the default skin into inventory.
    await req("/me/pet", { headers: cookieHeader(me.cookie) });

    const res = await req("/pet-skins/catalog", {
      headers: cookieHeader(me.cookie),
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.authenticated).toBe(true);
    const bySlug = new Map<string, any>(
      data.skins.map((s: any) => [s.slug, s]),
    );
    // Default is auto-owned + equipped on the pet we just created.
    expect(bySlug.get("default").owned).toBe(true);
    expect(bySlug.get("default").equippedOnPetIds).toContain(petId);
    // A skin we never bought / earned shows as not-owned.
    expect(bySlug.get("aurora").owned).toBe(false);
    expect(bySlug.get("aurora").equippedOnPetIds).toEqual([]);
  });
});
