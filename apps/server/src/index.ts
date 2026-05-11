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
import { pushRouter } from "./routes/push";
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
import { researchFeedRouter } from "./routes/research-feed";
import { paperSummaryRouter } from "./routes/paper-summary";
import { grantsRouter } from "./routes/grants";
import { authorClaimsRouter } from "./routes/authorClaims";
import { authorsRouter } from "./routes/authors";
import { paperAuthorQuestionsRouter } from "./routes/paperAuthorQuestions";
import { examsRouter } from "./routes/exams";
import { registerJob, startJobRunner } from "./lib/jobs";
import { ingestArxivJob } from "./jobs/ingestArxiv";
import { ingestOpenAlexJob } from "./jobs/ingestOpenAlex";
import { ingestPubmedJob } from "./jobs/ingestPubmed";
import { ingestNihGrantsJob } from "./jobs/ingestNihGrants";
import { ingestNsfGrantsJob } from "./jobs/ingestNsfGrants";
import { ingestGrantsGovJob } from "./jobs/ingestGrantsGov";
import { notifyGrantMatchesJob } from "./jobs/notifyGrantMatches";
import { claimExternalAuthorshipsByOrcidJob } from "./jobs/claimExternalAuthorshipsByOrcid";
import { harvestSocialResearcherPostsJob } from "./jobs/harvestSocialResearcherPosts";
import { finalizeStaleExamAttemptsJob } from "./jobs/finalizeStaleExamAttempts";
import { capstonesRouter } from "./routes/capstones";
import { classesRouter } from "./routes/classes";
import { petRouter, petCatalogRouter, petPublicRouter } from "./routes/pet";
import { misconceptionsRouter } from "./routes/misconceptions";
import { kernelFilesRouter } from "./routes/kernelFiles";
import { cohortsRouter, mentorsRouter } from "./routes/cohorts";
import { serverExecRouter } from "./routes/serverExec";
import { adminRouter } from "./routes/admin";
import { capstoneTracksRouter } from "./routes/capstoneTracks";
import { cohortInvitationsRouter } from "./routes/cohortInvitations";
import { meRouter } from "./routes/me";
import { feedbackRouter } from "./routes/feedback";
import { usersRouter } from "./routes/users";
import { protocolsRouter } from "./routes/protocols";
import { equipmentRouter } from "./routes/equipment";
import { labGroupsRouter, meLabRouter } from "./routes/labAssignments";
import {
  aiLabRouter,
  labProtocolsTroubleshootingRouter,
  labTroubleshootRouter,
} from "./routes/aiLab";
import {
  safetyCertsRouter,
  safetyCertsMeRouter,
} from "./routes/safetyCerts";
import {
  protocolRunsRouter,
  protocolRunsMeRouter,
} from "./routes/protocolRuns";
import { notifyExpiringCertsJob } from "./jobs/notifyExpiringCerts";
import { hardDeleteSoftDeletedUsersJob, cleanupOldLoginAttemptsJob } from "./lib/userCleanupJob";
import { bootstrapAdmin } from "./lib/bootstrapAdmin";
import { prewarmSearchIndex } from "./lib/searchIndex";
import { userFromCookieHeader } from "./middleware/auth";
import {
  attachUser,
  broadcastDraftPresence,
  detach,
  setUsernameResolver,
  subscribeArticle,
  subscribeDraft,
} from "./lib/liveBus";
import type { DraftKind } from "./lib/liveBus";
import { users as usersTable } from "@axiomic/db";
import { inArray } from "drizzle-orm";

// Sprint 40 — let liveBus resolve userIds → usernames for presence
// events without pulling in @axiomic/db (which would form a cycle).
setUsernameResolver((ids: string[]) => {
  if (ids.length === 0) return new Map();
  const rows = getDb()
    .select({ id: usersTable.id, username: usersTable.username })
    .from(usersTable)
    .where(inArray(usersTable.id, ids))
    .all();
  return new Map(rows.map((r) => [r.id, r.username]));
});
import {
  canonicalJson,
  publicKeyHex,
  verify,
  verifyWithPublicKey,
} from "./lib/signing";
import type { Env } from "./env";
import { env, warnOnInsecureConfig } from "./lib/envConfig";
import { setServerExecBackend } from "./lib/serverExec";
import { localProcessBackend } from "./lib/serverExecLocal";

// Sprint 46 — opt into the local-process executor when configured.
// Default stays 'stub' (returns not_enabled), so this is a no-op in
// dev unless the operator explicitly enables it.
if (env.SERVER_EXEC_BACKEND === "local") {
  setServerExecBackend(localProcessBackend);
}

const app = new Hono<Env>().basePath("/api/v1");

// Sprint 45 — CORS origin(s) come from CORS_ORIGIN. Comma-separated
// for multi-origin deploys (prod + staging + dev sharing one server).
const corsOrigins = env.CORS_ORIGIN.split(",")
  .map((s) => s.trim())
  .filter(Boolean);
app.use(
  "*",
  cors({
    origin: corsOrigins.length === 1 ? corsOrigins[0] : corsOrigins,
    credentials: true,
  }),
);
app.use("*", logger());

app.get("/health", (c) => c.json({ status: "ok", timestamp: new Date().toISOString() }));

// Sprint 37 — Public signing key for transcript verification.
// Returns the raw 32-byte ed25519 public key as lowercase hex so any
// external verifier can re-check a transcript signature without the
// server's involvement.
app.get("/keys/signing", (c) =>
  c.json({ algorithm: "ed25519", publicKey: publicKeyHex() }),
);

// Sprint 37 — Verify a posted transcript bundle. Accepts the same
// shape returned by /capstones/c/:slug/transcript: { manifest,
// signature, publicKey? }. When `publicKey` is present we verify
// against that key (so a verifier can confirm a manifest matches a
// specific instance's pinned key); otherwise we use this server's key.
app.post("/keys/verify", async (c) => {
  let body: any;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ valid: false, error: "Invalid JSON body" }, 400);
  }
  const manifest = body?.manifest;
  const signature = body?.signature;
  const claimedPublicKey: string | undefined = body?.publicKey;
  if (!manifest || typeof signature !== "string") {
    return c.json(
      { valid: false, error: "Missing manifest or signature" },
      400,
    );
  }
  const payload = canonicalJson(manifest);
  const valid = claimedPublicKey
    ? verifyWithPublicKey(payload, signature, claimedPublicKey)
    : verify(payload, signature);
  return c.json({
    valid,
    publicKey: claimedPublicKey ?? publicKeyHex(),
    canonicalPayload: payload,
  });
});

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
app.route("/push", pushRouter);
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
// Sprint 70 — for-you feed at /research/feed and tier-aware AI summary
// at /research/:slug/summary. Mounted BEFORE researchRouter so the
// `/feed` literal wins against researchRouter's `/:slug` matcher.
app.route("/research", researchFeedRouter);
app.route("/research", paperSummaryRouter);
app.route("/research", researchRouter);
// Sprint 71 — funding feed.
app.route("/grants", grantsRouter);
// Sprint 72 — engagement: author claims + author profile +
// per-paper Q&A.
app.route("/author-claims", authorClaimsRouter);
app.route("/authors", authorsRouter);
app.route("/external-papers", paperAuthorQuestionsRouter);
// Sprint 73 — exam mastery framework.
app.route("/exams", examsRouter);
app.route("/capstones", capstonesRouter);
app.route("/classes", classesRouter);
app.route("/me/pet", petRouter);
app.route("/pet-cosmetics", petCatalogRouter);
// S87 — public per-username pet display.
app.route("/users", petPublicRouter);
app.route("/misconceptions", misconceptionsRouter);
app.route("/kernel-files", kernelFilesRouter);
app.route("/cohorts", cohortsRouter);
app.route("/mentors", mentorsRouter);
app.route("/server-exec", serverExecRouter);
app.route("/admin", adminRouter);
app.route("/tracks", capstoneTracksRouter);
app.route("/cohort-invitations", cohortInvitationsRouter);
app.route("/me", meRouter);
app.route("/feedback", feedbackRouter);
app.route("/users", usersRouter);
// Sprint 79 — Lab protocol + equipment library.
app.route("/lab/protocols", protocolsRouter);
app.route("/lab/equipment", equipmentRouter);
// Sprint 80 — Safety certifications + protocol-run sign-offs.
app.route("/lab/safety-certs", safetyCertsRouter);
app.route("/lab/runs", protocolRunsRouter);
app.route("/me/safety-certs", safetyCertsMeRouter);
app.route("/me/lab/runs", protocolRunsMeRouter);
// Sprint 82 — Lab onboarding playbook + roster + skill MRI.
app.route("/lab-groups", labGroupsRouter);
app.route("/me/lab", meLabRouter);
// Sprint 83 — AI lab authoring + symptom-driven troubleshooting.
// aiLabRouter handles /draft-protocol + /draft-equipment-manual at
// /ai/lab; the per-protocol troubleshooting CRUD lives at
// /lab/protocols/:slug/troubleshooting; symptom-search at
// /lab/troubleshoot.
app.route("/ai/lab", aiLabRouter);
app.route("/lab", labTroubleshootRouter);
app.route("/lab", labProtocolsTroubleshootingRouter);

// Pre-warm the search index in the background so the first user query
// doesn't pay the embedding-build cost.
prewarmSearchIndex();

// Sprint 52 — promote the configured user to admin if no admin exists.
bootstrapAdmin(env.BOOTSTRAP_ADMIN_USERNAME);

// Sprint 69 — register external-source ingest cron jobs and start the
// runner. Set DISABLE_JOB_RUNNER=1 in tests / one-off CLI invocations
// where a setInterval would leak resources or hit external services.
if (process.env.DISABLE_JOB_RUNNER !== "1") {
  registerJob(ingestArxivJob);
  registerJob(ingestOpenAlexJob);
  registerJob(ingestPubmedJob);
  // Sprint 71 — funding feed.
  registerJob(ingestNihGrantsJob);
  registerJob(ingestNsfGrantsJob);
  registerJob(ingestGrantsGovJob);
  registerJob(notifyGrantMatchesJob);
  // Sprint 72 — engagement.
  registerJob(claimExternalAuthorshipsByOrcidJob);
  registerJob(harvestSocialResearcherPostsJob);
  // Sprint 73 — exam mastery framework.
  registerJob(finalizeStaleExamAttemptsJob);
  // Sprint 80 — daily cert-expiry warnings (30d/7d/1d ahead).
  registerJob(notifyExpiringCertsJob);
  // S108 — hard-delete soft-deleted users after the 30-day grace
  // period + expire the login-attempts ring buffer.
  registerJob(hardDeleteSoftDeletedUsersJob);
  registerJob(cleanupOldLoginAttemptsJob);
  startJobRunner();
}

export { app };

const port = env.PORT;
// Long-running SSE/streaming AI responses can exceed Bun's default
// 10s request idle timeout, which causes proxy socket hangups in dev.
const idleTimeout = parseInt(process.env.IDLE_TIMEOUT_SECONDS || "120");

if (import.meta.main) {
  console.log(`Axiomic server starting on port ${port}`);
  if (env.DEV_AUTH_BYPASS === "1" && env.NODE_ENV !== "production") {
    console.warn(
      `⚠️  DEV_AUTH_BYPASS enabled — every request is authed as "${env.DEV_AUTH_BYPASS_USER}". DO NOT USE IN PRODUCTION.`,
    );
  }
  warnOnInsecureConfig();
}

// Bun.serve passes (req, server) when a `websocket` handler is set.
// We hijack /api/v1/ws upgrades and delegate everything else to Hono.
type WSData = { userId: string | null; subscriptions: Set<string> };

export default {
  port,
  idleTimeout,
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
      // Clients can subscribe to per-article reaction streams or to
      // per-draft collaboration channels (Sprint 40). Other message
      // kinds are ignored for v1.
      try {
        const text = typeof raw === "string" ? raw : new TextDecoder().decode(raw);
        const msg = JSON.parse(text);
        if (msg && msg.type === "subscribe_article" && typeof msg.slug === "string") {
          subscribeArticle(ws, msg.slug);
        } else if (
          msg &&
          msg.type === "subscribe_draft" &&
          (msg.kind === "lesson" || msg.kind === "paper" || msg.kind === "capstone") &&
          typeof msg.targetId === "string"
        ) {
          subscribeDraft(ws, msg.kind as DraftKind, msg.targetId);
          broadcastDraftPresence(msg.kind as DraftKind, msg.targetId);
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
