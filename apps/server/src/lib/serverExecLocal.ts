// Sprint 46 — Local-process server-side execution backend.
//
// Replaces the S44 stub with a working executor that spawns a child
// process (python3 / node) under a wall-clock timeout + output cap.
// Targets single-host trusted-user deploys; arbitrary public input
// requires a sandboxed runtime (Docker / gVisor / firejail) which is
// a future swap.
//
// Wired in apps/server/src/index.ts when env.SERVER_EXEC_BACKEND is
// 'local'. Otherwise the stub backend keeps returning 'not_enabled'.

import { mkdtemp, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import { eq, inArray } from "drizzle-orm";
import {
  attachments,
  getDb,
  kernelFiles,
} from "@axiomic/db";
import { logger } from "./logger";
import { env } from "./envConfig";
import type {
  ServerExecBackend,
  ServerRunInput,
  ServerRunOutput,
} from "./serverExec";

const PYTHON_CANDIDATES = ["python3", "python"];
const NODE_CANDIDATES = ["node"];

function which(candidates: string[]): string | null {
  for (const cmd of candidates) {
    const found = Bun.spawnSync(["which", cmd], { stdout: "pipe", stderr: "pipe" });
    if (found.exitCode === 0) {
      const out = new TextDecoder().decode(found.stdout).trim();
      if (out) return out;
    }
  }
  return null;
}

// Resolve the caller's mounted kernel files for the given kernelKey
// and write their bytes into a fresh temp directory. The child process
// gets that dir as cwd so `open('files/data.csv')` works from Python
// and `fs.readFileSync('files/data.csv')` works from Node.
async function materializeKernelFiles(
  ownerId: string,
  kernelKey: string,
): Promise<string> {
  const tmp = await mkdtemp(path.join(tmpdir(), "axiomic-exec-"));
  const filesDir = path.join(tmp, "files");
  await mkdtemp(filesDir).catch(() => {});

  const db = getDb();
  const rows = db
    .select({
      name: kernelFiles.name,
      attachmentId: kernelFiles.attachmentId,
      storagePath: attachments.storagePath,
    })
    .from(kernelFiles)
    .innerJoin(attachments, eq(kernelFiles.attachmentId, attachments.id))
    .where(eq(kernelFiles.kernelKey, kernelKey))
    .all();
  if (rows.length === 0) return tmp;

  // Filter to caller-owned kernel files only (defense-in-depth — the
  // unique index on (kernelKey, name, ownerId) already keys per-user,
  // but checking ownership here is cheap and explicit).
  const ownerKernelFiles = db
    .select({ attachmentId: kernelFiles.attachmentId })
    .from(kernelFiles)
    .where(eq(kernelFiles.ownerId, ownerId))
    .all();
  const allowedAttachmentIds = new Set(
    ownerKernelFiles.map((r) => r.attachmentId),
  );

  const uploadsBase =
    env.UPLOADS_STORAGE_PATH ?? path.join(process.cwd(), "uploads");

  for (const row of rows) {
    if (!allowedAttachmentIds.has(row.attachmentId)) continue;
    const src = path.join(uploadsBase, row.storagePath);
    const dst = path.join(filesDir, row.name);
    try {
      const data = await Bun.file(src).arrayBuffer();
      await writeFile(dst, new Uint8Array(data));
    } catch {
      // Skip missing files; the cell will surface the error at runtime.
    }
  }
  // Suppress unused-import lint for inArray (kept for future filtering).
  void inArray;
  return tmp;
}

function clipBytes(buf: Buffer, max: number): { text: string; truncated: boolean } {
  if (buf.length <= max) {
    return { text: buf.toString("utf-8"), truncated: false };
  }
  const head = buf.subarray(0, max).toString("utf-8");
  return { text: head + "\n[output truncated]", truncated: true };
}

export const localProcessBackend: ServerExecBackend = async (
  run: ServerRunInput,
): Promise<ServerRunOutput> => {
  const start = performance.now();

  let cmdPath: string | null;
  let args: string[];
  if (run.language === "python") {
    cmdPath = which(PYTHON_CANDIDATES);
    if (!cmdPath) {
      return {
        status: "failed",
        exitCode: null,
        stdout: "",
        stderr: "",
        error: "python3 (or python) not found on PATH; install it to enable local server execution.",
        durationMs: 0,
      };
    }
    // -I = isolated mode (skip user site-packages, ignore PYTHON* env vars).
    args = ["-I", "-"];
  } else if (run.language === "js") {
    cmdPath = which(NODE_CANDIDATES);
    if (!cmdPath) {
      return {
        status: "failed",
        exitCode: null,
        stdout: "",
        stderr: "",
        error: "node not found on PATH; install Node.js to enable local server JS execution.",
        durationMs: 0,
      };
    }
    args = ["-e", run.source];
  } else {
    return {
      status: "failed",
      exitCode: null,
      stdout: "",
      stderr: "",
      error: `Unsupported language: ${run.language}`,
      durationMs: 0,
    };
  }

  let cwd: string;
  try {
    cwd = await materializeKernelFiles(run.ownerId, run.kernelKey);
  } catch {
    cwd = tmpdir();
  }

  const timeoutMs = env.SERVER_EXEC_TIMEOUT_MS;
  const maxBytes = env.SERVER_EXEC_MAX_OUTPUT_BYTES;

  let timedOut = false;
  let proc: ReturnType<typeof Bun.spawn> | null = null;
  try {
    proc = Bun.spawn([cmdPath, ...args], {
      cwd,
      stdin: run.language === "python" ? "pipe" : "ignore",
      stdout: "pipe",
      stderr: "pipe",
      env: {
        // Strip the parent process's env to a minimal subset. Cells
        // shouldn't see DATABASE_URL, signing keys, etc.
        PATH: process.env.PATH ?? "/usr/bin:/bin",
        HOME: process.env.HOME ?? "/tmp",
        LANG: process.env.LANG ?? "C.UTF-8",
        AXIOMIC_KERNEL_KEY: run.kernelKey,
      },
    });

    if (run.language === "python" && proc.stdin) {
      // Bun.spawn returns a FileSink for stdin when set to 'pipe'.
      // It exposes write() + end() methods directly.
      const sink = proc.stdin as unknown as {
        write(chunk: string | Uint8Array): unknown;
        end?(): unknown;
      };
      sink.write(run.source);
      sink.end?.();
    }

    const killTimer = setTimeout(() => {
      timedOut = true;
      proc?.kill("SIGKILL");
    }, timeoutMs);

    const stdoutPromise =
      proc.stdout && proc.stdout instanceof ReadableStream
        ? new Response(proc.stdout).arrayBuffer().then((a) => Buffer.from(a))
        : Promise.resolve(Buffer.alloc(0));
    const stderrPromise =
      proc.stderr && proc.stderr instanceof ReadableStream
        ? new Response(proc.stderr).arrayBuffer().then((a) => Buffer.from(a))
        : Promise.resolve(Buffer.alloc(0));
    const [stdoutBuf, stderrBuf, exitCode] = await Promise.all([
      stdoutPromise,
      stderrPromise,
      proc.exited,
    ]);
    clearTimeout(killTimer);

    const out = clipBytes(stdoutBuf, maxBytes);
    const err = clipBytes(stderrBuf, maxBytes);

    if (timedOut) {
      logger.warn({
        kind: "exec_timeout",
        backend: "local",
        language: run.language,
        kernelKey: run.kernelKey,
        timeoutMs,
        durationMs: Math.round(performance.now() - start),
      });
      return {
        status: "failed",
        exitCode: null,
        stdout: out.text,
        stderr: err.text,
        error: `Timed out after ${Math.round(timeoutMs / 1000)}s`,
        durationMs: Math.round(performance.now() - start),
      };
    }
    if (exitCode !== 0) {
      logger.warn({
        kind: "exec_nonzero_exit",
        backend: "local",
        language: run.language,
        kernelKey: run.kernelKey,
        exitCode,
        durationMs: Math.round(performance.now() - start),
      });
    }
    return {
      status: exitCode === 0 ? "succeeded" : "failed",
      exitCode,
      stdout: out.text,
      stderr: err.text,
      error: exitCode === 0 ? null : `Process exited with code ${exitCode}`,
      durationMs: Math.round(performance.now() - start),
    };
  } catch (e: any) {
    logger.error({
      kind: "exec_backend_threw",
      backend: "local",
      language: run.language,
      kernelKey: run.kernelKey,
      errorMessage: e?.message ?? String(e),
    });
    return {
      status: "failed",
      exitCode: null,
      stdout: "",
      stderr: "",
      error: e?.message ?? "Backend threw",
      durationMs: Math.round(performance.now() - start),
    };
  } finally {
    if (cwd && cwd !== tmpdir()) {
      rm(cwd, { recursive: true, force: true }).catch(() => {});
    }
  }
};
