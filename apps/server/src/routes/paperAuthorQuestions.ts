// Sprint 72 — Ask-the-author Q&A scoped to one external paper +
// one author position.
//
// Reuses the polymorphic news_comments table with
// targetKind="paper_author_question" and
// targetId="<externalPaperId>:<ordinal>" so each (paper, author
// slot) gets its own thread. When the slot is claimed in
// external_paper_authorships, the claimant gets a notification on
// every new top-level question.
//
// Routes:
//   GET  /external-papers/:id/authors/:ordinal/questions
//   POST /external-papers/:id/authors/:ordinal/questions

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { randomUUID } from "crypto";
import { and, desc, eq, isNull } from "drizzle-orm";
import {
  externalPaperAuthorships,
  externalPapers,
  getDb,
  newsComments,
  users,
} from "@axiomic/db";
import { notify } from "../lib/notifications";
import { requireAuth } from "../middleware/auth";
import type { Env } from "../env";

export const paperAuthorQuestionsRouter = new Hono<Env>();

function targetIdFor(paperId: string, ordinal: number): string {
  return `${paperId}:${ordinal}`;
}

function authorshipForSlot(
  paperId: string,
  ordinal: number,
): { userId: string } | null {
  const db = getDb();
  const row = db
    .select({ userId: externalPaperAuthorships.userId })
    .from(externalPaperAuthorships)
    .where(
      and(
        eq(externalPaperAuthorships.externalPaperId, paperId),
        eq(externalPaperAuthorships.ordinal, ordinal),
      ),
    )
    .get();
  return row ?? null;
}

interface QuestionNode {
  id: string;
  parentId: string | null;
  userId: string;
  username: string;
  displayName: string | null;
  content: string;
  editedAt: string | null;
  createdAt: string;
  children: QuestionNode[];
}

paperAuthorQuestionsRouter.get(
  "/:id/authors/:ordinal/questions",
  async (c) => {
    const id = c.req.param("id");
    const ordinalStr = c.req.param("ordinal");
    const ordinal = ordinalStr ? parseInt(ordinalStr, 10) : NaN;
    if (!id || !Number.isFinite(ordinal)) {
      return c.json({ error: "Bad target" }, 400);
    }
    const db = getDb();
    const paper = db
      .select({ id: externalPapers.id })
      .from(externalPapers)
      .where(eq(externalPapers.id, id))
      .get();
    if (!paper) return c.json({ error: "Paper not found" }, 404);

    const claimant = authorshipForSlot(id, ordinal);

    const rows = db
      .select({
        id: newsComments.id,
        parentId: newsComments.parentId,
        userId: newsComments.userId,
        username: users.username,
        displayName: users.displayName,
        content: newsComments.content,
        editedAt: newsComments.editedAt,
        createdAt: newsComments.createdAt,
      })
      .from(newsComments)
      .innerJoin(users, eq(newsComments.userId, users.id))
      .where(
        and(
          eq(newsComments.targetKind, "paper_author_question"),
          eq(newsComments.targetId, targetIdFor(id, ordinal)),
          isNull(newsComments.claimThreadId),
        ),
      )
      .orderBy(desc(newsComments.createdAt))
      .all();

    const byId = new Map<string, QuestionNode>();
    for (const r of rows) {
      byId.set(r.id, { ...r, children: [] });
    }
    const roots: QuestionNode[] = [];
    for (const node of byId.values()) {
      if (node.parentId && byId.has(node.parentId)) {
        byId.get(node.parentId)!.children.push(node);
      } else {
        roots.push(node);
      }
    }
    return c.json({
      questions: roots,
      authorClaimed: Boolean(claimant),
    });
  },
);

const submitSchema = z.object({
  content: z.string().min(1).max(5000),
  parentId: z.string().optional(),
});

paperAuthorQuestionsRouter.post(
  "/:id/authors/:ordinal/questions",
  requireAuth,
  zValidator("json", submitSchema),
  async (c) => {
    const me = c.get("user")!;
    const id = c.req.param("id");
    const ordinalStr = c.req.param("ordinal");
    const ordinal = ordinalStr ? parseInt(ordinalStr, 10) : NaN;
    if (!id || !Number.isFinite(ordinal)) {
      return c.json({ error: "Bad target" }, 400);
    }
    const { content, parentId } = c.req.valid("json");
    const db = getDb();

    const paper = db
      .select({ id: externalPapers.id, title: externalPapers.title })
      .from(externalPapers)
      .where(eq(externalPapers.id, id))
      .get();
    if (!paper) return c.json({ error: "Paper not found" }, 404);

    // Sprint 78 — when the client sends a parentId, verify that the
    // parent comment lives in THIS thread. Without the check, a user
    // could plant a "reply" whose parent belongs to a different paper
    // or author slot — polluting reply trees and routing notifications
    // to the wrong author.
    if (parentId) {
      const parent = db
        .select({
          targetKind: newsComments.targetKind,
          targetId: newsComments.targetId,
        })
        .from(newsComments)
        .where(eq(newsComments.id, parentId))
        .get();
      if (
        !parent ||
        parent.targetKind !== "paper_author_question" ||
        parent.targetId !== targetIdFor(id, ordinal)
      ) {
        return c.json({ error: "Parent comment is in a different thread" }, 400);
      }
    }

    const commentId = randomUUID();
    db.insert(newsComments)
      .values({
        id: commentId,
        articleId: null,
        parentId: parentId ?? null,
        userId: me.id,
        content,
        targetKind: "paper_author_question",
        targetId: targetIdFor(id, ordinal),
      })
      .run();

    // Fire a notification to the claimed author when this is a
    // top-level question (parent reply chains stay quiet — the
    // existing reply notifications cover those).
    if (!parentId) {
      const claimant = authorshipForSlot(id, ordinal);
      if (claimant && claimant.userId !== me.id) {
        await notify({
          recipientId: claimant.userId,
          actorId: me.id,
          kind: "claim_thread_reply", // reuse — closest existing
                                      // semantic to "someone wants
                                      // your attention". We don't
                                      // add a new notif kind for
                                      // this v1.
          subjectType: "claim_thread",
          subjectId: targetIdFor(id, ordinal),
          contextSlug: paper.id,
          preview:
            content.length > 120 ? content.slice(0, 119) + "…" : content,
        });
      }
    }

    return c.json({ id: commentId });
  },
);
