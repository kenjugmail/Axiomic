// Sprint 22 — per-key Pyodide kernel with rich output capture.
//
// Built on top of the existing apps/web/src/lib/pyodide.ts singleton
// (used by quiz/CodeQuestion). One Pyodide runtime in the page; we
// scope cell state to a "kernel key" by giving each key its own
// Python globals dict. So multiple papers open in tabs can share the
// loaded numpy + matplotlib without trampling each other's variables.
//
// Outputs we capture per run():
//   - stdout / stderr (print, sys.stderr.write, etc.)
//   - matplotlib figures: plt.show() captures the current figure to a
//     base64 PNG and emits a Display(kind='image_png').
//   - pandas DataFrames passed to display(...) emit Display(kind='html').
//   - Uncaught exceptions: serialized traceback as Display(kind='error').
//
// Kernel boot: enabled lazily on first run() call per key. Booting
// imports numpy + matplotlib (Agg backend) and installs the harness.
// Subsequent runs in the same key skip boot.

import { getPyodide, type PyodideRuntime } from "./pyodide";

export type DisplayKind = "image_png" | "html" | "text" | "error";

export interface Display {
  kind: DisplayKind;
  // For image_png: base64 PNG (no `data:` prefix).
  // For html / text / error: literal payload.
  data: string;
}

export interface RunResult {
  stdout: string;
  stderr: string;
  displays: Display[];
  // Uncaught Python exception, formatted with the traceback.
  error?: string;
  // Wall-clock duration in milliseconds.
  durationMs: number;
}

const HARNESS = String.raw`
# Sprint 22 harness — installs once per kernel key.
import io, sys, json, traceback, base64

# Prevent matplotlib from trying to open a GUI backend.
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

# Each kernel key has its own globals dict, but the harness lives in
# the kernel's *boot* namespace (built into Pyodide). We expose
# helpers _axiomic_run and _axiomic_displays here.

_axiomic_displays = []

def _capture_current_figure():
    fig = plt.gcf()
    if not fig.get_axes():
        plt.close(fig)
        return False
    buf = io.BytesIO()
    fig.savefig(buf, format="png", bbox_inches="tight", dpi=110)
    plt.close(fig)
    encoded = base64.b64encode(buf.getvalue()).decode("ascii")
    _axiomic_displays.append({"kind": "image_png", "data": encoded})
    return True

# Patch plt.show so user code that calls it captures the figure.
_orig_show = plt.show
def _patched_show(*args, **kwargs):
    _capture_current_figure()
plt.show = _patched_show

# display(obj) helper — emits HTML when the obj has _repr_html_ (e.g.
# pandas DataFrame), text otherwise.
def display(obj):
    repr_html = getattr(obj, "_repr_html_", None)
    if callable(repr_html):
        html = repr_html()
        if html:
            _axiomic_displays.append({"kind": "html", "data": str(html)})
            return
    _axiomic_displays.append({"kind": "text", "data": str(obj)})

def _axiomic_run(code, ns):
    """Run user code against the namespace ns. Capture stdout/stderr,
    matplotlib figures, and exceptions. Returns a JSON-encoded dict."""
    global _axiomic_displays
    _axiomic_displays = []
    out_buf = io.StringIO()
    err_buf = io.StringIO()
    old_out, old_err = sys.stdout, sys.stderr
    sys.stdout, sys.stderr = out_buf, err_buf
    error = None
    try:
        # Inject helpers into the user namespace so they can call
        # display() or plt.* directly.
        ns["display"] = display
        ns["plt"] = plt
        # Compile + exec to keep the user's tracebacks readable.
        exec(compile(code, "<cell>", "exec"), ns)
        # If the user left a figure open without calling plt.show(),
        # flush it so the cell still shows the plot.
        if plt.get_fignums():
            _capture_current_figure()
    except SystemExit:
        # Treat sys.exit() as a quiet stop — no traceback noise.
        pass
    except BaseException:
        error = traceback.format_exc()
    finally:
        sys.stdout, sys.stderr = old_out, old_err
    return json.dumps({
        "stdout": out_buf.getvalue(),
        "stderr": err_buf.getvalue(),
        "displays": list(_axiomic_displays),
        "error": error,
    })
`;

// Per-kernel-key state. Each key gets its own Python globals dict so
// cells inside the same paper share state but cells in different
// papers don't collide.
interface KernelState {
  // Promise resolves once the harness is installed for THIS runtime.
  // The shared singleton runs the harness once globally (the harness
  // is idempotent — re-running it just re-binds plt.show).
  ready: Promise<void>;
  // The Python `dict` used as globals when running cells under this
  // key. Stored as a JS-side proxy via `runtime.globals.get("...")`.
  namespaceVar: string;
  // Sprint 23 — Jupyter-style In/Out execution counter. Starts at 0;
  // increments on every successful (non-throwing) run().
  runCount: number;
}

const STATES = new Map<string, KernelState>();
// Sprint 23 — listeners notified when a kernel's runCount changes
// (after a successful run() or reset()). Used by the toolbar to
// re-render its banner without polling.
const LISTENERS = new Map<string, Set<() => void>>();
let harnessInstalled: Promise<void> | null = null;

function notify(key: string): void {
  const set = LISTENERS.get(key);
  if (!set) return;
  for (const fn of set) {
    try {
      fn();
    } catch {
      // listener error shouldn't break run flow
    }
  }
}

export function subscribeKernel(key: string, fn: () => void): () => void {
  let set = LISTENERS.get(key);
  if (!set) {
    set = new Set();
    LISTENERS.set(key, set);
  }
  set.add(fn);
  return () => {
    set!.delete(fn);
    if (set!.size === 0) LISTENERS.delete(key);
  };
}

export function getRunCount(key: string): number {
  return STATES.get(key)?.runCount ?? 0;
}

export function isKernelBooted(key: string): boolean {
  return STATES.has(key) && harnessInstalled !== null;
}

async function ensureHarness(runtime: PyodideRuntime): Promise<void> {
  if (harnessInstalled) return harnessInstalled;
  harnessInstalled = (async () => {
    await runtime.runPythonAsync(HARNESS);
  })();
  return harnessInstalled;
}

function namespaceVarFor(key: string): string {
  // Sanitize the key into a valid Python identifier suffix.
  const safe = key.replace(/[^A-Za-z0-9_]/g, "_").slice(0, 60);
  return `_axiomic_ns_${safe}`;
}

async function ensureKernel(key: string): Promise<{
  runtime: PyodideRuntime;
  namespaceVar: string;
  state: KernelState;
}> {
  const runtime = await getPyodide();
  await ensureHarness(runtime);

  let state = STATES.get(key);
  if (!state) {
    const namespaceVar = namespaceVarFor(key);
    const ready = (async () => {
      // Initialize the namespace with __name__ so user code that
      // uses `if __name__ == "__main__":` works.
      await runtime.runPythonAsync(`${namespaceVar} = {"__name__": "__main__"}`);
    })();
    state = { ready, namespaceVar, runCount: 0 };
    STATES.set(key, state);
  }
  await state.ready;
  return { runtime, namespaceVar: state.namespaceVar, state };
}

export interface PyodideKernel {
  run(code: string): Promise<RunResult & { runIndex: number }>;
  reset(): Promise<void>;
  // Sprint 42 — mount a fetched file into the in-browser virtual FS
  // so cells can `open('/files/foo.csv').read()`. Files written here
  // persist across runs in the same kernel until reset() is called.
  mountFile(name: string, bytes: Uint8Array): Promise<void>;
}

export function getKernel(key: string): PyodideKernel {
  return {
    async mountFile(name: string, bytes: Uint8Array): Promise<void> {
      const { runtime } = await ensureKernel(key);
      try {
        // Make sure /files exists; mkdir is idempotent on Pyodide FS
        // when used with safe ignoring of EEXIST.
        try {
          (runtime.FS as any).mkdir("/files");
        } catch {
          // already exists
        }
        (runtime.FS as any).writeFile(`/files/${name}`, bytes);
      } catch {
        // best-effort; the cell will surface the missing file at run
      }
    },
    async run(code: string): Promise<RunResult & { runIndex: number }> {
      const t0 = performance.now();
      try {
        const { runtime, namespaceVar, state } = await ensureKernel(key);
        // Use globals.set to ferry user code without escaping.
        runtime.globals.set("_axiomic_user_code", code);
        const resultJson = (await runtime.runPythonAsync(
          `_axiomic_run(_axiomic_user_code, ${namespaceVar})`,
        )) as string;
        const parsed = JSON.parse(resultJson) as {
          stdout: string;
          stderr: string;
          displays: Display[];
          error: string | null;
        };
        // Increment the kernel's run counter — Jupyter-style "In [N]"
        // marker. Errors still increment so the user sees ordering.
        state.runCount += 1;
        notify(key);
        return {
          stdout: parsed.stdout,
          stderr: parsed.stderr,
          displays: parsed.displays,
          error: parsed.error ?? undefined,
          durationMs: performance.now() - t0,
          runIndex: state.runCount,
        };
      } catch (e: any) {
        return {
          stdout: "",
          stderr: "",
          displays: [],
          error: e?.message ?? "Pyodide kernel error",
          durationMs: performance.now() - t0,
          runIndex: STATES.get(key)?.runCount ?? 0,
        };
      }
    },
    async reset(): Promise<void> {
      const state = STATES.get(key);
      if (!state) return;
      const runtime = await getPyodide();
      await runtime.runPythonAsync(
        `${state.namespaceVar} = {"__name__": "__main__"}`,
      );
      state.runCount = 0;
      notify(key);
    },
  };
}

// Test-only: clear all per-key state. Not used in production code.
export function _resetAllForTests(): void {
  STATES.clear();
  harnessInstalled = null;
}
