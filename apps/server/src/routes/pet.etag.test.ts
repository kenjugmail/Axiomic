// Phase 14E — ETag + If-None-Match on /me/pet.
//
// /me/pet response is ~30-45 KB and is hit on every page load.
// Adding ETag + If-None-Match lets the client get a 304 when
// nothing changed. This test verifies:
//  1. First GET returns 200 with an ETag header.
//  2. Second GET with If-None-Match: <etag> returns 304 + same ETag.
//  3. After a mutation (equip), the ETag changes.

import { describe, test, expect } from "bun:test";
import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import {
  getDb,
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
  const username = `et_${suffix}_${testId}`.slice(0, 30);
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

describe("Phase 14E — /me/pet ETag", () => {
  test("first GET returns 200 + ETag header", async () => {
    const me = await signup("first");
    const res = await req("/me/pet", { headers: cookieHeader(me.cookie) });
    expect(res.status).toBe(200);
    const etag = res.headers.get("etag");
    expect(etag).toBeTruthy();
    expect(etag).toMatch(/^"[a-f0-9]{16}"$/);
  });

  test("Phase 15B — Cache-Control: must-revalidate is set", async () => {
    const me = await signup("cc");
    const res = await req("/me/pet", { headers: cookieHeader(me.cookie) });
    expect(res.status).toBe(200);
    const cc = res.headers.get("cache-control");
    expect(cc).toBeTruthy();
    expect(cc!.toLowerCase()).toContain("must-revalidate");
    expect(cc!.toLowerCase()).toContain("private");
  });

  test("second GET with matching If-None-Match returns 304", async () => {
    const me = await signup("match");
    const r1 = await req("/me/pet", { headers: cookieHeader(me.cookie) });
    const etag = r1.headers.get("etag")!;
    const r2 = await req("/me/pet", {
      headers: { ...cookieHeader(me.cookie), "If-None-Match": etag },
    });
    expect(r2.status).toBe(304);
    // The 304 should echo the ETag so the client can keep its
    // cache key. Body must be empty.
    expect(r2.headers.get("etag")).toBe(etag);
    const text = await r2.text();
    expect(text).toBe("");
  });

  test("after a mutation, the ETag changes", async () => {
    const me = await signup("mutate");
    // Seed the catalog. The starter pack auto-equips study-cap
    // + glasses + office-hours-mug, so we use top-hat (a separate
    // head-slot item) for the test mutation.
    await req("/me/pet", { headers: cookieHeader(me.cookie) });
    ensurePetWithItems(me.username, ["top-hat"]);

    const r1 = await req("/me/pet", { headers: cookieHeader(me.cookie) });
    const e1 = r1.headers.get("etag")!;

    const equip = await req("/me/pet/equip", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(me.cookie) },
      body: JSON.stringify({ cosmeticSlug: "top-hat" }),
    });
    expect(equip.status).toBe(200);

    const r2 = await req("/me/pet", { headers: cookieHeader(me.cookie) });
    const e2 = r2.headers.get("etag")!;
    expect(e2).not.toBe(e1);

    // And a request with the now-stale ETag should NOT 304.
    const r3 = await req("/me/pet", {
      headers: { ...cookieHeader(me.cookie), "If-None-Match": e1 },
    });
    expect(r3.status).toBe(200);
  });
});
