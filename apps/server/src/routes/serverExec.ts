// Sprint 44 — Server-side execution router.
//
// POST /server-exec/runs creates a queued run, hands it to the
// configured backend, persists the result, and returns the run id.
// GET /server-exec/runs/:id polls. Per-user rate limit caps total
// runs per hour so a noisy cell can't DoS the executor.

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { randomUUID } from "crypto";
import { getDb, serverRuns } from "@axiomic/db";
import { requireAuth } from "../middleware/auth";
import {
  getServerExecBackend,
  isServerExecEnabled,
} from "../lib/serverExec";
import type { Env } from "../env";

export const serverExecRouter = new Hono<Env>();

const RUNS_PER_HOUR = 10;

const submitSchema = z.object({
  kernelKey: z.string().min(1).max(200),
  language: z.enum(["python", "js"]),
  source: z.string().min(1).max(50_000),
});

// GET /server-exec/status — does this deploy have a real executor?
// Public so the client can hide the "Run on server" toggle when not.
serverExecRouter.get("/status", (c) => {
  return c.json({ enabled: isServerExecEnabled() });
});

// POST /server-exec/runs — submit + execute synchronously.
serverExecRouter.post(
  "/runs",
  requireAuth,
  zValidator("json", submitSchema),
  async (c) => {
    const user = c.get("user")!;
    const data = c.req.valid("json");
    const db = getDb();

    // Per-user rate limit — count this user's runs in the last hour.
    const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const countRow = db
      .select({ n: sql<number>`COUNT(*)` })
      .from(serverRuns)
      .where(
        and(
          eq(serverRuns.ownerId, user.id),
          gte(serverRuns.createdAt, since),
        ),
      )
      .get();
    if (Number(countRow?.n ?? 0) >= RUNS_PER_HOUR) {
      return c.json(
        { error: `Rate limit: max ${RUNS_PER_HOUR} server runs per hour.` },
        429,
      );
    }

    const id = randomUUID();
    const startedAt = new Date().toISOString();
    db.insert(serverRuns).values({
      id,
      ownerId: user.id,
      kernelKey: data.kernelKey,
      language: data.language,
      source: data.source,
      status: "running",
      startedAt,
    }).run();

    let result;
    try {
      result = await getServerExecBackend()({
        id,
        ownerId: user.id,
        kernelKey: data.kernelKey,
        language: data.language,
        source: data.source,
      });
    } catch (e: any) {
      result = {
        status: "failed" as const,
        exitCode: 1,
        stdout: "",
        stderr: "",
        error: e?.message ?? "Backend threw",
        durationMs: null,
      };
    }
    const finishedAt = new Date().toISOString();
    db.update(serverRuns)
      .set({
        status: result.status,
        exitCode: result.exitCode,
        stdout: result.stdout,
        stderr: result.stderr,
        error: result.error,
        durationMs: result.durationMs,
        finishedAt,
      })
      .where(eq(serverRuns.id, id))
      .run();

    return c.json({
      id,
      status: result.status,
      exitCode: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr,
      error: result.error,
      durationMs: result.durationMs,
    });
  },
);

// GET /server-exec/runs/:id — poll a run. Owner-only so a guesser
// can't peek at someone else's stdout.
serverExecRouter.get("/runs/:id", requireAuth, async (c) => {
  const user = c.get("user")!;
  const id = c.req.param("id")!;
  const db = getDb();
  const row = db
    .select()
    .from(serverRuns)
    .where(eq(serverRuns.id, id))
    .get();
  if (!row) return c.json({ error: "Run not found" }, 404);
  if (row.ownerId !== user.id) {
    return c.json({ error: "Not your run." }, 403);
  }
  return c.json({
    id: row.id,
    status: row.status,
    language: row.language,
    exitCode: row.exitCode,
    stdout: row.stdout,
    stderr: row.stderr,
    error: row.error,
    durationMs: row.durationMs,
    createdAt: row.createdAt,
    startedAt: row.startedAt,
    finishedAt: row.finishedAt,
  });
});

// GET /server-exec/runs?kernelKey=... — owner's recent runs in a
// kernel scope (for a "history" surface on the cell).
serverExecRouter.get("/runs", requireAuth, async (c) => {
  const user = c.get("user")!;
  const kernelKey = c.req.query("kernelKey");
  const db = getDb();
  const where = kernelKey
    ? and(
        eq(serverRuns.ownerId, user.id),
        eq(serverRuns.kernelKey, kernelKey),
      )
    : eq(serverRuns.ownerId, user.id);
  const rows = db
    .select()
    .from(serverRuns)
    .where(where)
    .orderBy(desc(serverRuns.createdAt))
    .limit(20)
    .all();
  return c.json({
    runs: rows.map((r) => ({
      id: r.id,
      kernelKey: r.kernelKey,
      language: r.language,
      status: r.status,
      exitCode: r.exitCode,
      durationMs: r.durationMs,
      createdAt: r.createdAt,
    })),
  });
});
