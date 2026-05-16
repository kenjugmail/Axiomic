// Phase 33B — Certificate-Transparency-style credential log.
//
// An append-only, SHA-256 hash-chained log of credential
// lifecycle events (issued / revoked / unrevoked). Each leaf's
// hash commits to the previous leaf, so any silent rewrite or
// deletion breaks the chain and a periodically-signed tree head.
// Anti-backdating + anti-silent-revocation — a trust property
// hiring/regulated contexts need.
//
// Honest scope: a hash chain + consistency proof (dependency-
// free), NOT an RFC-6962 Merkle audit path. Reuses signing.ts
// (sign / canonicalJson / publicKeyHex) + node:crypto sha256
// (already used in embeddingCache.ts).

import { createHash, randomUUID } from "crypto";
import { and, desc, eq } from "drizzle-orm";
import {
  credentialLog,
  getDb,
  transparencyTreeHeads,
} from "@axiomic/db";
import { canonicalJson, publicKeyHex, sign, verify } from "./signing";

export type LogEventKind = "issued" | "revoked" | "unrevoked";

function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

function leafHashOf(
  prevHash: string,
  leafIndex: number,
  eventKind: LogEventKind,
  credentialKind: string,
  credentialRef: string,
  payload: unknown,
): string {
  return sha256(
    prevHash +
      canonicalJson({
        leafIndex,
        eventKind,
        credentialKind,
        credentialRef,
        payload,
      }),
  );
}

// Append one event. Idempotent: if the most recent event for this
// (kind, ref) already records the same state, it's a no-op (so a
// re-run of the mint hook or a repeated revoke doesn't double-log;
// an unrevoke→revoke transition DOES append). Best-effort caller —
// never let a logging failure break mint/revoke.
export function appendCredentialEvent(
  eventKind: LogEventKind,
  credentialKind: string,
  credentialRef: string,
  payload: Record<string, unknown> = {},
): { appended: boolean; leafIndex: number | null } {
  const db = getDb();
  try {
    return db.transaction((tx) => {
      const lastForRef = tx
        .select({ eventKind: credentialLog.eventKind })
        .from(credentialLog)
        .where(
          and(
            eq(credentialLog.credentialKind, credentialKind),
            eq(credentialLog.credentialRef, credentialRef),
          ),
        )
        .orderBy(desc(credentialLog.leafIndex))
        .limit(1)
        .get();
      if (lastForRef && lastForRef.eventKind === eventKind) {
        return { appended: false, leafIndex: null };
      }
      const tail = tx
        .select({
          leafIndex: credentialLog.leafIndex,
          leafHash: credentialLog.leafHash,
        })
        .from(credentialLog)
        .orderBy(desc(credentialLog.leafIndex))
        .limit(1)
        .get();
      const leafIndex = tail ? tail.leafIndex + 1 : 0;
      const prevHash = tail ? tail.leafHash : "";
      const leafHash = leafHashOf(
        prevHash,
        leafIndex,
        eventKind,
        credentialKind,
        credentialRef,
        payload,
      );
      tx.insert(credentialLog)
        .values({
          id: randomUUID(),
          leafIndex,
          eventKind,
          credentialKind,
          credentialRef,
          leafHash,
          prevHash,
          payloadJson: JSON.stringify(payload),
        })
        .run();
      return { appended: true, leafIndex };
    });
  } catch (err) {
    console.error("[transparency] append failed", err);
    return { appended: false, leafIndex: null };
  }
}

export interface TreeHead {
  treeSize: number;
  rootHash: string;
  signed: boolean;
  signature: string | null;
  signedAt: string | null;
  publicKey: string;
}

function currentChainHead(): { treeSize: number; rootHash: string } {
  const tail = getDb()
    .select({
      leafIndex: credentialLog.leafIndex,
      leafHash: credentialLog.leafHash,
    })
    .from(credentialLog)
    .orderBy(desc(credentialLog.leafIndex))
    .limit(1)
    .get();
  return {
    treeSize: tail ? tail.leafIndex + 1 : 0,
    rootHash: tail ? tail.leafHash : "",
  };
}

// The latest signed tree head, or — if none yet, or the chain has
// grown past the last signed head — the current unsigned head so
// callers always get a usable anchor.
export function getTreeHead(): TreeHead {
  const cur = currentChainHead();
  const signed = getDb()
    .select()
    .from(transparencyTreeHeads)
    .orderBy(desc(transparencyTreeHeads.treeSize))
    .limit(1)
    .get();
  if (signed && signed.treeSize === cur.treeSize) {
    return {
      treeSize: signed.treeSize,
      rootHash: signed.rootHash,
      signed: true,
      signature: signed.signature,
      signedAt: signed.signedAt,
      publicKey: publicKeyHex(),
    };
  }
  return {
    treeSize: cur.treeSize,
    rootHash: cur.rootHash,
    signed: false,
    signature: null,
    signedAt: null,
    publicKey: publicKeyHex(),
  };
}

// Sign the current head (idempotent: skips if a signed head for
// this exact treeSize already exists). Called by the hourly job.
export function signTreeHead(): { signed: boolean; treeSize: number } {
  const cur = currentChainHead();
  const db = getDb();
  const existing = db
    .select({ treeSize: transparencyTreeHeads.treeSize })
    .from(transparencyTreeHeads)
    .where(eq(transparencyTreeHeads.treeSize, cur.treeSize))
    .get();
  if (existing || cur.treeSize === 0) {
    return { signed: false, treeSize: cur.treeSize };
  }
  const signature = sign(
    canonicalJson({ treeSize: cur.treeSize, rootHash: cur.rootHash }),
  );
  db.insert(transparencyTreeHeads)
    .values({
      id: randomUUID(),
      treeSize: cur.treeSize,
      rootHash: cur.rootHash,
      signature,
    })
    .run();
  return { signed: true, treeSize: cur.treeSize };
}

export function verifyTreeHeadSignature(h: {
  treeSize: number;
  rootHash: string;
  signature: string;
}): boolean {
  return verify(
    canonicalJson({ treeSize: h.treeSize, rootHash: h.rootHash }),
    h.signature,
  );
}

// Recompute the whole chain; report the first leaf whose stored
// hash disagrees with its recomputed hash (tamper / reorder /
// deletion). O(n) — the log is small and this is a verifier path.
export function verifyChain(): {
  ok: boolean;
  brokenAtLeafIndex: number | null;
  size: number;
} {
  const leaves = getDb()
    .select()
    .from(credentialLog)
    .orderBy(credentialLog.leafIndex)
    .all();
  let prevHash = "";
  for (let i = 0; i < leaves.length; i++) {
    const lf = leaves[i];
    if (lf.leafIndex !== i || lf.prevHash !== prevHash) {
      return { ok: false, brokenAtLeafIndex: lf.leafIndex, size: leaves.length };
    }
    const recomputed = leafHashOf(
      prevHash,
      lf.leafIndex,
      lf.eventKind as LogEventKind,
      lf.credentialKind,
      lf.credentialRef,
      JSON.parse(lf.payloadJson),
    );
    if (recomputed !== lf.leafHash) {
      return { ok: false, brokenAtLeafIndex: lf.leafIndex, size: leaves.length };
    }
    prevHash = lf.leafHash;
  }
  return { ok: true, brokenAtLeafIndex: null, size: leaves.length };
}

export function listLeaves(since = 0, limit = 200) {
  return getDb()
    .select({
      leafIndex: credentialLog.leafIndex,
      eventKind: credentialLog.eventKind,
      credentialKind: credentialLog.credentialKind,
      credentialRef: credentialLog.credentialRef,
      leafHash: credentialLog.leafHash,
      prevHash: credentialLog.prevHash,
      createdAt: credentialLog.createdAt,
    })
    .from(credentialLog)
    .orderBy(credentialLog.leafIndex)
    .limit(Math.min(Math.max(limit, 1), 500))
    .offset(Math.max(since, 0))
    .all();
}

// Inclusion: the leaves for one credential + the signed/current
// head they chain up to. A holder proves "this credential was
// logged at leaf N and the issuer's head commits to a chain that
// contains it".
export function inclusionProof(
  credentialKind: string,
  credentialRef: string,
) {
  const events = getDb()
    .select({
      leafIndex: credentialLog.leafIndex,
      eventKind: credentialLog.eventKind,
      leafHash: credentialLog.leafHash,
      prevHash: credentialLog.prevHash,
      createdAt: credentialLog.createdAt,
    })
    .from(credentialLog)
    .where(
      and(
        eq(credentialLog.credentialKind, credentialKind),
        eq(credentialLog.credentialRef, credentialRef),
      ),
    )
    .orderBy(credentialLog.leafIndex)
    .all();
  return { credentialKind, credentialRef, events, treeHead: getTreeHead() };
}
