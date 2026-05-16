// Phase 31D — versioned public API namespace (/api/v1/public/*).
//
// Unauthenticated, CORS-open re-exposure of public data for
// third-party integration (employer ATS, other platforms): a
// user's signed credential bundle, their signed Axiomic Score,
// and a research-artifact provenance chain. Scoped open CORS is
// applied on THIS router only — the global credentialed CORS
// (index.ts) stays origin-locked. Honors the same
// credentialsPublic privacy gate as the wallet. The existing
// /keys/verify + /keys/signing are untouched; this only adds.

import { Hono } from "hono";
import type { Context } from "hono";
import { cors } from "hono/cors";
import { eq } from "drizzle-orm";
import { getDb, users } from "@axiomic/db";
import { getSessionUser } from "../middleware/auth";
import {
  buildWallet,
  serializeVcBundle,
  resolveShareToken,
} from "./credentials";
import {
  computeAxiomicScore,
  signAxiomicScore,
} from "../lib/compositeScore";
import { buildProvenance } from "../lib/provenance";
import { listActiveRevocations } from "../lib/revocation";
import {
  getTreeHead,
  inclusionProof,
  listLeaves,
} from "../lib/transparency";
import { getOrg, listOrgMembers } from "../lib/orgs";
import { orgAttestations } from "@axiomic/db";
import { toVerifiableCredential } from "../lib/vc";
import { clampInt } from "../lib/pagination";
import type { SignedCredential } from "../lib/signing";
import type { Env } from "../env";

export const publicApiRouter = new Hono<Env>();

// Open CORS for this subtree only (no credentials — public reads).
publicApiRouter.use("*", cors({ origin: "*" }));

type ResolveResult =
  | { ok: true; id: string; username: string; displayName: string | null }
  | { ok: false; res: Response };

async function resolvePublicUser(
  c: Context<Env>,
): Promise<ResolveResult> {
  const username = c.req.param("username")!;
  const u = getDb()
    .select({
      id: users.id,
      username: users.username,
      displayName: users.displayName,
      credentialsPublic: users.credentialsPublic,
    })
    .from(users)
    .where(eq(users.username, username))
    .get();
  if (!u) return { ok: false, res: c.json({ error: "User not found" }, 404) };
  if (!u.credentialsPublic) {
    const session = await getSessionUser(c);
    if (session?.id !== u.id) {
      return {
        ok: false,
        res: c.json({ error: "This portfolio is private" }, 403),
      };
    }
  }
  return {
    ok: true,
    id: u.id,
    username: u.username,
    displayName: u.displayName,
  };
}

publicApiRouter.get("/users/:username/credentials", async (c) => {
  const r = await resolvePublicUser(c);
  if (!r.ok) return r.res;
  const items = buildWallet(r.id, r.username);
  const fmt = c.req.query("format");
  if (fmt === "vc" || fmt === "ob3") {
    return c.json(
      serializeVcBundle(items, r.username, new URL(c.req.url).host, fmt),
    );
  }
  return c.json({
    user: { username: r.username, displayName: r.displayName },
    credentials: items,
  });
});

publicApiRouter.get("/users/:username/composite-score", async (c) => {
  const r = await resolvePublicUser(c);
  if (!r.ok) return r.res;
  const s = await computeAxiomicScore(r.id, r.username);
  return c.json({
    user: { username: r.username, displayName: r.displayName },
    ...s,
    credential: signAxiomicScore(r.id, r.username, s),
  });
});

publicApiRouter.get(
  "/research/:targetKind/:targetId/provenance",
  (c) => {
    const targetKind = c.req.param("targetKind")!;
    const targetId = c.req.param("targetId")!;
    return c.json(buildProvenance(targetKind, targetId));
  },
);

// Phase 32A — public, externally-checkable revocation feed. Any
// third party that cached a signed credential offline can poll
// this to learn the issuer has since withdrawn the claim — the
// CRL/OCSP analogue for Axiomic credentials. CORS-open (scoped to
// this router); no auth; no privacy gate (a revocation is a
// public trust statement, like the signing key itself).
publicApiRouter.get("/revocations", (c) => {
  const revocations = listActiveRevocations();
  c.header("cache-control", "public, max-age=300");
  return c.json({ count: revocations.length, revocations });
});

// Phase 33B — public credential transparency log. tree-head is
// the signed (or current) chain anchor; leaves paginates the log;
// inclusion proves a specific credential's events chain into the
// head. Tamper-evident: a verifier recomputes the chain itself.
publicApiRouter.get("/transparency/tree-head", (c) => {
  c.header("cache-control", "public, max-age=60");
  return c.json(getTreeHead());
});
publicApiRouter.get("/transparency/leaves", (c) => {
  const since = clampInt(c.req.query("since"), {
    def: 0,
    min: 0,
    max: Number.MAX_SAFE_INTEGER,
  });
  const limit = clampInt(c.req.query("limit"), { def: 200, min: 1, max: 1000 });
  return c.json({ leaves: listLeaves(since, limit), treeHead: getTreeHead() });
});
// Phase 33D — consume a selective-disclosure share link. Bypasses
// the all-or-nothing credentialsPublic gate ONLY for the token's
// scoped subset; 404 on missing/revoked/expired. ?format=vc|ob3
// composes with 33A.
publicApiRouter.get("/share/:token", (c) => {
  const r = resolveShareToken(c.req.param("token")!);
  if (!r) return c.json({ error: "Invalid or expired share link" }, 404);
  c.header("cache-control", "no-store");
  const fmt = c.req.query("format");
  if (fmt === "vc" || fmt === "ob3") {
    return c.json(
      serializeVcBundle(r.items, r.username, new URL(c.req.url).host, fmt),
    );
  }
  return c.json({
    user: { username: r.username, displayName: r.displayName },
    scope: r.scope,
    credentials: r.items,
  });
});

publicApiRouter.get("/transparency/inclusion", (c) => {
  const kind = (c.req.query("kind") ?? "").trim();
  const ref = (c.req.query("ref") ?? "").trim();
  if (!kind || !ref) {
    return c.json({ error: "kind + ref query required" }, 400);
  }
  return c.json(inclusionProof(kind, ref));
});

// Phase 34B — public org verify surface. Profile + members +
// signed attestations the org has issued; ?format=vc wraps each
// attestation as a W3C VC with the org as named issuer (33A).
publicApiRouter.get("/orgs/:slug", (c) => {
  const org = getOrg(c.req.param("slug")!);
  if (!org) return c.json({ error: "Org not found" }, 404);
  const attestations = getDb()
    .select({
      id: orgAttestations.id,
      subjectUserId: orgAttestations.subjectUserId,
      attestKind: orgAttestations.attestKind,
      attestRef: orgAttestations.attestRef,
      statement: orgAttestations.statement,
      createdAt: orgAttestations.createdAt,
      signedJson: orgAttestations.signedJson,
    })
    .from(orgAttestations)
    .where(eq(orgAttestations.orgId, org.id))
    .limit(200)
    .all();
  const fmt = c.req.query("format");
  if (fmt === "vc" || fmt === "ob3") {
    const host = new URL(c.req.url).host;
    const vcs = attestations
      .filter((a) => a.signedJson)
      .map((a) =>
        toVerifiableCredential(
          JSON.parse(a.signedJson) as SignedCredential,
          { host, subjectUsername: org.slug },
        ),
      );
    return c.json({
      "@context": ["https://www.w3.org/ns/credentials/v2"],
      type: ["VerifiablePresentation"],
      holder: `did:web:${host.replace(/:/g, "%3A")}`,
      count: vcs.length,
      verifiableCredential: vcs,
    });
  }
  return c.json({
    org: {
      slug: org.slug,
      name: org.name,
      descriptionMd: org.descriptionMd,
      website: org.website,
      verificationStatus: org.verificationStatus,
    },
    // Public surface: cap roster size and never expose internal
    // subject user ids (the non-VC list is for humans; the
    // ?format=vc branch carries the integrity-bearing payload).
    members: listOrgMembers(org.id).slice(0, 200),
    attestations: attestations.map((a) => ({
      id: a.id,
      attestKind: a.attestKind,
      attestRef: a.attestRef,
      statement: a.statement,
      createdAt: a.createdAt,
    })),
  });
});
