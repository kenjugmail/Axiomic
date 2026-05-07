// Sprint 21 — AI Research Paper Generator wizard.
//
// Five-step authoring flow that orchestrates the /ai/paper/* endpoints
// and hands a finished draft to the standard /research/:slug/edit
// surface. State is persisted to localStorage on every step so a
// refresh doesn't blow up work.
//
// Steps:
//   1. Topic         — title, research question, format, tier, length
//   2. Outline       — AI generates {sections: [{title, kind, bullets}]}
//   3. Sections      — author drafts each section (one at a time or all)
//   4. Enrich        — viz + concept + reference suggestions
//   5. Review        — set slug + cover, save as draft, hand off to editor
//
// The "Auto-draft" button at the top runs steps 2-3 in series and
// lands the user on Step 4 (enrich). This is the power-user shortcut.

import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Circle,
  GraduationCap,
  Loader2,
  RotateCcw,
  Sparkles,
  Trash2,
  Wand2,
} from "lucide-react";
import type {
  PaperConceptSuggestion,
  PaperLengthTarget,
  PaperOutlineSection,
  PaperOutlineSectionKind,
  PaperReferenceSuggestion,
  PaperVizSuggestion,
  ResearchPaperFormat,
  ResearchPaperTier,
} from "@axiomic/types";
import { api } from "../lib/api";
import { streamTokens } from "../lib/streamTokens";
import { useAuthStore } from "../stores/auth";
import { MarkdownRenderer } from "../components/MarkdownRenderer";
import { RichComposer } from "../components/composer/RichComposer";

// --- Wizard state model --------------------------------------------

interface WizardState {
  // Step 1.
  title: string;
  researchQuestion: string;
  format: ResearchPaperFormat;
  tier: ResearchPaperTier;
  length: PaperLengthTarget;
  // Step 2.
  sections: PaperOutlineSection[];
  // Step 3 lives inside sections[].body.
  // Step 5.
  slug: string;
  coverEmoji: string;
}

const STORAGE_KEY = "axiomic.research.wizard.v1";

const EMPTY_STATE: WizardState = {
  title: "",
  researchQuestion: "",
  format: "research",
  tier: "undergrad",
  length: "medium",
  sections: [],
  slug: "",
  coverEmoji: "📄",
};

function loadState(): WizardState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY_STATE;
    const parsed = JSON.parse(raw);
    return { ...EMPTY_STATE, ...parsed };
  } catch {
    return EMPTY_STATE;
  }
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 120);
}

// Pull the largest balanced JSON object out of a streaming token blob
// the same way Sprint 13's LessonFromArticleDialog does.
function parseOutline(text: string): { sections: PaperOutlineSection[] } | null {
  const start = text.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  let end = -1;
  for (let i = start; i < text.length; i++) {
    if (text[i] === "{") depth++;
    else if (text[i] === "}") {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  if (end === -1) return null;
  try {
    const parsed = JSON.parse(text.slice(start, end + 1));
    if (!Array.isArray(parsed?.sections)) return null;
    return {
      sections: parsed.sections
        .filter(
          (s: any) =>
            s &&
            typeof s.title === "string" &&
            Array.isArray(s.bullets),
        )
        .map((s: any) => ({
          title: String(s.title).slice(0, 120),
          kind: (
            ["concept", "method", "result", "discussion", "background"] as const
          ).includes(s.kind)
            ? (s.kind as PaperOutlineSectionKind)
            : "concept",
          bullets: s.bullets.slice(0, 8).map((b: any) => String(b).slice(0, 400)),
          body: typeof s.body === "string" ? s.body : undefined,
        })),
    };
  } catch {
    return null;
  }
}

const STEPS = ["Topic", "Outline", "Sections", "Enrich", "Review"] as const;
type StepIdx = 0 | 1 | 2 | 3 | 4;

// --- Page -----------------------------------------------------------

export function ResearchWizardPage() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuthStore();
  const [state, setState] = useState<WizardState>(loadState);
  const [step, setStep] = useState<StepIdx>(0);
  const [error, setError] = useState<string | null>(null);

  // Persist on every state change.
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {}
  }, [state]);

  if (authLoading) return null;
  if (!user) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <p className="text-muted-foreground mb-4">
          Sign in to use the research-paper wizard.
        </p>
        <Link to="/login" className="text-primary hover:underline">
          Sign in
        </Link>
      </div>
    );
  }

  const setField = <K extends keyof WizardState>(k: K, v: WizardState[K]) =>
    setState((prev) => ({ ...prev, [k]: v }));

  const reset = () => {
    if (
      !confirm(
        "Discard the wizard state and start over? Anything not saved to a draft will be lost.",
      )
    )
      return;
    setState(EMPTY_STATE);
    setStep(0);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {}
  };

  const canGoNext = (() => {
    if (step === 0) return state.title.trim().length >= 3;
    if (step === 1) return state.sections.length > 0;
    if (step === 2)
      return state.sections.every((s) => (s.body ?? "").trim().length > 0);
    if (step === 3) return true;
    return false;
  })();

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between gap-3 mb-2 flex-wrap">
        <Link
          to="/research"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          &larr; Research
        </Link>
        <button
          type="button"
          onClick={reset}
          className="text-xs text-muted-foreground hover:text-destructive inline-flex items-center gap-1"
        >
          <RotateCcw className="w-3 h-3" strokeWidth={2} /> Reset wizard
        </button>
      </div>

      <h1 className="font-display text-3xl font-semibold tracking-tight">
        Generate a research paper
      </h1>
      <p className="text-sm text-muted-foreground mt-1.5 max-w-xl">
        AI assists at each step — outline, section drafts, viz / concept /
        reference suggestions, optional tier derivation. Edit anything along
        the way, or hit <strong>Auto-draft</strong> to run the full chain.
      </p>

      <ol className="flex items-center gap-1 flex-wrap mt-6 text-xs">
        {STEPS.map((label, i) => {
          const done = i < step;
          const current = i === step;
          return (
            <li key={label} className="flex items-center">
              <button
                type="button"
                onClick={() => i <= step && setStep(i as StepIdx)}
                disabled={i > step}
                className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full transition-colors ${
                  current
                    ? "bg-primary text-primary-foreground"
                    : done
                      ? "text-muted-foreground hover:text-foreground"
                      : "text-muted-foreground/40 cursor-not-allowed"
                }`}
              >
                {done ? (
                  <CheckCircle2 className="w-3 h-3" strokeWidth={2} />
                ) : (
                  <Circle className="w-3 h-3" strokeWidth={2} />
                )}
                <span className="font-medium">
                  {i + 1}. {label}
                </span>
              </button>
              {i < STEPS.length - 1 && (
                <span className="text-muted-foreground/30 mx-0.5">→</span>
              )}
            </li>
          );
        })}
      </ol>

      {error && (
        <div className="mt-4 p-3 rounded-md bg-destructive/10 text-destructive text-sm">
          {error}
        </div>
      )}

      <div className="mt-6">
        {step === 0 && (
          <StepTopic
            state={state}
            setField={setField}
            onNext={() => setStep(1)}
          />
        )}
        {step === 1 && (
          <StepOutline
            state={state}
            setField={setField}
            setError={setError}
            onBack={() => setStep(0)}
            onNext={() => setStep(2)}
          />
        )}
        {step === 2 && (
          <StepSections
            state={state}
            setField={setField}
            setError={setError}
            onBack={() => setStep(1)}
            onNext={() => setStep(3)}
          />
        )}
        {step === 3 && (
          <StepEnrich
            state={state}
            setField={setField}
            onBack={() => setStep(2)}
            onNext={() => setStep(4)}
          />
        )}
        {step === 4 && (
          <StepReview
            state={state}
            setField={setField}
            setError={setError}
            onBack={() => setStep(3)}
            onSaved={(slug) => {
              try {
                localStorage.removeItem(STORAGE_KEY);
              } catch {}
              navigate(`/research/${slug}/edit`);
            }}
          />
        )}
      </div>

      {!canGoNext && step < 4 && (
        <p className="text-xs text-muted-foreground mt-4 italic">
          Complete this step to continue.
        </p>
      )}
    </div>
  );
}

// --- Step 1: Topic --------------------------------------------------

const FORMATS: Array<{ value: ResearchPaperFormat; label: string; blurb: string }> = [
  { value: "research", label: "Research", blurb: "Original results + method." },
  { value: "explainer", label: "Explainer", blurb: "Existing concepts, made accessible." },
  { value: "survey", label: "Survey", blurb: "Lay of the land + open questions." },
  { value: "opinion", label: "Opinion", blurb: "Argued position with evidence." },
];

const TIERS: Array<{ value: ResearchPaperTier; label: string; blurb: string }> = [
  { value: "intro", label: "Intro", blurb: "Plain English, no math." },
  { value: "undergrad", label: "Undergrad", blurb: "Math + worked examples." },
  { value: "grad", label: "Grad", blurb: "Research-flavored, terse." },
];

const LENGTHS: Array<{ value: PaperLengthTarget; label: string; words: string }> = [
  { value: "short", label: "Short", words: "400-600 words" },
  { value: "medium", label: "Medium", words: "800-1400 words" },
  { value: "deep", label: "Deep dive", words: "1800-3000 words" },
];

function StepTopic({
  state,
  setField,
  onNext,
}: {
  state: WizardState;
  setField: <K extends keyof WizardState>(k: K, v: WizardState[K]) => void;
  onNext: () => void;
}) {
  return (
    <div className="space-y-5">
      <div>
        <label className="block text-xs font-medium text-muted-foreground mb-1">
          Title
        </label>
        <input
          autoFocus
          value={state.title}
          onChange={(e) => setField("title", e.target.value)}
          placeholder="A precise, descriptive paper title"
          className="w-full px-3 py-2 rounded-md border border-input bg-background text-base font-semibold focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-muted-foreground mb-1">
          Research question{" "}
          <span className="text-[10px]">(optional, but helps the outliner focus)</span>
        </label>
        <textarea
          value={state.researchQuestion}
          onChange={(e) => setField("researchQuestion", e.target.value)}
          rows={2}
          placeholder="What's the core question you're answering?"
          className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm resize-y focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-muted-foreground mb-2">
          Format
        </label>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {FORMATS.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => setField("format", f.value)}
              className={`text-left px-3 py-2 rounded-md border transition-colors ${
                state.format === f.value
                  ? "border-primary bg-primary/5"
                  : "border-border hover:bg-accent/40"
              }`}
            >
              <div className="text-sm font-medium">{f.label}</div>
              <div className="text-[10px] text-muted-foreground mt-0.5">
                {f.blurb}
              </div>
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-muted-foreground mb-2">
          Reading depth (the canonical tier the wizard drafts)
        </label>
        <div className="grid grid-cols-3 gap-2">
          {TIERS.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => setField("tier", t.value)}
              className={`text-left px-3 py-2 rounded-md border transition-colors ${
                state.tier === t.value
                  ? "border-primary bg-primary/5"
                  : "border-border hover:bg-accent/40"
              }`}
            >
              <div className="text-sm font-medium">{t.label}</div>
              <div className="text-[10px] text-muted-foreground mt-0.5">
                {t.blurb}
              </div>
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-muted-foreground mb-2">
          Length target
        </label>
        <div className="grid grid-cols-3 gap-2">
          {LENGTHS.map((l) => (
            <button
              key={l.value}
              type="button"
              onClick={() => setField("length", l.value)}
              className={`text-left px-3 py-2 rounded-md border transition-colors ${
                state.length === l.value
                  ? "border-primary bg-primary/5"
                  : "border-border hover:bg-accent/40"
              }`}
            >
              <div className="text-sm font-medium">{l.label}</div>
              <div className="text-[10px] text-muted-foreground mt-0.5">
                {l.words}
              </div>
            </button>
          ))}
        </div>
      </div>

      <div className="flex justify-end pt-2">
        <button
          type="button"
          onClick={onNext}
          disabled={state.title.trim().length < 3}
          className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
        >
          Outline
          <ArrowRight className="w-3.5 h-3.5" strokeWidth={2} />
        </button>
      </div>
    </div>
  );
}

// --- Step 2: Outline (with Auto-draft kickoff) ----------------------

const KIND_LABEL: Record<PaperOutlineSectionKind, string> = {
  concept: "Concept",
  method: "Method",
  result: "Result",
  discussion: "Discussion",
  background: "Background",
};

function StepOutline({
  state,
  setField,
  setError,
  onBack,
  onNext,
}: {
  state: WizardState;
  setField: <K extends keyof WizardState>(k: K, v: WizardState[K]) => void;
  setError: (msg: string | null) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const [streaming, setStreaming] = useState(false);
  const [raw, setRaw] = useState("");
  const [autoDraftRunning, setAutoDraftRunning] = useState(false);
  const [autoDraftStatus, setAutoDraftStatus] = useState<string>("");

  const runOutline = async (): Promise<{ sections: PaperOutlineSection[] } | null> => {
    setStreaming(true);
    setError(null);
    setRaw("");
    let final: { sections: PaperOutlineSection[] } | null = null;
    try {
      const res = await api.ai.paperOutline({
        title: state.title.trim(),
        researchQuestion: state.researchQuestion.trim() || undefined,
        format: state.format,
        tier: state.tier,
        length: state.length,
      });
      const result = await streamTokens({
        url: "",
        body: undefined,
        onToken: (_t, acc) => {
          setRaw(acc);
          const p = parseOutline(acc);
          if (p) final = p;
        },
        signal: undefined,
        existingResponse: res,
      });
      if (!result.ok && result.error) {
        setError(result.error);
        setStreaming(false);
        return null;
      }
      const parsedFinal = parseOutline(result.text);
      if (parsedFinal) final = parsedFinal;
    } catch (e: any) {
      setError(e?.message ?? "Outline failed");
      setStreaming(false);
      return null;
    }
    setStreaming(false);
    if (final) {
      setField("sections", final.sections);
    } else {
      setError("Couldn't parse the outline. Try again.");
    }
    return final;
  };

  const generate = () => runOutline();

  const autoDraft = async () => {
    setAutoDraftRunning(true);
    setAutoDraftStatus("Outlining…");
    const outline = await runOutline();
    if (!outline) {
      setAutoDraftRunning(false);
      return;
    }
    // Now draft each section in series, accumulating into state.
    let prior = "";
    const drafted: PaperOutlineSection[] = [];
    for (let i = 0; i < outline.sections.length; i++) {
      const s = outline.sections[i];
      setAutoDraftStatus(
        `Drafting section ${i + 1}/${outline.sections.length}: ${s.title}…`,
      );
      try {
        const res = await api.ai.paperDraftSection({
          paper: { title: state.title.trim(), format: state.format },
          section: { title: s.title, kind: s.kind, bullets: s.bullets },
          prior,
          tier: state.tier,
          length: state.length,
        });
        const result = await streamTokens({
          url: "",
          body: undefined,
          onToken: () => {},
          existingResponse: res,
        });
        const body = result.text.trim();
        drafted.push({ ...s, body });
        prior = body;
        setField("sections", [
          ...drafted,
          ...outline.sections.slice(drafted.length),
        ]);
      } catch (e: any) {
        setError(e?.message ?? "Section draft failed");
        setAutoDraftRunning(false);
        return;
      }
    }
    setAutoDraftStatus("Done.");
    setAutoDraftRunning(false);
    setTimeout(onNext, 200);
  };

  const updateSection = (idx: number, patch: Partial<PaperOutlineSection>) => {
    const next = [...state.sections];
    next[idx] = { ...next[idx], ...patch };
    setField("sections", next);
  };

  const moveSection = (idx: number, dir: -1 | 1) => {
    const next = [...state.sections];
    const target = idx + dir;
    if (target < 0 || target >= next.length) return;
    [next[idx], next[target]] = [next[target], next[idx]];
    setField("sections", next);
  };

  const removeSection = (idx: number) => {
    setField(
      "sections",
      state.sections.filter((_, i) => i !== idx),
    );
  };

  const addSection = () => {
    setField("sections", [
      ...state.sections,
      { title: "New section", kind: "concept", bullets: [""] },
    ]);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="text-lg font-semibold">Outline</h2>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={generate}
            disabled={streaming || autoDraftRunning}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-primary/40 text-primary text-sm font-medium hover:bg-primary/10 disabled:opacity-50"
          >
            {streaming ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={2} />
            ) : (
              <Sparkles className="w-3.5 h-3.5" strokeWidth={2} />
            )}
            {state.sections.length > 0 ? "Regenerate" : "Generate outline"}
          </button>
          <button
            type="button"
            onClick={autoDraft}
            disabled={streaming || autoDraftRunning}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-foreground text-background text-sm font-medium hover:bg-foreground/90 disabled:opacity-50"
            title="Generate the outline + draft every section in one go."
          >
            <Wand2 className="w-3.5 h-3.5" strokeWidth={2} />
            Auto-draft
          </button>
        </div>
      </div>

      {(streaming || autoDraftRunning) && (
        <div className="flex items-center gap-2 text-xs text-primary">
          <Loader2 className="w-3 h-3 animate-spin" strokeWidth={2} />
          {autoDraftRunning
            ? autoDraftStatus
            : "Streaming outline…"}
        </div>
      )}

      {state.sections.length === 0 ? (
        <div className="p-6 rounded-md border border-dashed border-border text-center text-sm text-muted-foreground">
          {streaming
            ? "Working…"
            : "Click Generate outline to start, or Auto-draft to skip ahead."}
          {raw && !state.sections.length && (
            <pre className="text-[10px] font-mono mt-3 max-h-32 overflow-y-auto text-left">
              {raw.slice(0, 800)}
            </pre>
          )}
        </div>
      ) : (
        <ol className="space-y-2">
          {state.sections.map((s, i) => (
            <li
              key={i}
              className="p-3 rounded-md border border-border bg-card"
            >
              <div className="flex items-center gap-2 mb-2">
                <select
                  value={s.kind}
                  onChange={(e) =>
                    updateSection(i, { kind: e.target.value as PaperOutlineSectionKind })
                  }
                  className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-muted text-muted-foreground border border-border"
                >
                  {(["concept", "method", "result", "discussion", "background"] as const).map(
                    (k) => (
                      <option key={k} value={k}>
                        {KIND_LABEL[k]}
                      </option>
                    ),
                  )}
                </select>
                <input
                  value={s.title}
                  onChange={(e) => updateSection(i, { title: e.target.value })}
                  className="flex-1 px-2 py-1 rounded border border-input bg-background text-sm font-medium focus:outline-none focus:ring-2 focus:ring-ring"
                />
                <button
                  type="button"
                  onClick={() => moveSection(i, -1)}
                  disabled={i === 0}
                  className="text-xs text-muted-foreground hover:text-foreground disabled:opacity-30"
                  aria-label="Move up"
                >
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() => moveSection(i, 1)}
                  disabled={i === state.sections.length - 1}
                  className="text-xs text-muted-foreground hover:text-foreground disabled:opacity-30"
                  aria-label="Move down"
                >
                  ↓
                </button>
                <button
                  type="button"
                  onClick={() => removeSection(i)}
                  className="text-muted-foreground hover:text-destructive"
                  aria-label="Remove section"
                >
                  <Trash2 className="w-3.5 h-3.5" strokeWidth={2} />
                </button>
              </div>
              <textarea
                value={s.bullets.join("\n")}
                onChange={(e) =>
                  updateSection(i, {
                    bullets: e.target.value
                      .split("\n")
                      .map((b) => b.trim())
                      .filter(Boolean),
                  })
                }
                rows={Math.max(3, s.bullets.length)}
                placeholder="One bullet per line"
                className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm resize-y focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </li>
          ))}
        </ol>
      )}

      {state.sections.length > 0 && (
        <button
          type="button"
          onClick={addSection}
          className="text-xs px-3 py-1.5 rounded-md border border-dashed border-border hover:bg-accent/40 text-muted-foreground"
        >
          + Add section
        </button>
      )}

      <div className="flex justify-between pt-3">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="w-3.5 h-3.5" strokeWidth={2} /> Back
        </button>
        <button
          type="button"
          onClick={onNext}
          disabled={state.sections.length === 0}
          className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-md bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50"
        >
          Draft sections
          <ArrowRight className="w-3.5 h-3.5" strokeWidth={2} />
        </button>
      </div>
    </div>
  );
}

// --- Step 3: Section drafts ----------------------------------------

function StepSections({
  state,
  setField,
  setError,
  onBack,
  onNext,
}: {
  state: WizardState;
  setField: <K extends keyof WizardState>(k: K, v: WizardState[K]) => void;
  setError: (msg: string | null) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const [activeIdx, setActiveIdx] = useState<number>(() =>
    state.sections.findIndex((s) => !s.body?.trim()) >= 0
      ? state.sections.findIndex((s) => !s.body?.trim())
      : 0,
  );
  const [streaming, setStreaming] = useState(false);

  const current = state.sections[activeIdx];

  const updateBody = (body: string) => {
    const next = [...state.sections];
    next[activeIdx] = { ...next[activeIdx], body };
    setField("sections", next);
  };

  const draftCurrent = async () => {
    if (!current || streaming) return;
    setStreaming(true);
    setError(null);
    const prior = state.sections
      .slice(0, activeIdx)
      .map((s) => s.body ?? "")
      .filter(Boolean)
      .join("\n\n")
      .slice(-1500);
    try {
      const res = await api.ai.paperDraftSection({
        paper: { title: state.title.trim(), format: state.format },
        section: { title: current.title, kind: current.kind, bullets: current.bullets },
        prior,
        tier: state.tier,
        length: state.length,
      });
      const result = await streamTokens({
        url: "",
        body: undefined,
        onToken: (_t, acc) => {
          updateBody(acc);
        },
        existingResponse: res,
      });
      if (!result.ok && result.error) {
        setError(result.error);
      }
    } catch (e: any) {
      setError(e?.message ?? "Section draft failed");
    } finally {
      setStreaming(false);
    }
  };

  const allDrafted = state.sections.every((s) => (s.body ?? "").trim().length > 0);

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Draft each section</h2>
      <div className="flex flex-wrap gap-1.5">
        {state.sections.map((s, i) => {
          const drafted = (s.body ?? "").trim().length > 0;
          const active = i === activeIdx;
          return (
            <button
              key={i}
              type="button"
              onClick={() => setActiveIdx(i)}
              className={`inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border ${
                active
                  ? "border-primary bg-primary/10 text-primary"
                  : drafted
                    ? "border-emerald-500/40 bg-emerald-500/5 text-emerald-700 dark:text-emerald-300"
                    : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {drafted ? (
                <CheckCircle2 className="w-3 h-3" strokeWidth={2} />
              ) : (
                <Circle className="w-3 h-3" strokeWidth={2} />
              )}
              {i + 1}. {s.title}
            </button>
          );
        })}
      </div>

      {current && (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
              {KIND_LABEL[current.kind]} · bullets
            </div>
            <button
              type="button"
              onClick={draftCurrent}
              disabled={streaming}
              className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-primary/40 text-primary hover:bg-primary/10 disabled:opacity-50"
            >
              {streaming ? (
                <Loader2 className="w-3 h-3 animate-spin" strokeWidth={2} />
              ) : (
                <Sparkles className="w-3 h-3" strokeWidth={2} />
              )}
              {(current.body ?? "").trim().length > 0
                ? "Re-draft"
                : "Draft this section"}
            </button>
          </div>
          <ul className="text-xs text-muted-foreground list-disc list-inside space-y-1">
            {current.bullets.map((b, i) => (
              <li key={i}>{b}</li>
            ))}
          </ul>
          <RichComposer
            value={current.body ?? ""}
            onChange={updateBody}
            rows={12}
            placeholder="Section body — markdown + LaTeX, plus :::viz[name] embeds and [[concept-slug]] links."
          />
        </div>
      )}

      <div className="flex justify-between pt-3">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="w-3.5 h-3.5" strokeWidth={2} /> Back
        </button>
        <button
          type="button"
          onClick={onNext}
          disabled={!allDrafted}
          className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-md bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50"
        >
          Enrich
          <ArrowRight className="w-3.5 h-3.5" strokeWidth={2} />
        </button>
      </div>
    </div>
  );
}

// --- Step 4: Enrich (viz / concepts / references) -------------------

function StepEnrich({
  state,
  setField,
  onBack,
  onNext,
}: {
  state: WizardState;
  setField: <K extends keyof WizardState>(k: K, v: WizardState[K]) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const [vizSuggestions, setVizSuggestions] = useState<
    Record<number, PaperVizSuggestion[]>
  >({});
  const [conceptSuggestions, setConceptSuggestions] = useState<
    PaperConceptSuggestion[] | null
  >(null);
  const [refSuggestions, setRefSuggestions] = useState<
    PaperReferenceSuggestion[] | null
  >(null);
  const [busy, setBusy] = useState(false);

  const fullBody = useMemo(
    () =>
      state.sections
        .map((s) => `## ${s.title}\n\n${s.body ?? ""}`)
        .join("\n\n"),
    [state.sections],
  );

  // Auto-fetch suggestions on mount.
  useEffect(() => {
    let cancelled = false;
    setBusy(true);
    Promise.all([
      // Per-section viz.
      Promise.all(
        state.sections.map((s) =>
          api.ai
            .paperSuggestViz({ title: s.title, body: s.body ?? "" })
            .then((r) => r.suggestions)
            .catch(() => []),
        ),
      ),
      api.ai
        .paperSuggestConcepts(fullBody)
        .then((r) => r.suggestions)
        .catch(() => []),
      api.ai
        .paperSuggestReferences({ title: state.title, body: fullBody })
        .then((r) => r.suggestions)
        .catch(() => []),
    ]).then(([vizArrays, concepts, refs]) => {
      if (cancelled) return;
      const vizMap: Record<number, PaperVizSuggestion[]> = {};
      vizArrays.forEach((s, i) => (vizMap[i] = s));
      setVizSuggestions(vizMap);
      setConceptSuggestions(concepts);
      setRefSuggestions(refs);
      setBusy(false);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const insertVizIntoSection = (sectionIdx: number, vizName: string) => {
    const section = state.sections[sectionIdx];
    const directive = `\n\n:::viz[${vizName}]\n\n`;
    if ((section.body ?? "").includes(directive.trim())) return;
    const next = [...state.sections];
    next[sectionIdx] = {
      ...section,
      body: (section.body ?? "") + directive,
    };
    setField("sections", next);
  };

  const insertConceptInTopSection = (slug: string) => {
    if (state.sections.length === 0) return;
    const targetIdx = 0;
    const next = [...state.sections];
    const body = next[targetIdx].body ?? "";
    if (body.includes(`[[${slug}]]`) || body.includes(`[[${slug}|`)) return;
    // Insert as a parenthetical at the end of the first paragraph.
    const para = body.split(/\n\s*\n/)[0] ?? "";
    if (!para) return;
    const replaced = body.replace(para, `${para} ([[${slug}]])`);
    next[targetIdx] = { ...next[targetIdx], body: replaced };
    setField("sections", next);
  };

  return (
    <div className="space-y-5">
      <h2 className="text-lg font-semibold">Enrich</h2>
      <p className="text-sm text-muted-foreground">
        AI-suggested visualizations, concept links, and references. Click to
        insert; skip what doesn't fit.
      </p>

      {busy && (
        <div className="flex items-center gap-2 text-xs text-primary">
          <Loader2 className="w-3 h-3 animate-spin" strokeWidth={2} />
          Looking for matches…
        </div>
      )}

      {/* Visualizations */}
      <section>
        <h3 className="text-[10px] uppercase tracking-wider text-primary mb-2">
          Visualizations
        </h3>
        {state.sections.map((s, i) => {
          const vs = vizSuggestions[i] ?? [];
          if (vs.length === 0) return null;
          return (
            <div key={i} className="mb-3">
              <div className="text-xs text-muted-foreground mb-1">
                Section {i + 1}: {s.title}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {vs.map((v) => {
                  const inserted = (s.body ?? "").includes(`:::viz[${v.name}]`);
                  return (
                    <button
                      key={v.name}
                      type="button"
                      onClick={() => insertVizIntoSection(i, v.name)}
                      disabled={inserted}
                      className={`text-xs px-2.5 py-1 rounded-md border transition-colors ${
                        inserted
                          ? "border-emerald-500/40 bg-emerald-500/5 text-emerald-700 dark:text-emerald-300"
                          : "border-border hover:bg-accent/40"
                      }`}
                      title={v.blurb}
                    >
                      {inserted ? "✓ " : "+ "}
                      {v.name}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
        {Object.values(vizSuggestions).every((v) => v.length === 0) && !busy && (
          <p className="text-xs text-muted-foreground italic">
            No matching viz from the catalog. Skip ahead.
          </p>
        )}
      </section>

      {/* Concept links */}
      <section>
        <h3 className="text-[10px] uppercase tracking-wider text-primary mb-2">
          Concept links
        </h3>
        {conceptSuggestions === null ? null : conceptSuggestions.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">
            No matching wiki concepts found.
          </p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {conceptSuggestions.map((c) => {
              const inserted = state.sections.some(
                (s) =>
                  (s.body ?? "").includes(`[[${c.slug}]]`) ||
                  (s.body ?? "").includes(`[[${c.slug}|`),
              );
              return (
                <button
                  key={c.slug}
                  type="button"
                  onClick={() => insertConceptInTopSection(c.slug)}
                  disabled={inserted}
                  className={`text-xs px-2.5 py-1 rounded-md border transition-colors ${
                    inserted
                      ? "border-emerald-500/40 bg-emerald-500/5 text-emerald-700 dark:text-emerald-300"
                      : "border-border hover:bg-accent/40"
                  }`}
                  title={`${c.title} — adds [[${c.slug}]] to your first section.`}
                >
                  {inserted ? "✓ " : "+ "}
                  [[{c.slug}]]
                </button>
              );
            })}
          </div>
        )}
      </section>

      {/* References */}
      <section>
        <h3 className="text-[10px] uppercase tracking-wider text-primary mb-2">
          Suggested references
        </h3>
        {refSuggestions === null ? null : refSuggestions.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">
            No close matches in the platform corpus yet.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {refSuggestions.map((r) => (
              <li
                key={r.slug}
                className="text-sm flex items-start gap-2 px-3 py-2 rounded-md border border-border"
              >
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground flex-shrink-0 mt-0.5">
                  {r.kind}
                </span>
                <Link
                  to={r.url}
                  target="_blank"
                  className="flex-1 hover:underline"
                >
                  {r.title}
                </Link>
                <span className="text-[10px] text-muted-foreground tabular-nums">
                  {(r.score * 100).toFixed(0)}%
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="text-[11px] text-muted-foreground mt-2 italic">
          References show in the editor's Reference list — copy any of these
          there manually if you want to cite them.
        </p>
      </section>

      <div className="flex justify-between pt-3">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="w-3.5 h-3.5" strokeWidth={2} /> Back
        </button>
        <button
          type="button"
          onClick={onNext}
          className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-md bg-primary text-primary-foreground text-sm font-medium"
        >
          Review
          <ArrowRight className="w-3.5 h-3.5" strokeWidth={2} />
        </button>
      </div>
    </div>
  );
}

// --- Step 5: Review + save -----------------------------------------

function StepReview({
  state,
  setField,
  setError,
  onBack,
  onSaved,
}: {
  state: WizardState;
  setField: <K extends keyof WizardState>(k: K, v: WizardState[K]) => void;
  setError: (msg: string | null) => void;
  onBack: () => void;
  onSaved: (slug: string) => void;
}) {
  const [saving, setSaving] = useState(false);
  const slugTouchedRef = useRef(false);

  // Auto-derive slug from title once.
  useEffect(() => {
    if (!slugTouchedRef.current && !state.slug) {
      setField("slug", slugify(state.title));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.title]);

  const fullBody = state.sections
    .map((s) => `## ${s.title}\n\n${s.body ?? ""}`)
    .join("\n\n");

  const tierKey =
    state.tier === "intro"
      ? "contentIntro"
      : state.tier === "grad"
        ? "contentGrad"
        : "contentUndergrad";

  const save = async () => {
    setError(null);
    if (!state.slug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(state.slug)) {
      setError("Slug must be kebab-case (e.g. rope-positional-encoding).");
      return;
    }
    setSaving(true);
    try {
      const create: any = {
        slug: state.slug,
        title: state.title.trim(),
        format: state.format,
        canonicalTier: state.tier,
        coverEmoji: state.coverEmoji,
        status: "draft",
        contentIntro: "",
        contentUndergrad: "",
        contentGrad: "",
      };
      create[tierKey] = fullBody;
      await api.research.create(create);
      onSaved(state.slug);
    } catch (e: any) {
      setError(e?.message ?? "Failed to save draft");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <h2 className="text-lg font-semibold">Review</h2>
      <p className="text-sm text-muted-foreground">
        Final check before saving as a draft. You'll land in the editor with
        full control — tweak metadata, references, derive other tiers via the
        editor's tier tabs.
      </p>

      <div className="grid sm:grid-cols-[1fr_auto] gap-3">
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">
            Slug
          </label>
          <input
            value={state.slug}
            onChange={(e) => {
              slugTouchedRef.current = true;
              setField("slug", e.target.value);
            }}
            placeholder="kebab-case-title"
            className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">
            Cover
          </label>
          <input
            value={state.coverEmoji}
            onChange={(e) => setField("coverEmoji", e.target.value)}
            maxLength={4}
            className="w-20 px-3 py-2 rounded-md border border-input bg-background text-2xl text-center focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <div className="px-4 py-2 border-b border-border bg-muted/30 text-[10px] uppercase tracking-wider text-muted-foreground">
          Preview ({state.tier} tier)
        </div>
        <div className="p-5 prose-sm max-w-none">
          <h1 className="text-2xl font-display font-semibold mb-3">
            {state.title || "Untitled"}
          </h1>
          {fullBody.trim() ? (
            <MarkdownRenderer content={fullBody} />
          ) : (
            <p className="italic text-muted-foreground">No content yet.</p>
          )}
        </div>
      </div>

      <div className="flex justify-between pt-3">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="w-3.5 h-3.5" strokeWidth={2} /> Back
        </button>
        <button
          type="button"
          onClick={save}
          disabled={saving || !state.slug}
          className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-md bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50"
        >
          <GraduationCap className="w-3.5 h-3.5" strokeWidth={2} />
          {saving ? "Saving…" : "Save draft & open editor"}
        </button>
      </div>
    </div>
  );
}
