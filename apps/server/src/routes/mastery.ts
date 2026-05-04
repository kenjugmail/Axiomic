import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { getDb, masteryPaths, masteryNodes, userProgress, users } from "@axiomic/db";
import { eq, and, desc, inArray, ne, asc } from "drizzle-orm";
import { randomUUID } from "crypto";
import { requireAuth, getSessionUser } from "../middleware/auth";
import { notify } from "../lib/notifications";
import { recordActivityAndEvaluate } from "../lib/achievements";
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
      // Don't ship the full lesson body in the listing — just a flag so
      // the path page can show or hide the "Start lesson" button.
      hasLesson: !!n.lessonData,
      lessonData: undefined,
      quizData: undefined,
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

  // Activity + achievements: only fire when this is a fresh completion,
  // so re-marking an already-complete node doesn't pollute the activity
  // log or claim duplicate progress against streaks.
  let newAchievements: string[] = [];
  if (!wasAlreadyCompleted) {
    newAchievements = recordActivityAndEvaluate(user.id, "node_completed");
  }

  return c.json({ ok: true, newAchievements });
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

// "Pick up where you left off" — for the auth'd user, return the next
// incomplete node on the most-recently-active path. Falls back to the
// first node of the first path if the user has no completions yet.
mastery.get("/next-node", requireAuth, (c) => {
  const user = c.get("user")!;
  const db = getDb();

  const paths = db.select().from(masteryPaths).orderBy(asc(masteryPaths.id)).all();
  if (paths.length === 0) return c.json({ next: null });

  // Most-recent completion per path; choose the path with the latest
  // activity. If the user has no completions yet, fall back to the first
  // path so the home card always points somewhere.
  let chosenPath = paths[0];
  let latestActivity = "";
  for (const path of paths) {
    const nodeIds = db
      .select({ id: masteryNodes.id })
      .from(masteryNodes)
      .where(eq(masteryNodes.pathId, path.id))
      .all()
      .map((n) => n.id);
    if (nodeIds.length === 0) continue;
    const last = db
      .select({ completedAt: userProgress.completedAt })
      .from(userProgress)
      .where(
        and(
          eq(userProgress.userId, user.id),
          eq(userProgress.completed, true),
          inArray(userProgress.nodeId, nodeIds),
        ),
      )
      .orderBy(desc(userProgress.completedAt))
      .limit(1)
      .get();
    if (last?.completedAt && last.completedAt > latestActivity) {
      latestActivity = last.completedAt;
      chosenPath = path;
    }
  }

  // First non-completed node, ordered by `order`. If every node is
  // complete on the chosen path, return null.
  const nodes = db
    .select()
    .from(masteryNodes)
    .where(eq(masteryNodes.pathId, chosenPath.id))
    .orderBy(asc(masteryNodes.order))
    .all();

  const completedSet = new Set(
    db
      .select({ nodeId: userProgress.nodeId })
      .from(userProgress)
      .where(and(eq(userProgress.userId, user.id), eq(userProgress.completed, true)))
      .all()
      .map((r) => r.nodeId),
  );

  const next = nodes.find((n) => !completedSet.has(n.id));
  if (!next) return c.json({ next: null });

  return c.json({
    next: {
      pathSlug: chosenPath.slug,
      pathTitle: chosenPath.title,
      nodeSlug: next.slug,
      nodeTitle: next.title,
      level: next.level,
      hasLesson: !!next.lessonData,
    },
  });
});

// Get the authored lesson for a node, if any.
mastery.get("/lesson/:nodeId", async (c) => {
  const nodeId = c.req.param("nodeId");
  const db = getDb();
  const node = db
    .select({ lessonData: masteryNodes.lessonData })
    .from(masteryNodes)
    .where(eq(masteryNodes.id, nodeId))
    .get();
  if (!node) return c.json({ error: "Node not found" }, 404);
  if (!node.lessonData) return c.json({ lesson: null });
  try {
    return c.json({ lesson: JSON.parse(node.lessonData) });
  } catch {
    return c.json({ lesson: null });
  }
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

// Grade one question against one answer. Dispatches on `kind`,
// defaulting to multiple_choice for back-compat with older seeded
// quiz JSON that omits the field. Returns true when the answer is
// correct.
function gradeQuestion(q: any, answer: string | undefined): boolean {
  const kind = q?.kind ?? "multiple_choice";
  switch (kind) {
    case "multiple_choice":
      return answer !== undefined && answer === String(q.correctIndex);
    case "slider": {
      if (answer === undefined) return false;
      const v = parseFloat(answer);
      if (isNaN(v)) return false;
      return v >= q.target.min && v <= q.target.max;
    }
    case "drag_classify": {
      if (answer === undefined) return false;
      let map: Record<string, string>;
      try {
        const parsed = JSON.parse(answer);
        if (!parsed || typeof parsed !== "object") return false;
        map = parsed;
      } catch {
        return false;
      }
      // Every declared item must map to its declared bin.
      for (const item of q.items as Array<{ id: string; bin: string }>) {
        if (map[item.id] !== item.bin) return false;
      }
      return true;
    }
    case "code": {
      // The client reports { passed, total } after running the user's
      // code through Pyodide against the test cases. Self-paced learning
      // — trust the report — but we cross-check the totals against the
      // number of declared tests so a hand-crafted answer can't claim
      // more passes than there are tests.
      if (answer === undefined) return false;
      try {
        const parsed = JSON.parse(answer);
        if (!parsed || typeof parsed !== "object") return false;
        const total = q.tests?.length ?? 0;
        return (
          typeof parsed.passed === "number" &&
          typeof parsed.total === "number" &&
          parsed.passed === total &&
          parsed.total === total
        );
      } catch {
        return false;
      }
    }
    case "puzzle_drag_build": {
      if (answer === undefined) return false;
      let map: Record<string, string>;
      try {
        const parsed = JSON.parse(answer);
        if (!parsed || typeof parsed !== "object") return false;
        map = parsed;
      } catch {
        return false;
      }
      const componentsById = new Map<string, { type: string }>();
      for (const c of q.components as Array<{ id: string; type: string }>) {
        componentsById.set(c.id, c);
      }
      for (const slot of q.slots as Array<{ id: string; accepts: string }>) {
        const placed = map[slot.id];
        if (!placed) return false;
        const comp = componentsById.get(placed);
        if (!comp || comp.type !== slot.accepts) return false;
      }
      return true;
    }
    default:
      return false;
  }
}

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
    if (gradeQuestion(q, answers[q.id])) correct++;
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

  // Record activity for both the quiz attempt and (if there was a code
  // question) the coding problem specifically — code_warrior achievement
  // gates on it. Activity events fire even on partial passes so streaks
  // aren't held hostage by a hard quiz.
  const newAchievements: string[] = [];
  newAchievements.push(...recordActivityAndEvaluate(user.id, "quiz_passed"));
  // Look for any code question that the user got fully right and credit it.
  const codeQs = (questions as any[]).filter((q) => q?.kind === "code");
  for (const cq of codeQs) {
    if (gradeQuestion(cq, answers[cq.id])) {
      newAchievements.push(...recordActivityAndEvaluate(user.id, "code_question_passed"));
      break; // one credit per submit, regardless of how many code questions
    }
  }

  return c.json({ score, correct, total: questions.length, newAchievements });
});

export { mastery };
