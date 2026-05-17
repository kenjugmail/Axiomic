// Phase 33E — W3C Verifiable Credentials 2.0 / Open Badges 3.0.
//
// ?format=vc|ob3 wraps the existing SignedCredential into a
// standards envelope; /keys/verify accepts the VC and re-checks
// the JCS proof; did:web doc resolves; tampering invalidates;
// credentialStatus tracks revocation. Legacy bundle untouched.

import { describe, test, expect } from "bun:test";
import { app } from "../index";
import server from "../index";

async function req(path: string, opts?: RequestInit): Promise<Response> {
  return await app.fetch(new Request(`http://localhost/api/v1${path}`, opts));
}
function cookieHeader(cookie: string): Record<string, string> {
  return { cookie: cookie.split(";")[0] };
}
const testRun = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

async function signup(suffix: string) {
  const username = `vc_${suffix}_${testRun}`.slice(0, 30);
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

describe("Verifiable Credentials export (Phase 33A)", () => {
  test("?format=vc|ob3 + did.json + /keys/verify accepts + tamper + status", async () => {
    const { getDb, reproductions } = await import("@axiomic/db");
    const { randomUUID } = await import("crypto");
    const u = await signup("u");

    const reproId = randomUUID();
    getDb()
      .insert(reproductions)
      .values({
        id: reproId,
        articleId: null,
        targetKind: "research_paper",
        targetId: `paper-vc-${testRun}`,
        reproducerId: u.userId,
        status: "success",
        notes: "n",
        evidenceUrl: "https://example.com/nb",
        credentialMintedAt: new Date().toISOString(),
        credentialMintWeight: 3.0,
      })
      .run();

    const bundle = (await (
      await req("/me/credentials?format=vc", {
        headers: cookieHeader(u.cookie),
      })
    ).json()) as {
      type: string[];
      verifiableCredential: Array<Record<string, any>>;
    };
    expect(bundle.type).toContain("VerifiablePresentation");
    const vc = bundle.verifiableCredential.find((v) =>
      (v.type as string[]).includes("AxiomicReproductionCredential"),
    )!;
    expect(vc).toBeDefined();
    expect(vc["@context"][0]).toBe("https://www.w3.org/ns/credentials/v2");
    expect(String(vc.issuer)).toContain("did:web:");
    expect(vc.credentialSubject.reproductionId).toBe(reproId);
    expect(vc.proof.cryptosuite).toBe("eddsa-jcs-2022");
    expect(typeof vc.proof.proofValue).toBe("string");
    expect(vc.proof.proofValue.startsWith("z")).toBe(true);
    expect(vc.credentialStatus.revoked).toBe(false);

    // did:web document.
    const did = await server.fetch(
      new Request("http://localhost/.well-known/did.json"),
      undefined as any,
    );
    expect(did!.status).toBe(200);
    const didDoc = (await did!.json()) as {
      verificationMethod: Array<{ publicKeyJwk?: { crv: string } }>;
    };
    expect(
      didDoc.verificationMethod.some(
        (m) => m.publicKeyJwk?.crv === "Ed25519",
      ),
    ).toBe(true);

    // /keys/verify accepts the VC envelope.
    const vres = await req("/keys/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(vc),
    });
    const vbody = (await vres.json()) as {
      valid: boolean;
      format: string;
      revoked: boolean;
    };
    expect(vbody.valid).toBe(true);
    expect(vbody.format).toBe("vc");
    expect(vbody.revoked).toBe(false);

    // Tamper the subject → signature must fail.
    const tampered = JSON.parse(JSON.stringify(vc));
    tampered.credentialSubject.reproductionId = "forged";
    const tres = await req("/keys/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(tampered),
    });
    expect(((await tres.json()) as { valid: boolean }).valid).toBe(false);

    // Open Badges 3.0 shape.
    const ob = (await (
      await req("/me/credentials?format=ob3", {
        headers: cookieHeader(u.cookie),
      })
    ).json()) as { verifiableCredential: Array<Record<string, any>> };
    const obc = ob.verifiableCredential[0];
    expect(obc.type).toContain("OpenBadgeCredential");
    expect(obc.credentialSubject.type).toContain("AchievementSubject");

    // Revoke → exported credentialStatus flips.
    const { revokeCredential } = await import("../lib/revocation");
    revokeCredential("reproduction", reproId, "test", null);
    const after = (await (
      await req("/me/credentials?format=vc", {
        headers: cookieHeader(u.cookie),
      })
    ).json()) as { verifiableCredential: Array<Record<string, any>> };
    const vc2 = after.verifiableCredential.find((v) =>
      (v.type as string[]).includes("AxiomicReproductionCredential"),
    )!;
    expect(vc2.credentialStatus.revoked).toBe(true);
  });

  // Phase 35 #1 — a VC re-signed under a foreign did:key still
  // returns valid:true (bytes match THAT key) but MUST report
  // issuerTrusted:false so relying parties don't accept a forgery.
  test("issuerTrusted distinguishes instance key from a self-asserted did:key", async () => {
    const { getDb, reproductions } = await import("@axiomic/db");
    const { randomUUID, generateKeyPairSync, sign: nodeSign } = await import(
      "crypto"
    );
    const { canonicalJson } = await import("../lib/signing");
    const { didKeyFromEd25519, base58btcEncode } = await import("../lib/vc");
    const u = await signup("it");

    const reproId = randomUUID();
    getDb()
      .insert(reproductions)
      .values({
        id: reproId,
        articleId: null,
        targetKind: "research_paper",
        targetId: `paper-it-${testRun}`,
        reproducerId: u.userId,
        status: "success",
        notes: "n",
        evidenceUrl: "https://example.com/nb",
        credentialMintedAt: new Date().toISOString(),
        credentialMintWeight: 3.0,
      })
      .run();

    const bundle = (await (
      await req("/me/credentials?format=vc", {
        headers: cookieHeader(u.cookie),
      })
    ).json()) as { verifiableCredential: Array<Record<string, any>> };
    const vc = bundle.verifiableCredential.find((v) =>
      (v.type as string[]).includes("AxiomicReproductionCredential"),
    )!;

    // Instance-issued VC → valid + trusted.
    const ok = (await (
      await req("/keys/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(vc),
      })
    ).json()) as { valid: boolean; issuerTrusted: boolean };
    expect(ok.valid).toBe(true);
    expect(ok.issuerTrusted).toBe(true);

    // Forge: re-sign the same payload under an attacker keypair
    // and self-assert it via proof.verificationMethod did:key.
    const { publicKey, privateKey } = generateKeyPairSync("ed25519");
    const rawPub = publicKey
      .export({ type: "spki", format: "der" })
      .subarray(-32);
    const foreignDidKey = didKeyFromEd25519(
      Buffer.from(rawPub).toString("hex"),
    );
    const { proof: _drop, ...rest } = vc;
    const payload = canonicalJson(rest);
    const sig = nodeSign(null, Buffer.from(payload, "utf8"), privateKey);
    const forged = {
      ...rest,
      proof: {
        type: "DataIntegrityProof",
        cryptosuite: "eddsa-jcs-2022",
        created: new Date().toISOString(),
        verificationMethod: foreignDidKey,
        proofPurpose: "assertionMethod",
        proofValue: "z" + base58btcEncode(new Uint8Array(sig)),
      },
    };
    const forgedRes = (await (
      await req("/keys/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(forged),
      })
    ).json()) as { valid: boolean; issuerTrusted: boolean };
    // Bytes verify under the attacker's own key…
    expect(forgedRes.valid).toBe(true);
    // …but it is NOT this issuer — the critical assertion.
    expect(forgedRes.issuerTrusted).toBe(false);
  });
});
