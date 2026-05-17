// Phase 33E — competency-weighted peer skill endorsements.
//
// An endorser with signed proof on the skill carries weight; one
// with none weighs 0. No self-endorsement; duplicate 409; revoke
// by owner only; the band is exposed publicly (gated) and NEVER
// mutates the endorsee's signed-proof userSkillIndex.

import { describe, test, expect } from "bun:test";
import { app } from "../index";

async function req(path: string, opts?: RequestInit): Promise<Response> {
  return await app.fetch(new Request(`http://localhost/api/v1${path}`, opts));
}
function cookieHeader(cookie: string): Record<string, string> {
  return { cookie: cookie.split(";")[0] };
}
const testRun = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

async function signup(suffix: string) {
  const username = `se_${suffix}_${testRun}`.slice(0, 30);
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
  return {
    cookie: res.headers.get("set-cookie") || "",
    userId: data.user.id,
    username,
  };
}
const endorse = (cookie: string, body: unknown) =>
  req("/me/endorsements", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...cookieHeader(cookie) },
    body: JSON.stringify(body),
  });

describe("peer skill endorsements (Phase 33C)", () => {
  test("weight from proof, zero w/o proof, no self/dup, revoke, band separate", async () => {
    const { getDb, userSkillIndex } = await import("@axiomic/db");
    const { and, eq } = await import("drizzle-orm");
    const { randomUUID } = await import("crypto");

    const proven = await signup("pv"); // has proof on `x`
    const noproof = await signup("np"); // no proof on `y`
    const target = await signup("tg");
    const slugX = `skl-x-${testRun}`;
    const slugY = `skl-y-${testRun}`;

    getDb()
      .insert(userSkillIndex)
      .values({
        id: randomUUID(),
        userId: proven.userId,
        skillSlug: slugX,
        skillTitle: "Skill X",
        proofCount: 3,
        latestProofAt: new Date().toISOString(),
      })
      .run();

    const r1 = await endorse(proven.cookie, {
      username: target.username,
      skillSlug: slugX,
      skillTitle: "Skill X",
      note: "strong",
    });
    expect(r1.status).toBe(201);
    const b1 = (await r1.json()) as { id: string; weight: number };
    expect(b1.weight).toBeGreaterThan(0);

    const r2 = await endorse(noproof.cookie, {
      username: target.username,
      skillSlug: slugY,
      skillTitle: "Skill Y",
    });
    expect(r2.status).toBe(201);
    expect(((await r2.json()) as { weight: number }).weight).toBe(0);

    // No self-endorsement.
    const selfRes = await endorse(proven.cookie, {
      username: proven.username,
      skillSlug: slugX,
    });
    expect(selfRes.status).toBe(400);

    // Duplicate (same endorser+endorsee+skill).
    const dup = await endorse(proven.cookie, {
      username: target.username,
      skillSlug: slugX,
    });
    expect(dup.status).toBe(409);

    // Public band (gated like the wallet).
    const band = (await (
      await req(`/credentials/${target.username}/endorsements`)
    ).json()) as {
      endorsements: Array<{ skillSlug: string; totalWeight: number }>;
    };
    const gx = band.endorsements.find((g) => g.skillSlug === slugX)!;
    expect(gx).toBeDefined();
    expect(gx.totalWeight).toBeGreaterThan(0);
    expect(
      band.endorsements.find((g) => g.skillSlug === slugY)!.totalWeight,
    ).toBe(0);

    // Endorsements NEVER write the endorsee's signed-proof index.
    const idxRows = getDb()
      .select({ id: userSkillIndex.id })
      .from(userSkillIndex)
      .where(eq(userSkillIndex.userId, target.userId))
      .all();
    expect(idxRows.length).toBe(0);

    // Non-owner can't revoke; owner can.
    const denied = await req(`/me/endorsements/${b1.id}`, {
      method: "DELETE",
      headers: cookieHeader(noproof.cookie),
    });
    expect(denied.status).toBe(404);
    const ok = await req(`/me/endorsements/${b1.id}`, {
      method: "DELETE",
      headers: cookieHeader(proven.cookie),
    });
    expect(ok.status).toBe(200);
    const band2 = (await (
      await req(`/credentials/${target.username}/endorsements`)
    ).json()) as { endorsements: Array<{ skillSlug: string }> };
    expect(
      band2.endorsements.find((g) => g.skillSlug === slugX),
    ).toBeUndefined();
  });
});
