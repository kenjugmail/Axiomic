import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { sql } from "drizzle-orm";
import { getDb } from "@axiomic/db";
import { getAIProvider } from "@axiomic/ai";
import { auth } from "./routes/auth";
import { wiki } from "./routes/wiki";
import { commentsRouter } from "./routes/comments";
import { aiRouter } from "./routes/ai";
import { mastery } from "./routes/mastery";
import { forum } from "./routes/forum";
import { notificationsRouter } from "./routes/notifications";
import type { Env } from "./env";

const app = new Hono<Env>().basePath("/api/v1");

app.use("*", cors({ origin: "http://localhost:5173", credentials: true }));
app.use("*", logger());

app.get("/health", (c) => c.json({ status: "ok", timestamp: new Date().toISOString() }));

app.get("/ready", async (c) => {
  let dbOk = false;
  try {
    getDb().run(sql`SELECT 1`);
    dbOk = true;
  } catch {
    dbOk = false;
  }

  let aiOk = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const provider = getAIProvider();
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("ai timeout")), 1500);
    });
    const result = (await Promise.race([provider.embed("ping"), timeout])) as number[];
    aiOk = Array.isArray(result) && result.length > 0;
  } catch {
    aiOk = false;
  } finally {
    if (timer) clearTimeout(timer);
  }

  const ready = dbOk && aiOk;
  return c.json(
    { status: ready ? "ready" : "degraded", db: dbOk, ai: aiOk },
    ready ? 200 : 503
  );
});

app.route("/auth", auth);
app.route("/wiki", wiki);
app.route("/comments", commentsRouter);
app.route("/ai", aiRouter);
app.route("/mastery", mastery);
app.route("/forum", forum);
app.route("/notifications", notificationsRouter);

export { app };

const port = parseInt(process.env.PORT || "3000");

if (import.meta.main) {
  console.log(`Axiomic server starting on port ${port}`);
}

export default {
  port,
  fetch: app.fetch,
};
