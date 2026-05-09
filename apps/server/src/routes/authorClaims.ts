// Sprint 72 — Author-claim routes (user-facing).
//
//   POST /author-claims                 submit a manual claim (admin
//                                        will review)
//   GET  /author-claims/me              list the user's own claims
//                                        (pending + decided)
//
// ORCID auto-claim happens silently in the background — no user
// action needed. The manual flow exists for users without an ORCID
// or whose ORCID isn't in the upstream record.

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { randomUUID } from "crypto";
import { and, desc, eq } from "drizzle-orm";
import {
  authorClaimRequests,
  externalPaperAuthorships,
  externalPapers,
  getDb,
} from "@axiomic/db";
import { requireAuth } from "../middleware/auth";
import type { Env } from "../env";

export const authorClaimsRouter = new Hono<Env>();

const submitSchema = z.object({
  externalPaperId: z.string().min(8),
  ordinal: z.number().int().min(0).max(199),
  evidenceText: z.string().max(2000).optional().default(""),
  evidenceUrl: z.string().url().max(500).optional().nullable(),
});

authorClaimsRouter.post(
  "/",
  requireAuth,
  zValidator("json", submitSchema),
  async (c) => {
    const me = c.get("user")!;
    const { externalPaperId, ordinal, evidenceText, evidenceUrl } =
      c.req.valid("json");
    const db = getDb();

    const paper = db
      .select({ id: externalPapers.id, authorsJson: externalPapers.authorsJson })
      .from(externalPapers)
      .where(eq(externalPapers.id, externalPaperId))
      .get();
    if (!paper) return c.json({ error: "Paper not found" }, 404);

    // Bounds-check the ordinal against the paper's author count so a
    // user can't claim a position that doesn't exist.
    let authorCount = 0;
    try {
      const arr = JSON.parse(paper.authorsJson ?? "[]");
      if (Array.isArray(arr)) authorCount = arr.length;
    } catch {}
    if (ordinal >= authorCount) {
      return c.json({ error: "Ordinal exceeds paper author count" }, 400);
    }

    // Reject if the slot is already claimed.
    const occupied = db
      .select({ id: externalPaperAuthorships.id })
      .from(externalPaperAuthorships)
      .where(
        and(
          eq(externalPaperAuthorships.externalPaperId, externalPaperId),
          eq(externalPaperAuthorships.ordinal, ordinal),
        ),
      )
      .get();
    if (occupied) {
      return c.json({ error: "Authorship already claimed" }, 409);
    }

    // Reject duplicate pending claims by the same user.
    const existing = db
      .select({ id: authorClaimRequests.id, status: authorClaimRequests.status })
      .from(authorClaimRequests)
      .where(
        and(
          eq(authorClaimRequests.userId, me.id),
          eq(authorClaimRequests.externalPaperId, externalPaperId),
          eq(authorClaimRequests.ordinal, ordinal),
        ),
      )
      .get();
    if (existing && existing.status === "pending") {
      return c.json({ id: existing.id, status: "pending", duplicate: true });
    }

    const id = randomUUID();
    db.insert(authorClaimRequests)
      .values({
        id,
        userId: me.id,
        externalPaperId,
        ordinal,
        evidenceText,
        evidenceUrl: evidenceUrl ?? null,
      })
      .run();
    return c.json({ id, status: "pending" });
  },
);

authorClaimsRouter.get("/me", requireAuth, async (c) => {
  const me = c.get("user")!;
  const db = getDb();
  const rows = db
    .select()
    .from(authorClaimRequests)
    .where(eq(authorClaimRequests.userId, me.id))
    .orderBy(desc(authorClaimRequests.createdAt))
    .all();
  return c.json({ items: rows });
});
