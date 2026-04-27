import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { getDb, masteryPaths, masteryNodes, userProgress } from "@axiomic/db";
import { eq, and } from "drizzle-orm";
import { randomUUID } from "crypto";
import { requireAuth, getSessionUser } from "../middleware/auth";

const mastery = new Hono();

// List mastery paths
mastery.get("/paths", async (c) => {
  const db = getDb();
  const paths = db.select().from(masteryPaths).all();
  return c.json({ paths });
});

// Get mastery path with nodes and progress
mastery.get("/paths/:slug", async (c) => {
  const slug = c.req.param("slug");
  const db = getDb();
  const user = await getSessionUser(c);

  const path = db.select().from(masteryPaths).where(eq(masteryPaths.slug, slug)).get();
  if (!path) return c.json({ error: "Path not found" }, 404);

  const nodes = db
    .select()
    .from(masteryNodes)
    .where(eq(masteryNodes.pathId, path.id))
    .all()
    .map((n) => ({
      ...n,
      pageIds: JSON.parse(n.pageIds),
      prerequisiteNodeIds: JSON.parse(n.prerequisiteNodeIds),
    }));

  let progress: any[] = [];
  if (user) {
    progress = db
      .select({
        nodeId: userProgress.nodeId,
        completed: userProgress.completed,
        quizScore: userProgress.quizScore,
        completedAt: userProgress.completedAt,
      })
      .from(userProgress)
      .where(eq(userProgress.userId, user.id))
      .all();
  }

  return c.json({ path, nodes, progress });
});

// Mark node complete
mastery.post("/progress/:nodeId/complete", requireAuth, async (c) => {
  const nodeId = c.req.param("nodeId");
  const user = c.get("user")!;
  const db = getDb();

  const existing = db
    .select()
    .from(userProgress)
    .where(and(eq(userProgress.userId, user.id), eq(userProgress.nodeId, nodeId)))
    .get();

  if (existing) {
    db.update(userProgress)
      .set({ completed: true, completedAt: new Date().toISOString() })
      .where(eq(userProgress.id, existing.id))
      .run();
  } else {
    db.insert(userProgress).values({
      id: randomUUID(),
      userId: user.id,
      nodeId,
      completed: true,
      completedAt: new Date().toISOString(),
    }).run();
  }

  return c.json({ ok: true });
});

// Get quiz for a node
mastery.get("/quiz/:nodeId", async (c) => {
  const nodeId = c.req.param("nodeId");
  const db = getDb();

  const node = db.select().from(masteryNodes).where(eq(masteryNodes.id, nodeId)).get();
  if (!node) return c.json({ error: "Node not found" }, 404);

  // Parse canned quiz data or generate default questions
  let questions = [];
  if (node.quizData) {
    questions = JSON.parse(node.quizData);
  } else {
    questions = [
      {
        id: "q1",
        question: `What is the main concept behind ${node.title}?`,
        options: [
          "A fundamental building block of modern AI",
          "A purely theoretical concept with no practical use",
          "A deprecated technique from early computing",
          "A hardware optimization only",
        ],
        correctIndex: 0,
      },
      {
        id: "q2",
        question: `Which prerequisite is most important for understanding ${node.title}?`,
        options: [
          "Basic linear algebra",
          "Quantum computing",
          "Database design",
          "Network protocols",
        ],
        correctIndex: 0,
      },
    ];
  }

  return c.json({ questions });
});

// Submit quiz answers
const quizSubmitSchema = z.object({
  answers: z.record(z.string()),
});

mastery.post("/quiz/:nodeId", requireAuth, zValidator("json", quizSubmitSchema), async (c) => {
  const nodeId = c.req.param("nodeId");
  const { answers } = c.req.valid("json");
  const user = c.get("user")!;
  const db = getDb();

  const node = db.select().from(masteryNodes).where(eq(masteryNodes.id, nodeId)).get();
  if (!node) return c.json({ error: "Node not found" }, 404);

  let questions = [];
  if (node.quizData) {
    questions = JSON.parse(node.quizData);
  } else {
    questions = [
      { id: "q1", correctIndex: 0 },
      { id: "q2", correctIndex: 0 },
    ];
  }

  let correct = 0;
  for (const q of questions) {
    if (answers[q.id] === String(q.correctIndex)) correct++;
  }

  const score = questions.length > 0 ? correct / questions.length : 0;

  // Update progress
  const existing = db
    .select()
    .from(userProgress)
    .where(and(eq(userProgress.userId, user.id), eq(userProgress.nodeId, nodeId)))
    .get();

  if (existing) {
    db.update(userProgress)
      .set({ quizScore: score })
      .where(eq(userProgress.id, existing.id))
      .run();
  } else {
    db.insert(userProgress).values({
      id: randomUUID(),
      userId: user.id,
      nodeId,
      quizScore: score,
    }).run();
  }

  return c.json({ score, correct, total: questions.length });
});

export { mastery };
