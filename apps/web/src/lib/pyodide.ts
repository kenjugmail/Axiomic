// Lazy-loaded Pyodide runtime, shared across all CodeQuestion mounts on
// the page. The first call triggers the ~6 MB WASM download from jsdelivr;
// subsequent calls return the cached instance immediately.
//
// Pyodide is loaded from CDN rather than bundled to keep the main JS
// bundle small. Users who never open a code question never pay the cost.

const PYODIDE_VERSION = "0.26.4";
const PYODIDE_CDN_URL = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;

declare global {
  interface Window {
    loadPyodide?: (config?: { indexURL?: string }) => Promise<PyodideRuntime>;
  }
}

// Subset of the Pyodide API we actually use. The real type is bigger.
export interface PyodideRuntime {
  runPython(code: string): unknown;
  runPythonAsync(code: string): Promise<unknown>;
  globals: {
    set(name: string, value: unknown): void;
    get(name: string): unknown;
  };
}

let runtimePromise: Promise<PyodideRuntime> | null = null;

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const s = document.createElement("script");
    s.src = src;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(s);
  });
}

// Returns a singleton Pyodide runtime. Safe to call multiple times in
// parallel — the same in-flight promise is returned.
export function getPyodide(): Promise<PyodideRuntime> {
  if (runtimePromise) return runtimePromise;
  runtimePromise = (async () => {
    await loadScript(`${PYODIDE_CDN_URL}pyodide.js`);
    if (!window.loadPyodide) {
      throw new Error("Pyodide failed to expose loadPyodide on window");
    }
    const py = await window.loadPyodide({ indexURL: PYODIDE_CDN_URL });
    // Pre-import numpy so test cases that use np.* don't pay the cost
    // on first run. Pyodide ships with numpy included.
    await py.runPythonAsync("import numpy as np");
    return py;
  })();
  return runtimePromise;
}

// Run a piece of user-supplied code against an array of test cases.
// `code` must define a function named `functionName`. Returns one record
// per test — caller renders them.
export interface TestRunResult {
  name: string;
  passed: boolean;
  error?: string;
}

export async function runCodeAgainstTests(
  code: string,
  functionName: string,
  tests: Array<{ name: string; inputs: string[]; check: string }>,
): Promise<{ results: TestRunResult[]; output: string }> {
  const py = await getPyodide();

  // Capture print() output so the user can see what their code prints.
  py.runPython(`
import io, sys
_axiomic_stdout = io.StringIO()
sys.stdout = _axiomic_stdout
`);

  py.globals.set("user_code", code);
  py.globals.set("function_name", functionName);
  py.globals.set("tests_json", JSON.stringify(tests));

  const harness = `
import json, traceback
import numpy as np

results = []
user_globals = {"np": np}
exec(user_code, user_globals)
fn = user_globals.get(function_name)
tests_arr = json.loads(tests_json)
if fn is None:
    for test in tests_arr:
        results.append({
            "name": test["name"],
            "passed": False,
            "error": f"Function '{function_name}' not defined",
        })
else:
    for test in tests_arr:
        try:
            inputs = [eval(s, user_globals) for s in test["inputs"]]
            result = fn(*inputs)
            check_globals = {"result": result, "np": np, "inputs": inputs}
            passed = bool(eval(test["check"], check_globals))
            results.append({"name": test["name"], "passed": passed})
        except Exception as e:
            results.append({
                "name": test["name"],
                "passed": False,
                "error": f"{type(e).__name__}: {e}",
            })

json.dumps(results)
`;

  let resultsJson: string;
  try {
    resultsJson = py.runPython(harness) as string;
  } catch (err: any) {
    return {
      results: tests.map((t) => ({
        name: t.name,
        passed: false,
        error: err?.message ?? "Pyodide execution failed",
      })),
      output: "",
    };
  }
  const output = (py.runPython("_axiomic_stdout.getvalue()") as string) ?? "";
  py.runPython("sys.stdout = sys.__stdout__");

  let results: TestRunResult[];
  try {
    results = JSON.parse(resultsJson);
  } catch {
    results = tests.map((t) => ({
      name: t.name,
      passed: false,
      error: "Failed to parse harness output",
    }));
  }
  return { results, output };
}
