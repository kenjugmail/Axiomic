// Phase 28B — reproduction peer review → signed credential.
//
// A reproduction logged with status='success' enters a review
// queue. Independent reviewers post a verdict; once two
// 'confirmed' verdicts accrue, the reproduction's credential is
// minted (reproductions.credentialMintedAt) and surfaces in the
// Phase 28A wallet as a signed "Verified reproduction".

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, desc, eq, ne, notInArray, sql } from "drizzle-orm";
import { randomUUID } from "crypto";
import {
  getDb,
  reproductionReviews,
  reproductions,
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
  unrevoke,
} from "../lib/revocation";
import { requireAdmin } from "../middleware/requireAdmin";
import { appendCredentialEvent } from "../lib/transparency";
import type { Env } from "../env";

export const reproductionsRouter = new Hono<Env>();

// Phase 29A — the credential mints when the summed *trust weight*
// of confirming reviewers crosses CONFIRM_WEIGHT_THRESHOLD
// (reputation-weighted, replacing the old flat count of 2). A
// floor keeps every confirmer counting; a ceiling stops a single
// reviewer soloing the mint.

const reviewSchema = z.object({
  verdict: z.enum(["confirmed", "refuted", "inconclusive"]),
  notesMd: z.string().max(4000).optional().default(""),
});

// GET /reproductions/review-queue — successful reproductions the
// caller didn't author + hasn't reviewed yet + aren't credentialed.
reproductionsRouter.get("/review-queue", requireAuth, async (c) => {
  const me = c.get("user")!;
  const db = getDb();
  const reviewedIds = db
    .select({ id: reproductionReviews.reproductionId })
    .from(reproductionReviews)
    .where(eq(reproductionReviews.reviewerId, me.id))
    .all()
    .map((r) => r.id);

  const q = db
    .select({
      id: reproductions.id,
      targetKind: reproductions.targetKind,
      targetId: reproductions.targetId,
      status: reproductions.status,
      notes: reproductions.notes,
      evidenceUrl: reproductions.evidenceUrl,
      createdAt: reproductions.createdAt,
      reproducerId: reproductions.reproducerId,
      reproducerName: users.username,
    })
    .from(reproductions)
    .innerJoin(users, eq(reproductions.reproducerId, users.id))
    .where(
      and(
        eq(reproductions.status, "success"),
        ne(reproductions.reproducerId, me.id),
        sql`${reproductions.credentialMintedAt} IS NULL`,
        reviewedIds.length > 0
          ? notInArray(reproductions.id, reviewedIds)
          : sql`1=1`,
      ),
    )
    .orderBy(desc(reproductions.createdAt))
    .limit(50);
  const rows = q.all();
  return c.json({ reproductions: rows });
});

// GET /reproductions/:id — detail + its reviews (for the UI).
reproductionsRouter.get("/:id", requireAuth, async (c) => {
  const id = c.req.param("id")!;
  const db = getDb();
  const repro = db
    .select()
    .from(reproductions)
    .where(eq(reproductions.id, id))
    .get();
  if (!repro) return c.json({ error: "Reproduction not found" }, 404);
  const rawReviews = db
    .select({
      id: reproductionReviews.id,
      reviewerId: reproductionReviews.reviewerId,
      verdict: reproductionReviews.verdict,
      notesMd: reproductionReviews.notesMd,
      createdAt: reproductionReviews.createdAt,
      reviewerName: users.username,
    })
    .from(reproductionReviews)
    .innerJoin(users, eq(reproductionReviews.reviewerId, users.id))
    .where(eq(reproductionReviews.reproductionId, id))
    .orderBy(desc(reproductionReviews.createdAt))
    .all();

  // Annotate each review with the reviewer's trust weight so the
  // UI can show "this reviewer counts 1.8×".
  const reps = getReviewerReputations(
    rawReviews.map((r) => r.reviewerId),
  );
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

  return c.json({
    reproduction: {
      id: repro.id,
      targetKind: repro.targetKind,
      targetId: repro.targetId,
      status: repro.status,
      notes: repro.notes,
      evidenceUrl: repro.evidenceUrl,
      credentialMintedAt: repro.credentialMintedAt,
      credentialMintWeight: repro.credentialMintWeight,
      createdAt: repro.createdAt,
    },
    reviews,
    confirmWeightThreshold: CONFIRM_WEIGHT_THRESHOLD,
    currentConfirmedWeight,
  });
});

// POST /reproductions/:id/review — record a verdict. The Nth
// 'confirmed' mints the credential.
reproductionsRouter.post(
  "/:id/review",
  requireAuth,
  zValidator("json", reviewSchema),
  async (c) => {
    const me = c.get("user")!;
    const id = c.req.param("id")!;
    const { verdict, notesMd } = c.req.valid("json");
    if (
      env.NODE_ENV !== "test" &&
      !checkRateLimit(`repro-review:${me.id}`, 20, 60_000)
    ) {
      return c.json({ error: "Rate limited. Slow down." }, 429);
    }
    const db = getDb();
    const repro = db
      .select()
      .from(reproductions)
      .where(eq(reproductions.id, id))
      .get();
    if (!repro) return c.json({ error: "Reproduction not found" }, 404);
    if (repro.reproducerId === me.id) {
      return c.json({ error: "You can't review your own reproduction." }, 403);
    }
    if (repro.status !== "success") {
      return c.json(
        { error: "Only successful reproductions are reviewable." },
        400,
      );
    }

    try {
      db.insert(reproductionReviews)
        .values({
          id: randomUUID(),
          reproductionId: id,
          reviewerId: me.id,
          verdict,
          notesMd: notesMd ?? "",
        })
        .run();
    } catch {
      return c.json({ error: "You already reviewed this reproduction." }, 409);
    }

    // Mint the credential the moment the summed trust weight of
    // confirming reviewers crosses the threshold (and only once).
    if (!repro.credentialMintedAt) {
      const confirmerIds = db
        .select({ reviewerId: reproductionReviews.reviewerId })
        .from(reproductionReviews)
        .where(
          and(
            eq(reproductionReviews.reproductionId, id),
            eq(reproductionReviews.verdict, "confirmed"),
          ),
        )
        .all()
        .map((r) => r.reviewerId);
      const weight = confirmedWeight(confirmerIds);
      if (weight >= CONFIRM_WEIGHT_THRESHOLD) {
        const now = new Date().toISOString();
        db.update(reproductions)
          .set({ credentialMintedAt: now, credentialMintWeight: weight })
          .where(eq(reproductions.id, id))
          .run();
        // Phase 33B — append the issuance to the transparency log
        // (best-effort; never block the mint).
        appendCredentialEvent("issued", "reproduction", id, {
          mintedAt: now,
          weight,
        });
        void notify({
          recipientId: repro.reproducerId,
          actorId: null,
          kind: "reproduction_verified",
          subjectType: "reproduction",
          subjectId: id,
          contextSlug: null,
          preview:
            "Your reproduction was peer-verified — a signed credential is now in your wallet.",
        });
      }
    }

    // Phase 32A — dispute reaction. If a credential exists for this
    // reproduction and the summed trust weight of *refuting*
    // reviewers crosses the (symmetric) threshold, revoke it. The
    // ed25519 signature still verifies `valid:true`; the issuer just
    // asserts the underlying claim no longer holds. `repro` is a
    // pre-mint snapshot, so re-read the current minted state.
    const current = db
      .select({ mintedAt: reproductions.credentialMintedAt })
      .from(reproductions)
      .where(eq(reproductions.id, id))
      .get();
    if (current?.mintedAt) {
      const refuterIds = db
        .select({ reviewerId: reproductionReviews.reviewerId })
        .from(reproductionReviews)
        .where(
          and(
            eq(reproductionReviews.reproductionId, id),
            eq(reproductionReviews.verdict, "refuted"),
          ),
        )
        .all()
        .map((r) => r.reviewerId);
      // Same summation as the confirm gate (summed reviewer trust).
      const refuteWeight = confirmedWeight(refuterIds);
      if (
        refuteWeight >= REFUTE_WEIGHT_THRESHOLD &&
        !getRevocation("reproduction", id)
      ) {
        revokeCredential(
          "reproduction",
          id,
          "Peer review refuted this reproduction after the credential was minted.",
          null,
        );
        void notify({
          recipientId: repro.reproducerId,
          actorId: null,
          kind: "credential_revoked",
          subjectType: "reproduction",
          subjectId: id,
          contextSlug: null,
          preview:
            "A reproduction credential was revoked after peer review refuted it.",
        });
      }
    }

    return c.json({ ok: true });
  },
);

// Phase 32A — manual issuer/admin revoke + un-revoke (e.g. a
// refute was itself overturned). Reversible; the signature is
// never touched. `reason` surfaces in the wallet + public feed.
const revokeSchema = z.object({
  reason: z.string().max(500).optional().default(""),
});
reproductionsRouter.post(
  "/:id/revoke",
  requireAdmin,
  zValidator("json", revokeSchema),
  (c) => {
    const me = c.get("user")!;
    const id = c.req.param("id")!;
    const { reason } = c.req.valid("json");
    const db = getDb();
    const repro = db
      .select({ id: reproductions.id, reproducerId: reproductions.reproducerId })
      .from(reproductions)
      .where(eq(reproductions.id, id))
      .get();
    if (!repro) return c.json({ error: "Reproduction not found" }, 404);
    revokeCredential(
      "reproduction",
      id,
      reason || "Revoked by an administrator.",
      me.id,
    );
    void notify({
      recipientId: repro.reproducerId,
      actorId: null,
      kind: "credential_revoked",
      subjectType: "reproduction",
      subjectId: id,
      contextSlug: null,
      preview: "A reproduction credential was revoked by an administrator.",
    });
    return c.json({ ok: true, revoked: true });
  },
);
reproductionsRouter.post(
  "/:id/unrevoke",
  requireAdmin,
  (c) => {
    const me = c.get("user")!;
    const id = c.req.param("id")!;
    const db = getDb();
    const repro = db
      .select({ id: reproductions.id })
      .from(reproductions)
      .where(eq(reproductions.id, id))
      .get();
    if (!repro) return c.json({ error: "Reproduction not found" }, 404);
    unrevoke("reproduction", id, me.id);
    return c.json({ ok: true, revoked: false });
  },
);
