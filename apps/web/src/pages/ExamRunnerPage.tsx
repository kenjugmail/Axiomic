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
import { confirm } from "../stores/confirm";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  Calculator,
  Check,
  ChevronLeft,
  ChevronRight,
  Flag,
  Send,
  X,
} from "lucide-react";
import type {
  ExamAttemptState,
  ExamQuestionPayload,
  ExamSubmitResponse,
} from "@axiomic/types";
import { api } from "../lib/api";
import { Skeleton } from "../components/ui";
import { MarkdownRenderer } from "../components/MarkdownRenderer";
import { BreakScreen } from "../components/exam/BreakScreen";
import { DesmosCalculator } from "../components/exam/DesmosCalculator";
import { GridInQuestion } from "../components/exam/GridInQuestion";
import { MultiSelectQuestion } from "../components/exam/MultiSelectQuestion";
import { QuestionImage } from "../components/exam/QuestionImage";

// Sections where the on-screen calculator is available. Real
// Digital SAT: math only. This is per-exam content config in
// principle; for now we hard-code the rule (R&W -> hidden).
function sectionAllowsCalculator(sectionSlug: string | undefined): boolean {
  if (!sectionSlug) return false;
  return /math/i.test(sectionSlug);
}

type FlatQuestion = ExamQuestionPayload & { globalIndex: number };

// Active-section question list. Real Digital SAT navigation is
// strictly within-section — moving across sections happens only
// via the break-then-advance flow. For legacy single-section
// attempts (sectionDeadlines.length === 1) this returns the same
// shape as the previous flatten-all-sections behavior since the
// manifest has one section.
function questionsForSection(
  state: ExamAttemptState,
  idx: number,
): FlatQuestion[] {
  const sec = state.sections[idx];
  if (!sec) return [];
  return sec.questions.map((q, i) => ({ ...q, globalIndex: i }));
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
  // optimistically and reconcile from server fetches. Tracks every
  // variant's response (only the relevant field is non-null per
  // row).
  const [localAnswers, setLocalAnswers] = useState<
    Map<
      string,
      {
        selectedIndex: number | null;
        essayResponse: string | null;
        gridInResponse: string | null;
        selectedIndexes: number[] | null;
        flagged: boolean;
      }
    >
  >(new Map());
  const [advancing, setAdvancing] = useState(false);
  const [calcOpen, setCalcOpen] = useState(false);

  // Time-on-question tracking. The current question's "entered at"
  // tick — we delta against this when the user moves forward to add
  // to timeSpentMs. Also fed into a 30s heartbeat.
  const lastEnterRef = useRef<number>(Date.now());

  const flat = useMemo<FlatQuestion[]>(
    () =>
      state ? questionsForSection(state, state.currentSectionIdx ?? 0) : [],
    [state],
  );

  // Reset the in-section question pointer when the section advances
  // (server bumped state.currentSectionIdx after a break).
  useEffect(() => {
    setCurrentIndex(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.currentSectionIdx]);

  const loadState = useCallback(
    async (alive: () => boolean = () => true) => {
      if (!attemptId) return;
      try {
        const s = await api.exams.getAttempt(attemptId);
        if (!alive()) return; // a newer attemptId superseded this
        setState(s);
        const next = new Map<
          string,
          {
            selectedIndex: number | null;
            essayResponse: string | null;
            gridInResponse: string | null;
            selectedIndexes: number[] | null;
            flagged: boolean;
          }
        >();
        for (const a of s.answers) {
          next.set(a.questionId, {
            selectedIndex: a.selectedIndex,
            essayResponse: a.essayResponse ?? null,
            gridInResponse: a.gridInResponse ?? null,
            selectedIndexes: a.selectedIndexes ?? null,
            flagged: a.flagged,
          });
        }
        setLocalAnswers(next);
      } catch (e) {
        if (alive())
          setError(e instanceof Error ? e.message : "Failed to load attempt");
      }
    },
    [attemptId],
  );

  useEffect(() => {
    let alive = true;
    loadState(() => alive);
    return () => {
      alive = false;
    };
  }, [loadState]);

  // Tick the clock every second.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // Per-section warning toasts at 5m and 1m before the current
  // section's clock hits zero. Reset on every section change so the
  // learner sees both warnings again in the next section.
  const warnedRef = useRef<{ five: boolean; one: boolean; sectionIdx: number }>({
    five: false,
    one: false,
    sectionIdx: 0,
  });
  // The auto-submit is async; without this guard, every 1s tick after
  // expiry would re-fire `doSubmit`/`advance-section` until the first
  // request resolves — generating a flurry of duplicate calls.
  const autoSubmittedRef = useRef(false);

  // Section-advance helper. Either: drops into a break and reloads
  // state; or, when the last section ends, finalizes via submit.
  const advanceSection = useCallback(async () => {
    if (!attemptId || !state) return;
    setAdvancing(true);
    try {
      const r = await api.exams.advanceSection(
        attemptId,
        state.currentSectionIdx ?? 0,
      );
      if (r.done) {
        await doSubmit("Final section ended — submitting.");
      } else {
        await loadState();
        autoSubmittedRef.current = false;
        warnedRef.current = { five: false, one: false, sectionIdx: 0 };
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to advance section");
    } finally {
      setAdvancing(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attemptId, state?.currentSectionIdx]);

  useEffect(() => {
    if (!state) return;
    if (state.completedAt) return;
    if (result || submitting) return;
    // During a break the section clock isn't ticking — handled below.
    if (state.breakUntilAt && Date.parse(state.breakUntilAt) > now) return;
    // Reset warning state when the section index moves.
    if (warnedRef.current.sectionIdx !== state.currentSectionIdx) {
      warnedRef.current = {
        five: false,
        one: false,
        sectionIdx: state.currentSectionIdx,
      };
    }
    const deadlines = state.sectionDeadlines ?? [];
    const dl =
      deadlines[state.currentSectionIdx ?? 0] ??
      (state.expiresAt
        ? { endsAt: state.expiresAt }
        : null);
    if (!dl) return;
    const remaining = Date.parse(dl.endsAt) - now;
    if (remaining <= 0 && !autoSubmittedRef.current) {
      autoSubmittedRef.current = true;
      // Last section in the manifest? auto-submit; otherwise drop
      // into the break + advance state machine.
      const isLast =
        deadlines.length === 0 ||
        (state.currentSectionIdx ?? 0) >= deadlines.length - 1;
      if (isLast) {
        doSubmit("Time's up — auto-submitting.");
      } else {
        setToast("Section time's up — taking a break.");
        advanceSection();
      }
      return;
    }
    if (
      !warnedRef.current.five &&
      remaining <= 5 * 60_000 &&
      remaining > 4 * 60_000
    ) {
      warnedRef.current.five = true;
      setToast("5 minutes remaining in this section");
    }
    if (
      !warnedRef.current.one &&
      remaining <= 60_000 &&
      remaining > 0
    ) {
      warnedRef.current.one = true;
      setToast("1 minute remaining in this section");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [now, state]);

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
        gridInResponse?: string | null;
        selectedIndexes?: number[] | null;
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
        gridInResponse:
          patch.gridInResponse !== undefined
            ? patch.gridInResponse
            : (existing?.gridInResponse ?? null),
        selectedIndexes:
          patch.selectedIndexes !== undefined
            ? patch.selectedIndexes
            : (existing?.selectedIndexes ?? null),
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
          gridInResponse?: string | null;
          selectedIndexes?: number[] | null;
          flagged: boolean;
          timeSpentMs: number;
        } = {
          questionId: q.id,
          flagged: merged.flagged,
          timeSpentMs: Math.min(elapsed, 30 * 60_000),
        };
        // Only forward the fields that were actually patched so the
        // server doesn't clobber siblings.
        if (patch.selectedIndex !== undefined) {
          body.selectedIndex = merged.selectedIndex;
        }
        if (patch.essayResponse !== undefined) {
          body.essayResponse = merged.essayResponse;
        }
        if (patch.gridInResponse !== undefined) {
          body.gridInResponse = merged.gridInResponse;
        }
        if (patch.selectedIndexes !== undefined) {
          body.selectedIndexes = merged.selectedIndexes;
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
                {r.mcCorrectCount ?? r.rawTotal} questions correct
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
        <ReviewByQuestion state={state} />
      </div>
    );
  }

  // Break screen takes the entire viewport when active.
  if (
    state.breakUntilAt &&
    !state.completedAt &&
    Date.parse(state.breakUntilAt) > now - 1000
  ) {
    const nextIdx = (state.currentSectionIdx ?? 0) + 1;
    const nextSlug =
      state.sectionDeadlines?.[nextIdx]?.slug ??
      state.sections[nextIdx]?.slug ??
      null;
    return (
      <BreakScreen
        breakUntilAt={state.breakUntilAt}
        nextSectionTitle={nextSlug}
        onAdvance={advanceSection}
        advancing={advancing}
      />
    );
  }

  const q = flat[currentIndex];
  const activeSectionIdx = state.currentSectionIdx ?? 0;
  const sectionTitle =
    state.sections[activeSectionIdx]?.slug ?? state.sectionSlug ?? "";
  const currentDeadline =
    state.sectionDeadlines?.[activeSectionIdx] ??
    (state.expiresAt
      ? { endsAt: state.expiresAt }
      : null);
  const remainingMs = currentDeadline
    ? Math.max(0, Date.parse(currentDeadline.endsAt) - now)
    : 0;
  const isLastSection =
    (state.sectionDeadlines?.length ?? 1) - 1 <= activeSectionIdx;
  const answer = q ? localAnswers.get(q.id) : undefined;

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Top bar */}
      <div className="border-b border-border bg-card/50 backdrop-blur sticky top-0 z-10 px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-3 text-sm">
          <button
            type="button"
            onClick={async () => {
              if (
                await confirm({
                  title: "Leave without submitting?",
                  body: "Your progress is saved but you'll be back on the exam page.",
                })
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
        <div className="flex items-center gap-3">
          {state.calculatorAllowed &&
            sectionAllowsCalculator(sectionTitle) && (
              <button
                type="button"
                onClick={() => setCalcOpen((v) => !v)}
                aria-pressed={calcOpen}
                className={`text-xs px-2.5 py-1 rounded-md border inline-flex items-center gap-1.5 ${
                  calcOpen
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
                data-testid="calc-toggle"
              >
                <Calculator className="w-3.5 h-3.5" />
                Calculator
              </button>
            )}
          <div className="font-mono text-sm">
            {currentDeadline ? formatTimer(remainingMs) : "—"}
          </div>
        </div>
      </div>

      <div className="flex-1 flex flex-col md:flex-row max-w-7xl w-full mx-auto px-4 py-6 gap-6">
        {/* Question grid sidebar */}
        <aside className="md:w-44 flex-shrink-0 order-2 md:order-1">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
            Questions
          </div>
          <div className="grid grid-cols-8 md:grid-cols-5 gap-1.5">
            {flat.map((qq, i) => {
              const a = localAnswers.get(qq.id);
              const isCurrent = i === currentIndex;
              const isAnswered = (() => {
                if (!a) return false;
                switch (qq.type) {
                  case "essay":
                    return Boolean(a.essayResponse && a.essayResponse.trim().length > 0);
                  case "grid_in":
                    return Boolean(a.gridInResponse && a.gridInResponse.trim().length > 0);
                  case "multi_select":
                    return (
                      Array.isArray(a.selectedIndexes) &&
                      a.selectedIndexes.length === qq.correctCount
                    );
                  case "multiple_choice":
                    return a.selectedIndex != null;
                  default: {
                    const _exhaustive: never = qq;
                    void _exhaustive;
                    return false;
                  }
                }
              })();
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
            <div
              className={
                q.passageMd
                  ? "grid grid-cols-1 lg:grid-cols-2 gap-6"
                  : ""
              }
            >
              {q.passageMd && (
                <aside className="lg:sticky lg:top-4 lg:self-start lg:max-h-[calc(100vh-8rem)] lg:overflow-y-auto rounded-lg border border-border bg-card/50 p-4">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
                    Passage
                  </div>
                  <div className="prose prose-sm max-w-none dark:prose-invert [&_p]:mb-3">
                    <MarkdownRenderer content={q.passageMd} />
                  </div>
                </aside>
              )}
              <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
                Question {currentIndex + 1} of {flat.length}
              </div>
              {q.imageUrl && <QuestionImage src={q.imageUrl} />}
              <div className="prose prose-sm max-w-none dark:prose-invert mb-4">
                <MarkdownRenderer content={q.promptMd} />
              </div>
              {(() => {
                switch (q.type) {
                  case "essay":
                    return (
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
                          {(answer?.essayResponse ?? "")
                            .trim()
                            .split(/\s+/)
                            .filter(Boolean).length}{" "}
                          words · scored on submit
                        </div>
                      </div>
                    );
                  case "grid_in":
                    return (
                      <GridInQuestion
                        value={answer?.gridInResponse ?? ""}
                        onChange={(v) =>
                          persistAnswer(q, { gridInResponse: v })
                        }
                      />
                    );
                  case "multi_select":
                    return (
                      <MultiSelectQuestion
                        options={q.options}
                        selectedIndexes={answer?.selectedIndexes ?? []}
                        correctCount={q.correctCount}
                        onChange={(next) =>
                          persistAnswer(q, { selectedIndexes: next })
                        }
                      />
                    );
                  case "multiple_choice":
                    return (
                      <div className="space-y-2">
                        {q.options.map((opt, i) => {
                          const selected = answer?.selectedIndex === i;
                          return (
                            <button
                              key={opt.label}
                              type="button"
                              onClick={() =>
                                persistAnswer(q, { selectedIndex: i })
                              }
                              className={`w-full text-left rounded-lg border p-3 transition-colors ${
                                selected
                                  ? "border-primary bg-primary/10"
                                  : "border-border bg-card hover:border-primary/40"
                              }`}
                            >
                              <span className="font-mono text-xs font-semibold mr-3 text-muted-foreground">
                                {opt.label}
                              </span>
                              <span className="text-sm whitespace-pre-wrap">
                                {opt.text}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    );
                  default: {
                    const _exhaustive: never = q;
                    void _exhaustive;
                    return null;
                  }
                }
              })()}
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
              </div>
            </div>
          )}
        </main>
      </div>

      <div className="border-t border-border bg-card/50 px-4 py-3 sticky bottom-0">
        <div className="max-w-6xl mx-auto flex items-center justify-end gap-2">
          {!isLastSection && (
            <button
              type="button"
              onClick={async () => {
                if (
                  await confirm({
                    title: "End this section early?",
                    body: "You'll move to the break and won't be able to return.",
                    confirmLabel: "End section",
                  })
                ) {
                  advanceSection();
                }
              }}
              disabled={advancing || submitting}
              className="text-sm px-4 py-2 rounded-md border border-border hover:bg-accent/40 disabled:opacity-50 inline-flex items-center gap-1.5"
              data-testid="end-section"
            >
              {advancing ? "Ending…" : "End section"}
            </button>
          )}
          <button
            type="button"
            onClick={async () => {
              if (
                await confirm({
                  title: "Submit your exam now?",
                  body: "You won't be able to change answers after this.",
                  confirmLabel: "Submit",
                })
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

      {state.calculatorAllowed && sectionAllowsCalculator(sectionTitle) && (
        <DesmosCalculator
          open={calcOpen}
          onClose={() => setCalcOpen(false)}
          initialState={state.calculatorState}
          preseedExpressions={
            q?.meta && typeof q.meta === "object"
              ? // Per-question preseed lives in meta.calculatorPreseed
                // = { expressions: [{ latex }] }. Shape is opaque to
                // the runner — we just forward it.
                ((q.meta as { calculatorPreseed?: { expressions?: Array<{ latex: string }> } })
                  .calculatorPreseed?.expressions ?? null)
              : null
          }
          onStateChange={(s) => {
            if (!attemptId) return;
            api.exams.saveCalculatorState(attemptId, s).catch(() => {});
          }}
        />
      )}
    </div>
  );
}

// Phase 16A — score-report review block. Renders each question with
// the student's selection, correctness indicator, and (for essays)
// the AI grader's feedback markdown. Collapsed by default so the
// quick-glance score totals stay above the fold; click expands.
function ReviewByQuestion({ state }: { state: ExamAttemptState }) {
  const [open, setOpen] = useState(false);
  const answerByQ = useMemo(() => {
    const map = new Map<string, (typeof state.answers)[number]>();
    for (const a of state.answers) map.set(a.questionId, a);
    return map;
  }, [state.answers]);

  const allQuestions = useMemo(
    () => state.sections.flatMap((s) => s.questions),
    [state.sections],
  );
  // Server only returns isCorrect/correctIndex once the attempt is
  // completed. If the attempt is still in progress somehow (e.g.,
  // arrived here via a stale state) just skip the review.
  if (!state.completedAt) return null;
  const total = allQuestions.length;
  const correct = state.answers.filter((a) => a.isCorrect === true).length;

  return (
    <section className="mt-6">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full text-left rounded-lg border border-border bg-card px-4 py-3 hover:bg-accent flex items-center justify-between"
      >
        <div>
          <div className="font-display text-base font-semibold">
            Question-by-question review
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">
            {correct} of {total} multiple-choice correct · click to {open ? "hide" : "expand"}
          </div>
        </div>
        <span className="text-muted-foreground text-sm" aria-hidden>
          {open ? "▾" : "▸"}
        </span>
      </button>
      {open && (
        <ol className="mt-3 space-y-3">
          {allQuestions.map((q, i) => {
            const a = answerByQ.get(q.id);
            return (
              <ReviewQuestionCard key={q.id} q={q} index={i} answer={a} />
            );
          })}
        </ol>
      )}
    </section>
  );
}

function ReviewQuestionCard({
  q,
  index,
  answer,
}: {
  q: ExamQuestionPayload;
  index: number;
  answer: ExamAttemptState["answers"][number] | undefined;
}) {
  const isEssay = q.type === "essay";
  const isCorrect = answer?.isCorrect === true;
  const isWrong = answer?.isCorrect === false;
  return (
    <li
      data-testid="review-question"
      className={`rounded-lg border bg-card p-4 ${
        isCorrect
          ? "border-emerald-500/30"
          : isWrong
            ? "border-rose-500/30"
            : "border-border"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
          Q{index + 1} · {q.sectionSlug}
        </div>
        {isCorrect && (
          <span
            data-testid="correct-badge"
            className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400"
          >
            <Check className="w-3.5 h-3.5" /> Correct
          </span>
        )}
        {isWrong && (
          <span
            data-testid="wrong-badge"
            className="inline-flex items-center gap-1 text-xs text-rose-600 dark:text-rose-400"
          >
            <X className="w-3.5 h-3.5" /> Incorrect
          </span>
        )}
      </div>
      {q.passageMd && (
        <details className="mt-2 rounded-md border border-border bg-muted/30 px-3 py-2 text-xs">
          <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
            Show passage
          </summary>
          <div className="mt-2 prose prose-sm dark:prose-invert max-w-none [&_p]:mb-2">
            <MarkdownRenderer content={q.passageMd} />
          </div>
        </details>
      )}
      <div className="mt-2 prose prose-sm dark:prose-invert max-w-none">
        <MarkdownRenderer content={q.promptMd} />
      </div>

      {q.imageUrl && <QuestionImage src={q.imageUrl} />}
      {q.type === "multiple_choice" && (
        <ul className="mt-3 space-y-1.5">
          {q.options.map((opt, idx) => {
            const userPicked = answer?.selectedIndex === idx;
            const isAnswer = q.correctIndex === idx;
            return (
              <li
                key={idx}
                className={`text-sm rounded-md border px-3 py-1.5 flex items-center gap-2 ${
                  isAnswer
                    ? "border-emerald-500/40 bg-emerald-500/5"
                    : userPicked
                      ? "border-rose-500/40 bg-rose-500/5"
                      : "border-border"
                }`}
              >
                <span className="font-mono text-xs text-muted-foreground w-5">
                  {opt.label}
                </span>
                <span className="flex-1">{opt.text}</span>
                {isAnswer && (
                  <span className="text-[10px] uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                    Answer
                  </span>
                )}
                {userPicked && !isAnswer && (
                  <span className="text-[10px] uppercase tracking-wider text-rose-600 dark:text-rose-400">
                    Your pick
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {q.type === "grid_in" && (
        <div className="mt-3 text-sm space-y-1.5">
          <div className="rounded-md border border-border px-3 py-1.5">
            <span className="text-xs text-muted-foreground mr-2">
              Your answer:
            </span>
            <span className="font-mono">
              {answer?.gridInResponse?.trim() || "—"}
            </span>
          </div>
          {q.acceptedAnswers && q.acceptedAnswers.length > 0 && (
            <div className="rounded-md border border-emerald-500/40 bg-emerald-500/5 px-3 py-1.5">
              <span className="text-xs uppercase tracking-wider text-emerald-700 dark:text-emerald-300 mr-2">
                Accepted
              </span>
              <span className="font-mono text-xs">
                {q.acceptedAnswers.join(" · ")}
              </span>
            </div>
          )}
        </div>
      )}

      {q.type === "multi_select" && (
        <ul className="mt-3 space-y-1.5">
          {q.options.map((opt, idx) => {
            const picked = answer?.selectedIndexes?.includes(idx) ?? false;
            const isAnswer = q.correctIndexes?.includes(idx) ?? false;
            return (
              <li
                key={idx}
                className={`text-sm rounded-md border px-3 py-1.5 flex items-center gap-2 ${
                  isAnswer
                    ? "border-emerald-500/40 bg-emerald-500/5"
                    : picked
                      ? "border-rose-500/40 bg-rose-500/5"
                      : "border-border"
                }`}
              >
                <span className="font-mono text-xs text-muted-foreground w-5">
                  {opt.label}
                </span>
                <span className="flex-1">{opt.text}</span>
                {isAnswer && (
                  <span className="text-[10px] uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                    Answer
                  </span>
                )}
                {picked && !isAnswer && (
                  <span className="text-[10px] uppercase tracking-wider text-rose-600 dark:text-rose-400">
                    Your pick
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {isEssay && answer?.essayResponse && (
        <details className="mt-3">
          <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
            Your response
          </summary>
          <pre className="mt-2 whitespace-pre-wrap text-sm font-sans rounded-md border border-border bg-muted/30 p-3">
            {answer.essayResponse}
          </pre>
        </details>
      )}

      {isEssay && answer?.essayFeedbackMd && (
        <div
          data-testid="essay-feedback"
          className="mt-3 rounded-md border border-sky-500/30 bg-sky-500/5 p-3"
        >
          <div className="text-[10px] uppercase tracking-wider text-sky-700 dark:text-sky-300">
            AI feedback
            {answer.essayScore != null && q.maxEssayScore != null && (
              <span className="ml-2 font-mono">
                {answer.essayScore}/{q.maxEssayScore}
              </span>
            )}
          </div>
          <div className="mt-1 prose prose-sm dark:prose-invert max-w-none">
            <MarkdownRenderer content={answer.essayFeedbackMd} />
          </div>
        </div>
      )}
    </li>
  );
}
