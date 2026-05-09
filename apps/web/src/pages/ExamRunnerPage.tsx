// Sprint 73 — Timed exam runner.
//
// Full-screen mode (no Layout wrapping when used inside the existing
// Layout this still works — it just maxes width and dims surrounding
// chrome). Renders one question at a time with:
//
//   - Section + global timer with 5-min and 1-min toasts
//   - Question grid sidebar showing answered / flagged / current
//   - "Mark for review" toggle, prev/next, jump-to-question
//   - Heartbeat persistence: each answer change PUTs to the server
//     immediately + a periodic ping refreshes timeSpentMs.
//   - Auto-submit when the global timer hits 0.
//
// Adaptive mode is rendered through the same surface but the next
// question comes from POST /next-adaptive instead of the manifest.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ChevronLeft, ChevronRight, Flag, Send, X } from "lucide-react";
import type {
  ExamAttemptState,
  ExamQuestionPayload,
  ExamSubmitResponse,
} from "@axiomic/types";
import { api } from "../lib/api";
import { Skeleton } from "../components/ui";

interface FlatQuestion extends ExamQuestionPayload {
  globalIndex: number;
}

function flattenSections(state: ExamAttemptState): FlatQuestion[] {
  const out: FlatQuestion[] = [];
  for (const sec of state.sections) {
    for (const q of sec.questions) {
      out.push({ ...q, globalIndex: out.length });
    }
  }
  return out;
}

function formatTimer(ms: number): string {
  if (ms < 0) ms = 0;
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function ExamRunnerPage() {
  const { slug, attemptId } = useParams<{ slug: string; attemptId: string }>();
  const navigate = useNavigate();
  const [state, setState] = useState<ExamAttemptState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<ExamSubmitResponse | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  // Local mirror of answers — keyed by questionId. We update both
  // optimistically and reconcile from server fetches. Sprint 75:
  // tracks essay free-text alongside selectedIndex.
  const [localAnswers, setLocalAnswers] = useState<
    Map<
      string,
      {
        selectedIndex: number | null;
        essayResponse: string | null;
        flagged: boolean;
      }
    >
  >(new Map());

  // Time-on-question tracking. The current question's "entered at"
  // tick — we delta against this when the user moves forward to add
  // to timeSpentMs. Also fed into a 30s heartbeat.
  const lastEnterRef = useRef<number>(Date.now());

  const flat = useMemo<FlatQuestion[]>(
    () => (state ? flattenSections(state) : []),
    [state],
  );

  const loadState = useCallback(async () => {
    if (!attemptId) return;
    try {
      const s = await api.exams.getAttempt(attemptId);
      setState(s);
      const next = new Map<
        string,
        {
          selectedIndex: number | null;
          essayResponse: string | null;
          flagged: boolean;
        }
      >();
      for (const a of s.answers) {
        next.set(a.questionId, {
          selectedIndex: a.selectedIndex,
          essayResponse: a.essayResponse ?? null,
          flagged: a.flagged,
        });
      }
      setLocalAnswers(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load attempt");
    }
  }, [attemptId]);

  useEffect(() => {
    loadState();
  }, [loadState]);

  // Tick the clock every second.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // Time-warning toasts at 5m and 1m before the global expiry.
  const warnedRef = useRef<{ five: boolean; one: boolean }>({
    five: false,
    one: false,
  });
  useEffect(() => {
    if (!state?.expiresAt) return;
    const remaining = Date.parse(state.expiresAt) - now;
    if (remaining <= 0 && !state.completedAt && !result && !submitting) {
      // Auto-submit on expiry.
      doSubmit("Time's up — auto-submitting.");
      return;
    }
    if (
      !warnedRef.current.five &&
      remaining <= 5 * 60_000 &&
      remaining > 4 * 60_000
    ) {
      warnedRef.current.five = true;
      setToast("5 minutes remaining");
    }
    if (
      !warnedRef.current.one &&
      remaining <= 60_000 &&
      remaining > 0
    ) {
      warnedRef.current.one = true;
      setToast("1 minute remaining");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [now, state?.expiresAt]);

  // Auto-clear toast after 4s.
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(id);
  }, [toast]);

  const persistAnswer = useCallback(
    async (
      q: FlatQuestion,
      patch: {
        selectedIndex?: number | null;
        essayResponse?: string | null;
        flagged?: boolean;
      },
    ) => {
      if (!attemptId) return;
      const elapsed = Date.now() - lastEnterRef.current;
      const existing = localAnswers.get(q.id);
      const merged = {
        selectedIndex:
          patch.selectedIndex !== undefined
            ? patch.selectedIndex
            : (existing?.selectedIndex ?? null),
        essayResponse:
          patch.essayResponse !== undefined
            ? patch.essayResponse
            : (existing?.essayResponse ?? null),
        flagged:
          patch.flagged !== undefined
            ? patch.flagged
            : (existing?.flagged ?? false),
      };
      setLocalAnswers((prev) => {
        const next = new Map(prev);
        next.set(q.id, merged);
        return next;
      });
      try {
        const body: {
          questionId: string;
          selectedIndex?: number | null;
          essayResponse?: string | null;
          flagged: boolean;
          timeSpentMs: number;
        } = {
          questionId: q.id,
          flagged: merged.flagged,
          timeSpentMs: Math.min(elapsed, 30 * 60_000),
        };
        // Only forward the field that was actually patched so the
        // server doesn't clobber the other.
        if (patch.selectedIndex !== undefined) {
          body.selectedIndex = merged.selectedIndex;
        }
        if (patch.essayResponse !== undefined) {
          body.essayResponse = merged.essayResponse;
        }
        await api.exams.recordAnswer(attemptId, body);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to save answer");
      }
    },
    [attemptId, localAnswers],
  );

  const moveTo = useCallback(
    (idx: number) => {
      if (idx < 0 || idx >= flat.length) return;
      setCurrentIndex(idx);
      lastEnterRef.current = Date.now();
    },
    [flat.length],
  );

  const doSubmit = useCallback(
    async (note?: string) => {
      if (!attemptId || submitting || result) return;
      setSubmitting(true);
      try {
        const r = await api.exams.submitAttempt(attemptId);
        setResult(r);
        if (note) setToast(note);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to submit");
      } finally {
        setSubmitting(false);
      }
    },
    [attemptId, submitting, result],
  );

  if (error) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-500">
          {error}
        </div>
        <Link to="/exams" className="text-sm text-primary hover:underline mt-4 inline-block">
          ← All exams
        </Link>
      </div>
    );
  }
  if (!state) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8">
        <Skeleton className="h-8 w-1/2 mb-3" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  // Score-report view: render after submit (or on a previously-
  // completed attempt that already has a score).
  if (result || state.completedAt) {
    const r = result;
    return (
      <div className="max-w-3xl mx-auto px-4 py-8">
        <Link to={`/exams/${slug}`} className="text-sm text-primary hover:underline">
          ← Back to exam
        </Link>
        <h1 className="font-display text-2xl font-semibold tracking-tight mt-3">
          Score report
        </h1>
        {r ? (
          <>
            <div className="rounded-lg border border-border bg-card p-6 mt-4">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Total scaled
              </div>
              <div className="font-mono font-semibold text-4xl mt-1">
                {r.scaledTotal}
              </div>
              {r.percentileTotal != null && (
                <div className="text-sm text-muted-foreground mt-1">
                  {r.percentileTotal}th percentile
                </div>
              )}
              <div className="text-xs text-muted-foreground mt-2">
                {r.rawTotal} questions correct
              </div>
            </div>
            <h2 className="font-display text-lg font-semibold mt-6 mb-3">
              By section
            </h2>
            <div className="space-y-2">
              {Object.entries(r.sections).map(([slug, sec]) => (
                <div
                  key={slug}
                  className="rounded-lg border border-border bg-card p-3 flex items-center justify-between"
                >
                  <div>
                    <div className="text-sm font-medium">{slug}</div>
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground mt-0.5">
                      {sec.raw} correct
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-mono font-semibold text-base">
                      {sec.scaled}
                    </div>
                    {sec.percentile != null && (
                      <div className="text-[10px] text-muted-foreground">
                        {sec.percentile}th pct
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : (
          <p className="text-sm text-muted-foreground mt-4">
            Final score: <span className="font-mono font-semibold">{state.scoreScaled ?? "—"}</span>
          </p>
        )}
      </div>
    );
  }

  const q = flat[currentIndex];
  const sectionTitle = state.sections.find((s) =>
    s.questions.some((qq) => qq.id === q?.id),
  )?.slug;
  const remainingMs = state.expiresAt
    ? Math.max(0, Date.parse(state.expiresAt) - now)
    : 0;
  const answer = q ? localAnswers.get(q.id) : undefined;

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Top bar */}
      <div className="border-b border-border bg-card/50 backdrop-blur sticky top-0 z-10 px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-3 text-sm">
          <button
            type="button"
            onClick={() => {
              if (
                window.confirm(
                  "Leave without submitting? Your progress is saved but you'll be back on the exam page.",
                )
              ) {
                navigate(`/exams/${slug}`);
              }
            }}
            className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
          >
            <X className="w-4 h-4" />
            Exit
          </button>
          <span className="text-muted-foreground">·</span>
          <span className="font-medium uppercase tracking-wider text-[10px]">
            {sectionTitle}
          </span>
        </div>
        <div className="font-mono text-sm">
          {state.expiresAt ? formatTimer(remainingMs) : "—"}
        </div>
      </div>

      <div className="flex-1 flex flex-col md:flex-row max-w-6xl w-full mx-auto px-4 py-6 gap-6">
        {/* Question grid sidebar */}
        <aside className="md:w-44 flex-shrink-0 order-2 md:order-1">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
            Questions
          </div>
          <div className="grid grid-cols-8 md:grid-cols-5 gap-1.5">
            {flat.map((qq, i) => {
              const a = localAnswers.get(qq.id);
              const isCurrent = i === currentIndex;
              const isAnswered =
                qq.type === "essay"
                  ? Boolean(a?.essayResponse && a.essayResponse.trim().length > 0)
                  : a?.selectedIndex != null;
              const isFlagged = a?.flagged;
              return (
                <button
                  key={qq.id}
                  type="button"
                  onClick={() => moveTo(i)}
                  className={`text-xs h-8 rounded border transition-colors relative ${
                    isCurrent
                      ? "border-primary bg-primary/10 text-primary"
                      : isAnswered
                        ? "border-emerald-500/40 bg-emerald-500/10"
                        : "border-border text-muted-foreground hover:bg-accent/40"
                  }`}
                  aria-current={isCurrent}
                  aria-label={`Question ${i + 1}${isAnswered ? " (answered)" : ""}${isFlagged ? " (flagged)" : ""}`}
                >
                  {i + 1}
                  {isFlagged && (
                    <Flag className="absolute top-0 right-0 w-2.5 h-2.5 text-amber-500" />
                  )}
                </button>
              );
            })}
          </div>
        </aside>

        {/* Question pane */}
        <main className="flex-1 order-1 md:order-2">
          {!q ? (
            <p className="text-sm text-muted-foreground italic">
              No questions in this attempt.
            </p>
          ) : (
            <>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
                Question {currentIndex + 1} of {flat.length}
              </div>
              <div className="prose prose-sm max-w-none dark:prose-invert mb-4 whitespace-pre-wrap">
                {q.promptMd}
              </div>
              {q.type === "essay" ? (
                <div className="space-y-3">
                  {q.rubricMd && (
                    <details className="rounded-lg border border-border bg-card/50 px-3 py-2 text-xs">
                      <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                        Rubric (max score: {q.maxEssayScore ?? 6})
                      </summary>
                      <div className="mt-2 whitespace-pre-wrap text-foreground">
                        {q.rubricMd}
                      </div>
                    </details>
                  )}
                  <textarea
                    value={answer?.essayResponse ?? ""}
                    onChange={(e) =>
                      persistAnswer(q, { essayResponse: e.target.value })
                    }
                    placeholder="Compose your response here. Plain text or Markdown."
                    rows={18}
                    className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm font-mono leading-relaxed resize-y"
                  />
                  <div className="text-[10px] text-muted-foreground">
                    {(answer?.essayResponse ?? "").trim().split(/\s+/).filter(Boolean).length}{" "}
                    words · scored on submit
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  {q.options.map((opt, i) => {
                    const selected = answer?.selectedIndex === i;
                    return (
                      <button
                        key={opt.label}
                        type="button"
                        onClick={() => persistAnswer(q, { selectedIndex: i })}
                        className={`w-full text-left rounded-lg border p-3 transition-colors ${
                          selected
                            ? "border-primary bg-primary/10"
                            : "border-border bg-card hover:border-primary/40"
                        }`}
                      >
                        <span className="font-mono text-xs font-semibold mr-3 text-muted-foreground">
                          {opt.label}
                        </span>
                        <span className="text-sm whitespace-pre-wrap">{opt.text}</span>
                      </button>
                    );
                  })}
                </div>
              )}
              <div className="mt-4 flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() =>
                    persistAnswer(q, { flagged: !(answer?.flagged ?? false) })
                  }
                  className={`text-xs px-3 py-1.5 rounded-md border inline-flex items-center gap-1.5 ${
                    answer?.flagged
                      ? "border-amber-500 bg-amber-500/10 text-amber-500"
                      : "border-border text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Flag className="w-3.5 h-3.5" />
                  {answer?.flagged ? "Flagged" : "Mark for review"}
                </button>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => moveTo(currentIndex - 1)}
                    disabled={currentIndex === 0}
                    className="text-xs px-3 py-1.5 rounded-md border border-border hover:bg-accent/40 disabled:opacity-50 inline-flex items-center gap-1"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                    Prev
                  </button>
                  <button
                    type="button"
                    onClick={() => moveTo(currentIndex + 1)}
                    disabled={currentIndex === flat.length - 1}
                    className="text-xs px-3 py-1.5 rounded-md border border-border hover:bg-accent/40 disabled:opacity-50 inline-flex items-center gap-1"
                  >
                    Next
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </>
          )}
        </main>
      </div>

      <div className="border-t border-border bg-card/50 px-4 py-3 sticky bottom-0">
        <div className="max-w-6xl mx-auto flex items-center justify-end">
          <button
            type="button"
            onClick={() => {
              if (
                window.confirm(
                  "Submit your exam now? You won't be able to change answers after this.",
                )
              ) {
                doSubmit();
              }
            }}
            disabled={submitting}
            className="text-sm px-4 py-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 inline-flex items-center gap-1.5 font-medium"
          >
            <Send className="w-4 h-4" />
            {submitting ? "Submitting…" : "Submit exam"}
          </button>
        </div>
      </div>

      {toast && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 rounded-md border border-amber-500/40 bg-amber-500/10 text-amber-500 text-sm px-4 py-2 shadow z-20">
          {toast}
        </div>
      )}
    </div>
  );
}
