// Digital-SAT-parity: Desmos graphing calculator panel. Mirrors
// the official Digital SAT integration — a togglable floating
// panel available during math sections.
//
// Loads Desmos's calculator.js from their CDN with an API key
// (VITE_DESMOS_API_KEY) using the same script-singleton pattern
// as TurnstileWidget. When the key is unset or the script fails
// to load, the panel surfaces a clear "Calculator unavailable"
// message + Retry button so the rest of the exam keeps working.
//
// The Desmos instance is kept alive (only CSS-hidden) when the
// panel is closed so getState() keeps streaming. State is
// debounced-saved every ~5s and once more on beforeunload so a
// refresh restores the panel.

import { useEffect, useRef, useState } from "react";
import { Calculator, RefreshCw } from "lucide-react";

declare global {
  interface Window {
    Desmos?: {
      GraphingCalculator: (
        element: HTMLElement,
        options?: Record<string, unknown>,
      ) => DesmosInstance;
    };
  }
}

interface DesmosInstance {
  getState: () => Record<string, unknown>;
  setState: (state: Record<string, unknown>) => void;
  setExpressions: (
    expressions: Array<{ id?: string; latex: string }>,
  ) => void;
  destroy: () => void;
}

const SCRIPT_BASE = "https://www.desmos.com/api/v1.7/calculator.js";
let scriptPromise: Promise<void> | null = null;

function loadDesmosScript(apiKey: string): Promise<void> {
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve, reject) => {
    if (typeof window === "undefined") return resolve();
    if (window.Desmos) return resolve();
    const url = `${SCRIPT_BASE}?apiKey=${encodeURIComponent(apiKey)}`;
    const existing = document.querySelector(
      `script[src^="${SCRIPT_BASE}"]`,
    );
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () =>
        reject(new Error("desmos_script_load_failed")),
      );
      return;
    }
    const s = document.createElement("script");
    s.src = url;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("desmos_script_load_failed"));
    document.head.appendChild(s);
  });
  return scriptPromise;
}

interface Props {
  open: boolean;
  onClose: () => void;
  // Initial state restored on mount (from the server's
  // calculator_state_json).
  initialState?: Record<string, unknown> | null;
  // Optional pre-seed expressions for the current question. Applied
  // only when there's no learner-saved initial state.
  preseedExpressions?: Array<{ latex: string }> | null;
  // Debounced (~5s) save callback.
  onStateChange?: (state: Record<string, unknown>) => void;
}

const SAVE_DEBOUNCE_MS = 5000;

export function DesmosCalculator({
  open,
  onClose,
  initialState,
  preseedExpressions,
  onStateChange,
}: Props) {
  const apiKey = import.meta.env.VITE_DESMOS_API_KEY as string | undefined;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const instanceRef = useRef<DesmosInstance | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onStateChangeRef = useRef(onStateChange);
  onStateChangeRef.current = onStateChange;
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [retryNonce, setRetryNonce] = useState(0);

  // Mount/unmount the Desmos instance. We instantiate once the
  // panel first becomes visible — there's no point loading the
  // script ahead of time.
  useEffect(() => {
    if (!open) return;
    if (!apiKey) {
      setLoadError("DESMOS_API_KEY not set");
      return;
    }
    if (instanceRef.current) return;
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    loadDesmosScript(apiKey)
      .then(() => {
        if (cancelled || !containerRef.current || !window.Desmos) return;
        const inst = window.Desmos.GraphingCalculator(containerRef.current, {
          expressions: true,
          settingsMenu: true,
          zoomButtons: true,
          border: false,
        });
        instanceRef.current = inst;
        if (initialState) {
          try {
            inst.setState(initialState);
          } catch {
            // Corrupt state — start fresh.
          }
        } else if (preseedExpressions && preseedExpressions.length > 0) {
          inst.setExpressions(preseedExpressions);
        }
        // Wire an observer onto the calculator's state changes by
        // polling getState() against a JSON-stringified previous
        // snapshot. Desmos's official "observe" API is the cleaner
        // approach but its surface varies across versions; polling
        // is robust and only runs while the panel is open.
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setLoadError(err instanceof Error ? err.message : "Failed to load");
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, apiKey, retryNonce]);

  // Debounced state saver. Polls the live calculator every second
  // (cheap; only string-compares) and emits a coalesced save when
  // the snapshot changes and 5s have elapsed since the last save.
  const lastSavedRef = useRef<string>("");
  useEffect(() => {
    if (!open) return;
    const inst = instanceRef.current;
    if (!inst) return;
    const id = setInterval(() => {
      try {
        const cur = JSON.stringify(inst.getState());
        if (cur === lastSavedRef.current) return;
        // Debounce: schedule a save 5s out; subsequent diffs
        // restart the timer.
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
        saveTimerRef.current = setTimeout(() => {
          try {
            const next = JSON.stringify(inst.getState());
            if (next !== lastSavedRef.current) {
              lastSavedRef.current = next;
              onStateChangeRef.current?.(JSON.parse(next));
            }
          } catch {
            /* ignore */
          }
        }, SAVE_DEBOUNCE_MS);
      } catch {
        /* ignore — calculator might be tearing down */
      }
    }, 1000);
    return () => {
      clearInterval(id);
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [open]);

  // Flush on beforeunload so we don't lose the last 5s of work.
  useEffect(() => {
    const handler = () => {
      const inst = instanceRef.current;
      if (!inst || !onStateChangeRef.current) return;
      try {
        const cur = JSON.stringify(inst.getState());
        if (cur !== lastSavedRef.current) {
          onStateChangeRef.current(JSON.parse(cur));
        }
      } catch {
        /* ignore */
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);

  // Destroy on unmount.
  useEffect(() => {
    return () => {
      try {
        instanceRef.current?.destroy();
      } catch {
        /* ignore */
      }
      instanceRef.current = null;
    };
  }, []);

  if (!open) return null;

  return (
    <aside
      data-testid="desmos-panel"
      className="fixed right-4 bottom-4 z-30 w-[min(720px,95vw)] h-[min(560px,80vh)] rounded-xl border border-border bg-card shadow-floating flex flex-col"
    >
      <header className="px-3 py-2 border-b border-border flex items-center justify-between gap-2 shrink-0">
        <div className="inline-flex items-center gap-1.5 text-sm font-medium">
          <Calculator className="w-4 h-4" />
          Desmos calculator
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close calculator"
          className="text-muted-foreground hover:text-foreground text-sm px-2"
        >
          ×
        </button>
      </header>
      <div className="flex-1 relative">
        {loadError ? (
          <div
            data-testid="desmos-unavailable"
            className="absolute inset-0 flex flex-col items-center justify-center text-center px-6 gap-3"
          >
            <Calculator className="w-8 h-8 text-muted-foreground" />
            <div className="text-sm font-medium">Calculator unavailable</div>
            <p className="text-xs text-muted-foreground max-w-xs">
              {apiKey
                ? "Couldn't load the Desmos calculator from the CDN. Check your connection and try again."
                : "The Desmos API key isn't configured for this build. The calculator panel will work once VITE_DESMOS_API_KEY is set."}
            </p>
            {apiKey && (
              <button
                type="button"
                onClick={() => {
                  // Allow a fresh load attempt.
                  scriptPromise = null;
                  setLoadError(null);
                  setRetryNonce((n) => n + 1);
                }}
                className="text-xs px-3 py-1.5 rounded-md border border-border hover:bg-accent/40 inline-flex items-center gap-1.5"
              >
                <RefreshCw className="w-3 h-3" />
                Retry
              </button>
            )}
          </div>
        ) : (
          <div ref={containerRef} className="absolute inset-0" />
        )}
        {loading && (
          <div className="absolute bottom-2 left-2 text-[10px] uppercase tracking-wider text-muted-foreground">
            Loading…
          </div>
        )}
      </div>
    </aside>
  );
}
