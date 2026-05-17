// Phase 34E — organization accounts + signed attestation.
//
// Create org (creator=admin); role gate; a verifier attests a
// member → member wallet gets an org_attestation band, a
// transparency leaf appears, and the public org page exposes it
// as a VC with the org named in the manifest; non-verifier 403.

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
  const username = `og_${suffix}_${testRun}`.slice(0, 30);
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

describe("organization accounts (Phase 34B)", () => {
  test("create, role gate, verifier attests, wallet band, transparency, public VC", async () => {
    const admin = await signup("ad");
    const verifier = await signup("vf");
    const member = await signup("mb");
    const slug = `lab-${testRun}`.slice(0, 40);

    const create = await req("/orgs", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...cookieHeader(admin.cookie),
      },
      body: JSON.stringify({ slug, name: "Test Lab" }),
    });
    expect(create.status).toBe(201);

    const addV = await req(`/orgs/${slug}/members`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...cookieHeader(admin.cookie),
      },
      body: JSON.stringify({ username: verifier.username, role: "verifier" }),
    });
    expect(addV.status).toBe(201);
    await req(`/orgs/${slug}/members`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...cookieHeader(admin.cookie),
      },
      body: JSON.stringify({ username: member.username, role: "member" }),
    });

    // A plain member can't attest.
    const denied = await req(`/orgs/${slug}/attest`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...cookieHeader(member.cookie),
      },
      body: JSON.stringify({
        username: member.username,
        attestKind: "reproduction",
      }),
    });
    expect(denied.status).toBe(403);

    // Verifier attests the member.
    const att = await req(`/orgs/${slug}/attest`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...cookieHeader(verifier.cookie),
      },
      body: JSON.stringify({
        username: member.username,
        attestKind: "reproduction",
        attestRef: `repro-${testRun}`,
        statement: "Independently reproduced in our lab.",
      }),
    });
    expect(att.status).toBe(201);
    const attBody = (await att.json()) as {
      id: string;
      credential: { manifest: Record<string, unknown> };
    };
    expect(attBody.credential.manifest.orgSlug).toBe(slug);

    // Member's wallet shows the org_attestation band.
    const wallet = (await (
      await req("/me/credentials", { headers: cookieHeader(member.cookie) })
    ).json()) as {
      credentials: Array<{ kind: string; title: string }>;
    };
    expect(
      wallet.credentials.some((x) => x.kind === "org_attestation"),
    ).toBe(true);

    // Transparency leaf for the attestation.
    const inc = (await (
      await req(
        `/public/transparency/inclusion?kind=org_attestation&ref=${attBody.id}`,
      )
    ).json()) as { events: unknown[] };
    expect(inc.events.length).toBeGreaterThanOrEqual(1);

    // Public org page + VC export with org as named issuer.
    const pub = (await (await req(`/public/orgs/${slug}`)).json()) as {
      org: { name: string };
      attestations: unknown[];
    };
    expect(pub.org.name).toBe("Test Lab");
    expect(pub.attestations.length).toBe(1);
    const vc = (await (
      await req(`/public/orgs/${slug}?format=vc`)
    ).json()) as {
      verifiableCredential: Array<Record<string, any>>;
    };
    expect(vc.verifiableCredential.length).toBe(1);
    expect(
      vc.verifiableCredential[0].credentialSubject.orgSlug,
    ).toBe(slug);

    // Verify the org attestation signature through /keys/verify.
    const vr = await req("/keys/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(vc.verifiableCredential[0]),
    });
    expect(((await vr.json()) as { valid: boolean }).valid).toBe(true);
  });
});
