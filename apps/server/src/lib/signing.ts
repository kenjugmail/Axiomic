// Sprint 37 — ed25519 signing for capstone transcripts.
//
// Signs canonical JSON with an Ed25519 keypair so anyone with the
// public key can verify a transcript was issued by this Axiomic
// instance. Public key is exposed via /.well-known/axiomic-signing-pubkey;
// the private key is server-side and read from AXIOMIC_SIGNING_PRIVATE_KEY_HEX
// (raw 32-byte ed25519 seed, hex-encoded). When unset we generate an
// ephemeral keypair on first use — fine for development; production
// deployments should pin the key so transcripts remain verifiable
// across restarts.

import {
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  KeyObject,
  sign as cryptoSign,
  verify as cryptoVerify,
} from "crypto";
import { env } from "./envConfig";

let cached: { privateKey: KeyObject; publicKey: KeyObject; publicKeyHex: string } | null = null;

function loadFromEnv(): KeyObject | null {
  const hex = env.AXIOMIC_SIGNING_PRIVATE_KEY_HEX;
  if (!hex) return null;
  const seed = Buffer.from(hex.trim(), "hex");
  if (seed.length !== 32) {
    console.warn(
      "AXIOMIC_SIGNING_PRIVATE_KEY_HEX must be a 32-byte hex string; ignoring.",
    );
    return null;
  }
  // RFC 8410 Ed25519 PKCS#8 prefix + 32-byte seed.
  const prefix = Buffer.from(
    "302e020100300506032b657004220420",
    "hex",
  );
  const der = Buffer.concat([prefix, seed]);
  return createPrivateKey({ key: der, format: "der", type: "pkcs8" });
}

function ensureKeys(): NonNullable<typeof cached> {
  if (cached) return cached;
  let privateKey = loadFromEnv();
  let publicKey: KeyObject;
  if (!privateKey) {
    // Sprint 53 — refuse ephemeral keys in production. A transcript
    // signed under an ephemeral key stops verifying after every
    // restart, silently invalidating every issued credential. In
    // production this is a configuration bug, not a soft warning.
    if (env.NODE_ENV === "production") {
      throw new Error(
        "AXIOMIC_SIGNING_PRIVATE_KEY_HEX is required in production. " +
          "Generate one with `bash scripts/generate-signing-key.sh` " +
          "and set it in your environment before starting the server.",
      );
    }
    const pair = generateKeyPairSync("ed25519");
    privateKey = pair.privateKey;
    publicKey = pair.publicKey;
    if (env.NODE_ENV !== "test") {
      console.warn(
        "AXIOMIC_SIGNING_PRIVATE_KEY_HEX not set — using an ephemeral signing key. " +
          "Transcripts will not be verifiable across server restarts.",
      );
    }
  } else {
    publicKey = createPublicKey(privateKey);
  }
  const spki = publicKey.export({ format: "der", type: "spki" });
  // SPKI prefix is 12 bytes for Ed25519; raw key follows.
  const raw = Buffer.from(spki).subarray(12);
  cached = {
    privateKey,
    publicKey,
    publicKeyHex: raw.toString("hex"),
  };
  return cached;
}

export function publicKeyHex(): string {
  return ensureKeys().publicKeyHex;
}

export function sign(message: string): string {
  const { privateKey } = ensureKeys();
  // Ed25519 — pass null algorithm per Node docs.
  const sig = cryptoSign(null, Buffer.from(message, "utf-8"), privateKey);
  return Buffer.from(sig).toString("hex");
}

export function verify(message: string, signatureHex: string): boolean {
  try {
    const { publicKey } = ensureKeys();
    return cryptoVerify(
      null,
      Buffer.from(message, "utf-8"),
      publicKey,
      Buffer.from(signatureHex, "hex"),
    );
  } catch {
    return false;
  }
}

// Verify using a caller-supplied public key (raw 32-byte hex). Useful
// for the /verify page so a verifier can paste a transcript + public
// key and check independently.
export function verifyWithPublicKey(
  message: string,
  signatureHex: string,
  pubKeyHex: string,
): boolean {
  try {
    const raw = Buffer.from(pubKeyHex.trim(), "hex");
    if (raw.length !== 32) return false;
    const spkiPrefix = Buffer.from("302a300506032b6570032100", "hex");
    const der = Buffer.concat([spkiPrefix, raw]);
    const pub = createPublicKey({ key: der, format: "der", type: "spki" });
    return cryptoVerify(
      null,
      Buffer.from(message, "utf-8"),
      pub,
      Buffer.from(signatureHex, "hex"),
    );
  } catch {
    return false;
  }
}

// Canonical JSON: deterministic key ordering so the bytes that get
// signed match exactly when the verifier re-serializes the object.
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(obj).sort()) {
      out[k] = sortKeys(obj[k]);
    }
    return out;
  }
  return value;
}

// Test-only hook to reset the cached keypair so the next call
// regenerates / re-reads the env var.
export function __resetForTesting() {
  cached = null;
}
