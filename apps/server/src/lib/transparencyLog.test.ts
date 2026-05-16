// Phase 33E — credential transparency log.
//
// Minting a reproduction (via the review route) appends an
// 'issued' leaf; revoking appends 'revoked'. The chain verifies;
// tampering a leaf breaks it; the signed tree head verifies; the
// public endpoints expose head + inclusion; re-appending the same
// state is a no-op.

import { describe, test, expect } from "bun:test";
import { app } from "../index";
import {
  appendCredentialEvent,
  verifyChain,
  signTreeHead,
  verifyTreeHeadSignature,
  inclusionProof,
} from "./transparency";

async function req(path: string, opts?: RequestInit): Promise<Response> {
  return await app.fetch(new Request(`http://localhost/api/v1${path}`, opts));
}
function cookieHeader(cookie: string): Record<string, string> {
  return { cookie: cookie.split(";")[0] };
}
const testRun = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

async function signup(suffix: string) {
  const username = `tl_${suffix}_${testRun}`.slice(0, 30);
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
  return { cookie: res.headers.get("set-cookie") || "", userId: data.user.id };
}
const review = (cookie: string, id: string, verdict: "confirmed" | "refuted") =>
  req(`/reproductions/${id}/review`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...cookieHeader(cookie) },
    body: JSON.stringify({ verdict, notesMd: "" }),
  });

describe("credential transparency log (Phase 33B)", () => {
  test("issued+revoked leaves, chain integrity, tamper, signed head, idempotent", async () => {
    const { getDb, reproductions, credentialLog } =
      await import("@axiomic/db");
    const { eq } = await import("drizzle-orm");
    const { randomUUID } = await import("crypto");

    const author = await signup("au");
    const c1 = await signup("c1");
    const c2 = await signup("c2");
    const f1 = await signup("f1");
    const f2 = await signup("f2");

    const reproId = randomUUID();
    getDb()
      .insert(reproductions)
      .values({
        id: reproId,
        articleId: null,
        targetKind: "research_paper",
        targetId: `paper-tl-${testRun}`,
        reproducerId: author.userId,
        status: "success",
        notes: "n",
        evidenceUrl: "https://example.com/x",
      })
      .run();

    await review(c1.cookie, reproId, "confirmed");
    await review(c2.cookie, reproId, "confirmed"); // mint → 'issued'

    let proof = inclusionProof("reproduction", reproId);
    expect(proof.events.some((e) => e.eventKind === "issued")).toBe(true);
    expect(verifyChain().ok).toBe(true);

    await review(f1.cookie, reproId, "refuted");
    await review(f2.cookie, reproId, "refuted"); // auto-revoke → 'revoked'
    proof = inclusionProof("reproduction", reproId);
    expect(proof.events.some((e) => e.eventKind === "revoked")).toBe(true);
    expect(verifyChain().ok).toBe(true);

    // Idempotent: re-appending the same state is a no-op.
    const before = inclusionProof("reproduction", reproId).events.length;
    appendCredentialEvent("revoked", "reproduction", reproId, {});
    expect(inclusionProof("reproduction", reproId).events.length).toBe(
      before,
    );

    // Signed tree head verifies.
    signTreeHead();
    const th = inclusionProof("reproduction", reproId).treeHead;
    expect(th.treeSize).toBeGreaterThan(0);
    expect(th.signed).toBe(true);
    expect(
      verifyTreeHeadSignature({
        treeSize: th.treeSize,
        rootHash: th.rootHash,
        signature: th.signature!,
      }),
    ).toBe(true);

    // Tamper a leaf for this credential → chain breaks; restore.
    const row = getDb()
      .select()
      .from(credentialLog)
      .where(eq(credentialLog.credentialRef, reproId))
      .all()[0]!;
    const original = row.leafHash;
    getDb()
      .update(credentialLog)
      .set({ leafHash: "deadbeef" })
      .where(eq(credentialLog.id, row.id))
      .run();
    const broken = verifyChain();
    expect(broken.ok).toBe(false);
    expect(broken.brokenAtLeafIndex).toBe(row.leafIndex);
    getDb()
      .update(credentialLog)
      .set({ leafHash: original })
      .where(eq(credentialLog.id, row.id))
      .run();
    expect(verifyChain().ok).toBe(true);

    // Public endpoints.
    const headRes = (await (
      await req("/public/transparency/tree-head")
    ).json()) as { treeSize: number; publicKey: string };
    expect(headRes.treeSize).toBeGreaterThan(0);
    const inc = (await (
      await req(
        `/public/transparency/inclusion?kind=reproduction&ref=${reproId}`,
      )
    ).json()) as { events: unknown[] };
    expect(inc.events.length).toBeGreaterThanOrEqual(2);
  });
});
