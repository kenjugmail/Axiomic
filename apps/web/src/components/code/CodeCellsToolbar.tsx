// Sprint 23 — document-level toolbar for runnable code cells.
//
// Renders sticky-top above an article body when at least one code
// cell exists. Buttons:
//   - Run all: sequences each cell's run() in document order (cells
//     share a kernel, so order matters when later cells use earlier
//     state).
//   - Restart kernel: resets the per-document Python namespace,
//     resetting In[N] counters back to 1.
//
// Plus a one-time first-run trust banner: when the article author is
// not the current viewer and the viewer hasn't dismissed the banner
// for that author, show a small notice the first time they hit Run
// anywhere on the page.

import { useEffect, useState } from "react";
import { confirm } from "../../stores/confirm";
import { Loader2, Play, RotateCcw, Shield, X } from "lucide-react";
import {
  getKernel,
  getRunCount,
  isKernelBooted,
  subscribeKernel,
} from "../../lib/pyodideKernel";
import type { CodeCellHandle } from "./CodeCell";

interface Props {
  kernelKey: string;
  cellRefs: React.MutableRefObject<Array<CodeCellHandle | null>>;
  // Article-author username, when known. Drives the first-run trust
  // banner — skipped when the author is the current viewer.
  authorUsername?: string | null;
  viewerUsername?: string | null;
}

export function CodeCellsToolbar({
  kernelKey,
  cellRefs,
  authorUsername,
  viewerUsername,
}: Props) {
  const [runAllBusy, setRunAllBusy] = useState(false);
  const [progress, setProgress] = useState<{ idx: number; total: number } | null>(null);
  const [, force] = useState(0);
  const [trustDismissed, setTrustDismissed] = useState<boolean>(() =>
    isTrustDismissed(authorUsername, viewerUsername),
  );

  // Re-render when this document's kernel runCount changes — the
  // banner reflects whether the kernel has ever been booted.
  useEffect(() => {
    return subscribeKernel(kernelKey, () => force((n) => n + 1));
  }, [kernelKey]);

  const runAll = async () => {
    if (runAllBusy) return;
    setRunAllBusy(true);
    try {
      const cells = cellRefs.current.filter(
        (c): c is CodeCellHandle => c !== null,
      );
      for (let i = 0; i < cells.length; i++) {
        setProgress({ idx: i + 1, total: cells.length });
        const r = await cells[i].run();
        // Stop the chain on the first error so cascading failures
        // don't bury the actual cause.
        if (!r.ok) break;
      }
    } finally {
      setRunAllBusy(false);
      setProgress(null);
    }
  };

  const restart = async () => {
    if (
      !(await confirm({
        title: "Restart the Python kernel?",
        body: "Variables in every cell on this page will be cleared.",
        destructive: true,
      }))
    )
      return;
    await getKernel(kernelKey).reset();
  };

  const showTrust =
    !trustDismissed &&
    authorUsername &&
    viewerUsername &&
    authorUsername !== viewerUsername &&
    !isKernelBooted(kernelKey);

  const totalCells = cellRefs.current.length;
  const runIndex = getRunCount(kernelKey);

  return (
    <div className="sticky top-14 z-20 -mx-4 sm:mx-0 bg-background/85 backdrop-blur border-b border-border">
      <div className="flex items-center justify-between gap-3 px-4 py-2 flex-wrap">
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-muted-foreground">
          <span className="text-primary font-medium">
            {totalCells} runnable cell{totalCells === 1 ? "" : "s"}
          </span>
          {runIndex > 0 && (
            <>
              <span>·</span>
              <span className="font-mono tabular-nums">
                {runIndex} run{runIndex === 1 ? "" : "s"}
              </span>
            </>
          )}
          {progress && (
            <>
              <span>·</span>
              <span className="text-primary">
                running {progress.idx}/{progress.total}
              </span>
            </>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={runAll}
            disabled={runAllBusy || totalCells === 0}
            className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md bg-primary text-primary-foreground font-medium hover:bg-primary/90 disabled:opacity-50"
          >
            {runAllBusy ? (
              <Loader2 className="w-3 h-3 animate-spin" strokeWidth={2} />
            ) : (
              <Play className="w-3 h-3" strokeWidth={2} />
            )}
            Run all
          </button>
          <button
            type="button"
            onClick={restart}
            disabled={runAllBusy || !isKernelBooted(kernelKey)}
            className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-accent/40 disabled:opacity-50"
          >
            <RotateCcw className="w-3 h-3" strokeWidth={2} />
            Restart kernel
          </button>
        </div>
      </div>

      {showTrust && (
        <div className="px-4 pb-2">
          <div className="flex items-start gap-2 text-xs px-3 py-2 rounded-md border border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-200">
            <Shield
              className="w-3.5 h-3.5 flex-shrink-0 mt-0.5"
              strokeWidth={2}
            />
            <div className="flex-1">
              Code on this page is by{" "}
              <strong>@{authorUsername}</strong> and runs in your
              browser sandbox via Pyodide — no server access, no network
              beyond what your browser allows.
            </div>
            <button
              type="button"
              onClick={() => {
                setTrustDismissed(true);
                dismissTrust(authorUsername!, viewerUsername!);
              }}
              className="text-amber-800/70 dark:text-amber-200/70 hover:text-amber-900 dark:hover:text-amber-100"
              aria-label="Dismiss notice"
            >
              <X className="w-3.5 h-3.5" strokeWidth={2} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const TRUST_KEY_PREFIX = "axiomic.codecell.trust:";

function trustKey(authorUsername: string, viewerUsername: string): string {
  return `${TRUST_KEY_PREFIX}${viewerUsername}:${authorUsername}`;
}

function isTrustDismissed(
  authorUsername: string | null | undefined,
  viewerUsername: string | null | undefined,
): boolean {
  if (!authorUsername || !viewerUsername) return true;
  if (authorUsername === viewerUsername) return true;
  try {
    return localStorage.getItem(trustKey(authorUsername, viewerUsername)) === "1";
  } catch {
    return false;
  }
}

function dismissTrust(authorUsername: string, viewerUsername: string): void {
  try {
    localStorage.setItem(trustKey(authorUsername, viewerUsername), "1");
  } catch {
    // ignore
  }
}
