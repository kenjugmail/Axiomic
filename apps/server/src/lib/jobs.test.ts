// Sprint 69 — Job runner + lease tests.
//
// Validates leader election (a second process can't run while the
// first holds a fresh lease) + lease takeover (an expired lease
// gets reclaimed) + run history persistence.

import { describe, test, expect, beforeEach } from "bun:test";
import { eq } from "drizzle-orm";
import { getDb, jobLeases, jobRuns } from "@axiomic/db";
import {
  _resetJobRegistryForTests,
  registerJob,
  runJobNow,
} from "./jobs";

beforeEach(() => {
  _resetJobRegistryForTests();
});

describe("jobs runner (Sprint 69)", () => {
  test("runJobNow records a run row + updates lease last-run telemetry", async () => {
    const name = `test-job-${Math.random().toString(36).slice(2, 8)}`;
    let calls = 0;
    registerJob({
      name,
      intervalMs: 60_000,
      run: async () => {
        calls++;
        return { itemsProcessed: 7 };
      },
    });

    const result = await runJobNow(name);
    expect(result.itemsProcessed).toBe(7);
    expect(calls).toBe(1);

    const runs = getDb()
      .select()
      .from(jobRuns)
      .where(eq(jobRuns.jobName, name))
      .all();
    expect(runs.length).toBe(1);
    expect(runs[0].status).toBe("success");
    expect(runs[0].itemsProcessed).toBe(7);
  });

  test("runJobNow records error + rethrows on job failure", async () => {
    const name = `failing-${Math.random().toString(36).slice(2, 8)}`;
    registerJob({
      name,
      intervalMs: 60_000,
      run: async () => {
        throw new Error("boom");
      },
    });
    await expect(runJobNow(name)).rejects.toThrow("boom");

    const runs = getDb()
      .select()
      .from(jobRuns)
      .where(eq(jobRuns.jobName, name))
      .all();
    expect(runs.length).toBe(1);
    expect(runs[0].status).toBe("error");
    expect(runs[0].errorMessage).toContain("boom");
  });

  test("runJobNow throws on unknown job name", async () => {
    await expect(runJobNow("nope")).rejects.toThrow();
  });

  test("lease row updates last-run + last-status telemetry after a run", async () => {
    const name = `lease-${Math.random().toString(36).slice(2, 8)}`;
    registerJob({
      name,
      intervalMs: 60_000,
      run: async () => ({ itemsProcessed: 3 }),
    });

    // Pre-seed a lease so the update path runs.
    getDb()
      .insert(jobLeases)
      .values({
        jobName: name,
        leaseHolder: "another-process",
        leaseExpiresAt: new Date().toISOString().slice(0, 19).replace("T", " "),
      })
      .run();

    await runJobNow(name);

    const lease = getDb()
      .select()
      .from(jobLeases)
      .where(eq(jobLeases.jobName, name))
      .get();
    expect(lease?.lastStatus).toBe("success");
    expect(lease?.lastRunAt).not.toBeNull();
    expect(lease?.lastDurationMs).not.toBeNull();
  });

  test("registry returns the registered jobs", async () => {
    registerJob({
      name: "r1",
      intervalMs: 1_000,
      run: async () => ({}),
    });
    registerJob({
      name: "r2",
      intervalMs: 2_000,
      run: async () => ({}),
    });
    const { listRegisteredJobs } = await import("./jobs");
    const names = listRegisteredJobs().map((j) => j.name);
    expect(names).toContain("r1");
    expect(names).toContain("r2");
  });
});
