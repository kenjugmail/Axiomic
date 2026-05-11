// Sprint 41 — JavaScript kernel for `:::code[js]` cells.
//
// Pyodide is heavy and language-specific to Python. JS runs natively
// in the browser, so we provide a parallel kernel with the same
// shape (RunResult / Display / per-key globals) that runs JavaScript
// in a sandboxed Function-eval. Kernels with the same key share a
// `globals` object exposed as `globalThis` inside the cell.
//
// What we capture per run():
//   - console.log / .info / .warn / .error → stdout / stderr text
//   - Return value of the cell → `Display(kind='text')` if non-null
//     (objects are JSON-pretty-printed, primitives stringified)
//   - Uncaught exceptions → Display(kind='error') with a stack trace.
//
// Constraints. The cell runs in the page's main JS realm — there's no
// hard sandbox. We deliberately strip access to `window`, `document`,
// `localStorage`, `fetch`, and similar globals via a shadowing
// preamble so a cell can't escape into platform APIs by accident.

import type { Display, RunResult } from "./pyodideKernel";

interface JsKernelState {
  // Each kernel key gets its own scratch object; cells share it as
  // `globalThis` so a previous cell's `const x = 1` is visible to
  // the next cell as `globalThis.x`.
  scope: Record<string, unknown>;
  // Sprint 42 — mounted files: cells access them via
  // `axiomicFiles['name']` returning { bytes: Uint8Array, text(): string }.
  files: Map<string, Uint8Array>;
}

const kernels = new Map<string, JsKernelState>();

function getOrCreate(key: string): JsKernelState {
  let k = kernels.get(key);
  if (!k) {
    k = { scope: {}, files: new Map() };
    kernels.set(key, k);
  }
  return k;
}

// Sprint 42 — mount bytes onto a kernel under a virtual file name.
// Cell code can read it via the `axiomicFiles` global the runner
// injects below.
export function mountJsFile(
  kernelKey: string,
  name: string,
  bytes: Uint8Array,
): void {
  const k = getOrCreate(kernelKey);
  k.files.set(name, bytes);
}

// Globals we hide from cell code so accidental side effects on the
// host page surface as ReferenceErrors instead of silently mutating
// platform state. Cells that genuinely need DOM/network can be
// extended later via per-cell capabilities.
const SHADOWED_GLOBALS = [
  "window",
  "document",
  "self",
  "top",
  "parent",
  "frames",
  "localStorage",
  "sessionStorage",
  "indexedDB",
  "fetch",
  "XMLHttpRequest",
  "WebSocket",
  "navigator",
  "history",
  "location",
];

function pretty(value: unknown): string {
  if (value === undefined) return "undefined";
  if (value === null) return "null";
  if (typeof value === "function") return value.toString();
  if (typeof value === "object") {
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return Object.prototype.toString.call(value);
    }
  }
  return String(value);
}

export async function runJs(
  kernelKey: string,
  source: string,
): Promise<RunResult> {
  const kernel = getOrCreate(kernelKey);
  const stdout: string[] = [];
  const stderr: string[] = [];
  const displays: Display[] = [];

  const wrappedConsole = {
    log: (...args: unknown[]) => stdout.push(args.map(pretty).join(" ") + "\n"),
    info: (...args: unknown[]) => stdout.push(args.map(pretty).join(" ") + "\n"),
    warn: (...args: unknown[]) => stderr.push(args.map(pretty).join(" ") + "\n"),
    error: (...args: unknown[]) => stderr.push(args.map(pretty).join(" ") + "\n"),
    dir: (v: unknown) => stdout.push(pretty(v) + "\n"),
  };

  const start = performance.now();
  const shadows = SHADOWED_GLOBALS.map((g) => `let ${g} = undefined;`).join(" ");
  // Sprint 42 — expose mounted files as `axiomicFiles['name'].text()` /
  // `.bytes()` from inside the cell.
  const axiomicFiles: Record<string, { bytes(): Uint8Array; text(): string }> = {};
  for (const [name, bytes] of kernel.files) {
    axiomicFiles[name] = {
      bytes: () => bytes,
      text: () => new TextDecoder().decode(bytes),
    };
  }
  // The cell body runs as the body of an async function so `await`
  // works at the top level. `return (last expression)` lets us
  // capture the cell's value when the source is a single expression.
  const wrapper = `
    "use strict";
    ${shadows}
    return (async () => {
      ${source}
    })();
  `;
  try {
    const fn = new Function("globalThis", "console", "axiomicFiles", wrapper) as (
      g: Record<string, unknown>,
      c: typeof wrappedConsole,
      f: typeof axiomicFiles,
    ) => Promise<unknown>;
    const result = await fn(kernel.scope, wrappedConsole, axiomicFiles);
    if (result !== undefined) {
      displays.push({ kind: "text", data: pretty(result) });
    }
  } catch (err: any) {
    const stack =
      err && err.stack ? String(err.stack) : err ? String(err) : "Unknown error";
    return {
      stdout: stdout.join(""),
      stderr: stderr.join(""),
      displays,
      error: stack,
      durationMs: performance.now() - start,
    };
  }

  return {
    stdout: stdout.join(""),
    stderr: stderr.join(""),
    displays,
    durationMs: performance.now() - start,
  };
}

export function resetJsKernel(kernelKey: string): void {
  kernels.delete(kernelKey);
}
