// Phase 28F — credential wallet tests.
//
// Covers: the public wallet aggregates a verified reproduction
// into a signed credential; the JSON export carries a verifiable
// manifest+signature; the privacy toggle hides the portfolio from
// anonymous callers (403) while the owner can still read their
// own.

import { describe, test, expect } from "bun:test";
import { app } from "../index";

async function req(path: string, opts?: RequestInit): Promise<Response> {
  return await app.fetch(new Request(`http://localhost/api/v1${path}`, opts));
}

function cookieHeader(cookie: string): Record<string, string> {
  return { cookie: cookie.split(";")[0] };
}

const testRun = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

async function signup(
  suffix: string,
): Promise<{ cookie: string; userId: string; username: string }> {
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
  const cookie = res.headers.get("set-cookie") || "";
  return { cookie, userId: data.user.id, username };
}

describe("credential wallet (Phase 28A)", () => {
  test("aggregates a verified reproduction; JSON export is signed; privacy toggle gates anonymous reads", async () => {
    const { getDb, reproductions } = await import("@axiomic/db");
    const { randomUUID } = await import("crypto");
    const owner = await signup("owner");

    // Seed a peer-verified reproduction (credentialMintedAt set).
    getDb()
      .insert(reproductions)
      .values({
        id: randomUUID(),
        articleId: null,
        targetKind: "research_paper",
        targetId: `paper-${testRun}`,
        reproducerId: owner.userId,
        status: "success",
        notes: "Reproduced the headline benchmark.",
        evidenceUrl: "https://example.com/evidence",
        credentialMintedAt: new Date().toISOString(),
      })
      .run();

    // Public wallet shows it, signed.
    const pub = await req(`/credentials/${owner.username}`);
    expect(pub.status).toBe(200);
    const pubBody = (await pub.json()) as {
      credentials: Array<{ kind: string; signed: boolean; title: string }>;
    };
    const repro = pubBody.credentials.find((c) => c.kind === "reproduction");
    expect(repro).toBeDefined();
    expect(repro?.signed).toBe(true);

    // JSON export carries a verifiable manifest + signature.
    const exp = await req("/me/credentials?format=json", {
      headers: cookieHeader(owner.cookie),
    });
    expect(exp.status).toBe(200);
    const expBody = (await exp.json()) as {
      issuer: string;
      credentials: Array<{
        manifest: { kind: string };
        signature: string;
        publicKey: string;
        algorithm: string;
      }>;
    };
    expect(expBody.issuer).toBe("axiomic");
    const signed = expBody.credentials.find(
      (c) => c.manifest.kind === "reproduction",
    );
    expect(signed).toBeDefined();
    expect(signed?.algorithm).toBe("ed25519");
    expect(typeof signed?.signature).toBe("string");
    expect(signed?.signature.length).toBeGreaterThan(0);

    // Privacy: make it private.
    const toggle = await req("/me/credentials/visibility", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        ...cookieHeader(owner.cookie),
      },
      body: JSON.stringify({ public: false }),
    });
    expect(toggle.status).toBe(200);

    // Anonymous now 403.
    const anon = await req(`/credentials/${owner.username}`);
    expect(anon.status).toBe(403);

    // Owner can still read their own private portfolio.
    const ownView = await req(`/credentials/${owner.username}`, {
      headers: cookieHeader(owner.cookie),
    });
    expect(ownView.status).toBe(200);
    const ownBody = (await ownView.json()) as {
      credentials: Array<{ kind: string }>;
    };
    expect(
      ownBody.credentials.find((c) => c.kind === "reproduction"),
    ).toBeDefined();

    // Re-public for idempotency hygiene.
    await req("/me/credentials/visibility", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        ...cookieHeader(owner.cookie),
      },
      body: JSON.stringify({ public: true }),
    });
    const back = await req(`/credentials/${owner.username}`);
    expect(back.status).toBe(200);
  });

  test("unknown user → 404; empty wallet → 200 with []", async () => {
    const u = await signup("empty");
    const miss = await req(`/credentials/nobody-${testRun}`);
    expect(miss.status).toBe(404);
    const empty = await req(`/credentials/${u.username}`);
    expect(empty.status).toBe(200);
    const body = (await empty.json()) as { credentials: unknown[] };
    expect(Array.isArray(body.credentials)).toBe(true);
    expect(body.credentials.length).toBe(0);
  });
});
