// Sprint 19 — The Attention "wow loop".
//
// A scripted 3-minute demo journey that orchestrates the primitives
// shipped in S16 (cross-link rails), S17 (Concept Card), and S18
// (active coach). No new product features — just a tight composition
// that makes the flywheel legible to a first-time visitor:
//
//   1. Read   — a tight intro paragraph with hover-card concept links
//   2. Visualize — drop in the AttentionHeatmap component live
//   3. Quiz   — a single multiple-choice check with explanation
//   4. Coach  — the AISidebar's quick-checks header pre-seeded
//   5. Discuss + continue — link to the live forum + lesson surfaces
//
// Each step is a card. Steps reveal as the user clicks Continue, so a
// brand-new visitor can't lose the thread.

import { useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  CheckCircle2,
  Circle,
  GraduationCap,
  MessageSquare,
  Sparkles,
} from "lucide-react";
import { MarkdownRenderer } from "../components/MarkdownRenderer";
import { VizEmbed } from "../components/VizEmbed";
import { TutorMount } from "../components/ai/TutorMount";
import { useAuthStore } from "../stores/auth";

// Inline story copy — kept here so the demo is self-contained and
// doesn't drift if the seed wiki content evolves. Uses Sprint 17
// `[[concept-slug]]` syntax so each link reveals a hover preview.
const READ_BODY = `**Attention** is how a transformer decides where to look.

For each output token, attention computes a weighted average of the input — but the weights aren't fixed. They come from a query asking *"who's relevant to me right now?"* and being scored against every key in the sequence.

The math reduces to three steps:

1. Score every input by dot-product with the query.
2. Push the scores through [[softmax]] so they sum to 1.
3. Use those weights to mix the [[query-key-value|values]].

That's it. Everything that came after — multi-head, RoPE, FlashAttention — is a refinement of this loop.`;

interface QuizStep {
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}

const QUIZ: QuizStep = {
  question:
    "Why does scaled dot-product attention divide the dot products by √d_k before softmax?",
  options: [
    "To make the operation parallelizable across heads.",
    "To keep softmax inputs in a numerically friendly range as d_k grows.",
    "To produce attention weights that sum to 1.",
    "To save memory bandwidth on long sequences.",
  ],
  correctIndex: 1,
  explanation:
    "As d_k grows, raw dot-products grow with √d_k. Without scaling, softmax saturates and gradients vanish. Dividing by √d_k keeps the variance roughly constant.",
};

type StepId = "read" | "viz" | "quiz" | "coach" | "continue";
const STEP_ORDER: StepId[] = ["read", "viz", "quiz", "coach", "continue"];
const STEP_LABEL: Record<StepId, string> = {
  read: "Read",
  viz: "Visualize",
  quiz: "Check yourself",
  coach: "Ask the tutor",
  continue: "Keep going",
};

export function DemoAttentionPage() {
  const user = useAuthStore((s) => s.user);
  const [active, setActive] = useState<StepId>("read");
  const [reached, setReached] = useState<Set<StepId>>(new Set(["read"]));
  const [pickedIdx, setPickedIdx] = useState<number | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [coachOpen, setCoachOpen] = useState(false);

  const advance = (id: StepId) => {
    setActive(id);
    setReached((prev) => new Set(prev).add(id));
  };

  const stepIdx = STEP_ORDER.indexOf(active);
  const next = STEP_ORDER[stepIdx + 1] ?? null;

  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      <div className="mb-8">
        <Link to="/" className="text-xs text-muted-foreground hover:text-foreground">
          &larr; Home
        </Link>
        <h1 className="font-display text-3xl sm:text-4xl font-semibold tracking-tight leading-tight mt-2">
          Three minutes on attention
        </h1>
        <p className="text-muted-foreground text-sm mt-2 max-w-xl">
          A guided tour of the platform's flywheel — a paragraph to read, a
          visualization to play with, a question to check yourself, and an AI
          tutor that knows where you've been. Hover any{" "}
          <span className="text-primary underline decoration-dotted underline-offset-2">
            dotted link
          </span>{" "}
          to see the concept card.
        </p>

        <ol className="flex items-center gap-1 flex-wrap mt-6 text-xs">
          {STEP_ORDER.map((id, i) => {
            const done = reached.has(id) && id !== active;
            const current = id === active;
            return (
              <li key={id} className="flex items-center">
                <button
                  type="button"
                  disabled={!reached.has(id)}
                  onClick={() => setActive(id)}
                  className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full transition-colors ${
                    current
                      ? "bg-primary text-primary-foreground"
                      : done
                        ? "text-muted-foreground hover:text-foreground"
                        : "text-muted-foreground/50"
                  } ${reached.has(id) ? "" : "cursor-not-allowed"}`}
                >
                  {done ? (
                    <CheckCircle2 className="w-3 h-3" strokeWidth={2} />
                  ) : (
                    <Circle className="w-3 h-3" strokeWidth={2} />
                  )}
                  <span className="font-medium">
                    {i + 1}. {STEP_LABEL[id]}
                  </span>
                </button>
                {i < STEP_ORDER.length - 1 && (
                  <span className="text-muted-foreground/30 mx-0.5">→</span>
                )}
              </li>
            );
          })}
        </ol>
      </div>

      <div className="space-y-6">
        {/* Step 1: Read */}
        {(active === "read" || reached.has("viz")) && (
          <StepCard
            stepNumber={1}
            label={STEP_LABEL.read}
            collapsed={active !== "read"}
            onExpand={() => setActive("read")}
          >
            <div className="prose-sm max-w-none">
              <MarkdownRenderer content={READ_BODY} />
            </div>
            {active === "read" && (
              <ContinueButton onClick={() => advance("viz")}>
                Show me the heatmap
              </ContinueButton>
            )}
          </StepCard>
        )}

        {/* Step 2: Visualize */}
        {(active === "viz" || reached.has("quiz")) && (
          <StepCard
            stepNumber={2}
            label={STEP_LABEL.viz}
            collapsed={active !== "viz"}
            onExpand={() => setActive("viz")}
          >
            <p className="text-sm text-muted-foreground mb-3">
              Each cell is the attention weight from a query token (row) to a
              key token (column). Try a few sentences and watch how attention
              concentrates.
            </p>
            <VizEmbed name="attention-heatmap" />
            {active === "viz" && (
              <ContinueButton onClick={() => advance("quiz")}>
                Got it — quiz me
              </ContinueButton>
            )}
          </StepCard>
        )}

        {/* Step 3: Quiz */}
        {(active === "quiz" || reached.has("coach")) && (
          <StepCard
            stepNumber={3}
            label={STEP_LABEL.quiz}
            collapsed={active !== "quiz"}
            onExpand={() => setActive("quiz")}
          >
            <p className="text-sm font-medium mb-3">{QUIZ.question}</p>
            <div className="space-y-1.5">
              {QUIZ.options.map((opt, i) => {
                const picked = pickedIdx === i;
                const correct = revealed && i === QUIZ.correctIndex;
                const wrong = revealed && picked && i !== QUIZ.correctIndex;
                return (
                  <button
                    key={i}
                    type="button"
                    disabled={revealed}
                    onClick={() => {
                      setPickedIdx(i);
                      setRevealed(true);
                    }}
                    className={`block w-full text-left px-3 py-2 rounded-md border text-sm transition-colors ${
                      correct
                        ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                        : wrong
                          ? "border-rose-500/50 bg-rose-500/10 text-rose-700 dark:text-rose-300"
                          : picked
                            ? "border-primary bg-primary/10"
                            : "border-border hover:bg-accent/40"
                    }`}
                  >
                    {opt}
                  </button>
                );
              })}
            </div>
            {revealed && (
              <div className="mt-3 p-3 rounded-md bg-muted/50 border border-border text-sm">
                <strong>{pickedIdx === QUIZ.correctIndex ? "Right." : "Not quite."}</strong>{" "}
                {QUIZ.explanation}
              </div>
            )}
            {active === "quiz" && revealed && (
              <ContinueButton onClick={() => advance("coach")}>
                Ask the tutor
              </ContinueButton>
            )}
          </StepCard>
        )}

        {/* Step 4: Coach */}
        {(active === "coach" || reached.has("continue")) && (
          <StepCard
            stepNumber={4}
            label={STEP_LABEL.coach}
            collapsed={active !== "coach"}
            onExpand={() => setActive("coach")}
          >
            <p className="text-sm text-muted-foreground mb-3">
              The AI tutor reads your mistakes and recent lessons (when you're
              signed in) and answers Socratic-style — it asks one calibrated
              question rather than dumping the answer. Open it and try{" "}
              <em>"why divide by √d_k?"</em> — it'll point at the variance
              argument from the question above.
            </p>
            <button
              type="button"
              onClick={() => setCoachOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90"
            >
              <Sparkles className="w-4 h-4" strokeWidth={2} />
              Open the tutor
            </button>
            {!user && (
              <p className="text-xs text-muted-foreground mt-2">
                Sign in to get the personalized "Quick checks for you" header
                that uses your mistakes + due flashcards.
              </p>
            )}
            {active === "coach" && (
              <ContinueButton onClick={() => advance("continue")}>
                Show me what's next
              </ContinueButton>
            )}
          </StepCard>
        )}

        {/* Step 5: Continue */}
        {active === "continue" && (
          <StepCard stepNumber={5} label={STEP_LABEL.continue}>
            <p className="text-sm text-muted-foreground mb-4">
              Three minutes covered the loop. The platform is the same loop, at
              scale: every wiki concept has a lesson, an interactive viz, a
              forum thread, claim-anchored discussions, and reproducibility
              receipts on the news side.
            </p>
            <div className="grid sm:grid-cols-2 gap-3">
              <Link
                to="/paths/ml-engineer/lessons/attention-intro"
                className="flex items-start gap-3 p-3 rounded-md border border-border hover:bg-accent/30 transition-colors"
              >
                <GraduationCap className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" strokeWidth={1.8} />
                <div>
                  <div className="text-sm font-medium">Take the full lesson</div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Six concept slides + check-your-understanding questions on
                    the ML Engineer path.
                  </p>
                </div>
              </Link>
              <Link
                to="/wiki/attention"
                className="flex items-start gap-3 p-3 rounded-md border border-border hover:bg-accent/30 transition-colors"
              >
                <ArrowRight className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" strokeWidth={1.8} />
                <div>
                  <div className="text-sm font-medium">Read the wiki page</div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Three tiers — intro, undergrad math, research-frontier.
                  </p>
                </div>
              </Link>
              <Link
                to="/forum?wiki=attention"
                className="flex items-start gap-3 p-3 rounded-md border border-border hover:bg-accent/30 transition-colors"
              >
                <MessageSquare className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" strokeWidth={1.8} />
                <div>
                  <div className="text-sm font-medium">Join the discussion</div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Forum threads tagged to the attention page; structured
                    claims, questions, and critiques.
                  </p>
                </div>
              </Link>
              <Link
                to="/news"
                className="flex items-start gap-3 p-3 rounded-md border border-border hover:bg-accent/30 transition-colors"
              >
                <Sparkles className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" strokeWidth={1.8} />
                <div>
                  <div className="text-sm font-medium">Browse research articles</div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    With claim-anchored threads, runnable artifacts, and
                    reproducibility receipts.
                  </p>
                </div>
              </Link>
            </div>
            {!user && (
              <Link
                to="/signup"
                className="block mt-5 text-center px-4 py-2.5 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90"
              >
                Sign up to track your progress &rarr;
              </Link>
            )}
          </StepCard>
        )}
      </div>

      {/* Sprint 66d — consolidated to TutorMount so the demo gains
          per-page session history + selection-to-chat + settings popover
          for free, matching every other content surface. */}
      <TutorMount
        pageSlug="attention"
        pageTitle="Attention Mechanism"
        tier="intro"
        hideButton
        open={coachOpen}
        onOpenChange={setCoachOpen}
      />
    </div>
  );
}

function StepCard({
  stepNumber,
  label,
  collapsed,
  onExpand,
  children,
}: {
  stepNumber: number;
  label: string;
  collapsed?: boolean;
  onExpand?: () => void;
  children: React.ReactNode;
}) {
  if (collapsed) {
    return (
      <button
        type="button"
        onClick={onExpand}
        className="w-full text-left p-4 rounded-lg border border-border bg-muted/30 hover:bg-muted/50 transition-colors"
      >
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" strokeWidth={2} />
          Step {stepNumber} · {label}
        </div>
      </button>
    );
  }
  return (
    <div className="p-5 rounded-lg border border-border bg-card shadow-soft animate-fade-in">
      <div className="text-[10px] uppercase tracking-wider text-primary font-medium mb-3">
        Step {stepNumber} · {label}
      </div>
      {children}
    </div>
  );
}

function ContinueButton({
  onClick,
  children,
}: {
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-4 flex justify-end">
      <button
        type="button"
        onClick={onClick}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md bg-foreground text-background hover:bg-foreground/90"
      >
        {children}
        <ArrowRight className="w-3.5 h-3.5" strokeWidth={2} />
      </button>
    </div>
  );
}
