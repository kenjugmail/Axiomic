import { useEffect, useState } from "react";
import type { CodeQuestion as Q } from "@axiomic/types";
import { runCodeAgainstTests, type TestRunResult } from "../../lib/pyodide";

interface Props {
  question: Q;
  value: string | undefined;
  onChange: (v: string) => void;
  review?: { correct: boolean };
}

// Encode the answer the same way the server expects: { passed, total }
// JSON-stringified. The host's existing answer plumbing then routes it
// through submit unchanged.
function encodeAnswer(passed: number, total: number): string {
  return JSON.stringify({ passed, total });
}

// Pull existing code (if any) out of localStorage scoped per question,
// so the user's draft survives page reloads and modal close/open.
function loadDraft(qid: string, fallback: string): string {
  try {
    const stored = localStorage.getItem(`axiomic-code-${qid}`);
    return stored ?? fallback;
  } catch {
    return fallback;
  }
}
function saveDraft(qid: string, code: string) {
  try {
    localStorage.setItem(`axiomic-code-${qid}`, code);
  } catch {
    // ignore quota errors
  }
}

export function CodeQuestion({ question, onChange, review }: Props) {
  const [code, setCode] = useState(() => loadDraft(question.id, question.starterCode));
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<TestRunResult[] | null>(null);
  const [output, setOutput] = useState("");
  const [loadingPyodide, setLoadingPyodide] = useState(false);
  const [hasRunOnce, setHasRunOnce] = useState(false);

  useEffect(() => {
    saveDraft(question.id, code);
  }, [code, question.id]);

  const handleRun = async () => {
    setRunning(true);
    setLoadingPyodide(!hasRunOnce);
    try {
      const r = await runCodeAgainstTests(code, question.functionName, question.tests);
      setResults(r.results);
      setOutput(r.output);
      const passed = r.results.filter((x) => x.passed).length;
      onChange(encodeAnswer(passed, question.tests.length));
      setHasRunOnce(true);
    } finally {
      setRunning(false);
      setLoadingPyodide(false);
    }
  };

  const passedCount = results?.filter((r) => r.passed).length ?? 0;
  const totalCount = question.tests.length;

  return (
    <div className="space-y-3">
      <div className="rounded-md border border-border overflow-hidden">
        <div className="px-3 py-1.5 bg-muted/50 text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border flex items-center justify-between">
          <span>Python · numpy available as np</span>
          <span className="font-mono">def {question.functionName}(...)</span>
        </div>
        <textarea
          value={code}
          onChange={(e) => setCode(e.target.value)}
          disabled={!!review}
          spellCheck={false}
          rows={Math.max(8, code.split("\n").length + 1)}
          className="w-full p-3 font-mono text-xs bg-card text-foreground outline-none resize-y leading-relaxed"
          style={{ tabSize: 4 }}
        />
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={handleRun}
          disabled={running || !!review}
          className="px-3 py-1.5 text-sm rounded-md bg-primary text-primary-foreground font-medium disabled:opacity-50 transition-colors"
        >
          {loadingPyodide
            ? "Loading Python…"
            : running
              ? "Running…"
              : "Run tests"}
        </button>
        {results && (
          <span
            className={`text-xs px-2 py-0.5 rounded-full ${
              passedCount === totalCount
                ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                : "bg-amber-500/10 text-amber-700 dark:text-amber-400"
            }`}
          >
            {passedCount} / {totalCount} tests passing
          </span>
        )}
        <button
          onClick={() => setCode(question.starterCode)}
          disabled={running || !!review}
          className="ml-auto text-xs text-muted-foreground hover:text-foreground"
        >
          Reset
        </button>
      </div>

      {results && (
        <div className="rounded-md border border-border divide-y divide-border">
          {results.map((r, i) => (
            <div
              key={i}
              className={`px-3 py-2 text-xs flex items-start gap-2 ${
                r.passed ? "" : "bg-rose-500/5"
              }`}
            >
              <span
                className={`shrink-0 mt-0.5 ${
                  r.passed
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-rose-600 dark:text-rose-400"
                }`}
              >
                {r.passed ? "✓" : "✗"}
              </span>
              <div className="flex-1 min-w-0">
                <div className="font-medium">{r.name}</div>
                {r.error && (
                  <div className="text-rose-700 dark:text-rose-400 font-mono text-[11px] mt-0.5 break-words">
                    {r.error}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {output && (
        <div className="rounded-md border border-border bg-muted/30 p-3">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
            Output
          </div>
          <pre className="text-xs font-mono whitespace-pre-wrap leading-relaxed">
            {output}
          </pre>
        </div>
      )}

      {review && (
        <div
          className={`text-xs px-3 py-2 rounded-md ${
            review.correct
              ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
              : "bg-rose-500/10 text-rose-700 dark:text-rose-400"
          }`}
        >
          {review.correct
            ? `All ${totalCount} tests passing.`
            : `Tests not yet passing — keep iterating.`}
        </div>
      )}
    </div>
  );
}
