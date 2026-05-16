// Phase 32E — verifiable credential revocation.
//
// Two confirmers mint a reproduction credential; two refuters then
// cross the symmetric threshold and auto-revoke it. Asserts: the
// wallet annotates revoked + reason; the Axiomic Score drops the
// credential; provenance excludes it; /keys/verify still returns
// valid:true (signature authentic) BUT revoked:true; the public
// revocations feed lists it; admin un-revoke restores it; admin
// manual revoke pulls it again.

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
  const username = `cr_${suffix}_${testRun}`.slice(0, 30);
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

async function review(
  cookie: string,
  id: string,
  verdict: "confirmed" | "refuted",
) {
  return req(`/reproductions/${id}/review`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...cookieHeader(cookie) },
    body: JSON.stringify({ verdict, notesMd: "" }),
  });
}

describe("credential revocation (Phase 32A)", () => {
  test("refute auto-revokes; verify stays valid+revoked; feed + un/revoke", async () => {
    const { getDb, reproductions, users } = await import("@axiomic/db");
    const { eq } = await import("drizzle-orm");
    const { randomUUID } = await import("crypto");

    const author = await signup("au");
    const c1 = await signup("c1");
    const c2 = await signup("c2");
    const f1 = await signup("f1");
    const f2 = await signup("f2");
    const admin = await signup("ad");
    getDb()
      .update(users)
      .set({ role: "admin" })
      .where(eq(users.username, admin.username))
      .run();

    const reproId = randomUUID();
    const targetId = `paper-rev-${testRun}`;
    getDb()
      .insert(reproductions)
      .values({
        id: reproId,
        articleId: null,
        targetKind: "research_paper",
        targetId,
        reproducerId: author.userId,
        status: "success",
        notes: "Repro.",
        evidenceUrl: "https://example.com/nb",
      })
      .run();

    // Two zero-rep confirmers (1.5 + 1.5 = 3.0) mint the credential.
    expect((await review(c1.cookie, reproId, "confirmed")).status).toBe(200);
    expect((await review(c2.cookie, reproId, "confirmed")).status).toBe(200);

    const mintedWallet = (await (
      await req("/me/credentials", { headers: cookieHeader(author.cookie) })
    ).json()) as {
      credentials: Array<{
        kind: string;
        revoked?: boolean;
        credential: {
          manifest: Record<string, unknown>;
          signature: string;
          publicKey: string;
        } | null;
      }>;
    };
    const reproItem = mintedWallet.credentials.find(
      (x) => x.kind === "reproduction",
    )!;
    expect(reproItem).toBeDefined();
    expect(reproItem.revoked ?? false).toBe(false);

    const scoreBefore = (await (
      await req("/me/credentials/composite-score", {
        headers: cookieHeader(author.cookie),
      })
    ).json()) as { breakdown: { credentials: { raw: number } } };

    // Provenance includes the author before revoke.
    const provBefore = (await (
      await req(`/public/research/research_paper/${targetId}/provenance`)
    ).json()) as { reproducedBy: Array<{ username: string }> };
    expect(
      provBefore.reproducedBy.some((r) => r.username === author.username),
    ).toBe(true);

    // Two zero-rep refuters cross REFUTE_WEIGHT_THRESHOLD (3.0).
    expect((await review(f1.cookie, reproId, "refuted")).status).toBe(200);
    expect((await review(f2.cookie, reproId, "refuted")).status).toBe(200);

    // Wallet now annotates the item revoked (kept visible).
    const revWallet = (await (
      await req("/me/credentials", { headers: cookieHeader(author.cookie) })
    ).json()) as {
      credentials: Array<{
        kind: string;
        revoked?: boolean;
        revocationReason?: string | null;
      }>;
    };
    const revItem = revWallet.credentials.find(
      (x) => x.kind === "reproduction",
    )!;
    expect(revItem.revoked).toBe(true);
    expect(typeof revItem.revocationReason).toBe("string");

    // Composite score drops exactly that one credential.
    const scoreAfter = (await (
      await req("/me/credentials/composite-score", {
        headers: cookieHeader(author.cookie),
      })
    ).json()) as { breakdown: { credentials: { raw: number } } };
    expect(scoreAfter.breakdown.credentials.raw).toBe(
      scoreBefore.breakdown.credentials.raw - 1,
    );

    // Provenance excludes the revoked reproduction.
    const provAfter = (await (
      await req(`/public/research/research_paper/${targetId}/provenance`)
    ).json()) as { reproducedBy: Array<{ username: string }> };
    expect(
      provAfter.reproducedBy.some((r) => r.username === author.username),
    ).toBe(false);

    // /keys/verify: signature still authentic, but revoked:true.
    const vres = await req("/keys/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        manifest: reproItem.credential!.manifest,
        signature: reproItem.credential!.signature,
        publicKey: reproItem.credential!.publicKey,
      }),
    });
    const vbody = (await vres.json()) as {
      valid: boolean;
      revoked: boolean;
      revocationReason: string | null;
    };
    expect(vbody.valid).toBe(true);
    expect(vbody.revoked).toBe(true);
    expect(typeof vbody.revocationReason).toBe("string");

    // Public, externally-checkable revocation feed lists it.
    const feed = (await (await req("/public/revocations")).json()) as {
      revocations: Array<{ credentialKind: string; credentialRef: string }>;
    };
    expect(
      feed.revocations.some(
        (r) => r.credentialKind === "reproduction" && r.credentialRef === reproId,
      ),
    ).toBe(true);

    // Admin un-revoke restores it.
    const un = await req(`/reproductions/${reproId}/unrevoke`, {
      method: "POST",
      headers: cookieHeader(admin.cookie),
    });
    expect(un.status).toBe(200);
    const w2 = (await (
      await req("/me/credentials", { headers: cookieHeader(author.cookie) })
    ).json()) as { credentials: Array<{ kind: string; revoked?: boolean }> };
    expect(
      w2.credentials.find((x) => x.kind === "reproduction")!.revoked ?? false,
    ).toBe(false);

    // Admin manual revoke pulls it again.
    const man = await req(`/reproductions/${reproId}/revoke`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...cookieHeader(admin.cookie),
      },
      body: JSON.stringify({ reason: "Disputed by editorial." }),
    });
    expect(man.status).toBe(200);
    const w3 = (await (
      await req("/me/credentials", { headers: cookieHeader(author.cookie) })
    ).json()) as {
      credentials: Array<{
        kind: string;
        revoked?: boolean;
        revocationReason?: string | null;
      }>;
    };
    const finalItem = w3.credentials.find((x) => x.kind === "reproduction")!;
    expect(finalItem.revoked).toBe(true);
    expect(finalItem.revocationReason).toBe("Disputed by editorial.");

    // Non-admin can't revoke.
    const denied = await req(`/reproductions/${reproId}/revoke`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...cookieHeader(c1.cookie),
      },
      body: JSON.stringify({ reason: "nope" }),
    });
    expect(denied.status).toBe(403);
  });
});
