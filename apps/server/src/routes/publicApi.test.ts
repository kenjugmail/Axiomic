// Phase 31F — public API namespace + provenance + .well-known.

import { describe, test, expect } from "bun:test";
import { app } from "../index";
import server from "../index";

async function req(path: string, opts?: RequestInit): Promise<Response> {
  return await app.fetch(new Request(`http://localhost/api/v1${path}`, opts));
}
function cookieHeader(cookie: string): Record<string, string> {
  return { cookie: cookie.split(";")[0] };
}
const testRun =
  Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
async function signup(suffix: string) {
  const username = `pa_${suffix}_${testRun}`.slice(0, 30);
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

describe("public API (Phase 31D)", () => {
  test("public credentials honor the privacy gate; CORS open; /keys/verify still works", async () => {
    const u = await signup("u");
    const open = await req(`/public/users/${u.username}/credentials`);
    expect(open.status).toBe(200);
    expect(open.headers.get("access-control-allow-origin")).toBe("*");

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

    // The existing verify endpoint is untouched.
    const v = await req("/keys/signing");
    expect(v.status).toBe(200);
  });

  test("research provenance joins minted reproductions + accepted bounty claims", async () => {
    const {
      getDb,
      researchPapers,
      reproductions,
      researchBounties,
      bountyClaims,
    } = await import("@axiomic/db");
    const { randomUUID } = await import("crypto");
    const author = await signup("a");
    const repro = await signup("r");
    const worker = await signup("w");
    const db = getDb();

    const paperId = randomUUID();
    db.insert(researchPapers)
      .values({
        id: paperId,
        slug: `pap-${testRun}`,
        title: "Paper",
        authorId: author.userId,
        tags: "[]",
      })
      .run();
    db.insert(reproductions)
      .values({
        id: randomUUID(),
        articleId: null,
        targetKind: "research_paper",
        targetId: paperId,
        reproducerId: repro.userId,
        status: "success",
        credentialMintedAt: new Date().toISOString(),
        credentialMintWeight: 3.0,
      })
      .run();
    const bountyId = randomUUID();
    db.insert(researchBounties)
      .values({
        id: bountyId,
        slug: `bnt-${testRun}`,
        title: "Extend it",
        kind: "extend",
        posterId: author.userId,
        linkedPaperId: paperId,
        status: "completed",
      })
      .run();
    db.insert(bountyClaims)
      .values({
        id: randomUUID(),
        bountyId,
        userId: worker.userId,
        status: "accepted",
      })
      .run();

    const res = await req(
      `/public/research/research_paper/${paperId}/provenance`,
    );
    expect(res.status).toBe(200);
    const b = (await res.json()) as {
      reproducedBy: Array<{ username: string; confirmedWeight: number | null }>;
      bountyContributions: Array<{ username: string; bountySlug: string }>;
    };
    expect(
      b.reproducedBy.find((x) => x.username === repro.username),
    ).toBeDefined();
    expect(
      b.bountyContributions.find((x) => x.username === worker.username),
    ).toBeDefined();
  });

  test(".well-known signing pubkey matches /api/v1/keys/signing", async () => {
    const wk = await server.fetch(
      new Request("http://localhost/.well-known/axiomic-signing-pubkey"),
      undefined as any,
    );
    expect(wk).toBeDefined();
    expect(wk!.status).toBe(200);
    const hex = (await wk!.text()).trim();
    expect(hex.length).toBeGreaterThan(0);

    const ks = await req("/keys/signing");
    const ksb = (await ks.json()) as { publicKey: string };
    expect(hex).toBe(ksb.publicKey);
  });
});
