// Sprint 69 — In-process cron with SQLite-based leader election.
//
// Why a custom runner instead of node-cron / a worker queue?
//
//   - We're already a single-host SQLite deployment; pulling in
//     Redis/BullMQ would be an order of magnitude more
//     infrastructure than the workload justifies.
//   - But we DO need leader election so two server processes
//     (e.g. during a rolling restart, or a future multi-replica
//     setup) don't both ingest arXiv at once and double-count.
//
// The lease pattern: each job owns a row in `job_leases` with a
// `leaseExpiresAt` timestamp. To run a job, a process atomically
// updates that row (`UPDATE … WHERE leaseExpiresAt < now() OR
// leaseHolder = me`) and runs only if the update affected 1 row.
// SQLite's serializable isolation makes this safe under concurrency.
//
// Lease takeover: if the lease holder dies mid-run, its lease
// expires after 2× the job's interval, and another process picks up
// on the next tick. We don't try to recover the in-flight run; the
// next scheduled run starts fresh.

import { randomUUID } from "crypto";
import { and, desc, eq, lt, or, sql } from "drizzle-orm";
import { getDb, jobLeases, jobRuns } from "@axiomic/db";

export interface JobDefinition {
  name: string;
  intervalMs: number;
  // Lease duration multiplier. 2 means a stuck lease takes 2×
  // intervalMs to expire. Default is 2.
  leaseExpiryMultiplier?: number;
  run: (ctx: JobRunContext) => Promise<JobRunResult>;
}

export interface JobRunContext {
  jobName: string;
  startedAt: Date;
}

export interface JobRunResult {
  itemsProcessed?: number;
  // Free-form success message surfaced in the admin panel.
  message?: string;
}

interface RegisteredJob extends JobDefinition {
  timer?: ReturnType<typeof setInterval>;
}

const REGISTRY = new Map<string, RegisteredJob>();
let JOB_RUNNER_ENABLED = true;
const PROCESS_ID = randomUUID();

export function disableJobRunner(): void {
  JOB_RUNNER_ENABLED = false;
}

export function getProcessId(): string {
  return PROCESS_ID;
}

export function registerJob(def: JobDefinition): void {
  REGISTRY.set(def.name, { ...def });
}

export function listRegisteredJobs(): JobDefinition[] {
  return [...REGISTRY.values()].map(({ timer: _t, ...rest }) => rest);
}

function nowIso(): string {
  return new Date().toISOString().slice(0, 19).replace("T", " ");
}

function plusMsIso(ms: number): string {
  return new Date(Date.now() + ms)
    .toISOString()
    .slice(0, 19)
    .replace("T", " ");
}

// Try to claim the lease for `jobName`. Returns true if we now own
// the lease, false if another process holds it.
function claimLease(
  jobName: string,
  leaseDurationMs: number,
): boolean {
  const db = getDb();
  const now = nowIso();
  const expiresAt = plusMsIso(leaseDurationMs);

  const existing = db
    .select({ holder: jobLeases.leaseHolder, expires: jobLeases.leaseExpiresAt })
    .from(jobLeases)
    .where(eq(jobLeases.jobName, jobName))
    .get();

  if (!existing) {
    try {
      db.insert(jobLeases)
        .values({
          jobName,
          leaseHolder: PROCESS_ID,
          leaseExpiresAt: expiresAt,
        })
        .run();
      return true;
    } catch {
      // Another process inserted concurrently; fall through to the
      // update path.
    }
  }

  // Update only if the lease is ours OR expired.
  const result = db
    .update(jobLeases)
    .set({ leaseHolder: PROCESS_ID, leaseExpiresAt: expiresAt })
    .where(
      and(
        eq(jobLeases.jobName, jobName),
        or(
          eq(jobLeases.leaseHolder, PROCESS_ID),
          lt(jobLeases.leaseExpiresAt, now),
        ),
      ),
    )
    .run();
  // better-sqlite3 returns { changes }. drizzle wraps it.
  const changes = (result as unknown as { changes?: number }).changes ?? 0;
  return changes > 0;
}

function recordRunStart(jobName: string): string {
  const id = randomUUID();
  getDb()
    .insert(jobRuns)
    .values({
      id,
      jobName,
      startedAt: nowIso(),
      status: "running",
    })
    .run();
  return id;
}

function recordRunFinish(
  runId: string,
  jobName: string,
  status: "success" | "error",
  durationMs: number,
  itemsProcessed: number,
  errorMessage?: string,
): void {
  const db = getDb();
  db.update(jobRuns)
    .set({
      finishedAt: nowIso(),
      status,
      durationMs,
      itemsProcessed,
      errorMessage: errorMessage ?? null,
    })
    .where(eq(jobRuns.id, runId))
    .run();
  db.update(jobLeases)
    .set({
      lastRunAt: nowIso(),
      lastStatus: status,
      lastErrorMessage: errorMessage ?? null,
      lastDurationMs: durationMs,
    })
    .where(eq(jobLeases.jobName, jobName))
    .run();

  // Trim per-job run history to ~50 most recent rows so this table
  // doesn't grow without bound.
  try {
    const cutoff = db
      .select({ startedAt: jobRuns.startedAt })
      .from(jobRuns)
      .where(eq(jobRuns.jobName, jobName))
      .orderBy(desc(jobRuns.startedAt))
      .limit(1)
      .offset(50)
      .get();
    if (cutoff) {
      db.delete(jobRuns)
        .where(
          and(
            eq(jobRuns.jobName, jobName),
            sql`${jobRuns.startedAt} <= ${cutoff.startedAt}`,
          ),
        )
        .run();
    }
  } catch {
    // Trim failure is non-fatal.
  }
}

// Run a registered job ONCE, regardless of lease state. Used by the
// admin "Run now" button + tests. Never call this from the timer
// path; that's what `tick()` is for.
export async function runJobNow(jobName: string): Promise<JobRunResult> {
  const job = REGISTRY.get(jobName);
  if (!job) throw new Error(`Unknown job: ${jobName}`);

  const startedAt = new Date();
  const runId = recordRunStart(jobName);
  const t0 = performance.now();
  try {
    const result = await job.run({ jobName: job.name, startedAt });
    const durationMs = Math.round(performance.now() - t0);
    recordRunFinish(
      runId,
      jobName,
      "success",
      durationMs,
      result.itemsProcessed ?? 0,
    );
    return result;
  } catch (err) {
    const durationMs = Math.round(performance.now() - t0);
    const message = err instanceof Error ? err.message : String(err);
    recordRunFinish(runId, jobName, "error", durationMs, 0, message);
    throw err;
  }
}

async function tick(jobName: string): Promise<void> {
  if (!JOB_RUNNER_ENABLED) return;
  const job = REGISTRY.get(jobName);
  if (!job) return;
  const leaseDurationMs =
    job.intervalMs * (job.leaseExpiryMultiplier ?? 2);
  if (!claimLease(jobName, leaseDurationMs)) {
    return; // another process holds the lease
  }
  try {
    await runJobNow(jobName);
  } catch (err) {
    console.error(`[jobs] ${jobName} failed:`, err);
  }
}

export function startJobRunner(): void {
  if (!JOB_RUNNER_ENABLED) return;
  for (const job of REGISTRY.values()) {
    if (job.timer) continue;
    job.timer = setInterval(() => {
      tick(job.name).catch((err) =>
        console.error(`[jobs] tick(${job.name}) crashed:`, err),
      );
    }, job.intervalMs);
    // Don't keep the event loop alive solely for cron timers when
    // the rest of the server has shut down.
    if (typeof (job.timer as { unref?: () => void }).unref === "function") {
      (job.timer as { unref: () => void }).unref();
    }
  }
}

export function stopJobRunner(): void {
  for (const job of REGISTRY.values()) {
    if (job.timer) {
      clearInterval(job.timer);
      job.timer = undefined;
    }
  }
}

// Test-only — drop registry between describe blocks.
export function _resetJobRegistryForTests(): void {
  stopJobRunner();
  REGISTRY.clear();
}
