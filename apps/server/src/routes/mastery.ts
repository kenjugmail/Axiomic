import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { getDb, masteryPaths, masteryNodes, userProgress, users } from "@axiomic/db";
import { eq, and, desc, inArray, ne } from "drizzle-orm";
import { randomUUID } from "crypto";
import { requireAuth, getSessionUser } from "../middleware/auth";
import { notify } from "../lib/notifications";
import type { Env } from "../env";

const mastery = new Hono<Env>();

const LEVEL_ORDER = ["apprentice", "practitioner", "specialist", "expert", "researcher"] as const;
type Level = typeof LEVEL_ORDER[number];

function levelIndex(level: string): number {
  const i = LEVEL_ORDER.indexOf(level as Level);
  return i === -1 ? -1 : i;
}

function isLevel(level: string): level is Level {
  return levelIndex(level) >= 0;
}

const LEVEL_TITLE: Record<Level, string> = {
  apprentice: "Apprentice",
  practitioner: "Practitioner",
  specialist: "Specialist",
  expert: "Expert",
  researcher: "Researcher",
};

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

// Mark node complete. Idempotent: re-marking an already-completed node
// is a no-op and never re-fires the level-up notification. A genuinely
// new completion that crosses a level boundary on this path triggers a
// `mastery_level_up` notification to the same user (self-notify, with
// actorId=null so the notify() self-skip doesn't drop it).
mastery.post("/progress/:nodeId/complete", requireAuth, async (c) => {
  const nodeId = c.req.param("nodeId")!;
  const user = c.get("user")!;
  const db = getDb();

  const node = db
    .select()
    .from(masteryNodes)
    .where(eq(masteryNodes.id, nodeId))
    .get();
  if (!node) return c.json({ error: "Node not found" }, 404);

  const existing = db
    .select()
    .from(userProgress)
    .where(and(eq(userProgress.userId, user.id), eq(userProgress.nodeId, nodeId)))
    .get();

  // Re-marking an already-completed node is a no-op for both DB and
  // notifications. Without this guard the notification would re-fire
  // on every click after a user crossed a level boundary.
  const wasAlreadyCompleted = !!(existing && existing.completed);

  if (existing) {
    if (!existing.completed) {
      db.update(userProgress)
        .set({ completed: true, completedAt: new Date().toISOString() })
        .where(eq(userProgress.id, existing.id))
        .run();
    }
  } else {
    db.insert(userProgress).values({
      id: randomUUID(),
      userId: user.id,
      nodeId,
      completed: true,
      completedAt: new Date().toISOString(),
    }).run();
  }

  // Level-up check: was this the first completed node at `node.level` for
  // this path? Compare highest previously-completed level vs new level.
  if (!wasAlreadyCompleted && isLevel(node.level)) {
    try {
      const path = db
        .select({ slug: masteryPaths.slug, title: masteryPaths.title })
        .from(masteryPaths)
        .where(eq(masteryPaths.id, node.pathId))
        .get();

      // All completed nodes (other than the one we just inserted) on this
      // path, with their levels. Excluding the current nodeId is essential
      // because the row we just inserted/updated would otherwise be in the
      // result set and the level transition would always look stationary.
      const otherCompleted = db
        .select({ level: masteryNodes.level })
        .from(userProgress)
        .innerJoin(masteryNodes, eq(userProgress.nodeId, masteryNodes.id))
        .where(
          and(
            eq(userProgress.userId, user.id),
            eq(userProgress.completed, true),
            eq(masteryNodes.pathId, node.pathId),
            ne(userProgress.nodeId, nodeId),
          ),
        )
        .all();

      // Highest level previously reached on this path, considering ALL
      // other completed nodes (including same-level peers). The level-up
      // fires only when the new completion strictly raises the bar — so
      // the SECOND apprentice node doesn't re-fire the apprentice
      // notification, and stepping back to a lower level is silent.
      let prevHighest = -1;
      for (const r of otherCompleted) {
        const idx = levelIndex(r.level);
        if (idx > prevHighest) prevHighest = idx;
      }

      const newIdx = levelIndex(node.level);
      if (newIdx > prevHighest && path) {
        await notify({
          recipientId: user.id,
          actorId: null,
          kind: "mastery_level_up",
          subjectType: "mastery_node",
          subjectId: nodeId,
          contextSlug: path.slug,
          preview: `You've reached ${LEVEL_TITLE[node.level as Level]} on ${path.title}.`,
        });
      }
    } catch (err) {
      console.error("level-up notification failed", err);
    }
  }

  return c.json({ ok: true });
});

// Per-user mastery summary across all paths.
mastery.get("/users/:username/summary", (c) => {
  const username = c.req.param("username");
  const db = getDb();

  const user = db
    .select({ id: users.id, username: users.username })
    .from(users)
    .where(eq(users.username, username))
    .get();
  if (!user) return c.json({ error: "User not found" }, 404);

  const paths = db.select().from(masteryPaths).all();

  let totalCompleted = 0;
  let highestIdx = -1;

  const pathSummaries = paths.map((path) => {
    const nodes = db
      .select({ id: masteryNodes.id, level: masteryNodes.level })
      .from(masteryNodes)
      .where(eq(masteryNodes.pathId, path.id))
      .all();

    const totalNodes = nodes.length;
    const nodeIds = nodes.map((n) => n.id);

    const completed = nodeIds.length === 0
      ? []
      : db
          .select({
            nodeId: userProgress.nodeId,
            completedAt: userProgress.completedAt,
          })
          .from(userProgress)
          .where(
            and(
              eq(userProgress.userId, user.id),
              eq(userProgress.completed, true),
              inArray(userProgress.nodeId, nodeIds),
            ),
          )
          .orderBy(desc(userProgress.completedAt))
          .all();

    const completedNodes = completed.length;
    totalCompleted += completedNodes;

    const completedSet = new Set(completed.map((c) => c.nodeId));
    let pathHighest = -1;
    for (const n of nodes) {
      if (!completedSet.has(n.id)) continue;
      const idx = levelIndex(n.level);
      if (idx > pathHighest) pathHighest = idx;
    }
    if (pathHighest > highestIdx) highestIdx = pathHighest;

    return {
      pathSlug: path.slug,
      pathTitle: path.title,
      totalNodes,
      completedNodes,
      currentLevel: pathHighest >= 0 ? LEVEL_ORDER[pathHighest] : null,
      latestCompletionAt: completed[0]?.completedAt ?? null,
    };
  });

  return c.json({
    username: user.username,
    paths: pathSummaries,
    totalCompleted,
    highestLevel: highestIdx >= 0 ? LEVEL_ORDER[highestIdx] : null,
  });
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
