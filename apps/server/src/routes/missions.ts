// Phase 39 — "Goodness" missions.
//
// A Mission is a big real-world problem (hunger / poverty /
// climate) decomposed into sub-problems. Anyone signed in can read
// + open-join; members post contributions (links + writeups, no
// uploads) + sub-problems. A contribution is peer/expert reviewed
// with the EXACT reproduction rigor (reviewerTrust weighted verdict
// sum → signCredential → transparency leaf → symmetric refute-
// revoke). Backing orgs lend a verifier/admin attestation. None of
// signing.ts / transparency.ts / the trust math is touched — this
// composes them, mirroring reproductions.ts:159-300.

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, desc, eq, sql } from "drizzle-orm";
import { randomUUID } from "crypto";
import {
  getDb,
  missionContributionReviews,
  missionContributions,
  missionMembers,
  missionOrgBackers,
  missionSubproblems,
  missions,
  orgs,
  users,
} from "@axiomic/db";
import { requireAuth } from "../middleware/auth";
import { checkRateLimit } from "../lib/rateLimit";
import { env } from "../lib/envConfig";
import { notify } from "../lib/notifications";
import {
  CONFIRM_WEIGHT_THRESHOLD,
  confirmedWeight,
  getReviewerReputations,
  reviewerWeight,
} from "../lib/reviewerTrust";
import {
  REFUTE_WEIGHT_THRESHOLD,
  getRevocation,
  revokeCredential,
} from "../lib/revocation";
import { appendCredentialEvent } from "../lib/transparency";
import { signCredential } from "../lib/signing";
import { grantXp } from "../lib/xp";
import { attestContribution, gateOrg } from "../lib/orgs";
import { buildMissionImpact } from "../lib/missionImpact";
import {
  gateMission,
  getMission,
  isMember,
  isOrganizer,
} from "../lib/missions";
import type { Env } from "../env";

export const missionsRouter = new Hono<Env>();

// Slug from a free-text title + a short random suffix so titles can
// collide. Mirrors forum.ts:81 slugify.
function slugify(title: string): string {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
  const suffix = Math.random().toString(36).slice(2, 8);
  return base ? `${base}-${suffix}` : suffix;
}

function parseArtifacts(raw: string): Array<{
  kind: string;
  url: string;
  label: string;
}> {
  try {
    const v = JSON.parse(raw);
    if (!Array.isArray(v)) return [];
    return v
      .filter(
        (a) =>
          a &&
          typeof a.kind === "string" &&
          typeof a.url === "string",
      )
      .map((a) => ({
        kind: String(a.kind),
        url: String(a.url),
        label: typeof a.label === "string" ? a.label : "",
      }));
  } catch {
    return [];
  }
}

function parseTags(raw: string): string[] {
  try {
    const v = JSON.parse(raw);
    if (!Array.isArray(v)) return [];
    return v.filter((x) => typeof x === "string");
  } catch {
    return [];
  }
}

const createSchema = z.object({
  title: z.string().min(4).max(160),
  problemMd: z.string().max(20000).optional().default(""),
  summaryMd: z.string().max(4000).optional().default(""),
  theme: z.string().min(1).max(60).optional().default("other"),
  topicTags: z.array(z.string().max(60)).max(12).optional().default([]),
});

// POST /missions — create a mission. Creator auto-joins as
// 'organizer'. Any auth user (rate-limited).
missionsRouter.post(
  "/",
  requireAuth,
  zValidator("json", createSchema),
  (c) => {
    const me = c.get("user")!;
    if (
      env.NODE_ENV !== "test" &&
      !checkRateLimit(`mission-create:${me.id}`, 5, 3600_000)
    ) {
      return c.json({ error: "Rate limited. Slow down." }, 429);
    }
    const { title, problemMd, summaryMd, theme, topicTags } =
      c.req.valid("json");
    const db = getDb();
    const id = randomUUID();
    let slug = slugify(title);
    // Extremely unlikely collision on the random suffix; retry once.
    const exists = db
      .select({ id: missions.id })
      .from(missions)
      .where(eq(missions.slug, slug))
      .get();
    if (exists) slug = slugify(title);
    db.insert(missions)
      .values({
        id,
        slug,
        title,
        problemMd,
        summaryMd,
        theme,
        topicTagsJson: JSON.stringify(topicTags),
        status: "open",
        creatorId: me.id,
      })
      .run();
    db.insert(missionMembers)
      .values({
        id: randomUUID(),
        missionId: id,
        userId: me.id,
        role: "organizer",
      })
      .run();
    return c.json({ ok: true, id, slug }, 201);
  },
);

function missionListShape(rows: Array<typeof missions.$inferSelect>) {
  return rows.map((m) => ({
    slug: m.slug,
    title: m.title,
    summaryMd: m.summaryMd,
    theme: m.theme,
    topicTags: parseTags(m.topicTagsJson),
    status: m.status,
    createdAt: m.createdAt,
  }));
}

// GET /missions — open list, newest first.
missionsRouter.get("/", (c) => {
  const db = getDb();
  const rows = db
    .select()
    .from(missions)
    .orderBy(desc(missions.createdAt))
    .limit(100)
    .all();
  return c.json({ missions: missionListShape(rows) });
});

// GET /missions/discover — open + active, with member counts. A
// lightweight discovery surface (mirrors the bounty discover idea).
missionsRouter.get("/discover", (c) => {
  const db = getDb();
  const rows = db
    .select()
    .from(missions)
    .where(
      sql`${missions.status} in ('open','active')`,
    )
    .orderBy(desc(missions.createdAt))
    .limit(50)
    .all();
  const counts = new Map<string, number>();
  if (rows.length > 0) {
    const cnt = db
      .select({
        missionId: missionMembers.missionId,
        n: sql<number>`count(*)`,
      })
      .from(missionMembers)
      .groupBy(missionMembers.missionId)
      .all();
    for (const r of cnt) counts.set(r.missionId, Number(r.n));
  }
  return c.json({
    missions: rows.map((m) => ({
      slug: m.slug,
      title: m.title,
      summaryMd: m.summaryMd,
      theme: m.theme,
      topicTags: parseTags(m.topicTagsJson),
      status: m.status,
      memberCount: counts.get(m.id) ?? 0,
      createdAt: m.createdAt,
    })),
  });
});

// GET /missions/:slug — public detail: problem, sub-problems,
// members, backers, contributions w/ verification state, impact.
missionsRouter.get("/:slug", async (c) => {
  const g = await gateMission(c);
  if (!g.ok) return g.res;
  const { mission } = g;
  const db = getDb();

  const subproblems = db
    .select({
      id: missionSubproblems.id,
      slug: missionSubproblems.slug,
      title: missionSubproblems.title,
      descriptionMd: missionSubproblems.descriptionMd,
      status: missionSubproblems.status,
      order: missionSubproblems.order,
      createdAt: missionSubproblems.createdAt,
    })
    .from(missionSubproblems)
    .where(eq(missionSubproblems.missionId, mission.id))
    .orderBy(missionSubproblems.order)
    .all();

  const members = db
    .select({
      username: users.username,
      displayName: users.displayName,
      role: missionMembers.role,
      joinedAt: missionMembers.joinedAt,
    })
    .from(missionMembers)
    .innerJoin(users, eq(missionMembers.userId, users.id))
    .where(eq(missionMembers.missionId, mission.id))
    .all();

  const backers = db
    .select({
      slug: orgs.slug,
      name: orgs.name,
      createdAt: missionOrgBackers.createdAt,
    })
    .from(missionOrgBackers)
    .innerJoin(orgs, eq(missionOrgBackers.orgId, orgs.id))
    .where(eq(missionOrgBackers.missionId, mission.id))
    .all();

  const rawContribs = db
    .select({
      id: missionContributions.id,
      subproblemId: missionContributions.subproblemId,
      userId: missionContributions.userId,
      username: users.username,
      kind: missionContributions.kind,
      bodyMd: missionContributions.bodyMd,
      artifactsJson: missionContributions.artifactsJson,
      credentialMintedAt: missionContributions.credentialMintedAt,
      credentialMintWeight: missionContributions.credentialMintWeight,
      createdAt: missionContributions.createdAt,
    })
    .from(missionContributions)
    .innerJoin(users, eq(missionContributions.userId, users.id))
    .where(eq(missionContributions.missionId, mission.id))
    .orderBy(desc(missionContributions.createdAt))
    .all();

  // Per-contribution review rollup (confirmed weight + verdict
  // breakdown) so the UI can render a verification bar.
  const allReviews =
    rawContribs.length > 0
      ? db
          .select({
            contributionId: missionContributionReviews.contributionId,
            reviewerId: missionContributionReviews.reviewerId,
            verdict: missionContributionReviews.verdict,
          })
          .from(missionContributionReviews)
          .where(
            sql`${missionContributionReviews.contributionId} in (${sql.join(
              rawContribs.map((r) => sql`${r.id}`),
              sql`, `,
            )})`,
          )
          .all()
      : [];
  const byContribConfirmers = new Map<string, string[]>();
  const byContribRefuters = new Map<string, string[]>();
  for (const rv of allReviews) {
    if (rv.verdict === "confirmed") {
      const a = byContribConfirmers.get(rv.contributionId) ?? [];
      a.push(rv.reviewerId);
      byContribConfirmers.set(rv.contributionId, a);
    } else if (rv.verdict === "refuted") {
      const a = byContribRefuters.get(rv.contributionId) ?? [];
      a.push(rv.reviewerId);
      byContribRefuters.set(rv.contributionId, a);
    }
  }

  const contributions = rawContribs.map((r) => {
    const confWeight = confirmedWeight(
      byContribConfirmers.get(r.id) ?? [],
    );
    const refWeight = confirmedWeight(
      byContribRefuters.get(r.id) ?? [],
    );
    const rev = getRevocation("mission_contribution", r.id);
    return {
      id: r.id,
      subproblemId: r.subproblemId,
      username: r.username,
      kind: r.kind,
      bodyMd: r.bodyMd,
      artifacts: parseArtifacts(r.artifactsJson),
      credentialMintedAt: r.credentialMintedAt,
      credentialMintWeight: r.credentialMintWeight,
      confirmedWeight: confWeight,
      refutedWeight: refWeight,
      confirmWeightThreshold: CONFIRM_WEIGHT_THRESHOLD,
      revoked: rev !== null,
      revocationReason: rev?.reason ?? null,
      createdAt: r.createdAt,
    };
  });

  return c.json({
    mission: {
      // The working-group room (mission_working_group) is keyed by
      // this id server-side; the detail page passes it to
      // <ReviewRoom roomId={...}/>. Missions are Open so the id is
      // not sensitive (membership, not secrecy, gates the room).
      id: mission.id,
      slug: mission.slug,
      title: mission.title,
      problemMd: mission.problemMd,
      summaryMd: mission.summaryMd,
      theme: mission.theme,
      topicTags: parseTags(mission.topicTagsJson),
      status: mission.status,
      createdAt: mission.createdAt,
    },
    membership: g.membership,
    subproblems,
    members,
    backers,
    contributions,
    impact: buildMissionImpact(mission.id),
  });
});

// POST /missions/:slug/join — open self-join → 'member'. Idempotent.
missionsRouter.post("/:slug/join", requireAuth, async (c) => {
  const me = c.get("user")!;
  const mission = getMission(c.req.param("slug")!);
  if (!mission) return c.json({ error: "Mission not found" }, 404);
  if (
    env.NODE_ENV !== "test" &&
    !checkRateLimit(`mission-join:${me.id}`, 30, 60_000)
  ) {
    return c.json({ error: "Rate limited. Slow down." }, 429);
  }
  const db = getDb();
  const existing = db
    .select({ id: missionMembers.id })
    .from(missionMembers)
    .where(
      and(
        eq(missionMembers.missionId, mission.id),
        eq(missionMembers.userId, me.id),
      ),
    )
    .get();
  if (existing) return c.json({ ok: true, alreadyMember: true });
  db.insert(missionMembers)
    .values({
      id: randomUUID(),
      missionId: mission.id,
      userId: me.id,
      role: "member",
    })
    .run();
  return c.json({ ok: true }, 201);
});

const subproblemSchema = z.object({
  title: z.string().min(4).max(160),
  descriptionMd: z.string().max(8000).optional().default(""),
});

// GET /missions/:slug/subproblems — open.
missionsRouter.get("/:slug/subproblems", async (c) => {
  const g = await gateMission(c);
  if (!g.ok) return g.res;
  const db = getDb();
  const rows = db
    .select({
      id: missionSubproblems.id,
      slug: missionSubproblems.slug,
      title: missionSubproblems.title,
      descriptionMd: missionSubproblems.descriptionMd,
      status: missionSubproblems.status,
      order: missionSubproblems.order,
      createdAt: missionSubproblems.createdAt,
    })
    .from(missionSubproblems)
    .where(eq(missionSubproblems.missionId, g.mission.id))
    .orderBy(missionSubproblems.order)
    .all();
  return c.json({ subproblems: rows });
});

// POST /missions/:slug/subproblems — members only.
missionsRouter.post(
  "/:slug/subproblems",
  requireAuth,
  zValidator("json", subproblemSchema),
  async (c) => {
    const me = c.get("user")!;
    const g = await gateMission(c);
    if (!g.ok) return g.res;
    if (!isMember(g.mission, me.id)) {
      return c.json({ error: "Join the mission to add a sub-problem." }, 403);
    }
    if (
      env.NODE_ENV !== "test" &&
      !checkRateLimit(`mission-subproblem:${me.id}`, 20, 60_000)
    ) {
      return c.json({ error: "Rate limited. Slow down." }, 429);
    }
    const { title, descriptionMd } = c.req.valid("json");
    const db = getDb();
    const id = randomUUID();
    // Order = current count (append to the end).
    const cnt = db
      .select({ n: sql<number>`count(*)` })
      .from(missionSubproblems)
      .where(eq(missionSubproblems.missionId, g.mission.id))
      .get();
    const order = Number(cnt?.n ?? 0);
    let slug = slugify(title);
    const clash = db
      .select({ id: missionSubproblems.id })
      .from(missionSubproblems)
      .where(
        and(
          eq(missionSubproblems.missionId, g.mission.id),
          eq(missionSubproblems.slug, slug),
        ),
      )
      .get();
    if (clash) slug = slugify(title);
    db.insert(missionSubproblems)
      .values({
        id,
        missionId: g.mission.id,
        slug,
        title,
        descriptionMd,
        status: "open",
        order,
        createdById: me.id,
      })
      .run();
    return c.json({ ok: true, id, slug }, 201);
  },
);

const contributionSchema = z.object({
  subproblemId: z.string().max(64).optional(),
  kind: z
    .enum(["analysis", "data", "solution", "synthesis"])
    .optional()
    .default("analysis"),
  bodyMd: z.string().min(1).max(20000),
  artifacts: z
    .array(
      z.object({
        kind: z.string().min(1).max(40),
        url: z.string().min(1).max(2000),
        label: z.string().max(200).optional().default(""),
      }),
    )
    .max(20)
    .optional()
    .default([]),
});

// GET /missions/:slug/contributions — open; verification state.
missionsRouter.get("/:slug/contributions", async (c) => {
  const g = await gateMission(c);
  if (!g.ok) return g.res;
  const db = getDb();
  const rows = db
    .select({
      id: missionContributions.id,
      subproblemId: missionContributions.subproblemId,
      username: users.username,
      kind: missionContributions.kind,
      bodyMd: missionContributions.bodyMd,
      artifactsJson: missionContributions.artifactsJson,
      credentialMintedAt: missionContributions.credentialMintedAt,
      credentialMintWeight: missionContributions.credentialMintWeight,
      createdAt: missionContributions.createdAt,
    })
    .from(missionContributions)
    .innerJoin(users, eq(missionContributions.userId, users.id))
    .where(eq(missionContributions.missionId, g.mission.id))
    .orderBy(desc(missionContributions.createdAt))
    .all();
  return c.json({
    contributions: rows.map((r) => {
      const rev = getRevocation("mission_contribution", r.id);
      return {
        id: r.id,
        subproblemId: r.subproblemId,
        username: r.username,
        kind: r.kind,
        bodyMd: r.bodyMd,
        artifacts: parseArtifacts(r.artifactsJson),
        credentialMintedAt: r.credentialMintedAt,
        credentialMintWeight: r.credentialMintWeight,
        revoked: rev !== null,
        revocationReason: rev?.reason ?? null,
        createdAt: r.createdAt,
      };
    }),
  });
});

// POST /missions/:slug/contributions — members only.
missionsRouter.post(
  "/:slug/contributions",
  requireAuth,
  zValidator("json", contributionSchema),
  async (c) => {
    const me = c.get("user")!;
    const g = await gateMission(c);
    if (!g.ok) return g.res;
    if (!isMember(g.mission, me.id)) {
      return c.json(
        { error: "Join the mission to post a contribution." },
        403,
      );
    }
    if (
      env.NODE_ENV !== "test" &&
      !checkRateLimit(`mission-contribute:${me.id}`, 20, 60_000)
    ) {
      return c.json({ error: "Rate limited. Slow down." }, 429);
    }
    const { subproblemId, kind, bodyMd, artifacts } = c.req.valid("json");
    const db = getDb();
    // If a sub-problem is referenced it must belong to this mission.
    if (subproblemId) {
      const sp = db
        .select({ id: missionSubproblems.id })
        .from(missionSubproblems)
        .where(
          and(
            eq(missionSubproblems.id, subproblemId),
            eq(missionSubproblems.missionId, g.mission.id),
          ),
        )
        .get();
      if (!sp) {
        return c.json(
          { error: "That sub-problem isn't part of this mission." },
          400,
        );
      }
    }
    const id = randomUUID();
    db.insert(missionContributions)
      .values({
        id,
        missionId: g.mission.id,
        subproblemId: subproblemId ?? null,
        userId: me.id,
        kind,
        bodyMd,
        artifactsJson: JSON.stringify(artifacts),
      })
      .run();
    return c.json({ ok: true, id }, 201);
  },
);

const reviewSchema = z.object({
  verdict: z.enum(["confirmed", "refuted", "inconclusive"]),
  notesMd: z.string().max(4000).optional().default(""),
});

// POST /missions/:slug/contributions/:id/review — verified-
// credential rigor. MIRRORS reproductions.ts:159-300 exactly:
// insert review (409 on dup); if not minted, sum confirming
// reviewer trust; ≥ threshold ⇒ set credentialMintedAt +
// credentialMintWeight, signCredential, append transparency leaf,
// notify, grant XP; then dispute path — if minted & refute weight
// ≥ threshold & not already revoked ⇒ revokeCredential.
missionsRouter.post(
  "/:slug/contributions/:id/review",
  requireAuth,
  zValidator("json", reviewSchema),
  async (c) => {
    const me = c.get("user")!;
    const contributionId = c.req.param("id")!;
    const { verdict, notesMd } = c.req.valid("json");
    const g = await gateMission(c);
    if (!g.ok) return g.res;
    if (
      env.NODE_ENV !== "test" &&
      !checkRateLimit(`mission-review:${me.id}`, 20, 60_000)
    ) {
      return c.json({ error: "Rate limited. Slow down." }, 429);
    }
    const db = getDb();
    const contribution = db
      .select()
      .from(missionContributions)
      .where(
        and(
          eq(missionContributions.id, contributionId),
          eq(missionContributions.missionId, g.mission.id),
        ),
      )
      .get();
    if (!contribution) {
      return c.json({ error: "Contribution not found" }, 404);
    }
    if (contribution.userId === me.id) {
      return c.json(
        { error: "You can't review your own contribution." },
        403,
      );
    }

    try {
      db.insert(missionContributionReviews)
        .values({
          id: randomUUID(),
          contributionId,
          reviewerId: me.id,
          verdict,
          notesMd: notesMd ?? "",
        })
        .run();
    } catch {
      return c.json(
        { error: "You already reviewed this contribution." },
        409,
      );
    }

    // Mint the credential the moment the summed trust weight of
    // confirming reviewers crosses the threshold (and only once).
    if (!contribution.credentialMintedAt) {
      const confirmerIds = db
        .select({ reviewerId: missionContributionReviews.reviewerId })
        .from(missionContributionReviews)
        .where(
          and(
            eq(missionContributionReviews.contributionId, contributionId),
            eq(missionContributionReviews.verdict, "confirmed"),
          ),
        )
        .all()
        .map((r) => r.reviewerId);
      const weight = confirmedWeight(confirmerIds);
      if (weight >= CONFIRM_WEIGHT_THRESHOLD) {
        const now = new Date().toISOString();
        db.update(missionContributions)
          .set({ credentialMintedAt: now, credentialMintWeight: weight })
          .where(eq(missionContributions.id, contributionId))
          .run();
        const author = db
          .select({ username: users.username })
          .from(users)
          .where(eq(users.id, contribution.userId))
          .get();
        // Sign the contribution credential. signing.ts is byte-
        // unchanged; this just namespaces a new manifest kind.
        signCredential("mission_contribution", {
          missionSlug: g.mission.slug,
          subproblemId: contribution.subproblemId,
          contributionId,
          userId: contribution.userId,
          username: author?.username ?? "",
          kind: contribution.kind,
          issuedAt: now,
        });
        appendCredentialEvent(
          "issued",
          "mission_contribution",
          contributionId,
          { mintedAt: now, weight },
        );
        void notify({
          recipientId: contribution.userId,
          actorId: null,
          kind: "mission_contribution_verified",
          subjectType: "reproduction",
          subjectId: contributionId,
          contextSlug: g.mission.slug,
          preview:
            "Your mission contribution was peer-verified — a signed credential is now in your wallet.",
        });
        try {
          grantXp({
            userId: contribution.userId,
            source: "mission-contribution",
            sourceRefId: contributionId,
          });
        } catch {
          // XP is non-critical; never break the mint.
        }
      }
    }

    // Dispute reaction (symmetric refute → revoke). `contribution`
    // is a pre-mint snapshot, so re-read the current minted state.
    const current = db
      .select({ mintedAt: missionContributions.credentialMintedAt })
      .from(missionContributions)
      .where(eq(missionContributions.id, contributionId))
      .get();
    if (current?.mintedAt) {
      const refuterIds = db
        .select({ reviewerId: missionContributionReviews.reviewerId })
        .from(missionContributionReviews)
        .where(
          and(
            eq(missionContributionReviews.contributionId, contributionId),
            eq(missionContributionReviews.verdict, "refuted"),
          ),
        )
        .all()
        .map((r) => r.reviewerId);
      const refuteWeight = confirmedWeight(refuterIds);
      if (
        refuteWeight >= REFUTE_WEIGHT_THRESHOLD &&
        !getRevocation("mission_contribution", contributionId)
      ) {
        revokeCredential(
          "mission_contribution",
          contributionId,
          "Peer review refuted this contribution after the credential was minted.",
          null,
        );
        void notify({
          recipientId: contribution.userId,
          actorId: null,
          kind: "credential_revoked",
          subjectType: "reproduction",
          subjectId: contributionId,
          contextSlug: g.mission.slug,
          preview:
            "A mission contribution credential was revoked after peer review refuted it.",
        });
      }
    }

    return c.json({ ok: true });
  },
);

// GET /missions/:slug/contributions/:id — detail + reviews (so the
// UI can show "this reviewer counts 1.8×"), mirrors GET
// /reproductions/:id.
missionsRouter.get("/:slug/contributions/:id", async (c) => {
  const g = await gateMission(c);
  if (!g.ok) return g.res;
  const contributionId = c.req.param("id")!;
  const db = getDb();
  const contribution = db
    .select()
    .from(missionContributions)
    .where(
      and(
        eq(missionContributions.id, contributionId),
        eq(missionContributions.missionId, g.mission.id),
      ),
    )
    .get();
  if (!contribution) {
    return c.json({ error: "Contribution not found" }, 404);
  }
  const rawReviews = db
    .select({
      id: missionContributionReviews.id,
      reviewerId: missionContributionReviews.reviewerId,
      verdict: missionContributionReviews.verdict,
      notesMd: missionContributionReviews.notesMd,
      createdAt: missionContributionReviews.createdAt,
      reviewerName: users.username,
    })
    .from(missionContributionReviews)
    .innerJoin(users, eq(missionContributionReviews.reviewerId, users.id))
    .where(eq(missionContributionReviews.contributionId, contributionId))
    .orderBy(desc(missionContributionReviews.createdAt))
    .all();
  const reps = getReviewerReputations(rawReviews.map((r) => r.reviewerId));
  const reviews = rawReviews.map((r) => ({
    id: r.id,
    verdict: r.verdict,
    notesMd: r.notesMd,
    createdAt: r.createdAt,
    reviewerName: r.reviewerName,
    weight: reviewerWeight(reps.get(r.reviewerId) ?? 0),
  }));
  const currentConfirmedWeight = confirmedWeight(
    rawReviews
      .filter((r) => r.verdict === "confirmed")
      .map((r) => r.reviewerId),
  );
  const rev = getRevocation("mission_contribution", contributionId);
  return c.json({
    contribution: {
      id: contribution.id,
      subproblemId: contribution.subproblemId,
      kind: contribution.kind,
      bodyMd: contribution.bodyMd,
      artifacts: parseArtifacts(contribution.artifactsJson),
      credentialMintedAt: contribution.credentialMintedAt,
      credentialMintWeight: contribution.credentialMintWeight,
      revoked: rev !== null,
      revocationReason: rev?.reason ?? null,
      createdAt: contribution.createdAt,
    },
    reviews,
    confirmWeightThreshold: CONFIRM_WEIGHT_THRESHOLD,
    currentConfirmedWeight,
  });
});

const backerSchema = z.object({
  orgSlug: z.string().min(1).max(80),
});

// POST /missions/:slug/backers — an org admin adds their org as a
// backer of the mission (gateOrg admin gate).
missionsRouter.post(
  "/:slug/backers",
  requireAuth,
  zValidator("json", backerSchema),
  async (c) => {
    const me = c.get("user")!;
    const mission = getMission(c.req.param("slug")!);
    if (!mission) return c.json({ error: "Mission not found" }, 404);
    if (
      env.NODE_ENV !== "test" &&
      !checkRateLimit(`mission-backer:${me.id}`, 20, 60_000)
    ) {
      return c.json({ error: "Rate limited. Slow down." }, 429);
    }
    const { orgSlug } = c.req.valid("json");
    const og = gateOrg(orgSlug, me.id, "admin");
    if (!og.ok) return c.json({ error: og.error }, og.status);
    const db = getDb();
    try {
      db.insert(missionOrgBackers)
        .values({
          id: randomUUID(),
          missionId: mission.id,
          orgId: og.org.id,
          addedByUserId: me.id,
        })
        .run();
    } catch {
      return c.json({ error: "That org already backs this mission." }, 409);
    }
    return c.json({ ok: true }, 201);
  },
);

const attestSchema = z.object({
  orgSlug: z.string().min(1).max(80),
  statement: z.string().max(1000).optional().default(""),
});

// POST /missions/:slug/contributions/:id/attest — a backing org's
// verifier/admin attests an (external) contributor's verified
// contribution. Reuses orgs.attestContribution (signs + logs an
// org_attestation WITHOUT the membership precondition).
missionsRouter.post(
  "/:slug/contributions/:id/attest",
  requireAuth,
  zValidator("json", attestSchema),
  async (c) => {
    const me = c.get("user")!;
    const contributionId = c.req.param("id")!;
    const mission = getMission(c.req.param("slug")!);
    if (!mission) return c.json({ error: "Mission not found" }, 404);
    if (
      env.NODE_ENV !== "test" &&
      !checkRateLimit(`mission-attest:${me.id}`, 20, 60_000)
    ) {
      return c.json({ error: "Rate limited. Slow down." }, 429);
    }
    const { orgSlug, statement } = c.req.valid("json");
    const db = getDb();
    const contribution = db
      .select({
        id: missionContributions.id,
        userId: missionContributions.userId,
        credentialMintedAt: missionContributions.credentialMintedAt,
      })
      .from(missionContributions)
      .where(
        and(
          eq(missionContributions.id, contributionId),
          eq(missionContributions.missionId, mission.id),
        ),
      )
      .get();
    if (!contribution) {
      return c.json({ error: "Contribution not found" }, 404);
    }
    // Only a verified (minted) contribution can be expert-attested —
    // the org is endorsing a peer-verified result, not raw work.
    if (!contribution.credentialMintedAt) {
      return c.json(
        { error: "Only a peer-verified contribution can be attested." },
        400,
      );
    }
    const og = gateOrg(orgSlug, me.id, "verifier");
    if (!og.ok) return c.json({ error: og.error }, og.status);
    // The org must actually back this mission.
    const backs = db
      .select({ id: missionOrgBackers.id })
      .from(missionOrgBackers)
      .where(
        and(
          eq(missionOrgBackers.missionId, mission.id),
          eq(missionOrgBackers.orgId, og.org.id),
        ),
      )
      .get();
    if (!backs) {
      return c.json(
        { error: "Your org isn't a backer of this mission." },
        403,
      );
    }
    const r = attestContribution(
      og.org,
      me.id,
      contribution.userId,
      contributionId,
      statement,
    );
    void notify({
      recipientId: contribution.userId,
      actorId: me.id,
      kind: "org_attested",
      subjectType: "org_attestation",
      subjectId: r.id,
      contextSlug: og.org.slug,
      preview: `${og.org.name} attested your mission contribution — it's now in your wallet.`,
    });
    return c.json({ ok: true, id: r.id, credential: r.signed }, 201);
  },
);

// Convenience used by route guards in other modules / tests.
export { isMember, isOrganizer };
