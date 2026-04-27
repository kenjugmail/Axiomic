import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { getDb, comments, votes, users, commentEdits } from "@axiomic/db";
import { eq, and, desc, asc, sql } from "drizzle-orm";
import { randomUUID } from "crypto";
import { requireAuth, getSessionUser } from "../middleware/auth";

const commentsRouter = new Hono();

// Get comments for a page
commentsRouter.get("/:pageId", async (c) => {
  const pageId = c.req.param("pageId");
  const sort = c.req.query("sort") || "new";
  const db = getDb();
  const currentUser = await getSessionUser(c);

  const allComments = db
    .select({
      id: comments.id,
      pageId: comments.pageId,
      parentId: comments.parentId,
      userId: comments.userId,
      username: users.username,
      displayName: users.displayName,
      content: comments.content,
      editedAt: comments.editedAt,
      createdAt: comments.createdAt,
    })
    .from(comments)
    .innerJoin(users, eq(comments.userId, users.id))
    .where(eq(comments.pageId, pageId))
    .all();

  // Get vote totals
  const voteTotals = db
    .select({
      commentId: votes.commentId,
      total: sql<number>`sum(${votes.value})`.as("total"),
    })
    .from(votes)
    .groupBy(votes.commentId)
    .all();

  const voteMap = new Map(voteTotals.map((v) => [v.commentId, v.total || 0]));

  // Get current user's votes
  let userVoteMap = new Map<string, number>();
  if (currentUser) {
    const userVotes = db
      .select({ commentId: votes.commentId, value: votes.value })
      .from(votes)
      .where(eq(votes.userId, currentUser.id))
      .all();
    userVoteMap = new Map(userVotes.map((v) => [v.commentId, v.value]));
  }

  // Build threaded structure
  const enriched = allComments.map((comment) => ({
    ...comment,
    score: voteMap.get(comment.id) || 0,
    userVote: userVoteMap.get(comment.id) || 0,
  }));

  // Sort
  const sorted = enriched.sort((a, b) => {
    if (sort === "top") return b.score - a.score;
    if (sort === "controversial") {
      const aC = Math.abs(a.score) < 2 ? a.score : -Math.abs(a.score);
      const bC = Math.abs(b.score) < 2 ? b.score : -Math.abs(b.score);
      return aC - bC;
    }
    // Default: newest first
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  // Thread comments
  const rootComments = sorted.filter((c) => !c.parentId);
  const childMap = new Map<string, typeof sorted>();
  for (const comment of sorted) {
    if (comment.parentId) {
      const children = childMap.get(comment.parentId) || [];
      children.push(comment);
      childMap.set(comment.parentId, children);
    }
  }

  function buildTree(comment: (typeof sorted)[0]): any {
    return {
      ...comment,
      children: (childMap.get(comment.id) || []).map(buildTree),
    };
  }

  return c.json({ comments: rootComments.map(buildTree) });
});

// Create comment
const createSchema = z.object({
  pageId: z.string(),
  content: z.string().min(1).max(10000),
  parentId: z.string().optional(),
});

commentsRouter.post("/", requireAuth, zValidator("json", createSchema), async (c) => {
  const { pageId, content, parentId } = c.req.valid("json");
  const user = c.get("user")!;
  const db = getDb();

  const id = randomUUID();
  db.insert(comments).values({
    id,
    pageId,
    parentId: parentId || null,
    userId: user.id,
    content,
  }).run();

  return c.json({
    comment: {
      id,
      pageId,
      parentId: parentId || null,
      userId: user.id,
      username: user.username,
      content,
      score: 0,
      userVote: 0,
      editedAt: null,
      createdAt: new Date().toISOString(),
      children: [],
    },
  }, 201);
});

// Update comment
const updateSchema = z.object({ content: z.string().min(1).max(10000) });

commentsRouter.put("/:id", requireAuth, zValidator("json", updateSchema), async (c) => {
  const id = c.req.param("id");
  const { content: newContent } = c.req.valid("json");
  const user = c.get("user")!;
  const db = getDb();

  const comment = db.select().from(comments).where(eq(comments.id, id)).get();
  if (!comment) return c.json({ error: "Comment not found" }, 404);
  if (comment.userId !== user.id) return c.json({ error: "Not your comment" }, 403);

  // Save edit history
  db.insert(commentEdits).values({
    id: randomUUID(),
    commentId: id,
    previousContent: comment.content,
  }).run();

  const now = new Date().toISOString();
  db.update(comments).set({ content: newContent, editedAt: now }).where(eq(comments.id, id)).run();

  return c.json({ comment: { ...comment, content: newContent, editedAt: now } });
});

// Vote on comment
const voteSchema = z.object({ value: z.union([z.literal(1), z.literal(-1)]) });

commentsRouter.post("/:id/vote", requireAuth, zValidator("json", voteSchema), async (c) => {
  const commentId = c.req.param("id");
  const { value } = c.req.valid("json");
  const user = c.get("user")!;
  const db = getDb();

  const existing = db
    .select()
    .from(votes)
    .where(and(eq(votes.commentId, commentId), eq(votes.userId, user.id)))
    .get();

  if (existing) {
    if (existing.value === value) {
      // Remove vote (toggle)
      db.delete(votes).where(eq(votes.id, existing.id)).run();
    } else {
      // Change vote
      db.update(votes).set({ value }).where(eq(votes.id, existing.id)).run();
    }
  } else {
    db.insert(votes).values({
      id: randomUUID(),
      commentId,
      userId: user.id,
      value,
    }).run();
  }

  return c.json({ ok: true });
});

export { commentsRouter };
