// Phase 30C — recruiter dashboard.
//
// Completes the credential wallet into a two-sided hiring
// channel: search candidates by *proven* skill (the denormalized
// userSkillIndex, self-healed on wallet views), browse the skill
// catalog, and save candidates into talent pools. Discovery-only;
// no payments. Only users with credentialsPublic=true are
// searchable (the index already excludes private users; we
// re-check at read time as defense-in-depth).

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { randomUUID } from "crypto";
import {
  getDb,
  talentPoolMembers,
  userSkillIndex,
  userTalentPools,
  users,
} from "@axiomic/db";
import { requireAuth } from "../middleware/auth";
import { checkRateLimit } from "../lib/rateLimit";
import { env } from "../lib/envConfig";
import { listRoles, getRole } from "../lib/roles";
import { analyzeSkillGap } from "../lib/skillGap";
import type { Env } from "../env";

export const recruiterRouter = new Hono<Env>();

// GET /recruiter/search?skill=&minProofs= — public discovery.
recruiterRouter.get(
  "/search",
  zValidator(
    "query",
    z.object({
      skill: z.string().min(1).max(120),
      minProofs: z
        .string()
        .optional()
        .transform((v) =>
          Math.max(1, Math.min(50, parseInt(v ?? "1", 10) || 1)),
        ),
    }),
  ),
  async (c) => {
    const { skill, minProofs } = c.req.valid("query");
    const db = getDb();
    const rows = db
      .select({
        username: users.username,
        displayName: users.displayName,
        skillSlug: userSkillIndex.skillSlug,
        skillTitle: userSkillIndex.skillTitle,
        proofCount: userSkillIndex.proofCount,
        latestProofAt: userSkillIndex.latestProofAt,
        credentialsPublic: users.credentialsPublic,
      })
      .from(userSkillIndex)
      .innerJoin(users, eq(userSkillIndex.userId, users.id))
      .where(
        and(
          eq(userSkillIndex.skillSlug, skill),
          sql`${userSkillIndex.proofCount} >= ${minProofs}`,
          eq(users.credentialsPublic, true),
          isNull(users.deletedAt),
        ),
      )
      .orderBy(
        desc(userSkillIndex.proofCount),
        desc(userSkillIndex.latestProofAt),
      )
      .limit(50)
      .all();
    return c.json({
      skill,
      candidates: rows
        .filter((r) => r.credentialsPublic !== false)
        .map((r) => ({
          username: r.username,
          displayName: r.displayName,
          skillSlug: r.skillSlug,
          skillTitle: r.skillTitle,
          proofCount: r.proofCount,
          latestProofAt: r.latestProofAt,
        })),
    });
  },
);

// GET /recruiter/skills — the searchable skill catalog with
// public-candidate counts (for the search page's browse/picker).
recruiterRouter.get("/skills", async (c) => {
  const db = getDb();
  const rows = db
    .select({
      skillSlug: userSkillIndex.skillSlug,
      skillTitle: sql<string>`MIN(${userSkillIndex.skillTitle})`,
      candidates: sql<number>`COUNT(DISTINCT ${userSkillIndex.userId})`,
    })
    .from(userSkillIndex)
    .innerJoin(users, eq(userSkillIndex.userId, users.id))
    .where(and(eq(users.credentialsPublic, true), isNull(users.deletedAt)))
    .groupBy(userSkillIndex.skillSlug)
    .orderBy(desc(sql`COUNT(DISTINCT ${userSkillIndex.userId})`))
    .limit(200)
    .all();
  return c.json({
    skills: rows.map((r) => ({
      slug: r.skillSlug,
      title: r.skillTitle,
      candidates: Number(r.candidates),
    })),
  });
});

// ---- Talent pools (saved candidate lists) ----

recruiterRouter.get("/pools", requireAuth, async (c) => {
  const me = c.get("user")!;
  const db = getDb();
  const pools = db
    .select({
      id: userTalentPools.id,
      name: userTalentPools.name,
      createdAt: userTalentPools.createdAt,
      count: sql<number>`(SELECT COUNT(*) FROM talent_pool_members m WHERE m.pool_id = ${userTalentPools.id})`,
    })
    .from(userTalentPools)
    .where(eq(userTalentPools.ownerId, me.id))
    .orderBy(desc(userTalentPools.createdAt))
    .all();
  return c.json({ pools: pools.map((p) => ({ ...p, count: Number(p.count) })) });
});

recruiterRouter.post(
  "/pools",
  requireAuth,
  zValidator("json", z.object({ name: z.string().min(1).max(80) })),
  async (c) => {
    const me = c.get("user")!;
    if (
      env.NODE_ENV !== "test" &&
      !checkRateLimit(`talent-pool:${me.id}`, 20, 60_000)
    ) {
      return c.json({ error: "Rate limited. Slow down." }, 429);
    }
    const { name } = c.req.valid("json");
    const id = randomUUID();
    getDb()
      .insert(userTalentPools)
      .values({ id, ownerId: me.id, name })
      .run();
    return c.json({ id, name }, 201);
  },
);

recruiterRouter.get("/pools/:id", requireAuth, async (c) => {
  const me = c.get("user")!;
  const db = getDb();
  const pool = db
    .select()
    .from(userTalentPools)
    .where(eq(userTalentPools.id, c.req.param("id")!))
    .get();
  if (!pool) return c.json({ error: "Pool not found" }, 404);
  if (pool.ownerId !== me.id) return c.json({ error: "Owner only" }, 403);
  const members = db
    .select({
      candidateUserId: talentPoolMembers.candidateUserId,
      username: users.username,
      displayName: users.displayName,
      addedAt: talentPoolMembers.addedAt,
    })
    .from(talentPoolMembers)
    .innerJoin(users, eq(talentPoolMembers.candidateUserId, users.id))
    .where(eq(talentPoolMembers.poolId, pool.id))
    .orderBy(desc(talentPoolMembers.addedAt))
    .all();
  return c.json({ pool: { id: pool.id, name: pool.name }, members });
});

// Phase 32C — curated target-role catalog (public, like /skills).
recruiterRouter.get("/roles", (c) => {
  return c.json({ roles: listRoles() });
});

// Phase 32C — per-candidate signed-proof gap for a pool against a
// target role. Owner-only; one analyzeSkillGap per member (pools
// are small). Powers the recruiter "who's closest to this role".
recruiterRouter.get("/pools/:id/gap", requireAuth, async (c) => {
  const me = c.get("user")!;
  const db = getDb();
  const pool = db
    .select({ id: userTalentPools.id, ownerId: userTalentPools.ownerId, name: userTalentPools.name })
    .from(userTalentPools)
    .where(eq(userTalentPools.id, c.req.param("id")!))
    .get();
  if (!pool) return c.json({ error: "Pool not found" }, 404);
  if (pool.ownerId !== me.id) return c.json({ error: "Owner only" }, 403);
  const roleSlug = (c.req.query("role") ?? "").trim();
  const role = roleSlug ? getRole(roleSlug) : null;
  if (!role) return c.json({ error: "Unknown role" }, 404);
  const members = db
    .select({
      candidateUserId: talentPoolMembers.candidateUserId,
      username: users.username,
      displayName: users.displayName,
    })
    .from(talentPoolMembers)
    .innerJoin(users, eq(talentPoolMembers.candidateUserId, users.id))
    .where(eq(talentPoolMembers.poolId, pool.id))
    .all();
  const rows = members
    .map((m) => {
      const g = analyzeSkillGap(m.candidateUserId, role.requiredSkillSlugs);
      return {
        username: m.username,
        displayName: m.displayName,
        coverage: g.coverage,
        proven: g.proven.length,
        weak: g.weak.length,
        missing: g.missing.length,
      };
    })
    .sort((a, b) => b.coverage - a.coverage);
  return c.json({
    pool: { id: pool.id, name: pool.name },
    role: { slug: role.slug, title: role.title },
    candidates: rows,
  });
});

recruiterRouter.post(
  "/pools/:id/members",
  requireAuth,
  zValidator("json", z.object({ candidateUsername: z.string().min(1) })),
  async (c) => {
    const me = c.get("user")!;
    const db = getDb();
    const pool = db
      .select({ id: userTalentPools.id, ownerId: userTalentPools.ownerId })
      .from(userTalentPools)
      .where(eq(userTalentPools.id, c.req.param("id")!))
      .get();
    if (!pool) return c.json({ error: "Pool not found" }, 404);
    if (pool.ownerId !== me.id) return c.json({ error: "Owner only" }, 403);
    const cand = db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.username, c.req.valid("json").candidateUsername))
      .get();
    if (!cand) return c.json({ error: "Candidate not found" }, 404);
    try {
      db.insert(talentPoolMembers)
        .values({
          id: randomUUID(),
          poolId: pool.id,
          candidateUserId: cand.id,
        })
        .run();
    } catch {
      return c.json({ error: "Already in this pool" }, 409);
    }
    return c.json({ ok: true }, 201);
  },
);

recruiterRouter.delete(
  "/pools/:id/members/:candidateUserId",
  requireAuth,
  async (c) => {
    const me = c.get("user")!;
    const db = getDb();
    const pool = db
      .select({ id: userTalentPools.id, ownerId: userTalentPools.ownerId })
      .from(userTalentPools)
      .where(eq(userTalentPools.id, c.req.param("id")!))
      .get();
    if (!pool) return c.json({ error: "Pool not found" }, 404);
    if (pool.ownerId !== me.id) return c.json({ error: "Owner only" }, 403);
    db.delete(talentPoolMembers)
      .where(
        and(
          eq(talentPoolMembers.poolId, pool.id),
          eq(
            talentPoolMembers.candidateUserId,
            c.req.param("candidateUserId")!,
          ),
        ),
      )
      .run();
    return c.json({ ok: true });
  },
);
