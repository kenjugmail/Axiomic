import { useMemo, useState } from "react";
import type { MlSandboxQuestion as Q } from "@axiomic/types";
import { getPyodide } from "../../lib/pyodide";

interface Props {
  question: Q;
  value: string | undefined;
  onChange: (v: string) => void;
  review?: { correct: boolean };
}

interface Envelope {
  graded: boolean;
  correct: boolean;
  params: Record<string, number>;
  metrics: Record<string, number>;
}

function parseEnvelope(value: string | undefined): Envelope | null {
  if (!value) return null;
  try {
    const r = JSON.parse(value);
    if (r && typeof r === "object" && r.graded === true) return r as Envelope;
  } catch {
    /* not graded yet */
  }
  return null;
}

function meets(
  m: number,
  op: Q["target"]["op"],
  v: number,
): boolean {
  if (op === "lt") return m < v;
  if (op === "lte") return m <= v;
  if (op === "gt") return m > v;
  return m >= v;
}

// Interactive ML sandbox: sliders feed params into a Python harness
// (reuses the shared Pyodide runtime, numpy preloaded) that sets a
// `metrics` dict. Pass when the target metric meets the op. Emits
// the same {graded,correct} envelope as free_response so the
// synchronous lesson/exam graders need no special case.
export function MlSandboxQuestion({ question, value, onChange, review }: Props) {
  const existing = useMemo(() => parseEnvelope(value), [value]);
  const [params, setParams] = useState<Record<string, number>>(() => {
    if (existing?.params) return existing.params;
    const o: Record<string, number> = {};
    for (const p of question.params) o[p.name] = p.default;
    return o;
  });
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const locked = !!review;

  const metrics = existing?.metrics ?? null;
  const pass = existing?.correct ?? false;

  async function run() {
    if (running) return;
    setRunning(true);
    setError(null);
    try {
      const py = await getPyodide();
      const assigns = question.params
        .map((p) => `${p.name} = ${Number(params[p.name] ?? p.default)}`)
        .join("\n");
      const code = `${assigns}\n${question.harnessCode}\nimport json as _json\n_json.dumps(metrics)`;
      // Pyodide is single-threaded so a true infinite loop can't be
      // force-aborted in-thread, but a wall-clock timeout covers the
      // realistic slow-harness case and guarantees the UI never hangs
      // waiting forever. On timeout we fall through to the catch and
      // emit NO graded envelope.
      const TIMEOUT_MS = 6000;
      const out = (await Promise.race([
        py.runPythonAsync(code),
        new Promise<never>((_, reject) =>
          setTimeout(
            () =>
              reject(
                new Error(
                  "Harness took too long (>6s). Keep loops/epochs small.",
                ),
              ),
            TIMEOUT_MS,
          ),
        ),
      ])) as string;
      const m = JSON.parse(out) as Record<string, number>;
      const tv = m[question.target.metric];
      const correct =
        typeof tv === "number" &&
        meets(tv, question.target.op, question.target.value);
      const env: Envelope = {
        graded: true,
        correct,
        params: { ...params },
        metrics: m,
      };
      onChange(JSON.stringify(env));
    } catch (e: any) {
      setError(e?.message ?? "Run failed");
    } finally {
      setRunning(false);
    }
  }

  const opLabel = { lt: "<", lte: "≤", gt: ">", gte: "≥" }[
    question.target.op
  ];

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        {question.params.map((p) => (
          <div key={p.name}>
            <div className="flex items-center justify-between text-xs mb-1">
              <label className="text-muted-foreground">{p.label}</label>
              <span className="font-mono tabular-nums">
                {params[p.name] ?? p.default}
              </span>
            </div>
            <input
              type="range"
              aria-label={`${p.label} (${p.min}–${p.max})`}
              min={p.min}
              max={p.max}
              step={p.step}
              value={params[p.name] ?? p.default}
              disabled={locked}
              onChange={(e) =>
                setParams((s) => ({
                  ...s,
                  [p.name]: parseFloat(e.target.value),
                }))
              }
              className="w-full"
            />
          </div>
        ))}
      </div>

      <div className="text-xs text-muted-foreground">
        Target: <span className="font-mono">{question.target.metric}</span>{" "}
        {opLabel} {question.target.value}
      </div>

      {!locked && (
        <button
          type="button"
          onClick={run}
          disabled={running}
          className="inline-flex items-center px-3 py-1.5 text-sm rounded-md bg-primary text-primary-foreground font-medium disabled:opacity-50"
        >
          {running ? "Running…" : "Run"}
        </button>
      )}
      {error && <p className="text-xs text-rose-600">{error}</p>}

      {metrics && (
        <div
          className={`rounded-md border p-3 text-sm ${
            pass
              ? "border-emerald-500/40 bg-emerald-500/10"
              : "border-amber-500/40 bg-amber-500/10"
          }`}
        >
          <div
            className={`font-medium mb-1 ${
              pass
                ? "text-emerald-700 dark:text-emerald-400"
                : "text-amber-700 dark:text-amber-400"
            }`}
          >
            {pass ? "Target reached" : "Not there yet — adjust and re-run"}
          </div>
          <ul className="font-mono text-xs space-y-0.5">
            {Object.entries(metrics).map(([k, v]) => (
              <li key={k}>
                {k}: {typeof v === "number" ? v.toFixed(4) : String(v)}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
