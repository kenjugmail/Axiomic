// Phase 33E — selective-disclosure share links.
//
// A scoped token exposes only chosen credential kinds via a
// public link, bypassing the all-or-nothing credentialsPublic
// gate ONLY for that subset; hashed at rest; composes with VC
// export; revoke/expiry → 404.

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
  const username = `sh_${suffix}_${testRun}`.slice(0, 30);
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

describe("selective-disclosure share links (Phase 33D)", () => {
  test("scope filter, hashed-at-rest, gate bypass, VC, revoke/missing", async () => {
    const { getDb, reproductions, credentialShareTokens } =
      await import("@axiomic/db");
    const { eq } = await import("drizzle-orm");
    const { createHash, randomUUID } = await import("crypto");
    const u = await signup("u");

    getDb()
      .insert(reproductions)
      .values({
        id: randomUUID(),
        articleId: null,
        targetKind: "research_paper",
        targetId: `paper-sh-${testRun}`,
        reproducerId: u.userId,
        status: "success",
        notes: "n",
        evidenceUrl: "https://example.com/x",
        credentialMintedAt: new Date().toISOString(),
        credentialMintWeight: 3.0,
      })
      .run();

    const mk = (body: unknown) =>
      req("/me/credentials/share-tokens", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...cookieHeader(u.cookie),
        },
        body: JSON.stringify(body),
      });

    // All-scope token.
    const c = await mk({ scope: { mode: "all" }, expiresInDays: 30 });
    expect(c.status).toBe(201);
    const allTok = (await c.json()) as { id: string; token: string };

    const shared = (await (
      await req(`/public/share/${allTok.token}`)
    ).json()) as { credentials: Array<{ kind: string }> };
    expect(shared.credentials.some((x) => x.kind === "reproduction")).toBe(
      true,
    );

    // Hashed at rest — the raw token is never stored.
    const row = getDb()
      .select()
      .from(credentialShareTokens)
      .where(eq(credentialShareTokens.id, allTok.id))
      .get()!;
    expect(row.tokenHash).not.toBe(allTok.token);
    expect(row.tokenHash).toBe(
      createHash("sha256").update(allTok.token).digest("hex"),
    );

    // Scoped to a kind the user doesn't have → empty.
    const k = await mk({ scope: { mode: "kinds", kinds: ["bounty"] } });
    const kTok = (await k.json()) as { token: string };
    const kShared = (await (
      await req(`/public/share/${kTok.token}`)
    ).json()) as { credentials: unknown[] };
    expect(kShared.credentials.length).toBe(0);

    // VC format composes with share links.
    const vcShared = (await (
      await req(`/public/share/${allTok.token}?format=vc`)
    ).json()) as { verifiableCredential: unknown[] };
    expect(vcShared.verifiableCredential.length).toBeGreaterThanOrEqual(1);

    // Make the portfolio private → public wallet 403, but the
    // scoped share link still works (bypasses the gate).
    await req("/me/credentials/visibility", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        ...cookieHeader(u.cookie),
      },
      body: JSON.stringify({ public: false }),
    });
    const gated = await req(`/public/users/${u.username}/credentials`);
    expect(gated.status).toBe(403);
    const stillOk = await req(`/public/share/${allTok.token}`);
    expect(stillOk.status).toBe(200);

    // Owner lists tokens, then revokes → link 404s.
    const list = (await (
      await req("/me/credentials/share-tokens", {
        headers: cookieHeader(u.cookie),
      })
    ).json()) as { tokens: Array<{ id: string }> };
    expect(list.tokens.length).toBeGreaterThanOrEqual(2);
    const del = await req(`/me/credentials/share-tokens/${allTok.id}`, {
      method: "DELETE",
      headers: cookieHeader(u.cookie),
    });
    expect(del.status).toBe(200);
    expect((await req(`/public/share/${allTok.token}`)).status).toBe(404);

    // Unknown token → 404.
    expect(
      (await req(`/public/share/nope-${testRun}`)).status,
    ).toBe(404);
  });
});
