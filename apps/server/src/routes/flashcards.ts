import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, asc, desc, eq, isNull, lte, or, sql } from "drizzle-orm";
import { randomUUID } from "crypto";
import { getDb, flashcards, flashcardReviews } from "@axiomic/db";
import { requireAuth } from "../middleware/auth";
import { schedule } from "../lib/srs";
import type { Env } from "../env";

export const flashcardsRouter = new Hono<Env>();

// --- Save a card to the user's deck -------------------------------------

const saveSchema = z.object({
  pageSlug: z.string().min(1).max(200),
  pageTitle: z.string().min(1).max(200),
  front: z.string().min(1).max(500),
  back: z.string().min(1).max(2000),
});

flashcardsRouter.post(
  "/",
  requireAuth,
  zValidator("json", saveSchema),
  async (c) => {
    const user = c.get("user")!;
    const body = c.req.valid("json");
    const db = getDb();

    const id = randomUUID();
    db.insert(flashcards).values({
      id,
      userId: user.id,
      pageSlug: body.pageSlug,
      pageTitle: body.pageTitle,
      front: body.front,
      back: body.back,
    }).run();

    const card = db
      .select()
      .from(flashcards)
      .where(eq(flashcards.id, id))
      .get();

    return c.json({ card }, 201);
  },
);

// --- List all of the user's cards (newest first) -----------------------

flashcardsRouter.get("/", requireAuth, async (c) => {
  const user = c.get("user")!;
  const db = getDb();

  const cards = db
    .select()
    .from(flashcards)
    .where(eq(flashcards.userId, user.id))
    .orderBy(desc(flashcards.createdAt))
    .all();

  return c.json({ cards });
});

// --- Cards due for review (dueAt <= now OR new) ------------------------

flashcardsRouter.get("/due", requireAuth, async (c) => {
  const user = c.get("user")!;
  const db = getDb();
  const now = new Date().toISOString();

  const cards = db
    .select()
    .from(flashcards)
    .where(
      and(
        eq(flashcards.userId, user.id),
        or(isNull(flashcards.dueAt), lte(flashcards.dueAt, now)),
      ),
    )
    // Surface the cards waiting longest first; new cards (dueAt null)
    // come up via the OR clause and sort to the end of the descending
    // dueAt ordering, so we explicitly secondary-sort by createdAt asc.
    .orderBy(asc(sql`COALESCE(${flashcards.dueAt}, '9999-12-31')`), asc(flashcards.createdAt))
    .limit(50)
    .all();

  return c.json({ cards });
});

// --- Submit a review ----------------------------------------------------

const reviewSchema = z.object({
  rating: z.number().int().min(0).max(5),
});

flashcardsRouter.post(
  "/:id/review",
  requireAuth,
  zValidator("json", reviewSchema),
  async (c) => {
    const user = c.get("user")!;
    const id = c.req.param("id");
    if (!id) return c.json({ error: "Missing id" }, 400);
    const { rating } = c.req.valid("json");
    const db = getDb();

    const card = db
      .select()
      .from(flashcards)
      .where(and(eq(flashcards.id, id), eq(flashcards.userId, user.id)))
      .get();
    if (!card) return c.json({ error: "Card not found" }, 404);

    const next = schedule(
      {
        easeFactor: card.easeFactor,
        interval: card.interval,
        repetitions: card.repetitions,
      },
      rating,
    );

    db.update(flashcards)
      .set({
        easeFactor: next.easeFactor,
        interval: next.interval,
        repetitions: next.repetitions,
        dueAt: next.dueAt,
      })
      .where(eq(flashcards.id, id))
      .run();

    db.insert(flashcardReviews).values({
      id: randomUUID(),
      cardId: id,
      userId: user.id,
      rating,
    }).run();

    const updated = db
      .select()
      .from(flashcards)
      .where(eq(flashcards.id, id))
      .get();

    return c.json({ card: updated });
  },
);

// --- Delete -------------------------------------------------------------

flashcardsRouter.delete("/:id", requireAuth, async (c) => {
  const user = c.get("user")!;
  const id = c.req.param("id");
  if (!id) return c.json({ error: "Missing id" }, 400);
  const db = getDb();

  // Delete review history first (FK constraint).
  db.delete(flashcardReviews).where(eq(flashcardReviews.cardId, id)).run();
  db.delete(flashcards)
    .where(and(eq(flashcards.id, id), eq(flashcards.userId, user.id)))
    .run();

  return c.json({ ok: true });
});
