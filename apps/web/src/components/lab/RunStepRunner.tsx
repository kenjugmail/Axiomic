import { useState } from "react";
import { Check, ShieldAlert, ClipboardCheck } from "lucide-react";
import type {
  ProtocolRunDetailResponse,
  StepUpdateRequest,
} from "@axiomic/types";
import { MarkdownRenderer } from "../MarkdownRenderer";

type Step = ProtocolRunDetailResponse["steps"][number];

interface Props {
  steps: Step[];
  stepState: ProtocolRunDetailResponse["run"]["stepState"];
  // True when the run is owned by the current viewer and is editable
  // (in_progress or rejected — once signed_off the runner is read-only).
  editable: boolean;
  onUpdate: (ordinal: number, body: StepUpdateRequest) => Promise<void>;
}

interface DraftEntry {
  observation: string;
  expanded: boolean;
}

export function RunStepRunner({
  steps,
  stepState,
  editable,
  onUpdate,
}: Props) {
  const [drafts, setDrafts] = useState<Record<string, DraftEntry>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (steps.length === 0) {
    return (
      <p className="text-sm text-muted-foreground italic">
        This protocol has no steps.
      </p>
    );
  }

  const setDraft = (key: string, patch: Partial<DraftEntry>) =>
    setDrafts((prev) => ({
      ...prev,
      [key]: {
        observation:
          patch.observation ??
          prev[key]?.observation ??
          stepState[key]?.observation ??
          "",
        expanded: patch.expanded ?? prev[key]?.expanded ?? false,
      },
    }));

  const submit = async (
    ordinal: number,
    body: StepUpdateRequest,
  ): Promise<void> => {
    setError(null);
    setBusy(String(ordinal));
    try {
      await onUpdate(ordinal, body);
      setDraft(String(ordinal), { expanded: false });
    } catch (err) {
      setError((err as Error)?.message ?? "Update failed");
    } finally {
      setBusy(null);
    }
  };

  const doneCount = Object.values(stepState).filter((s) => s.done).length;

  return (
    <div>
      <div className="text-xs text-muted-foreground mb-3">
        {doneCount} / {steps.length} steps completed
      </div>
      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 mb-3 text-sm text-destructive">
          {error}
        </div>
      )}
      <ol className="space-y-3">
        {steps.map((step) => {
          const key = String(step.ordinal);
          const state = stepState[key];
          const isDone = !!state?.done;
          const draft = drafts[key];
          const observation =
            draft?.observation ?? state?.observation ?? "";
          const isBusy = busy === key;
          const expanded = draft?.expanded ?? false;

          return (
            <li
              key={step.id}
              className={`rounded-lg border bg-card p-4 transition-colors duration-fast ${
                isDone
                  ? "border-emerald-500/40 bg-emerald-500/5"
                  : "border-border"
              }`}
            >
              <div className="flex items-start gap-3">
                <button
                  type="button"
                  disabled={!editable || isBusy}
                  onClick={() => {
                    if (!editable) return;
                    if (isDone) {
                      submit(step.ordinal, { done: false });
                    } else {
                      submit(step.ordinal, {
                        done: true,
                        observation: observation.trim() || undefined,
                      });
                    }
                  }}
                  aria-pressed={isDone}
                  aria-label={`Mark step ${step.ordinal} ${isDone ? "incomplete" : "complete"}`}
                  className={`shrink-0 mt-0.5 w-7 h-7 rounded-full border flex items-center justify-center transition-colors duration-fast ${
                    isDone
                      ? "bg-emerald-500 border-emerald-500 text-white"
                      : "border-border bg-background text-muted-foreground hover:border-foreground hover:text-foreground"
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  {isDone ? (
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

                  {(editable || (state?.observation ?? "").length > 0) && (
                    <details
                      open={expanded || (!editable && !!state?.observation)}
                      onToggle={(e) =>
                        setDraft(key, {
                          expanded: (e.target as HTMLDetailsElement).open,
                        })
                      }
                      className="mt-3 text-xs"
                    >
                      <summary className="cursor-pointer text-muted-foreground">
                        Observation
                        {state?.observation
                          ? ` · ${state.observation.length} chars saved`
                          : ""}
                      </summary>
                      <div className="mt-2 space-y-2">
                        <textarea
                          value={observation}
                          onChange={(e) =>
                            setDraft(key, {
                              observation: e.target.value,
                              expanded: true,
                            })
                          }
                          disabled={!editable || isBusy}
                          rows={3}
                          placeholder="What did you observe? (visible to the mentor at sign-off)"
                          className="w-full px-2 py-1.5 rounded-md border border-input bg-background text-sm font-mono disabled:opacity-50"
                        />
                        {editable && (
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() =>
                              submit(step.ordinal, {
                                done: true,
                                observation: observation.trim() || undefined,
                              })
                            }
                            className="px-3 py-1.5 rounded-md bg-foreground text-background text-xs hover:bg-foreground/90 disabled:opacity-50"
                          >
                            {isBusy ? "Saving…" : "Save observation"}
                          </button>
                        )}
                      </div>
                    </details>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
