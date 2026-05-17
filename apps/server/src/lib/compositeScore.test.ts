// Phase 31F — signed Axiomic Score: range, determinism,
// sign/verify round-trip, public privacy gate.

import { describe, test, expect } from "bun:test";
import { app } from "../index";
import { computeAxiomicScore, signAxiomicScore } from "./compositeScore";

async function req(path: string, opts?: RequestInit): Promise<Response> {
  return await app.fetch(new Request(`http://localhost/api/v1${path}`, opts));
}
function cookieHeader(cookie: string): Record<string, string> {
  return { cookie: cookie.split(";")[0] };
}
const testRun =
  Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
async function signup(suffix: string) {
  const username = `as_${suffix}_${testRun}`.slice(0, 30);
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

describe("composite score (Phase 31C)", () => {
  test("range + determinism + sign/verify + tamper", async () => {
    const u = await signup("u");
    const s1 = await computeAxiomicScore(u.userId, u.username);
    expect(Number.isInteger(s1.score)).toBe(true);
    expect(s1.score).toBeGreaterThanOrEqual(0);
    expect(s1.score).toBeLessThanOrEqual(1000);
    for (const k of [
      "xp",
      "credentials",
      "reviewerTrust",
      "mastery",
      "streak",
    ] as const) {
      const c = (s1.breakdown as any)[k];
      expect(c.normalized).toBeGreaterThanOrEqual(0);
      expect(c.normalized).toBeLessThanOrEqual(1);
    }
    const s2 = await computeAxiomicScore(u.userId, u.username);
    expect(s2.score).toBe(s1.score);

    const cred = signAxiomicScore(u.userId, u.username, s1);
    const ok = await req("/keys/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        manifest: cred.manifest,
        signature: cred.signature,
        publicKey: cred.publicKey,
      }),
    });
    expect(ok.status).toBe(200);
    expect(((await ok.json()) as { valid: boolean }).valid).toBe(true);

    const tampered = await req("/keys/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        manifest: { ...cred.manifest, score: 9999 },
        signature: cred.signature,
        publicKey: cred.publicKey,
      }),
    });
    const tb = (await tampered.json()) as { valid: boolean };
    expect(tb.valid).toBe(false);
  });

  test("endpoints: own (auth) + public privacy gate", async () => {
    const u = await signup("g");
    const mine = await req("/me/credentials/composite-score", {
      headers: cookieHeader(u.cookie),
    });
    expect(mine.status).toBe(200);
    const mb = (await mine.json()) as { score: number; credential: unknown };
    expect(typeof mb.score).toBe("number");
    expect(mb.credential).toBeDefined();

    // Public default (credentialsPublic defaults true) → 200.
    const pub = await req(`/credentials/${u.username}/composite-score`);
    expect(pub.status).toBe(200);

    // Go private → anonymous 403, owner still 200.
    await req("/me/credentials/visibility", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        ...cookieHeader(u.cookie),
      },
      body: JSON.stringify({ public: false }),
    });
    const anon = await req(`/credentials/${u.username}/composite-score`);
    expect(anon.status).toBe(403);
    const owner = await req(`/credentials/${u.username}/composite-score`, {
      headers: cookieHeader(u.cookie),
    });
    expect(owner.status).toBe(200);
  });
});
