// Phase 33A — W3C Verifiable Credentials 2.0 / Open Badges 3.0.
//
// Re-serializes an existing SignedCredential (signing.ts) into a
// standards envelope so external wallets / ATS / credential
// ecosystems can ingest and verify Axiomic credentials. The
// underlying ed25519 key and the legacy {manifest,signature,...}
// path are UNCHANGED — this only adds a second representation.
//
// Honest interop level: JCS-class canonicalization (signing.ts
// canonicalJson — sorted keys, RFC-8785-class for the value types
// we emit) declared as cryptosuite "eddsa-jcs-2022", proofValue as
// multibase base58btc. NOT URDNA2015 JSON-LD / not RFC-6962. A
// conformant eddsa-jcs-2022 verifier (and our own /keys/verify)
// accepts it; no new dependencies.

import {
  canonicalJson,
  publicKeyHex,
  sign,
  verifyWithPublicKey,
} from "./signing";
import { getRevocation } from "./revocation";
import { freshnessBand, AGING_MAX_DAYS } from "./freshness";
import type { SignedCredential } from "./signing";

const B58 =
  "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

export function base58btcEncode(bytes: Uint8Array): string {
  let zeros = 0;
  while (zeros < bytes.length && bytes[zeros] === 0) zeros++;
  let num = 0n;
  for (const b of bytes) num = num * 256n + BigInt(b);
  let out = "";
  while (num > 0n) {
    const r = Number(num % 58n);
    num = num / 58n;
    out = B58[r] + out;
  }
  return "1".repeat(zeros) + out;
}

export function base58btcDecode(str: string): Uint8Array {
  let zeros = 0;
  while (zeros < str.length && str[zeros] === "1") zeros++;
  let num = 0n;
  for (const ch of str) {
    const idx = B58.indexOf(ch);
    if (idx < 0) throw new Error("invalid base58btc");
    num = num * 58n + BigInt(idx);
  }
  const bytes: number[] = [];
  while (num > 0n) {
    bytes.unshift(Number(num % 256n));
    num = num / 256n;
  }
  return new Uint8Array([...new Array(zeros).fill(0), ...bytes]);
}

// Multibase base58btc — 'z' prefix.
function mb(bytes: Uint8Array): string {
  return "z" + base58btcEncode(bytes);
}
function mbDecode(s: string): Uint8Array {
  if (!s.startsWith("z")) throw new Error("expected multibase z");
  return base58btcDecode(s.slice(1));
}

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}
function bytesToHex(b: Uint8Array): string {
  return [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
}
function b64url(b: Uint8Array): string {
  return Buffer.from(b)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

// did:key for an Ed25519 raw public key: multicodec 0xed01 prefix
// + 32-byte key, multibase base58btc.
export function didKeyFromEd25519(pubHex: string): string {
  const raw = hexToBytes(pubHex);
  const prefixed = new Uint8Array(2 + raw.length);
  prefixed[0] = 0xed;
  prefixed[1] = 0x01;
  prefixed.set(raw, 2);
  return "did:key:" + mb(prefixed);
}

function didKeyToEd25519Hex(didKey: string): string {
  const mbpart = didKey.replace("did:key:", "");
  const decoded = mbDecode(mbpart);
  if (decoded[0] !== 0xed || decoded[1] !== 0x01) {
    throw new Error("not an ed25519 did:key");
  }
  return bytesToHex(decoded.slice(2));
}

// did:web for this instance. Per the did:web spec a port is
// percent-encoded.
export function issuerDidWeb(host: string): string {
  return "did:web:" + host.replace(/:/g, "%3A");
}

export function publicKeyJwk(): Record<string, string> {
  return {
    kty: "OKP",
    crv: "Ed25519",
    x: b64url(hexToBytes(publicKeyHex())),
  };
}

// did:web DID document served at /.well-known/did.json. Lists the
// did:key verification method so both did:web and did:key
// resolvers find the same Ed25519 key.
export function didDocument(host: string): Record<string, unknown> {
  const did = issuerDidWeb(host);
  const didKey = didKeyFromEd25519(publicKeyHex());
  const vmId = did + "#key-1";
  return {
    "@context": [
      "https://www.w3.org/ns/did/v1",
      "https://w3id.org/security/suites/jws-2020/v1",
    ],
    id: did,
    verificationMethod: [
      {
        id: vmId,
        type: "JsonWebKey2020",
        controller: did,
        publicKeyJwk: publicKeyJwk(),
      },
      {
        id: didKey + "#" + didKey.replace("did:key:", ""),
        type: "Ed25519VerificationKey2020",
        controller: did,
        publicKeyMultibase: didKey.replace("did:key:", ""),
      },
    ],
    assertionMethod: [vmId],
    authentication: [vmId],
  };
}

export interface VcOptions {
  host: string;
  subjectUsername: string;
  // Drives credentialSubject.id; falls back to a urn.
  subjectDid?: string;
}

// Map an Axiomic credential kind → a VC `type` and a human name.
function kindMeta(kind: string): { type: string; name: string } {
  switch (kind) {
    case "reproduction":
      return { type: "AxiomicReproductionCredential", name: "Verified reproduction" };
    case "bounty":
      return { type: "AxiomicBountyCredential", name: "Completed research bounty" };
    case "composite_score":
      return { type: "AxiomicScoreCredential", name: "Axiomic Score" };
    case "capstone":
      return { type: "AxiomicCapstoneCredential", name: "Capstone" };
    case "skill_endorsement":
      return { type: "AxiomicEndorsementCredential", name: "Peer skill endorsement" };
    default:
      return { type: "AxiomicCredential", name: kind };
  }
}

function pickEarnedAt(m: Record<string, unknown>): string | null {
  for (const k of ["mintedAt", "earnedAt", "issuedAt", "completedAt", "acceptedAt"]) {
    const v = m[k];
    if (typeof v === "string" && v.length > 0) return v;
  }
  return null;
}

// Build a W3C Verifiable Credential 2.0 from a SignedCredential.
// The proof is a fresh DataIntegrityProof (eddsa-jcs-2022) over
// the proof-less VC — it does NOT reuse the legacy signature, so
// both representations stay independently valid.
export function toVerifiableCredential(
  sc: SignedCredential,
  opts: VcOptions,
  extraTypes: string[] = [],
): Record<string, unknown> {
  const { kind, ...subjectClaims } = sc.manifest as Record<string, unknown> & {
    kind: string;
  };
  const meta = kindMeta(kind);
  const did = issuerDidWeb(opts.host);
  const earnedAt = pickEarnedAt(sc.manifest as Record<string, unknown>);
  const subjectId =
    opts.subjectDid ?? `urn:axiomic:user:${opts.subjectUsername}`;

  const ref =
    (subjectClaims.reproductionId as string) ??
    (subjectClaims.bountyId as string) ??
    (subjectClaims.userId as string) ??
    "";
  const rev = ref ? getRevocation(kind, ref) : null;

  const vc: Record<string, unknown> = {
    "@context": [
      "https://www.w3.org/ns/credentials/v2",
      "https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json",
    ],
    type: ["VerifiableCredential", meta.type, ...extraTypes],
    issuer: did,
    name: meta.name,
    credentialSubject: { id: subjectId, ...subjectClaims },
  };
  if (earnedAt) {
    vc.validFrom = earnedAt;
    // validUntil = the freshness "stale" boundary, recomputable
    // by any verifier from validFrom (no re-sign needed).
    const t = Date.parse(earnedAt);
    if (!Number.isNaN(t)) {
      vc.validUntil = new Date(
        t + AGING_MAX_DAYS * 86_400_000,
      ).toISOString();
    }
  }
  vc.credentialStatus = {
    id: `https://${opts.host}/api/v1/public/revocations`,
    type: "AxiomicRevocation2025",
    credentialKind: kind,
    credentialRef: ref,
    revoked: rev !== null,
    ...(rev ? { revocationReason: rev.reason } : {}),
  };
  vc.credentialSchema = {
    id: `https://${opts.host}/api/v1/keys/verify`,
    type: "AxiomicEd25519JCS2022",
  };
  if (earnedAt) {
    (vc as Record<string, unknown>).freshness = freshnessBand(earnedAt);
  }

  const proofless = canonicalJson(vc);
  const sigHex = sign(proofless);
  vc.proof = {
    type: "DataIntegrityProof",
    cryptosuite: "eddsa-jcs-2022",
    created: new Date().toISOString(),
    verificationMethod: did + "#key-1",
    proofPurpose: "assertionMethod",
    proofValue: mb(hexToBytes(sigHex)),
  };
  return vc;
}

// Open Badges 3.0 — same VC envelope, achievement-shaped subject.
export function toOpenBadge3(
  sc: SignedCredential,
  opts: VcOptions,
): Record<string, unknown> {
  const { kind, ...claims } = sc.manifest as Record<string, unknown> & {
    kind: string;
  };
  const meta = kindMeta(kind);
  const did = issuerDidWeb(opts.host);
  const earnedAt = pickEarnedAt(sc.manifest as Record<string, unknown>);
  const subjectId =
    opts.subjectDid ?? `urn:axiomic:user:${opts.subjectUsername}`;

  const ob: Record<string, unknown> = {
    "@context": [
      "https://www.w3.org/ns/credentials/v2",
      "https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json",
    ],
    type: ["VerifiableCredential", "OpenBadgeCredential"],
    issuer: {
      id: did,
      type: ["Profile"],
      name: "Axiomic",
    },
    name: meta.name,
    credentialSubject: {
      id: subjectId,
      type: ["AchievementSubject"],
      achievement: {
        id: `https://${opts.host}/verify`,
        type: ["Achievement"],
        name: meta.name,
        description: `Axiomic ${kind} credential for @${opts.subjectUsername}.`,
        criteria: {
          narrative:
            "Issued by Axiomic on demonstrated, peer- or self-verified evidence; Ed25519-signed and revocation-checked.",
        },
      },
      claims,
    },
  };
  if (earnedAt) {
    ob.validFrom = earnedAt;
    (ob.credentialSubject as Record<string, unknown>).awardedDate = earnedAt;
  }
  const proofless = canonicalJson(ob);
  const sigHex = sign(proofless);
  ob.proof = {
    type: "DataIntegrityProof",
    cryptosuite: "eddsa-jcs-2022",
    created: new Date().toISOString(),
    verificationMethod: did + "#key-1",
    proofPurpose: "assertionMethod",
    proofValue: mb(hexToBytes(sigHex)),
  };
  return ob;
}

// Additive verify path for a VC/OB3 envelope. Strips `proof`,
// re-canonicalizes, and ed25519-verifies the multibase proofValue
// against this instance's key (did:web) or the proof's did:key.
export function verifyVerifiableCredential(vc: unknown): {
  valid: boolean;
  issuerKeyHex: string | null;
} {
  if (!vc || typeof vc !== "object") return { valid: false, issuerKeyHex: null };
  const obj = vc as Record<string, unknown>;
  const proof = obj.proof as Record<string, unknown> | undefined;
  if (!proof || typeof proof.proofValue !== "string") {
    return { valid: false, issuerKeyHex: null };
  }
  let keyHex = publicKeyHex();
  const vm = typeof proof.verificationMethod === "string"
    ? proof.verificationMethod
    : "";
  if (vm.startsWith("did:key:")) {
    try {
      keyHex = didKeyToEd25519Hex(vm.split("#")[0]);
    } catch {
      return { valid: false, issuerKeyHex: null };
    }
  }
  const { proof: _omit, ...rest } = obj;
  const payload = canonicalJson(rest);
  let sigHex: string;
  try {
    sigHex = bytesToHex(mbDecode(proof.proofValue as string));
  } catch {
    return { valid: false, issuerKeyHex: null };
  }
  const valid = verifyWithPublicKey(payload, sigHex, keyHex);
  return { valid, issuerKeyHex: keyHex };
}
