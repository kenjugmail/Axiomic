// Sprint 37 — signing primitives.
//
// Cover the round-trip + tamper-detection path so the transcript
// guarantees are testable: a valid signature verifies, any byte change
// in the message or signature invalidates it, and verifyWithPublicKey
// works against the same public key the server exposes.

import { describe, test, expect } from "bun:test";
import {
  canonicalJson,
  publicKeyHex,
  sign,
  verify,
  verifyWithPublicKey,
} from "./signing";

describe("Sprint 37 — ed25519 signing", () => {
  test("sign / verify round-trip succeeds", () => {
    const msg = "hello transcripts";
    const sig = sign(msg);
    expect(typeof sig).toBe("string");
    expect(sig.length).toBe(128); // 64 bytes hex
    expect(verify(msg, sig)).toBe(true);
  });

  test("tampered message fails verification", () => {
    const msg = "hello transcripts";
    const sig = sign(msg);
    expect(verify(msg + " ", sig)).toBe(false);
    expect(verify(msg.slice(0, -1), sig)).toBe(false);
  });

  test("tampered signature fails verification", () => {
    const sig = sign("payload");
    // Flip the last byte.
    const flipped = sig.slice(0, -2) + (sig.slice(-2) === "00" ? "ff" : "00");
    expect(verify("payload", flipped)).toBe(false);
  });

  test("verifyWithPublicKey accepts the server's published key", () => {
    const msg = "verifiable bytes";
    const sig = sign(msg);
    const pub = publicKeyHex();
    expect(verifyWithPublicKey(msg, sig, pub)).toBe(true);
  });

  test("verifyWithPublicKey rejects an unrelated public key", () => {
    const sig = sign("anything");
    // 32 zero bytes — almost certainly not the actual key.
    const fakePub = "00".repeat(32);
    expect(verifyWithPublicKey("anything", sig, fakePub)).toBe(false);
  });

  test("canonicalJson sorts keys deterministically and recursively", () => {
    const a = canonicalJson({ b: 1, a: { d: 4, c: 3 } });
    const b = canonicalJson({ a: { c: 3, d: 4 }, b: 1 });
    expect(a).toBe(b);
    expect(a).toBe('{"a":{"c":3,"d":4},"b":1}');
  });

  test("canonicalJson preserves array order", () => {
    expect(canonicalJson([3, 1, 2])).toBe("[3,1,2]");
  });
});
