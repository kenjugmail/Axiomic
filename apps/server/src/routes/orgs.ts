// Phase 34B — organization / institution account routes.

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import { getDb, orgMembers, users } from "@axiomic/db";
import { requireAuth, getSessionUser } from "../middleware/auth";
import { checkRateLimit } from "../lib/rateLimit";
import { env } from "../lib/envConfig";
import {
  attestForMember,
  createOrg,
  gateOrg,
  listOrgMembers,
  memberRole,
  orgAttestationsForUser,
} from "../lib/orgs";
import { notify } from "../lib/notifications";
import type { Env } from "../env";

export const orgsRouter = new Hono<Env>();

orgsRouter.post(
  "/",
  requireAuth,
  zValidator(
    "json",
    z.object({
      slug: z
        .string()
        .min(2)
        .max(60)
        .regex(/^[a-z0-9-]+$/, "lowercase, digits, hyphens only"),
      name: z.string().min(2).max(160),
      descriptionMd: z.string().max(8000).optional().default(""),
      website: z.string().max(300).optional().default(""),
    }),
  ),
  (c) => {
    const me = c.get("user")!;
    if (
      env.NODE_ENV !== "test" &&
      !checkRateLimit(`org-create:${me.id}`, 5, 3600_000)
    ) {
      return c.json({ error: "Rate limited." }, 429);
    }
    const r = createOrg(me.id, c.req.valid("json"));
    if (!r.ok) return c.json({ error: "That slug is taken." }, 409);
    return c.json({ ok: true, id: r.id }, 201);
  },
);

orgsRouter.get("/:slug", async (c) => {
  const session = await getSessionUser(c);
  const g = gateOrg(c.req.param("slug")!, session?.id ?? null, null);
  if (!g.ok) return c.json({ error: g.error }, g.status);
  return c.json({
    org: {
      slug: g.org.slug,
      name: g.org.name,
      descriptionMd: g.org.descriptionMd,
      website: g.org.website,
      verificationStatus: g.org.verificationStatus,
    },
    role: g.role,
    members: listOrgMembers(g.org.id),
  });
});

orgsRouter.post(
  "/:slug/members",
  requireAuth,
  zValidator(
    "json",
    z.object({
      username: z.string().min(1),
      role: z.enum(["member", "admin", "verifier"]).optional().default("member"),
    }),
  ),
  (c) => {
    const me = c.get("user")!;
    const g = gateOrg(c.req.param("slug")!, me.id, "admin");
    if (!g.ok) return c.json({ error: g.error }, g.status);
    const { username, role } = c.req.valid("json");
    const db = getDb();
    const u = db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.username, username))
      .get();
    if (!u) return c.json({ error: "User not found" }, 404);
    try {
      db.insert(orgMembers)
        .values({ id: randomUUID(), orgId: g.org.id, userId: u.id, role })
        .run();
    } catch {
      return c.json({ error: "Already a member" }, 409);
    }
    return c.json({ ok: true }, 201);
  },
);

orgsRouter.post(
  "/:slug/members/:username/role",
  requireAuth,
  zValidator(
    "json",
    z.object({ role: z.enum(["member", "admin", "verifier"]) }),
  ),
  (c) => {
    const me = c.get("user")!;
    const g = gateOrg(c.req.param("slug")!, me.id, "admin");
    if (!g.ok) return c.json({ error: g.error }, g.status);
    const db = getDb();
    const u = db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.username, c.req.param("username")!))
      .get();
    if (!u) return c.json({ error: "User not found" }, 404);
    const r = db
      .update(orgMembers)
      .set({ role: c.req.valid("json").role })
      .where(
        and(eq(orgMembers.orgId, g.org.id), eq(orgMembers.userId, u.id)),
      )
      .run();
    if (((r as unknown as { changes?: number }).changes ?? 0) === 0) {
      return c.json({ error: "Not a member" }, 404);
    }
    return c.json({ ok: true });
  },
);

orgsRouter.post(
  "/:slug/attest",
  requireAuth,
  zValidator(
    "json",
    z.object({
      username: z.string().min(1),
      attestKind: z.enum(["reproduction", "bounty", "skill"]),
      attestRef: z.string().max(200).optional().default(""),
      statement: z.string().max(1000).optional().default(""),
    }),
  ),
  (c) => {
    const me = c.get("user")!;
    const g = gateOrg(c.req.param("slug")!, me.id, "verifier");
    if (!g.ok) return c.json({ error: g.error }, g.status);
    const { username, attestKind, attestRef, statement } =
      c.req.valid("json");
    const db = getDb();
    const subject = db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.username, username))
      .get();
    if (!subject) return c.json({ error: "User not found" }, 404);
    const r = attestForMember(
      g.org,
      me.id,
      subject.id,
      attestKind,
      attestRef,
      statement,
    );
    if (!r.ok) return c.json({ error: r.error }, 400);
    void notify({
      recipientId: subject.id,
      actorId: me.id,
      kind: "org_attested",
      subjectType: "org_attestation",
      subjectId: r.id,
      contextSlug: g.org.slug,
      preview: `${g.org.name} attested your ${attestKind} — it's now in your wallet.`,
    });
    return c.json({ ok: true, id: r.id, credential: r.signed }, 201);
  },
);

// Caller's own incoming org attestations (band on the wallet UI).
orgsRouter.get("/me/attestations", requireAuth, (c) => {
  const me = c.get("user")!;
  return c.json({ attestations: orgAttestationsForUser(me.id) });
});

export { memberRole };
