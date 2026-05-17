// Phase 28C/D — research bounty marketplace.
//
// A poster (researcher / institution) publishes a unit of real
// work (reproduce / extend / analyze). Learners claim a slot,
// submit a writeup + artifact links, and the poster accepts or
// rejects. Acceptance grants XP + an optional badge + a signed
// "Bounty Completed" credential that surfaces in the Phase 28A
// wallet. Mirrors the Phase 27 hackathon patterns + the
// /hackathons/discover discoverability pattern.

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, asc, desc, eq, ne, sql } from "drizzle-orm";
import { randomUUID } from "crypto";
import {
  bountyClaims,
  bountySubmissions,
  getDb,
  researchBounties,
  userAchievements,
  users,
} from "@axiomic/db";
import { requireAuth, getSessionUser } from "../middleware/auth";
import { checkRateLimit } from "../lib/rateLimit";
import { env } from "../lib/envConfig";
import { notify } from "../lib/notifications";
import { grantXp } from "../lib/xp";
import { gradeEssay } from "../lib/essayGrader";
import { listCollaborators, rankCollaborators } from "../lib/collabMatch";
import type { Env } from "../env";

export const bountiesRouter = new Hono<Env>();

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const KINDS = ["reproduce", "extend", "analyze", "other"] as const;

const createSchema = z.object({
  slug: z.string().min(3).max(80).regex(SLUG_RE),
  title: z.string().min(1).max(200),
  descriptionMd: z.string().max(20000).optional().default(""),
  kind: z.enum(KINDS).optional().default("other"),
  linkedPaperId: z.string().min(1).max(64).nullable().optional(),
  linkedArticleId: z.string().min(1).max(64).nullable().optional(),
  rewardXp: z.number().int().min(0).max(10000).optional().default(0),
  rewardBadgeSlug: z.string().min(1).max(120).nullable().optional(),
  maxClaimants: z.number().int().min(1).max(100).optional().default(1),
  deadlineAt: z.string().datetime().nullable().optional(),
});

const updateSchema = createSchema.partial().extend({
  slug: z.never().optional(),
});

const submitSchema = z.object({
  writeup: z.string().max(20000).optional().default(""),
  artifacts: z
    .array(
      z.object({
        kind: z.enum(["github", "colab", "demo", "paper", "other"]),
        url: z.string().url().max(500),
        label: z.string().min(1).max(120),
      }),
    )
    .max(10)
    .optional()
    .default([]),
});

// GET /bounties/discover — public listing.
bountiesRouter.get("/discover", async (c) => {
  const db = getDb();
  const rows = db
    .select({
      id: researchBounties.id,
      slug: researchBounties.slug,
      title: researchBounties.title,
      kind: researchBounties.kind,
      status: researchBounties.status,
      rewardXp: researchBounties.rewardXp,
      maxClaimants: researchBounties.maxClaimants,
      deadlineAt: researchBounties.deadlineAt,
      createdAt: researchBounties.createdAt,
    })
    .from(researchBounties)
    .where(
      and(
        eq(researchBounties.discoverable, true),
        ne(researchBounties.status, "closed"),
      ),
    )
    .orderBy(desc(researchBounties.createdAt))
    .limit(100)
    .all();
  return c.json({ bounties: rows });
});

// GET /bounties — mine (posted + claimed).
bountiesRouter.get("/", requireAuth, async (c) => {
  const me = c.get("user")!;
  const db = getDb();
  const posted = db
    .select()
    .from(researchBounties)
    .where(eq(researchBounties.posterId, me.id))
    .orderBy(desc(researchBounties.createdAt))
    .all();
  const claimRows = db
    .select({ bountyId: bountyClaims.bountyId })
    .from(bountyClaims)
    .where(eq(bountyClaims.userId, me.id))
    .all()
    .map((r) => r.bountyId);
  const claimed = claimRows.length
    ? db
        .select()
        .from(researchBounties)
        .where(
          sql`${researchBounties.id} IN ${claimRows}`,
        )
        .all()
        .filter((b) => !posted.find((p) => p.id === b.id))
    : [];
  const sum = (b: typeof researchBounties.$inferSelect) => ({
    id: b.id,
    slug: b.slug,
    title: b.title,
    kind: b.kind,
    status: b.status,
    rewardXp: b.rewardXp,
    maxClaimants: b.maxClaimants,
    deadlineAt: b.deadlineAt,
    createdAt: b.createdAt,
  });
  return c.json({ posted: posted.map(sum), claimed: claimed.map(sum) });
});

// POST /bounties — create. Rate-limited to discourage spam.
bountiesRouter.post(
  "/",
  requireAuth,
  zValidator("json", createSchema),
  async (c) => {
    const me = c.get("user")!;
    if (
      env.NODE_ENV !== "test" &&
      !checkRateLimit(`bounty-create:${me.id}`, 5, 60 * 60_000)
    ) {
      return c.json({ error: "Rate limited. Slow down." }, 429);
    }
    const data = c.req.valid("json");
    const db = getDb();
    const existing = db
      .select({ id: researchBounties.id })
      .from(researchBounties)
      .where(eq(researchBounties.slug, data.slug))
      .get();
    if (existing) return c.json({ error: "Slug already taken" }, 409);
    const id = randomUUID();
    const now = new Date().toISOString();
    db.insert(researchBounties)
      .values({
        id,
        slug: data.slug,
        title: data.title,
        descriptionMd: data.descriptionMd ?? "",
        kind: data.kind ?? "other",
        linkedPaperId: data.linkedPaperId ?? null,
        linkedArticleId: data.linkedArticleId ?? null,
        rewardXp: data.rewardXp ?? 0,
        rewardBadgeSlug: data.rewardBadgeSlug ?? null,
        status: "open",
        maxClaimants: data.maxClaimants ?? 1,
        deadlineAt: data.deadlineAt ?? null,
        discoverable: true,
        posterId: me.id,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    return c.json({ id, slug: data.slug }, 201);
  },
);

// GET /bounties/:slug — detail. Poster sees all claims +
// submissions; a claimant sees their own; others see the public
// shell.
bountiesRouter.get("/:slug", async (c) => {
  const slug = c.req.param("slug")!;
  const db = getDb();
  const b = db
    .select()
    .from(researchBounties)
    .where(eq(researchBounties.slug, slug))
    .get();
  if (!b) return c.json({ error: "Bounty not found" }, 404);
  const session = await getSessionUser(c);
  const isPoster = session?.id === b.posterId;

  const claims = db
    .select({
      id: bountyClaims.id,
      userId: bountyClaims.userId,
      username: users.username,
      displayName: users.displayName,
      status: bountyClaims.status,
      claimedAt: bountyClaims.claimedAt,
    })
    .from(bountyClaims)
    .innerJoin(users, eq(bountyClaims.userId, users.id))
    .where(eq(bountyClaims.bountyId, b.id))
    .orderBy(asc(bountyClaims.claimedAt))
    .all();

  const myClaim = session
    ? claims.find((cl) => cl.userId === session.id) ?? null
    : null;

  // Submissions: poster sees all, a claimant sees their own.
  const claimIds = claims.map((cl) => cl.id);
  const subs =
    claimIds.length > 0
      ? db
          .select()
          .from(bountySubmissions)
          .where(sql`${bountySubmissions.claimId} IN ${claimIds}`)
          .all()
      : [];
  const visibleSubs = subs
    .filter(
      (s) => isPoster || (myClaim && s.claimId === myClaim.id),
    )
    .map((s) => ({
      id: s.id,
      claimId: s.claimId,
      writeup: s.writeup,
      artifacts: safeJson<unknown[]>(s.artifactsJson, []),
      submittedAt: s.submittedAt,
      aiReview: isPoster ? safeJson<unknown | null>(s.aiReviewJson, null) : null,
    }));

  return c.json({
    bounty: {
      id: b.id,
      slug: b.slug,
      title: b.title,
      descriptionMd: b.descriptionMd,
      kind: b.kind,
      rewardXp: b.rewardXp,
      rewardBadgeSlug: b.rewardBadgeSlug,
      status: b.status,
      maxClaimants: b.maxClaimants,
      deadlineAt: b.deadlineAt,
      createdAt: b.createdAt,
      isPoster,
    },
    claims: isPoster
      ? claims
      : claims.map((cl) => ({
          id: cl.id,
          username: cl.username,
          displayName: cl.displayName,
          status: cl.status,
          claimedAt: cl.claimedAt,
          userId: cl.userId,
        })),
    submissions: visibleSubs,
    myClaim,
  });
});

bountiesRouter.put(
  "/:slug",
  requireAuth,
  zValidator("json", updateSchema),
  async (c) => {
    const me = c.get("user")!;
    const slug = c.req.param("slug")!;
    const data = c.req.valid("json");
    const db = getDb();
    const b = db
      .select()
      .from(researchBounties)
      .where(eq(researchBounties.slug, slug))
      .get();
    if (!b) return c.json({ error: "Bounty not found" }, 404);
    if (b.posterId !== me.id) return c.json({ error: "Poster only" }, 403);
    const patch: Record<string, unknown> = {
      updatedAt: new Date().toISOString(),
    };
    if (data.title !== undefined) patch.title = data.title;
    if (data.descriptionMd !== undefined)
      patch.descriptionMd = data.descriptionMd;
    if (data.kind !== undefined) patch.kind = data.kind;
    if (data.rewardXp !== undefined) patch.rewardXp = data.rewardXp;
    if (data.rewardBadgeSlug !== undefined)
      patch.rewardBadgeSlug = data.rewardBadgeSlug;
    if (data.maxClaimants !== undefined)
      patch.maxClaimants = data.maxClaimants;
    if (data.deadlineAt !== undefined) patch.deadlineAt = data.deadlineAt;
    db.update(researchBounties)
      .set(patch)
      .where(eq(researchBounties.id, b.id))
      .run();
    return c.json({ ok: true });
  },
);

bountiesRouter.delete("/:slug", requireAuth, async (c) => {
  const me = c.get("user")!;
  const slug = c.req.param("slug")!;
  const db = getDb();
  const b = db
    .select()
    .from(researchBounties)
    .where(eq(researchBounties.slug, slug))
    .get();
  if (!b) return c.json({ error: "Bounty not found" }, 404);
  if (b.posterId !== me.id) return c.json({ error: "Poster only" }, 403);
  if (b.status !== "open") {
    return c.json({ error: "Only open bounties can be deleted" }, 400);
  }
  db.delete(researchBounties).where(eq(researchBounties.id, b.id)).run();
  return c.json({ ok: true });
});

// POST /bounties/:slug/claim — take a slot.
bountiesRouter.post("/:slug/claim", requireAuth, async (c) => {
  const me = c.get("user")!;
  const slug = c.req.param("slug")!;
  const db = getDb();
  const b = db
    .select()
    .from(researchBounties)
    .where(eq(researchBounties.slug, slug))
    .get();
  if (!b) return c.json({ error: "Bounty not found" }, 404);
  if (b.status !== "open") {
    return c.json({ error: "This bounty is not open for claims" }, 400);
  }
  if (b.posterId === me.id) {
    return c.json({ error: "You can't claim your own bounty" }, 400);
  }
  // A caller who already holds a (non-rejected) claim gets a clear
  // 409 rather than a misleading "slots full" — checked before the
  // cap so their own slot doesn't read as the cap being hit.
  const mine = db
    .select({ status: bountyClaims.status })
    .from(bountyClaims)
    .where(
      and(
        eq(bountyClaims.bountyId, b.id),
        eq(bountyClaims.userId, me.id),
      ),
    )
    .get();
  if (mine && mine.status !== "rejected") {
    return c.json({ error: "You already claimed this bounty" }, 409);
  }
  // Rejected claims free their slot, so they don't count toward
  // the cap.
  const claimCount = db
    .select({ n: sql<number>`COUNT(*)` })
    .from(bountyClaims)
    .where(
      and(
        eq(bountyClaims.bountyId, b.id),
        ne(bountyClaims.status, "rejected"),
      ),
    )
    .get();
  if (Number(claimCount?.n ?? 0) >= b.maxClaimants) {
    return c.json({ error: "All claim slots are taken" }, 400);
  }
  try {
    db.insert(bountyClaims)
      .values({
        id: randomUUID(),
        bountyId: b.id,
        userId: me.id,
        status: "claimed",
      })
      .run();
  } catch {
    return c.json({ error: "You already claimed this bounty" }, 409);
  }
  void notify({
    recipientId: b.posterId,
    actorId: me.id,
    kind: "bounty_claimed",
    subjectType: "research_bounty",
    subjectId: b.id,
    contextSlug: b.slug,
    preview: `${me.username} claimed "${b.title}"`,
  });
  return c.json({ ok: true }, 201);
});

// POST /bounties/:slug/submit — claimant submits their work.
bountiesRouter.post(
  "/:slug/submit",
  requireAuth,
  zValidator("json", submitSchema),
  async (c) => {
    const me = c.get("user")!;
    const slug = c.req.param("slug")!;
    const data = c.req.valid("json");
    const db = getDb();
    const b = db
      .select()
      .from(researchBounties)
      .where(eq(researchBounties.slug, slug))
      .get();
    if (!b) return c.json({ error: "Bounty not found" }, 404);
    const claim = db
      .select()
      .from(bountyClaims)
      .where(
        and(
          eq(bountyClaims.bountyId, b.id),
          eq(bountyClaims.userId, me.id),
        ),
      )
      .get();
    if (!claim) return c.json({ error: "Claim this bounty first" }, 400);
    if (claim.status === "accepted") {
      return c.json({ error: "Already accepted — nothing to resubmit" }, 400);
    }

    // Optional advisory AI sanity pass (never gates acceptance).
    let aiReviewJson: string | null = null;
    try {
      const grade = await gradeEssay({
        promptMd: `${b.title}\n\n${b.descriptionMd}`,
        rubricMd:
          "- (1 pt) The submission addresses what the bounty asked\n" +
          "- (1 pt) The writeup is specific and verifiable",
        maxScore: 2,
        essayResponse: data.writeup ?? "",
        signal: AbortSignal.timeout(15_000),
      });
      aiReviewJson = JSON.stringify({
        score: grade.score,
        maxScore: 2,
        feedbackMd: grade.feedbackMd,
        gradedBy: grade.gradedBy,
      });
    } catch {
      aiReviewJson = null;
    }

    const existing = db
      .select()
      .from(bountySubmissions)
      .where(eq(bountySubmissions.claimId, claim.id))
      .get();
    const now = new Date().toISOString();
    if (existing) {
      db.update(bountySubmissions)
        .set({
          writeup: data.writeup ?? "",
          artifactsJson: JSON.stringify(data.artifacts ?? []),
          aiReviewJson,
          submittedAt: now,
        })
        .where(eq(bountySubmissions.id, existing.id))
        .run();
    } else {
      db.insert(bountySubmissions)
        .values({
          id: randomUUID(),
          claimId: claim.id,
          writeup: data.writeup ?? "",
          artifactsJson: JSON.stringify(data.artifacts ?? []),
          aiReviewJson,
        })
        .run();
    }
    db.update(bountyClaims)
      .set({ status: "submitted" })
      .where(eq(bountyClaims.id, claim.id))
      .run();
    return c.json({ ok: true }, existing ? 200 : 201);
  },
);

// POST /bounties/:slug/claims/:claimId/accept — poster accepts a
// submission. Grants XP + optional badge + signed credential
// (the wallet signs it on the fly; here we just flip state +
// reward). Idempotent: a re-accept is a no-op.
bountiesRouter.post(
  "/:slug/claims/:claimId/accept",
  requireAuth,
  async (c) => {
    const me = c.get("user")!;
    const slug = c.req.param("slug")!;
    const claimId = c.req.param("claimId")!;
    const db = getDb();
    const b = db
      .select()
      .from(researchBounties)
      .where(eq(researchBounties.slug, slug))
      .get();
    if (!b) return c.json({ error: "Bounty not found" }, 404);
    if (b.posterId !== me.id) return c.json({ error: "Poster only" }, 403);
    const claim = db
      .select()
      .from(bountyClaims)
      .where(eq(bountyClaims.id, claimId))
      .get();
    if (!claim || claim.bountyId !== b.id) {
      return c.json({ error: "Claim not found" }, 404);
    }
    if (claim.status === "accepted") {
      return c.json({ ok: true, alreadyAccepted: true });
    }

    db.update(bountyClaims)
      .set({ status: "accepted" })
      .where(eq(bountyClaims.id, claim.id))
      .run();

    // Flip the bounty to completed once enough accepted claims.
    const acceptedCount = db
      .select({ n: sql<number>`COUNT(*)` })
      .from(bountyClaims)
      .where(
        and(
          eq(bountyClaims.bountyId, b.id),
          eq(bountyClaims.status, "accepted"),
        ),
      )
      .get();
    if (Number(acceptedCount?.n ?? 0) >= b.maxClaimants) {
      db.update(researchBounties)
        .set({ status: "completed", updatedAt: new Date().toISOString() })
        .where(eq(researchBounties.id, b.id))
        .run();
    }

    // Reward fan-out — idempotent (grantXp dedups on
    // source+sourceRefId; badge insert ignores dup).
    grantXp({
      userId: claim.userId,
      source: "bounty-completed",
      sourceRefId: b.id,
      amount: b.rewardXp > 0 ? b.rewardXp : undefined,
    });
    if (b.rewardBadgeSlug) {
      try {
        db.insert(userAchievements)
          .values({
            id: randomUUID(),
            userId: claim.userId,
            slug: b.rewardBadgeSlug,
          })
          .run();
      } catch {
        // already earned
      }
    }
    void notify({
      recipientId: claim.userId,
      actorId: me.id,
      kind: "bounty_accepted",
      subjectType: "research_bounty",
      subjectId: b.id,
      contextSlug: b.slug,
      preview: `Your bounty submission for "${b.title}" was accepted — credential minted.`,
    });
    return c.json({ ok: true });
  },
);

bountiesRouter.post(
  "/:slug/claims/:claimId/reject",
  requireAuth,
  async (c) => {
    const me = c.get("user")!;
    const slug = c.req.param("slug")!;
    const claimId = c.req.param("claimId")!;
    const db = getDb();
    const b = db
      .select()
      .from(researchBounties)
      .where(eq(researchBounties.slug, slug))
      .get();
    if (!b) return c.json({ error: "Bounty not found" }, 404);
    if (b.posterId !== me.id) return c.json({ error: "Poster only" }, 403);
    const claim = db
      .select()
      .from(bountyClaims)
      .where(eq(bountyClaims.id, claimId))
      .get();
    if (!claim || claim.bountyId !== b.id) {
      return c.json({ error: "Claim not found" }, 404);
    }
    db.update(bountyClaims)
      .set({ status: "rejected" })
      .where(eq(bountyClaims.id, claim.id))
      .run();
    return c.json({ ok: true });
  },
);

// Phase 30D — collaboration matcher. Fellow non-rejected
// claimants of this bounty, with a shared-weakness snippet. Only
// a claimant (or the poster) may see the roster.
bountiesRouter.get("/:slug/collaborators", requireAuth, async (c) => {
  const me = c.get("user")!;
  const db = getDb();
  const b = db
    .select({ id: researchBounties.id, posterId: researchBounties.posterId })
    .from(researchBounties)
    .where(eq(researchBounties.slug, c.req.param("slug")!))
    .get();
  if (!b) return c.json({ error: "Bounty not found" }, 404);
  if (b.posterId !== me.id) {
    const claim = db
      .select({ status: bountyClaims.status })
      .from(bountyClaims)
      .where(
        and(
          eq(bountyClaims.bountyId, b.id),
          eq(bountyClaims.userId, me.id),
        ),
      )
      .get();
    if (!claim || claim.status === "rejected") {
      return c.json({ error: "Claim this bounty first" }, 403);
    }
  }
  const collaborators = await listCollaborators(b.id, me.id);
  return c.json({ bountyId: b.id, collaborators });
});

// Phase 30D — top-N ranked collaborators for the caller.
bountiesRouter.get(
  "/:slug/match-collaborator",
  requireAuth,
  async (c) => {
    const me = c.get("user")!;
    const db = getDb();
    const b = db
      .select({
        id: researchBounties.id,
        posterId: researchBounties.posterId,
      })
      .from(researchBounties)
      .where(eq(researchBounties.slug, c.req.param("slug")!))
      .get();
    if (!b) return c.json({ error: "Bounty not found" }, 404);
    if (b.posterId !== me.id) {
      const claim = db
        .select({ status: bountyClaims.status })
        .from(bountyClaims)
        .where(
          and(
            eq(bountyClaims.bountyId, b.id),
            eq(bountyClaims.userId, me.id),
          ),
        )
        .get();
      if (!claim || claim.status === "rejected") {
        return c.json({ error: "Claim this bounty first" }, 403);
      }
    }
    const matches = await rankCollaborators(b.id, me.id, 3);
    return c.json({ bountyId: b.id, matches });
  },
);

function safeJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}
