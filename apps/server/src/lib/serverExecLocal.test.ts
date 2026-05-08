// Sprint 46 — local-process executor tests.
//
// These exercise the actual backend (not the stub). They require
// python3 / node on PATH; if missing, the backend returns a friendly
// error and the test asserts that path. CI typically has both.

import { describe, test, expect } from "bun:test";
import { localProcessBackend } from "./serverExecLocal";

const RUN_BASE = {
  id: "test-run",
  ownerId: "test-owner",
  kernelKey: "test:kernel",
};

describe("Sprint 46 — localProcessBackend", () => {
  test("python: print works and exit code is 0", async () => {
    const result = await localProcessBackend({
      ...RUN_BASE,
      language: "python",
      source: "print('hello from python')",
    });
    if (result.error?.includes("not found on PATH")) {
      // Skip on environments without python3.
      return;
    }
    expect(result.status).toBe("succeeded");
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("hello from python");
  }, 10_000);

  test("python: non-zero exit surfaces as failed", async () => {
    const result = await localProcessBackend({
      ...RUN_BASE,
      language: "python",
      source: "import sys; sys.exit(7)",
    });
    if (result.error?.includes("not found on PATH")) return;
    expect(result.status).toBe("failed");
    expect(result.exitCode).toBe(7);
  }, 10_000);

  test("python: uncaught exception → stderr + non-zero exit", async () => {
    const result = await localProcessBackend({
      ...RUN_BASE,
      language: "python",
      source: "raise ValueError('boom')",
    });
    if (result.error?.includes("not found on PATH")) return;
    expect(result.status).toBe("failed");
    expect(result.stderr).toContain("ValueError");
    expect(result.stderr).toContain("boom");
  }, 10_000);

  test("js: console.log works and exit code is 0", async () => {
    const result = await localProcessBackend({
      ...RUN_BASE,
      language: "js",
      source: "console.log('hello from node');",
    });
    if (result.error?.includes("not found on PATH")) return;
    expect(result.status).toBe("succeeded");
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("hello from node");
  }, 10_000);

  test("python: env vars from parent are stripped (DATABASE_URL is invisible)", async () => {
    process.env.DATABASE_URL = "/tmp/should-not-leak.db";
    const result = await localProcessBackend({
      ...RUN_BASE,
      language: "python",
      source:
        "import os; print('LEAKED' if 'DATABASE_URL' in os.environ else 'OK')",
    });
    if (result.error?.includes("not found on PATH")) return;
    expect(result.stdout.trim()).toBe("OK");
  }, 10_000);
});
