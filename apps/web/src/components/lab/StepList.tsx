import { useState } from "react";
import { Check, ShieldAlert, ClipboardCheck } from "lucide-react";
import type { ProtocolStep } from "@axiomic/types";
import { MarkdownRenderer } from "../MarkdownRenderer";

interface Props {
  steps: ProtocolStep[];
  // Sprint 79 — local-only step ticking. Persistence comes in S80
  // when a protocol_run row owns the per-step state.
  storageKey?: string;
}

function loadChecked(key: string): Set<number> {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return new Set();
    return new Set(arr.filter((n): n is number => typeof n === "number"));
  } catch {
    return new Set();
  }
}

function saveChecked(key: string, set: Set<number>): void {
  try {
    window.localStorage.setItem(key, JSON.stringify([...set]));
  } catch {
    // Ignore quota / privacy-mode failures.
  }
}

export function StepList({ steps, storageKey }: Props) {
  const [checked, setChecked] = useState<Set<number>>(() =>
    storageKey ? loadChecked(storageKey) : new Set(),
  );

  const toggle = (ordinal: number) => {
    const next = new Set(checked);
    if (next.has(ordinal)) next.delete(ordinal);
    else next.add(ordinal);
    setChecked(next);
    if (storageKey) saveChecked(storageKey, next);
  };

  if (steps.length === 0) {
    return (
      <p className="text-sm text-muted-foreground italic">
        No procedure steps authored yet.
      </p>
    );
  }

  return (
    <ol className="space-y-4">
      {steps.map((step) => {
        const isChecked = checked.has(step.ordinal);
        return (
          <li
            key={step.id}
            className={`rounded-lg border bg-card p-4 transition-colors duration-fast ${
              isChecked
                ? "border-emerald-500/40 bg-emerald-500/5"
                : "border-border"
            }`}
          >
            <div className="flex items-start gap-3">
              <button
                type="button"
                onClick={() => toggle(step.ordinal)}
                aria-pressed={isChecked}
                aria-label={`Mark step ${step.ordinal} ${isChecked ? "incomplete" : "complete"}`}
                className={`shrink-0 mt-0.5 w-7 h-7 rounded-full border flex items-center justify-center transition-colors duration-fast ${
                  isChecked
                    ? "bg-emerald-500 border-emerald-500 text-white"
                    : "border-border bg-background text-muted-foreground hover:border-foreground hover:text-foreground"
                }`}
              >
                {isChecked ? (
                  <Check className="w-4 h-4" strokeWidth={2.5} />
                ) : (
                  <span className="text-xs font-mono">{step.ordinal}</span>
                )}
              </button>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-semibold text-foreground mb-1">
                  {step.title}
                </h3>
                <MarkdownRenderer
                  content={step.instructionMd}
                  className="text-sm [&_p]:mb-2 [&_ul]:my-1"
                />
                {step.safetyNotesMd.trim().length > 0 && (
                  <div className="mt-3 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-sm">
                    <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-400 mb-1">
                      <ShieldAlert className="w-3.5 h-3.5" strokeWidth={2} />
                      Safety
                    </div>
                    <MarkdownRenderer
                      content={step.safetyNotesMd}
                      className="text-sm [&_p]:mb-1"
                    />
                  </div>
                )}
                {step.verificationMd.trim().length > 0 && (
                  <div className="mt-3 rounded-md border border-sky-500/30 bg-sky-500/5 px-3 py-2 text-sm">
                    <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-sky-700 dark:text-sky-400 mb-1">
                      <ClipboardCheck className="w-3.5 h-3.5" strokeWidth={2} />
                      Verify
                    </div>
                    <MarkdownRenderer
                      content={step.verificationMd}
                      className="text-sm [&_p]:mb-1"
                    />
                  </div>
                )}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
