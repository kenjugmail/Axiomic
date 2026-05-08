// Sprint 22 — runnable code cell.
//
// Renders a Python code block + Run button + collapsible output. State
// is shared across cells in the same kernel key (e.g. all cells in
// one paper share variables). Output kinds: stdout/stderr text,
// matplotlib figures (base64 PNGs), pandas tables (HTML), tracebacks.
//
// v1 uses a plain monospace textarea as the editor. Tab inserts two
// spaces; ⌘/Ctrl+Enter runs the cell. CodeMirror is a follow-up.

import { useEffect, useImperativeHandle, useRef, useState, forwardRef } from "react";
import { Loader2, Play, RotateCcw, Terminal } from "lucide-react";
import { getKernel, type Display, type RunResult } from "../../lib/pyodideKernel";
import { runJs } from "../../lib/jsKernel";

interface Props {
  // Original code from the markdown directive. The user can edit
  // freely; "Reset cell" reverts to this string.
  initialCode: string;
  // Scoping key — typically `paper:${slug}` or `lesson:${nodeId}`.
  // Cells with the same kernelKey share Python state.
  kernelKey: string;
  // Sprint 41 — runtime selector. Defaults to 'python' (Pyodide).
  // 'js' / 'javascript' route to the lightweight in-page JS kernel.
  language?: string;
}

// Sprint 23 — exposed via the forwarded ref so the document-level
// Run-all toolbar can sequence cells in document order.
export interface CodeCellHandle {
  run: () => Promise<{ ok: boolean }>;
}

export const CodeCell = forwardRef<CodeCellHandle, Props>(function CodeCell(
  { initialCode, kernelKey, language },
  ref,
) {
  const [code, setCode] = useState(initialCode);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<(RunResult & { runIndex: number }) | null>(null);
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  const jsRunCount = useRef(0);
  const isJs = language === "js" || language === "javascript";
  const langLabel = isJs ? "JavaScript" : "Python";

  // Sync `code` when initialCode changes (e.g. the parent re-renders
  // with a new directive content). Don't clobber unsaved edits — only
  // update on a clean state.
  useEffect(() => {
    setCode((prev) => (prev === "" ? initialCode : prev));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const run = async (): Promise<{ ok: boolean }> => {
    if (running) return { ok: false };
    setRunning(true);
    try {
      if (isJs) {
        // JS kernels are scoped to a `js:` prefix so a Python and a
        // JS cell with the same surface kernelKey don't trample
        // each other's globals. Pyodide's runIndex is per-key; the
        // JS kernel doesn't track one, so we count locally.
        const r = await runJs(`js:${kernelKey}`, code);
        jsRunCount.current += 1;
        setResult({ ...r, runIndex: jsRunCount.current });
        return { ok: !r.error };
      }
      const kernel = getKernel(kernelKey);
      const r = await kernel.run(code);
      setResult(r);
      return { ok: !r.error };
    } finally {
      setRunning(false);
    }
  };

  // Expose run() to the parent so a document-level "Run all" can
  // sequence cells. Memoized via useImperativeHandle.
  useImperativeHandle(ref, () => ({ run }), [run]);

  const reset = () => {
    setCode(initialCode);
    setResult(null);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // ⌘/Ctrl+Enter runs the cell.
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      run();
      return;
    }
    // Tab inserts two spaces (Python convention) instead of moving
    // focus.
    if (e.key === "Tab" && !e.shiftKey) {
      e.preventDefault();
      const ta = taRef.current;
      if (!ta) return;
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      const next = code.slice(0, start) + "    " + code.slice(end);
      setCode(next);
      requestAnimationFrame(() => {
        ta.focus();
        ta.setSelectionRange(start + 4, start + 4);
      });
    }
  };

  // Auto-grow the textarea up to a reasonable cap so the editor doesn't
  // jump around as the user types.
  const lineCount = Math.max(3, code.split("\n").length);
  const rows = Math.min(lineCount + 1, 24);

  const hasOutput =
    result &&
    (result.stdout ||
      result.stderr ||
      result.displays.length > 0 ||
      result.error);

  // In/Out marker — empty before the cell has ever run, dot during
  // the run, the run-index number after.
  const inMarker = running
    ? "[…]"
    : result
      ? `[${result.runIndex}]`
      : "[ ]";

  return (
    <div className="my-4 rounded-lg border border-border bg-card overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-3 py-1.5 border-b border-border bg-muted/30">
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-muted-foreground">
          <span className="font-mono tabular-nums text-primary/80">
            In {inMarker}
          </span>
          <span className="opacity-50">·</span>
          <Terminal className="w-3 h-3" strokeWidth={2} />
          {langLabel}
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={reset}
            disabled={running || code === initialCode}
            className="text-[10px] uppercase tracking-wider px-2 py-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30 inline-flex items-center gap-1"
            title="Revert to original code"
          >
            <RotateCcw className="w-3 h-3" strokeWidth={2} />
            Reset
          </button>
          <button
            type="button"
            onClick={run}
            disabled={running}
            className="text-xs px-2.5 py-0.5 rounded bg-primary text-primary-foreground font-medium hover:bg-primary/90 disabled:opacity-50 inline-flex items-center gap-1"
            title="Run (⌘/Ctrl+Enter)"
          >
            {running ? (
              <Loader2 className="w-3 h-3 animate-spin" strokeWidth={2} />
            ) : (
              <Play className="w-3 h-3" strokeWidth={2} />
            )}
            {running ? "Running…" : "Run"}
          </button>
        </div>
      </div>
      <textarea
        ref={taRef}
        value={code}
        onChange={(e) => setCode(e.target.value)}
        onKeyDown={onKeyDown}
        rows={rows}
        spellCheck={false}
        className="w-full px-3 py-2 bg-background font-mono text-xs leading-relaxed resize-y focus:outline-none focus:ring-2 focus:ring-ring focus:ring-inset"
      />

      {hasOutput && result && (
        <div className="border-t border-border bg-muted/20 px-3 py-2 space-y-2 text-xs">
          {result.stdout && (
            <pre className="font-mono text-[11px] whitespace-pre-wrap leading-relaxed">
              {result.stdout}
            </pre>
          )}
          {result.stderr && (
            <pre className="font-mono text-[11px] whitespace-pre-wrap leading-relaxed text-amber-700 dark:text-amber-300">
              {result.stderr}
            </pre>
          )}
          {result.displays.map((d, i) => (
            <DisplayBlock key={i} d={d} />
          ))}
          {result.error && (
            <pre className="font-mono text-[11px] whitespace-pre-wrap leading-relaxed text-rose-700 dark:text-rose-300 bg-rose-500/5 p-2 rounded border border-rose-500/30">
              {result.error}
            </pre>
          )}
          <div className="text-[10px] text-muted-foreground tabular-nums">
            {result.durationMs.toFixed(0)} ms
          </div>
        </div>
      )}
    </div>
  );
});

function DisplayBlock({ d }: { d: Display }) {
  if (d.kind === "image_png") {
    return (
      <img
        src={`data:image/png;base64,${d.data}`}
        alt="Cell output"
        className="max-w-full rounded border border-border"
      />
    );
  }
  if (d.kind === "html") {
    // pandas DataFrame HTML is mostly tables. Sandbox via a wrapper
    // div with controlled styling — Pyodide-emitted HTML is from the
    // user's own code so we treat it as code-execution output, not
    // adversarial input.
    return (
      <div
        className="overflow-x-auto text-[11px] [&_table]:border-collapse [&_table]:w-auto [&_th]:px-2 [&_th]:py-1 [&_th]:bg-muted [&_th]:text-left [&_th]:font-medium [&_td]:px-2 [&_td]:py-1 [&_td]:border [&_td]:border-border"
        dangerouslySetInnerHTML={{ __html: d.data }}
      />
    );
  }
  if (d.kind === "text") {
    return (
      <pre className="font-mono text-[11px] whitespace-pre-wrap leading-relaxed">
        {d.data}
      </pre>
    );
  }
  // 'error' shape never gets emitted from the Python side directly;
  // exceptions land in result.error. Keep the branch for type safety.
  return (
    <pre className="font-mono text-[11px] whitespace-pre-wrap text-rose-700 dark:text-rose-300">
      {d.data}
    </pre>
  );
}
