// Sprint 44 — Server-side execution backend.
//
// The default backend is a stub that returns `not_enabled` for every
// submission. A production deploy can swap in a real executor (Docker
// container, firejail process, gVisor sandbox) by calling
// `setServerExecBackend()` at boot.
//
// Backends receive a sanitized run record and return the result; the
// router persists status + output and the client polls. Backends are
// expected to enforce their own resource limits (CPU, memory, wall
// time, network egress).

export interface ServerRunInput {
  id: string;
  ownerId: string;
  kernelKey: string;
  language: "python" | "js";
  source: string;
}

export interface ServerRunOutput {
  status: "succeeded" | "failed" | "not_enabled";
  exitCode: number | null;
  stdout: string;
  stderr: string;
  error: string | null;
  durationMs: number | null;
}

export type ServerExecBackend = (
  run: ServerRunInput,
) => Promise<ServerRunOutput>;

const stubBackend: ServerExecBackend = async () => ({
  status: "not_enabled",
  exitCode: null,
  stdout: "",
  stderr: "",
  error:
    "Server-side execution is not enabled on this Axiomic instance. " +
    "Cells will continue to run in-browser via Pyodide / the JS kernel. " +
    "To enable, deploy a sandboxed executor and call setServerExecBackend().",
  durationMs: null,
});

let backend: ServerExecBackend = stubBackend;

export function setServerExecBackend(fn: ServerExecBackend): void {
  backend = fn;
}

export function getServerExecBackend(): ServerExecBackend {
  return backend;
}

export function isServerExecEnabled(): boolean {
  return backend !== stubBackend;
}
