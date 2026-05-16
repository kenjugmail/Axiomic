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
import { buildWallet } from "./credentials";
import {
  computeAxiomicScore,
  signAxiomicScore,
} from "../lib/compositeScore";
import { buildProvenance } from "../lib/provenance";
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
  return c.json({
    user: { username: r.username, displayName: r.displayName },
    credentials: buildWallet(r.id, r.username),
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
