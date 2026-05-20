import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  HelpCircle,
  List as ListIcon,
  NotebookPen,
  Pencil,
  Sparkles,
  Trophy,
  X as XIcon,
} from "lucide-react";
import { api } from "../lib/api";
import type {
  Lesson,
  LessonSlide,
  MasteryNode,
  QuizQuestion,
} from "@axiomic/types";
import { assertQuestionKind } from "@axiomic/types";
import { MarkdownRenderer } from "../components/MarkdownRenderer";
import { TutorMount } from "../components/ai/TutorMount";
import { dispatchAskTutor } from "../components/ai/askTutorAction";
import { PetByUsername } from "../pet";
import { AiGradedResponse } from "../components/quiz/AiGradedResponse";
import { QuestionRenderer, isAnswered } from "../components/quiz/QuestionRenderer";
import { LessonNotes } from "../components/mastery/LessonNotes";
import { PreviewViz } from "../components/lesson/PreviewViz";
import { useAuthStore } from "../stores/auth";

const PASSING_SCORE = 0.7;

// Question kinds whose own component renders correct/incorrect feedback
// (via the answer envelope) — pressing Next on those should advance
// immediately. All other kinds rely on LessonPage to render the
// explanation panel, so we use a two-step "Check answer → Next" flow.
const SELF_REVEALING_KINDS = new Set<QuizQuestion["kind"]>([
  "free_response",
  "scenario",
  "ml_sandbox",
  "guided_derivation",
  "code",
]);

type Phase =
  | "loading"
  | "playing"
  | "finished"
  | "no-lesson"
  | "lab-embed"
  | "error";

interface LabEmbed {
  kind: "protocol" | "cert" | "equipment-training" | "exam";
  slug: string;
}

function scoreLocally(question: QuizQuestion, answer: string | undefined): boolean {
  const q = assertQuestionKind(question);
  if (answer === undefined && q.kind !== "slider") return false;
  switch (q.kind) {
    case "multiple_choice":
      return answer === String(q.correctIndex);
    case "slider": {
      const v = parseFloat(answer ?? String(q.default));
      return !isNaN(v) && v >= q.target.min && v <= q.target.max;
    }
    case "drag_classify": {
      try {
        const map = JSON.parse(answer!) as Record<string, string>;
        return q.items.every((i) => map[i.id] === i.bin);
      } catch {
        return false;
      }
    }
    case "code": {
      try {
        const r = JSON.parse(answer!) as { passed: number; total: number };
        return (
          typeof r.passed === "number" &&
          r.passed === q.tests.length &&
          r.total === q.tests.length
        );
      } catch {
        return false;
      }
    }
    case "puzzle_drag_build": {
      try {
        const map = JSON.parse(answer!) as Record<string, string>;
        const compsById = new Map(q.components.map((c) => [c.id, c]));
        return q.slots.every((s) => {
          const cId = map[s.id];
          if (!cId) return false;
          const comp = compsById.get(cId);
          return !!comp && comp.type === s.accepts;
        });
      } catch {
        return false;
      }
    }
    case "math_expression": {
      if (answer === undefined) return false;
      const norm = (s: string) => s.replace(/\s+/g, "").toLowerCase();
      const a = norm(answer);
      return q.acceptedAnswers.some((acc) => norm(acc) === a);
    }
    case "sortable": {
      try {
        const order = JSON.parse(answer!) as string[];
        const correct = q.items.map((it) => it.id);
        return (
          order.length === correct.length &&
          order.every((id, i) => id === correct[i])
        );
      } catch {
        return false;
      }
    }
    case "code_completion": {
      try {
        const map = JSON.parse(answer!) as Record<string, string>;
        const norm = (s: string) => s.trim();
        return q.blanks.every((b) => {
          const u = map[b.id];
          if (typeof u !== "string") return false;
          const nu = norm(u);
          return b.acceptedAnswers.some((acc) => norm(acc) === nu);
        });
      } catch {
        return false;
      }
    }
    case "free_response":
    case "scenario":
    case "ml_sandbox": {
      if (answer === undefined) return false;
      try {
        const r = JSON.parse(answer) as { graded?: boolean; correct?: boolean };
        return r.graded === true && r.correct === true;
      } catch {
        return false;
      }
    }
    case "guided_derivation": {
      if (answer === undefined) return false;
      try {
        const r = JSON.parse(answer) as {
          completed?: boolean;
          correct?: boolean;
        };
        return r.completed === true && r.correct === true;
      } catch {
        return false;
      }
    }
  }
}

// PreviewViz lives in components/lesson/ so the editor preview modal
// can share the lazy chunks with the player.

function slideShortTitle(s: LessonSlide, i: number): string {
  if (s.kind === "text") return s.title || `Slide ${i + 1}`;
  if (s.kind === "section") return s.title || `Section ${i + 1}`;
  if (s.kind === "explain_back") {
    const p = s.question.prompt;
    if (p && p.length) return p.length > 60 ? p.slice(0, 60) + "…" : p;
    return `Slide ${i + 1}`;
  }
  const q = s.question.question;
  if (typeof q !== "string" || !q.length) return `Slide ${i + 1}`;
  return q.length > 60 ? q.slice(0, 60) + "…" : q;
}

export function LessonPage() {
  const { pathSlug, nodeSlug } = useParams<{
    pathSlug: string;
    nodeSlug: string;
  }>();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);

  const [phase, setPhase] = useState<Phase>("loading");
  const [labEmbed, setLabEmbed] = useState<LabEmbed | null>(null);
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [node, setNode] = useState<MasteryNode | null>(null);
  const [pathTitle, setPathTitle] = useState("");
  const [sourceArticle, setSourceArticle] = useState<{
    slug: string;
    title: string;
    authorUsername: string;
  } | null>(null);
  const [recommendedNext, setRecommendedNext] = useState<{
    slug: string;
    title: string;
    hasLesson: boolean;
  } | null>(null);
  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [hintTier, setHintTier] = useState<Record<string, number>>({});
  const [solutionShown, setSolutionShown] = useState<Record<string, boolean>>(
    {},
  );
  const [confidence, setConfidence] = useState<Record<string, number>>({});
  const recordedAttempts = useRef<Set<string>>(new Set());
  const [completeResult, setCompleteResult] = useState<{
    xpAwarded: number;
    petLeveledUp?: { newLevel: number };
    newAchievements: string[];
  } | null>(null);
  const [frontier, setFrontier] = useState<
    Array<{
      kind: string;
      slug: string;
      title: string;
      snippet: string;
      reason: string;
      htmlUrl: string | null;
    }>
  >([]);
  const [forecast, setForecast] = useState<{
    estimatedReadyOn: string | null;
    plan: Array<{ conceptTitle: string | null; targetDate: string }>;
  } | null>(null);
  const [calibration, setCalibration] = useState<
    Array<{ confidence: number; label: string; n: number; accuracy: number }>
  >([]);
  const [reflection, setReflection] = useState("");
  const [reflectionSaved, setReflectionSaved] = useState(false);
  const [petQuest, setPetQuest] = useState<{
    conceptTitle: string;
    petName: string;
    justCompleted: boolean;
  } | null>(null);
  const [credential, setCredential] = useState<{
    verifyId: string;
    score: number;
  } | null>(null);
  const [mintingCred, setMintingCred] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [slidesDrawerOpen, setSlidesDrawerOpen] = useState(false);
  const mainRef = useRef<HTMLDivElement | null>(null);
  const drawerRef = useRef<HTMLDivElement | null>(null);

  // Load path (for context + recommended-next), plus lesson + saved progress.
  useEffect(() => {
    if (!pathSlug || !nodeSlug) return;
    let cancelled = false;
    setPhase("loading");

    api.mastery
      .getPath(pathSlug)
      .then((data) => {
        if (cancelled) return;
        const found = data.nodes.find((n) => n.slug === nodeSlug);
        if (!found) {
          setError("Node not found in this path.");
          setPhase("error");
          return;
        }
        setNode(found);
        setPathTitle(data.path.title);

        // Recommended next: first non-completed node in path order whose
        // id ≠ current. Falls back to the next node by `order` if all done.
        const completed = new Set(
          data.progress.filter((p) => p.completed).map((p) => p.nodeId),
        );
        const ordered = [...data.nodes].sort((a, b) => a.order - b.order);
        const here = ordered.findIndex((n) => n.id === found.id);
        const after = ordered.slice(here + 1);
        const next =
          after.find((n) => !completed.has(n.id)) ?? after[0] ?? null;
        if (next) {
          setRecommendedNext({
            slug: next.slug,
            title: next.title,
            hasLesson: !!next.hasLesson,
          });
        }

        // Load the lesson body + saved progress in parallel.
        return Promise.all([
          api.mastery.getLesson(found.id),
          api.mastery.getLessonProgress(found.id).catch(() => ({ slideIdx: 0 })),
        ]).then(([lr, prog]) => {
          if (cancelled) return;
          setSourceArticle(lr.sourceArticle ?? null);
          // Sprint 82 — lab nodes (protocol / cert / equipment-training)
          // forward the user to the corresponding lab surface instead of
          // rendering slides.
          if (lr.nodeKind && lr.nodeKind !== "lesson") {
            const slug =
              lr.protocolSlug ??
              lr.certSlug ??
              lr.equipmentSlug ??
              lr.examSlug ??
              "";
            setLabEmbed({
              kind: lr.nodeKind as LabEmbed["kind"],
              slug,
            });
            setPhase("lab-embed");
            return;
          }
          if (!lr.lesson || lr.lesson.slides.length === 0) {
            setPhase("no-lesson");
            return;
          }
          setLesson(lr.lesson);
          setIdx(
            Math.min(
              Math.max(0, prog.slideIdx),
              lr.lesson.slides.length - 1,
            ),
          );
          setPhase("playing");
        });
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e?.message ?? "Failed to load lesson");
        setPhase("error");
      });

    return () => {
      cancelled = true;
    };
  }, [pathSlug, nodeSlug]);

  // Persist slide index (debounced) and fire a "viewed" telemetry
  // event for the active slide. Both are best-effort — failures are
  // swallowed (anon users get 401 on the events endpoint).
  useEffect(() => {
    if (phase !== "playing" || !node) return;
    const t = setTimeout(() => {
      api.mastery.setLessonProgress(node.id, idx).catch(() => {});
      api.mastery.postSlideEvent(node.id, idx, "viewed").catch(() => {});
    }, 200);
    return () => clearTimeout(t);
  }, [idx, phase, node]);

  // Scroll the main panel back to top on slide change.
  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }, [idx]);

  // Keyboard: ← → to step, Esc to exit.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      if (e.key === "Escape") {
        if (slidesDrawerOpen) {
          setSlidesDrawerOpen(false);
          return;
        }
        if (pathSlug) navigate(`/paths/${pathSlug}`);
        return;
      }
      if (phase !== "playing") return;
      if (e.key === "ArrowRight") handleNext();
      if (e.key === "ArrowLeft") handlePrev();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, idx, lesson, answers, slidesDrawerOpen]);

  // Lock body scroll while the slide drawer is open on mobile.
  useEffect(() => {
    if (!slidesDrawerOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [slidesDrawerOpen]);

  const slides = lesson?.slides ?? [];
  const slide = slides[idx];
  const questionSlides = useMemo(
    () =>
      slides.filter(
        (s): s is Extract<LessonSlide, { kind: "question" }> =>
          s.kind === "question",
      ),
    [slides],
  );
  const isLast = idx === slides.length - 1;

  const isCorrect = (q: QuizQuestion) =>
    revealed[q.id] && scoreLocally(q, answers[q.id]);

  const canAdvance = (() => {
    if (!slide) return false;
    if (slide.kind === "question") {
      return isAnswered(slide.question, answers[slide.question.id]);
    }
    return true;
  })();

  function recordAttemptOnce(
    qid: string,
    slideIdx: number,
    correct: boolean,
    conf?: number,
  ) {
    if (!node || recordedAttempts.current.has(qid)) return;
    recordedAttempts.current.add(qid);
    api.mastery
      .recordAttempt(node.id, {
        questionId: qid,
        slideIdx,
        correct,
        confidence: conf,
        answerJson: answers[qid],
      })
      .catch(() => {});
  }

  function handleNext() {
    if (!canAdvance) return;
    if (slide?.kind === "question") {
      const qid = slide.question.id;
      const correct = scoreLocally(slide.question, answers[qid]);
      const twoStep = !SELF_REVEALING_KINDS.has(slide.question.kind);
      // First click on a non-self-revealing question: show the
      // explanation panel and stay on the slide. The learner must
      // press Next again to advance.
      if (twoStep && !revealed[qid]) {
        setRevealed((r) => ({ ...r, [qid]: true }));
        if (node) {
          api.mastery
            .postSlideEvent(
              node.id,
              idx,
              correct ? "answered_correct" : "answered_wrong",
            )
            .catch(() => {});
        }
        return;
      }
      // Self-revealing kinds (or second click on a two-step): ensure
      // revealed flag is set so isCorrect/feedback gating works, and
      // emit the analytics event once on advance.
      if (!revealed[qid]) {
        setRevealed((r) => ({ ...r, [qid]: true }));
        if (node) {
          api.mastery
            .postSlideEvent(
              node.id,
              idx,
              correct ? "answered_correct" : "answered_wrong",
            )
            .catch(() => {});
        }
      }
      if (slide.retryUntilCorrect && !correct) {
        return;
      }
      recordAttemptOnce(qid, idx, correct, confidence[qid]);
    }
    if (isLast) {
      handleFinish();
    } else {
      setIdx((i) => Math.min(i + 1, slides.length - 1));
    }
  }

  function handlePrev() {
    setIdx((i) => Math.max(0, i - 1));
  }

  async function handleFinish() {
    if (submitting || !node) return;
    setSubmitting(true);
    try {
      const total = questionSlides.length;
      let correct = 0;
      for (const s of questionSlides) {
        if (scoreLocally(s.question, answers[s.question.id])) correct++;
      }
      const score = total > 0 ? correct / total : 1;
      if (score >= PASSING_SCORE) {
        try {
          const r = await api.mastery.markComplete(node.id);
          setCompleteResult({
            xpAwarded: r.xpAwarded,
            petLeveledUp: r.petLeveledUp,
            newAchievements: r.newAchievements,
          });
        } catch {
          // ignore — auto-mark is best-effort
        }
      }
      api.mastery
        .frontier(node.id)
        .then((r) => setFrontier(r.papers))
        .catch(() => {});
      api.me
        .readiness()
        .then((r) =>
          setForecast({
            estimatedReadyOn: r.estimatedReadyOn,
            plan: r.plan.map((p) => ({
              conceptTitle: p.conceptTitle,
              targetDate: p.targetDate,
            })),
          }),
        )
        .catch(() => {});
      api.mastery
        .calibration()
        .then((r) => setCalibration(r.buckets))
        .catch(() => {});
      api.mastery
        .petQuest()
        .then((r) => setPetQuest(r.quest))
        .catch(() => {});
      setPhase("finished");
    } finally {
      setSubmitting(false);
    }
  }

  const finalScore = (() => {
    if (questionSlides.length === 0) return 1;
    let correct = 0;
    for (const s of questionSlides) {
      if (scoreLocally(s.question, answers[s.question.id])) correct++;
    }
    return correct / questionSlides.length;
  })();

  const answeredCorrectIds = new Set(
    Object.entries(answers)
      .filter(([qid, val]) => {
        const qs = questionSlides.find((s) => s.question.id === qid);
        return qs && scoreLocally(qs.question, val);
      })
      .map(([qid]) => qid),
  );

  const exitHref = pathSlug ? `/paths/${pathSlug}` : "/paths";

  // Single slide-list rendering used by the desktop sidebar AND the
  // mobile bottom-sheet. `onPick` lets the sheet close when the user
  // chooses a slide.
  const renderSlideList = (onPick?: () => void) => (
    <ol className="space-y-px px-2">
      {slides.map((s, i) => {
        const active = i === idx;
        const Icon = s.kind === "question" ? HelpCircle : BookOpen;
        const correct =
          s.kind === "question" && answeredCorrectIds.has(s.question.id);
        return (
          <li key={i}>
            <button
              onClick={() => {
                setIdx(i);
                onPick?.();
              }}
              aria-current={active ? "step" : undefined}
              className={`w-full text-left flex items-start gap-2 px-3 py-2 rounded-md text-xs transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                active
                  ? "bg-primary/10 text-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent/40"
              }`}
            >
              <span className="mt-0.5 shrink-0">
                {correct ? (
                  <CheckCircle2
                    className="w-3.5 h-3.5 text-accent-emerald"
                    strokeWidth={2.2}
                  />
                ) : (
                  <Icon
                    className={`w-3.5 h-3.5 ${active ? "text-primary" : ""}`}
                    strokeWidth={2}
                  />
                )}
              </span>
              <span className="flex-1 min-w-0">
                <span className="block font-mono text-[10px] text-muted-foreground">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="block leading-snug">
                  {slideShortTitle(s, i)}
                </span>
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );

  return (
    <div className="min-h-[calc(100vh-3.5rem)] bg-background">
      {/* Top header */}
      <div className="border-b border-border bg-card/95 backdrop-blur sticky top-14 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center gap-3">
          <Link
            to={exitHref}
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="w-4 h-4" strokeWidth={2} />
            <span className="hidden sm:inline">{pathTitle || "Path"}</span>
          </Link>
          <div className="h-5 w-px bg-border" />
          <div className="min-w-0 flex-1">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Lesson
            </div>
            <h1 className="text-sm font-semibold truncate">
              {node?.title ?? "Loading…"}
            </h1>
          </div>
          {phase === "playing" && slides.length > 0 && (
            <button
              onClick={() => setSlidesDrawerOpen(true)}
              className="lg:hidden inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-accent/40 transition-colors duration-fast tabular-nums"
              aria-haspopup="dialog"
              aria-expanded={slidesDrawerOpen}
            >
              <ListIcon className="w-3.5 h-3.5" strokeWidth={2} />
              {idx + 1} / {slides.length}
            </button>
          )}
          {user && pathSlug && nodeSlug && (
            <Link
              to={`/paths/${pathSlug}/lessons/${nodeSlug}/edit`}
              className="hidden sm:inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/40"
              title="Suggest an edit"
            >
              <Pencil className="w-3.5 h-3.5" strokeWidth={2} />
              Edit
            </Link>
          )}
          <button
            onClick={() => setNotesOpen((v) => !v)}
            className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md transition-colors duration-fast ${
              notesOpen
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:text-foreground hover:bg-accent/40"
            }`}
            aria-pressed={notesOpen}
          >
            <NotebookPen className="w-3.5 h-3.5" strokeWidth={2} />
            <span className="hidden sm:inline">Notes</span>
          </button>
          <Link
            to={exitHref}
            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/40"
            aria-label="Exit lesson"
            title="Exit (Esc)"
          >
            <XIcon className="w-4 h-4" strokeWidth={2} />
          </Link>
        </div>
        {phase === "playing" && slides.length > 0 && (
          <div className="h-1 bg-muted">
            <div
              className="h-full bg-primary transition-all duration-base ease-out"
              style={{
                width: `${((idx + 1) / slides.length) * 100}%`,
              }}
            />
          </div>
        )}
      </div>

      {/* Body */}
      <div className="max-w-7xl mx-auto grid lg:grid-cols-[260px_1fr] min-h-[calc(100vh-7rem)]">
        {/* Slide list — sticky sidebar (desktop only) */}
        <aside className="hidden lg:block border-r border-border">
          <nav className="sticky top-[calc(3.5rem+3.5rem+0.25rem)] py-4 max-h-[calc(100vh-7.25rem)] overflow-y-auto">
            <div className="px-4 pb-2 text-[10px] uppercase tracking-wider text-muted-foreground">
              Slides · {slides.length}
            </div>
            {renderSlideList()}
          </nav>
        </aside>

        {/* Main content */}
        <div ref={mainRef} className="px-4 sm:px-8 py-8 overflow-y-auto">
          {sourceArticle && phase !== "loading" && (
            <div className="max-w-3xl mx-auto mb-6">
              <Link
                to={`/news/${sourceArticle.slug}`}
                className="inline-flex items-center gap-2 text-xs px-3 py-1.5 rounded-full border border-border bg-muted/40 text-muted-foreground hover:text-foreground hover:bg-accent/40 transition-colors"
              >
                <BookOpen className="w-3 h-3" strokeWidth={2} />
                Sourced from{" "}
                <PetByUsername username={sourceArticle.authorUsername} size="xs" />
                <span className="font-medium">@{sourceArticle.authorUsername}</span>
                's article ·{" "}
                <span className="text-foreground">{sourceArticle.title}</span>
              </Link>
            </div>
          )}

          {phase === "loading" && (
            <div className="max-w-3xl mx-auto space-y-4">
              <div className="h-8 animate-pulse bg-muted rounded w-1/3" />
              <div className="h-48 animate-pulse bg-muted rounded" />
              <div className="h-4 animate-pulse bg-muted rounded w-2/3" />
            </div>
          )}

          {phase === "no-lesson" && (
            <div className="max-w-2xl mx-auto py-20 text-center">
              <div className="mx-auto w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-4">
                <BookOpen
                  className="w-6 h-6 text-muted-foreground"
                  strokeWidth={1.6}
                />
              </div>
              <h2 className="font-display text-2xl font-semibold mb-2">
                No lesson yet
              </h2>
              <p className="text-sm text-muted-foreground mb-6">
                This node doesn't have an authored lesson. You can still take
                the quiz to mark it complete.
              </p>
              <Link
                to={exitHref}
                className="inline-flex items-center px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90"
              >
                Back to path
              </Link>
            </div>
          )}

          {phase === "lab-embed" && labEmbed && (
            <div className="max-w-2xl mx-auto py-16 text-center">
              <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                <BookOpen
                  className="w-6 h-6 text-primary"
                  strokeWidth={1.6}
                />
              </div>
              <h2 className="font-display text-2xl font-semibold mb-2">
                {labEmbed.kind === "protocol"
                  ? "Hands-on protocol"
                  : labEmbed.kind === "cert"
                    ? "Safety certification"
                    : labEmbed.kind === "exam"
                      ? "Practice exam"
                      : "Equipment training"}
              </h2>
              <p className="text-sm text-muted-foreground mb-6">
                {labEmbed.kind === "protocol"
                  ? "This step is a real lab procedure. Run it at the bench, log your observations, and request a sign-off when done — completion bubbles back here."
                  : labEmbed.kind === "cert"
                    ? "Pass the safety quiz to mark this step complete. Your certification is saved to your lab profile."
                    : labEmbed.kind === "exam"
                      ? "This step is a full timed exam. Work through every section; your score and attempt history are saved to your exam profile."
                      : "Equipment manual + training. Reading the manual + passing the equipment cert marks this step complete."}
              </p>
              <div className="flex items-center justify-center gap-2">
                <Link
                  to={
                    labEmbed.kind === "protocol"
                      ? `/lab/protocols/${labEmbed.slug}`
                      : labEmbed.kind === "cert"
                        ? `/lab/safety-certs/${labEmbed.slug}`
                        : labEmbed.kind === "exam"
                          ? `/exams/${labEmbed.slug}`
                          : `/lab/equipment/${labEmbed.slug}`
                  }
                  className="inline-flex items-center px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90"
                >
                  Open
                </Link>
                <Link
                  to={exitHref}
                  className="inline-flex items-center px-4 py-2 rounded-md border border-border text-sm hover:bg-accent/40"
                >
                  Back to path
                </Link>
              </div>
            </div>
          )}

          {phase === "error" && (
            <div className="max-w-2xl mx-auto py-20 text-center">
              <h2 className="font-display text-2xl font-semibold mb-2">
                Couldn't load this lesson
              </h2>
              <p className="text-sm text-destructive mb-6">{error}</p>
              <Link
                to={exitHref}
                className="inline-flex items-center px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90"
              >
                Back to path
              </Link>
            </div>
          )}

          {phase === "playing" &&
            idx === 0 &&
            lesson?.meta &&
            (lesson.meta.timeMinutes ||
              lesson.meta.difficulty ||
              (lesson.meta.objectives &&
                lesson.meta.objectives.length > 0) ||
              (lesson.meta.prereqs && lesson.meta.prereqs.length > 0)) && (
              <div className="max-w-3xl mx-auto mb-6 rounded-lg border border-border bg-card p-5 animate-fade-in">
                <div className="flex items-center gap-2 flex-wrap mb-3">
                  {lesson.meta.difficulty && (
                    <span className="text-[11px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
                      {lesson.meta.difficulty}
                    </span>
                  )}
                  {lesson.meta.timeMinutes && (
                    <span className="text-xs text-muted-foreground">
                      ~{lesson.meta.timeMinutes} min
                    </span>
                  )}
                </div>
                {lesson.meta.objectives &&
                  lesson.meta.objectives.length > 0 && (
                    <div className="mb-3">
                      <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">
                        You'll learn
                      </div>
                      <ul className="list-disc pl-5 text-sm space-y-0.5">
                        {lesson.meta.objectives.map((o, i) => (
                          <li key={i}>{o}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                {lesson.meta.prereqs && lesson.meta.prereqs.length > 0 && (
                  <div className="text-xs text-muted-foreground">
                    Prerequisites: {lesson.meta.prereqs.join(" · ")}
                  </div>
                )}
              </div>
            )}

          {phase === "playing" && slide && slide.kind === "text" && (
            <article className="max-w-3xl mx-auto animate-fade-in">
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2 inline-flex items-center gap-1.5">
                <BookOpen className="w-3 h-3" strokeWidth={2} />
                Concept · slide {idx + 1} of {slides.length}
              </div>
              {slide.title && (
                <h2 className="font-display text-3xl sm:text-4xl font-semibold tracking-tight leading-tight mb-6">
                  {slide.title}
                </h2>
              )}
              <div
                className={
                  slide.viz
                    ? "grid lg:grid-cols-2 gap-8 items-start"
                    : "max-w-prose"
                }
              >
                <div className="font-serif text-lg leading-relaxed [&_p]:mb-4 [&_h3]:font-sans [&_h3]:text-xl [&_h3]:font-semibold [&_h3]:mt-6 [&_h3]:mb-3">
                  <MarkdownRenderer
                    content={slide.body ?? ""}
                    codeKernelKey={node ? `lesson:${node.id}` : null}
                  />
                </div>
                {slide.viz && (
                  <div className="lg:sticky lg:top-32">
                    <div className="rounded-lg border border-border bg-card p-4">
                      <PreviewViz name={slide.viz} props={slide.vizProps} />
                    </div>
                  </div>
                )}
              </div>
            </article>
          )}

          {phase === "playing" && slide && slide.kind === "section" && (
            <section className="max-w-3xl mx-auto animate-fade-in py-10">
              <div className="text-[11px] uppercase tracking-wider text-primary mb-3 inline-flex items-center gap-1.5">
                <BookOpen className="w-3 h-3" strokeWidth={2} />
                Section · slide {idx + 1} of {slides.length}
              </div>
              <h2 className="font-display text-4xl sm:text-5xl font-semibold tracking-tight leading-tight pb-5 mb-5 border-b border-border">
                {slide.title}
              </h2>
              {slide.body && (
                <div className="font-serif text-lg leading-relaxed text-muted-foreground max-w-prose [&_p]:mb-4">
                  <MarkdownRenderer content={slide.body} />
                </div>
              )}
            </section>
          )}

          {phase === "playing" && slide && slide.kind === "question" && (
            <div className="max-w-2xl mx-auto animate-fade-in">
              <div className="text-[11px] uppercase tracking-wider text-primary mb-2 inline-flex items-center gap-1.5">
                <HelpCircle className="w-3 h-3" strokeWidth={2} />
                Check your understanding · slide {idx + 1} of {slides.length}
              </div>
              <h2 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight leading-snug mb-6">
                {slide.question.question}
              </h2>
              <div className="rounded-lg border border-border bg-card p-5">
                <QuestionRenderer
                  question={slide.question}
                  value={answers[slide.question.id]}
                  onChange={(v) =>
                    setAnswers((a) => ({ ...a, [slide.question.id]: v }))
                  }
                />
                {slide.hints && slide.hints.length > 0 && (
                  <div className="mt-4 space-y-1">
                    {slide.hints
                      .slice(0, hintTier[slide.question.id] ?? 0)
                      .map((h, hi) => (
                        <p
                          key={hi}
                          className="text-sm text-accent-amber/90 flex gap-1.5"
                        >
                          <span aria-hidden>💡</span>
                          <span>{h}</span>
                        </p>
                      ))}
                    {(hintTier[slide.question.id] ?? 0) <
                      slide.hints.length && (
                      <button
                        type="button"
                        onClick={() =>
                          setHintTier((t) => ({
                            ...t,
                            [slide.question.id]:
                              (t[slide.question.id] ?? 0) + 1,
                          }))
                        }
                        className="text-xs text-primary hover:underline"
                      >
                        {(hintTier[slide.question.id] ?? 0) === 0
                          ? "Show a hint"
                          : "Show another hint"}
                      </button>
                    )}
                  </div>
                )}
                {revealed[slide.question.id] && (
                  <div
                    className={`mt-4 rounded-md border p-3 text-sm ${
                      isCorrect(slide.question)
                        ? "border-accent-emerald/40 bg-accent-emerald/10"
                        : "border-accent-amber/40 bg-accent-amber/10"
                    }`}
                  >
                    <div
                      className={
                        isCorrect(slide.question)
                          ? "font-medium text-accent-emerald"
                          : "font-medium text-accent-amber"
                      }
                    >
                      {isCorrect(slide.question)
                        ? "Correct."
                        : "Not quite — review the explanation, then continue."}
                    </div>
                    {slide.question.explanation && (
                      <div className="mt-2 text-foreground/90 [&_p]:mb-2 [&_p:last-child]:mb-0">
                        <MarkdownRenderer
                          content={slide.question.explanation}
                        />
                      </div>
                    )}
                    {!isCorrect(slide.question) && (
                      <button
                        type="button"
                        onClick={() => {
                          const raw = answers[slide.question.id] ?? "";
                          let ans = raw;
                          try {
                            const env = JSON.parse(raw);
                            if (
                              env &&
                              typeof env === "object" &&
                              typeof env.text === "string"
                            )
                              ans = env.text;
                          } catch {
                            /* raw answer */
                          }
                          dispatchAskTutor({
                            quote: `I answered this lesson question incorrectly and want to find my misconception.\n\nQuestion: ${slide.question.question}\n\nMy answer: ${ans || "(blank)"}\n\nDon't just give the answer — help me see where my reasoning went wrong.`,
                          });
                        }}
                        className="mt-3 inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
                      >
                        <Sparkles className="w-3.5 h-3.5" strokeWidth={2} />
                        Work through this with the tutor
                      </button>
                    )}
                  </div>
                )}
                {revealed[slide.question.id] && slide.workedSolution && (
                  <div className="mt-3">
                    {solutionShown[slide.question.id] ? (
                      <div className="rounded-md border border-border bg-muted/40 p-3 text-sm [&_p]:mb-2 [&_p:last-child]:mb-0">
                        <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">
                          Worked solution
                        </div>
                        <MarkdownRenderer content={slide.workedSolution} />
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() =>
                          setSolutionShown((s) => ({
                            ...s,
                            [slide.question.id]: true,
                          }))
                        }
                        className="text-xs text-primary hover:underline"
                      >
                        Show worked solution
                      </button>
                    )}
                  </div>
                )}
                {revealed[slide.question.id] && (
                  <div className="mt-3 flex items-center gap-2 flex-wrap">
                    <span className="text-xs text-muted-foreground">
                      How sure were you?
                    </span>
                    {[
                      { v: 0, label: "Guessed" },
                      { v: 1, label: "Unsure" },
                      { v: 2, label: "Confident" },
                    ].map((opt) => {
                      const qid = slide.question.id;
                      const sel = confidence[qid] === opt.v;
                      return (
                        <button
                          key={opt.v}
                          type="button"
                          onClick={() => {
                            setConfidence((cf) => ({ ...cf, [qid]: opt.v }));
                            recordAttemptOnce(
                              qid,
                              idx,
                              scoreLocally(slide.question, answers[qid]),
                              opt.v,
                            );
                          }}
                          className={`text-xs px-2 py-1 rounded-md border ${
                            sel
                              ? "border-primary bg-primary/10 text-primary"
                              : "border-border text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-3">
                {slide.retryUntilCorrect
                  ? "Answer correctly to continue. Use ← → to navigate."
                  : "Answer to advance. Use ← → to navigate."}
              </p>
            </div>
          )}

          {phase === "playing" &&
            slide &&
            slide.kind === "explain_back" && (
              <div className="max-w-2xl mx-auto animate-fade-in">
                <div className="text-[11px] uppercase tracking-wider text-primary mb-2 inline-flex items-center gap-1.5">
                  <NotebookPen className="w-3 h-3" strokeWidth={2} />
                  Explain back · slide {idx + 1} of {slides.length}
                </div>
                <h2 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight leading-snug mb-6">
                  {slide.question.prompt}
                </h2>
                {slide.question.rubricCriteria &&
                slide.question.rubricCriteria.length > 0 ? (
                  <div className="space-y-3">
                    <div className="flex items-center gap-3 rounded-md border border-border bg-card p-3">
                      {user?.username && (
                        <PetByUsername
                          username={user.username}
                          size="xs"
                        />
                      )}
                      <p className="text-sm text-muted-foreground">
                        Explain it so your pet gets it. Teaching it back in
                        plain words is one of the strongest ways to learn —
                        this never blocks progress.
                      </p>
                    </div>
                    <AiGradedResponse
                      questionText={slide.question.prompt}
                      rubricCriteria={slide.question.rubricCriteria}
                      value={answers[slide.question.id]}
                      onChange={(v) =>
                        setAnswers((a) => ({
                          ...a,
                          [slide.question.id]: v,
                        }))
                      }
                    />
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground mb-4">
                    Take a minute to answer in your own words (notes or out
                    loud). This slide does not block progress — continue when
                    you are ready.
                  </p>
                )}
              </div>
            )}

          {phase === "finished" && (
            <div className="max-w-2xl mx-auto py-12 text-center animate-fade-in">
              <div
                className={`mx-auto w-16 h-16 rounded-full flex items-center justify-center mb-5 ${
                  finalScore >= PASSING_SCORE
                    ? "bg-accent-emerald/15 text-accent-emerald"
                    : "bg-accent-amber/15 text-accent-amber"
                }`}
              >
                {finalScore >= PASSING_SCORE ? (
                  <Trophy className="w-7 h-7" strokeWidth={2} />
                ) : (
                  <BookOpen className="w-7 h-7" strokeWidth={2} />
                )}
              </div>
              <h2 className="font-display text-3xl font-semibold tracking-tight mb-2">
                {finalScore >= PASSING_SCORE
                  ? "Lesson complete"
                  : "Lesson finished"}
              </h2>
              {questionSlides.length > 0 ? (
                <p className="text-base text-muted-foreground mb-6">
                  You answered{" "}
                  <span className="font-semibold text-foreground">
                    {Math.round(finalScore * questionSlides.length)} /{" "}
                    {questionSlides.length}
                  </span>{" "}
                  embedded checks correctly.
                  {finalScore >= PASSING_SCORE
                    ? " This node is now marked complete."
                    : " Keep exploring — try the quiz to mark this node complete."}
                </p>
              ) : (
                <p className="text-base text-muted-foreground mb-6">
                  This node is now marked complete.
                </p>
              )}
              {completeResult &&
                (completeResult.xpAwarded > 0 ||
                  completeResult.petLeveledUp ||
                  completeResult.newAchievements.length > 0) && (
                  <div className="flex items-center justify-center gap-2 flex-wrap mb-6">
                    {completeResult.xpAwarded > 0 && (
                      <span className="inline-flex items-center gap-1 text-sm px-3 py-1 rounded-full bg-accent-emerald/15 text-accent-emerald font-medium">
                        +{completeResult.xpAwarded} XP
                      </span>
                    )}
                    {completeResult.petLeveledUp && (
                      <span className="inline-flex items-center gap-1 text-sm px-3 py-1 rounded-full bg-primary/15 text-primary font-medium">
                        Pet reached level{" "}
                        {completeResult.petLeveledUp.newLevel}
                      </span>
                    )}
                    {completeResult.newAchievements.map((a) => (
                      <span
                        key={a}
                        className="inline-flex items-center gap-1 text-sm px-3 py-1 rounded-full bg-accent-amber/15 text-accent-amber font-medium"
                      >
                        <Trophy className="w-3.5 h-3.5" strokeWidth={2} />
                        {a.replace(/_/g, " ")}
                      </span>
                    ))}
                  </div>
                )}
              {(() => {
                const conf = [...calibration]
                  .sort((a, b) => b.confidence - a.confidence)
                  .find((b) => b.n > 0);
                const next = forecast?.plan?.[0];
                const show =
                  !!forecast?.estimatedReadyOn || !!next || !!conf;
                if (!show) return null;
                return (
                  <div className="max-w-md mx-auto mb-6 text-left rounded-lg border border-border bg-card p-4 space-y-1.5">
                    <div className="text-[11px] uppercase tracking-wider text-primary inline-flex items-center gap-1.5">
                      <Sparkles className="w-3 h-3" strokeWidth={2} />
                      Your trajectory
                    </div>
                    {forecast?.estimatedReadyOn ? (
                      <p className="text-sm text-muted-foreground">
                        On track — projected ready{" "}
                        <span className="font-medium text-foreground">
                          {new Date(
                            forecast.estimatedReadyOn,
                          ).toLocaleDateString()}
                        </span>
                        .
                      </p>
                    ) : next ? (
                      <p className="text-sm text-muted-foreground">
                        Next focus:{" "}
                        <span className="font-medium text-foreground">
                          {next.conceptTitle ?? "a weak concept"}
                        </span>
                        .
                      </p>
                    ) : null}
                    {conf && (
                      <p className="text-sm text-muted-foreground">
                        {conf.label} answers:{" "}
                        <span className="font-medium text-foreground">
                          {Math.round(conf.accuracy * 100)}% correct
                        </span>{" "}
                        ({conf.n}).
                        {conf.confidence >= 2 && conf.accuracy < 0.6
                          ? " You may be over-confident — slow down on these."
                          : ""}
                      </p>
                    )}
                  </div>
                );
              })()}
              {frontier.length > 0 && (
                <div className="max-w-md mx-auto mb-6 text-left rounded-lg border border-border bg-card p-4">
                  <div className="text-[11px] uppercase tracking-wider text-primary mb-2 inline-flex items-center gap-1.5">
                    <Sparkles className="w-3 h-3" strokeWidth={2} />
                    Explore the frontier
                  </div>
                  <ul className="space-y-2">
                    {frontier.map((p) =>
                      p.kind === "external_paper" ? (
                        <li key={p.slug}>
                          <a
                            href={p.htmlUrl ?? "#"}
                            target="_blank"
                            rel="noreferrer"
                            className="text-sm font-medium text-primary hover:underline"
                          >
                            {p.title}
                          </a>
                          <p className="text-xs text-muted-foreground line-clamp-2">
                            {p.reason || p.snippet}
                          </p>
                        </li>
                      ) : (
                        <li key={p.slug}>
                          <Link
                            to={`/research/${p.slug}`}
                            className="text-sm font-medium text-primary hover:underline"
                          >
                            {p.title}
                          </Link>
                          <p className="text-xs text-muted-foreground line-clamp-2">
                            {p.reason || p.snippet}
                          </p>
                        </li>
                      ),
                    )}
                  </ul>
                </div>
              )}
              {petQuest && (
                <div className="max-w-md mx-auto mb-6 text-left rounded-lg border border-primary/30 bg-primary/5 p-4 flex items-center gap-3">
                  {user?.username && (
                    <PetByUsername username={user.username} size="xs" />
                  )}
                  <p className="text-sm text-muted-foreground">
                    {petQuest.justCompleted ? (
                      <>
                        {petQuest.petName || "Your pet"} learned{" "}
                        <span className="font-medium text-foreground">
                          {petQuest.conceptTitle}
                        </span>{" "}
                        with you — quest complete!
                      </>
                    ) : (
                      <>
                        {petQuest.petName || "Your pet"} wants to learn{" "}
                        <span className="font-medium text-foreground">
                          {petQuest.conceptTitle}
                        </span>
                        . Clear its review card to finish the quest.
                      </>
                    )}
                  </p>
                </div>
              )}
              {finalScore >= PASSING_SCORE && (
                <div className="max-w-md mx-auto mb-6 text-left rounded-lg border border-border bg-card p-4">
                  {credential ? (
                    <p className="text-sm text-muted-foreground">
                      Credential minted — Axiomic score{" "}
                      <span className="font-semibold text-foreground">
                        {credential.score}/1000
                      </span>
                      . Verifiable id{" "}
                      <code className="text-xs">{credential.verifyId}</code>.
                    </p>
                  ) : (
                    <button
                      type="button"
                      disabled={mintingCred}
                      onClick={() => {
                        setMintingCred(true);
                        api.mastery
                          .mintCredential()
                          .then((r) => setCredential(r))
                          .catch(() => {})
                          .finally(() => setMintingCred(false));
                      }}
                      className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline disabled:opacity-50"
                    >
                      <Sparkles className="w-3.5 h-3.5" strokeWidth={2} />
                      {mintingCred
                        ? "Minting…"
                        : "Mint a verifiable skill credential"}
                    </button>
                  )}
                </div>
              )}
              {node && (
                <div className="max-w-md mx-auto mb-6 text-left rounded-lg border border-border bg-card p-4">
                  <div className="text-[11px] uppercase tracking-wider text-primary mb-2">
                    What's still fuzzy?
                  </div>
                  {reflectionSaved ? (
                    <p className="text-sm text-muted-foreground">
                      Saved to your spaced-review deck — it'll resurface in
                      Today.
                    </p>
                  ) : (
                    <>
                      <textarea
                        value={reflection}
                        onChange={(e) => setReflection(e.target.value)}
                        rows={2}
                        placeholder="One thing you want to revisit…"
                        className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                      />
                      <button
                        type="button"
                        disabled={!reflection.trim()}
                        onClick={() => {
                          const text = reflection.trim();
                          if (!text || !node) return;
                          setReflectionSaved(true);
                          api.flashcards
                            .save({
                              pageSlug: node.slug,
                              pageTitle: node.title,
                              front: `Revisit (${node.title}): what was fuzzy?`,
                              back: text,
                            })
                            .catch(() => setReflectionSaved(false));
                        }}
                        className="mt-2 inline-flex items-center px-3 py-1.5 text-sm rounded-md bg-primary text-primary-foreground font-medium disabled:opacity-50"
                      >
                        Save to review
                      </button>
                    </>
                  )}
                </div>
              )}
              <div className="flex items-center justify-center gap-3 flex-wrap">
                {recommendedNext && recommendedNext.slug !== nodeSlug && (
                  <button
                    onClick={() => {
                      if (!pathSlug || !recommendedNext) return;
                      if (recommendedNext.hasLesson) {
                        navigate(
                          `/paths/${pathSlug}/lessons/${recommendedNext.slug}`,
                        );
                      } else {
                        navigate(exitHref);
                      }
                    }}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90"
                  >
                    <Sparkles className="w-3.5 h-3.5" strokeWidth={2} />
                    Continue: {recommendedNext.title}
                    <ArrowRight className="w-3.5 h-3.5" strokeWidth={2} />
                  </button>
                )}
                <Link
                  to={exitHref}
                  className="inline-flex items-center px-4 py-2 rounded-md border border-border text-sm hover:bg-accent/40"
                >
                  Back to path
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Footer controls — sticky at bottom on the playing phase */}
      {phase === "playing" && slides.length > 0 && (
        <div className="sticky bottom-0 border-t border-border bg-card/95 backdrop-blur z-20">
          <div className="max-w-7xl mx-auto px-4 sm:px-8 py-3 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
            <button
              onClick={handlePrev}
              disabled={idx === 0}
              className="justify-self-start inline-flex items-center gap-1 px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground disabled:opacity-30"
            >
              <ArrowLeft className="w-3.5 h-3.5" strokeWidth={2} />
              Back
            </button>
            <div className="text-xs text-muted-foreground tabular-nums">
              {idx + 1} / {slides.length}
            </div>
            <button
              onClick={handleNext}
              disabled={!canAdvance || submitting}
              className="justify-self-end inline-flex items-center gap-1 px-4 py-1.5 text-sm rounded-md bg-primary text-primary-foreground font-medium disabled:opacity-50"
            >
              {(() => {
                if (isLast) return submitting ? "Finishing…" : "Finish";
                if (
                  slide?.kind === "question" &&
                  !SELF_REVEALING_KINDS.has(slide.question.kind) &&
                  !revealed[slide.question.id]
                ) {
                  return "Check answer";
                }
                return "Next";
              })()}
              <ArrowRight className="w-3.5 h-3.5" strokeWidth={2} />
            </button>
          </div>
        </div>
      )}

      {/* Notes drawer */}
      {notesOpen && node && user && (
        <div className="fixed bottom-0 inset-x-0 z-40 px-4 pb-4 sm:px-8 sm:pb-8 pointer-events-none">
          <div className="max-w-2xl mx-auto pointer-events-auto animate-fade-in">
            <LessonNotes nodeId={node.id} />
          </div>
        </div>
      )}

      {/* Mobile slide-list bottom sheet — only used on screens below
          the lg breakpoint where the desktop sidebar is hidden. */}
      {slidesDrawerOpen && (
        <div
          className="lg:hidden fixed inset-0 z-50 bg-background/70 backdrop-blur-sm animate-fade-in"
          onClick={() => setSlidesDrawerOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label="All slides"
        >
          <div
            ref={drawerRef}
            className="absolute inset-x-0 bottom-0 max-h-[70vh] bg-card border-t border-border rounded-t-xl shadow-floating flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 h-12 border-b border-border">
              <span className="text-xs uppercase tracking-wider text-muted-foreground">
                Slides · {slides.length}
              </span>
              <button
                onClick={() => setSlidesDrawerOpen(false)}
                className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/40"
                aria-label="Close slide list"
              >
                <XIcon className="w-4 h-4" strokeWidth={2} />
              </button>
            </div>
            <nav className="flex-1 overflow-y-auto py-3">
              {renderSlideList(() => setSlidesDrawerOpen(false))}
            </nav>
          </div>
        </div>
      )}

      {/* Sprint 63h — AI tutor mount: floating button + sidebar +
          selection-to-chat. Watches the page's main content for
          highlighted text. */}
      {node && (
        <TutorMount
          pageSlug={node.slug}
          pageTitle={node.title}
          tier="lesson"
          articleRef={mainRef}
        />
      )}
    </div>
  );
}
