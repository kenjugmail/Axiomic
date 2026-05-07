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
import { searchRouter } from "./routes/search";
import { settingsRouter } from "./routes/settings";
import { flashcardsRouter } from "./routes/flashcards";
import { achievementsRouter } from "./routes/achievements";
import { activityRouter } from "./routes/activity";
import { newsRouter } from "./routes/news";
import { socialRouter } from "./routes/social";
import { gamificationRouter } from "./routes/gamification";
import { onboardingRouter } from "./routes/onboarding";
import { uploadsRouter } from "./routes/uploads";
import { conceptsRouter } from "./routes/concepts";
import { researchRouter } from "./routes/research";
import { capstonesRouter } from "./routes/capstones";
import { prewarmSearchIndex } from "./lib/searchIndex";
import { userFromCookieHeader } from "./middleware/auth";
import { attachUser, detach, subscribeArticle } from "./lib/liveBus";
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
app.route("/search", searchRouter);
app.route("/settings", settingsRouter);
app.route("/flashcards", flashcardsRouter);
app.route("/achievements", achievementsRouter);
app.route("/activity", activityRouter);
app.route("/news", newsRouter);
app.route("/", socialRouter);
app.route("/gamification", gamificationRouter);
app.route("/onboarding", onboardingRouter);
app.route("/uploads", uploadsRouter);
app.route("/concepts", conceptsRouter);
app.route("/research", researchRouter);
app.route("/capstones", capstonesRouter);

// Pre-warm the search index in the background so the first user query
// doesn't pay the embedding-build cost.
prewarmSearchIndex();

export { app };

const port = parseInt(process.env.PORT || "3000");

if (import.meta.main) {
  console.log(`Axiomic server starting on port ${port}`);
  if (
    process.env.DEV_AUTH_BYPASS === "1" &&
    process.env.NODE_ENV !== "production"
  ) {
    const u = process.env.DEV_AUTH_BYPASS_USER || "alice";
    console.warn(
      `⚠️  DEV_AUTH_BYPASS enabled — every request is authed as "${u}". DO NOT USE IN PRODUCTION.`
    );
  }
}

// Bun.serve passes (req, server) when a `websocket` handler is set.
// We hijack /api/v1/ws upgrades and delegate everything else to Hono.
type WSData = { userId: string | null; subscriptions: Set<string> };

export default {
  port,
  fetch(req: Request, server: any): Response | Promise<Response> | undefined {
    const url = new URL(req.url);
    if (url.pathname === "/api/v1/ws") {
      const userId = userFromCookieHeader(req.headers.get("cookie"));
      const data: WSData = { userId, subscriptions: new Set() };
      if (server.upgrade(req, { data })) return;
      return new Response("Upgrade failed", { status: 500 });
    }
    return app.fetch(req);
  },
  websocket: {
    open(ws: any) {
      const data = ws.data as WSData;
      if (data?.userId) attachUser(ws, data.userId);
    },
    message(ws: any, raw: string | Uint8Array) {
      // Clients can subscribe to per-article reaction streams. Other
      // message kinds are ignored for v1.
      try {
        const text = typeof raw === "string" ? raw : new TextDecoder().decode(raw);
        const msg = JSON.parse(text);
        if (msg && msg.type === "subscribe_article" && typeof msg.slug === "string") {
          subscribeArticle(ws, msg.slug);
        }
      } catch {
        // ignore malformed frames
      }
    },
    close(ws: any) {
      detach(ws);
    },
  },
};
