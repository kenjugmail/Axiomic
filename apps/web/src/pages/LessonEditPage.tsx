import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  BookOpen,
  Eye,
  HelpCircle,
  List as ListIcon,
  Plus,
  Save,
  Trash2,
  X as XIcon,
} from "lucide-react";
import { api } from "../lib/api";
import type { Lesson, LessonSlide } from "@axiomic/types";
import { MarkdownRenderer } from "../components/MarkdownRenderer";
import { LessonPreviewModal } from "../components/lesson/LessonPreviewModal";
import { useAuthStore } from "../stores/auth";
import { Skeleton } from "../components/ui";

const VIZ_NAMES: string[] = [
  "softmax-temperature-preview",
  "attention-heatmap-explorer",
  "gradient-descent-2d",
  "tokenizer-playground",
  "embedding-explorer",
  "layer-activations",
  "positional-encoding",
  "activation-function-gallery",
  "lorenz-attractor",
  "double-pendulum",
  "phase-portrait-1d",
];

function newTextSlide(): LessonSlide {
  return { kind: "text", title: "Untitled", body: "" };
}

function newQuestionSlide(): LessonSlide {
  return {
    kind: "question",
    question: {
      id: `q_${Math.random().toString(36).slice(2, 8)}`,
      kind: "multiple_choice",
      question: "What is …?",
      options: ["Option A", "Option B", "Option C"],
      correctIndex: 0,
    } as any,
  };
}

export function LessonEditPage() {
  const { pathSlug, nodeSlug } = useParams<{
    pathSlug: string;
    nodeSlug: string;
  }>();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuthStore();

  const [phase, setPhase] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [nodeId, setNodeId] = useState<string | null>(null);
  const [nodeTitle, setNodeTitle] = useState("");
  const [slides, setSlides] = useState<LessonSlide[]>([]);
  const [activeIdx, setActiveIdx] = useState(0);
  const [editMessage, setEditMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedVersion, setSavedVersion] = useState<number | null>(null);
  const [slidesDrawerOpen, setSlidesDrawerOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [versions, setVersions] = useState<
    Array<{
      version: number;
      editorUsername: string | null;
      editMessage: string | null;
      createdAt: string;
    }>
  >([]);

  useEffect(() => {
    if (!pathSlug || !nodeSlug) return;
    let cancelled = false;
    setPhase("loading");
    api.mastery
      .getPath(pathSlug)
      .then((p) => {
        const node = p.nodes.find((n) => n.slug === nodeSlug);
        if (!node) {
          setError("Node not found");
          setPhase("error");
          return;
        }
        setNodeId(node.id);
        setNodeTitle(node.title);

        return Promise.all([
          api.mastery.getLesson(node.id),
          api.mastery.listLessonVersions(node.id).catch(() => ({
            versions: [],
          })),
        ]).then(([lr, vr]) => {
          if (cancelled) return;
          const initial: LessonSlide[] =
            lr.lesson?.slides && lr.lesson.slides.length > 0
              ? (lr.lesson.slides as LessonSlide[])
              : [newTextSlide()];
          setSlides(initial);
          setVersions(vr.versions ?? []);
          setPhase("ready");
        });
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e?.message ?? "Failed to load");
        setPhase("error");
      });
    return () => {
      cancelled = true;
    };
  }, [pathSlug, nodeSlug]);

  // Body-scroll lock + Esc handler for the mobile slide drawer.
  useEffect(() => {
    if (!slidesDrawerOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSlidesDrawerOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
  }, [slidesDrawerOpen]);

  // Body-scroll lock + Esc handler for the preview modal.
  useEffect(() => {
    if (!previewOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPreviewOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
  }, [previewOpen]);

  const exitHref = pathSlug ? `/paths/${pathSlug}/lessons/${nodeSlug}` : "/paths";

  const updateSlide = (i: number, next: LessonSlide) => {
    setSlides((prev) => prev.map((s, j) => (j === i ? next : s)));
  };
  const removeSlide = (i: number) => {
    if (slides.length <= 1) return;
    setSlides((prev) => prev.filter((_, j) => j !== i));
    setActiveIdx((idx) => Math.max(0, Math.min(idx, slides.length - 2)));
  };
  const moveSlide = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= slides.length) return;
    setSlides((prev) => {
      const copy = prev.slice();
      [copy[i], copy[j]] = [copy[j], copy[i]];
      return copy;
    });
    setActiveIdx(j);
  };
  const addText = () => {
    setSlides((prev) => [...prev, newTextSlide()]);
    setActiveIdx(slides.length);
  };
  const addQuestion = () => {
    setSlides((prev) => [...prev, newQuestionSlide()]);
    setActiveIdx(slides.length);
  };

  const slide = slides[activeIdx];

  const renderSlideList = (onPick?: () => void) => (
    <>
      <ol className="space-y-px px-2">
        {slides.map((s, i) => {
          const Icon = s.kind === "question" ? HelpCircle : BookOpen;
          const active = i === activeIdx;
          return (
            <li key={i} className="group">
              <button
                onClick={() => {
                  setActiveIdx(i);
                  onPick?.();
                }}
                className={`w-full text-left flex items-start gap-2 px-3 py-2 rounded-md text-xs transition-colors duration-fast ${
                  active
                    ? "bg-primary/10 text-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent/40"
                }`}
              >
                <Icon
                  className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${
                    active ? "text-primary" : ""
                  }`}
                  strokeWidth={2}
                />
                <span className="flex-1 min-w-0">
                  <span className="block font-mono text-[10px] text-muted-foreground">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="block leading-snug truncate">
                    {s.kind === "text"
                      ? s.title || "Untitled"
                      : s.question.question.slice(0, 40) || "Question"}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
      <div className="px-2 mt-2 space-y-1">
        <button
          onClick={() => {
            addText();
            onPick?.();
          }}
          className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-md border border-dashed border-border text-xs text-muted-foreground hover:text-foreground hover:bg-accent/40"
        >
          <Plus className="w-3.5 h-3.5" strokeWidth={2} />
          Text slide
        </button>
        <button
          onClick={() => {
            addQuestion();
            onPick?.();
          }}
          className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-md border border-dashed border-border text-xs text-muted-foreground hover:text-foreground hover:bg-accent/40"
        >
          <Plus className="w-3.5 h-3.5" strokeWidth={2} />
          Question slide
        </button>
      </div>
    </>
  );

  const save = async () => {
    if (!nodeId || saving) return;
    setSaving(true);
    setError(null);
    try {
      const r = await api.mastery.putLesson(nodeId, {
        slides: slides as any,
        editMessage: editMessage.trim() || undefined,
      });
      setSavedVersion(r.version);
      setEditMessage("");
      // refresh versions list
      const vr = await api.mastery.listLessonVersions(nodeId).catch(() => ({
        versions: [],
      }));
      setVersions(vr.versions ?? []);
    } catch (e: any) {
      setError(e?.message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const restore = async (version: number) => {
    if (!nodeId) return;
    if (!confirm(`Restore from v${version}? A new version will be created.`)) {
      return;
    }
    try {
      const r = await api.mastery.restoreLessonVersion(nodeId, version);
      setSlides(r.lesson.slides as LessonSlide[]);
      setSavedVersion(r.version);
      const vr = await api.mastery
        .listLessonVersions(nodeId)
        .catch(() => ({ versions: [] }));
      setVersions(vr.versions ?? []);
    } catch (e: any) {
      setError(e?.message ?? "Restore failed");
    }
  };

  if (authLoading || phase === "loading") {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12 space-y-3">
        <Skeleton className="h-8 w-1/3" />
        <Skeleton className="h-64" />
      </div>
    );
  }
  if (!user) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <p className="text-muted-foreground mb-4">Sign in to edit lessons.</p>
        <Link to="/login" className="text-primary hover:underline">
          Sign in
        </Link>
      </div>
    );
  }
  if (phase === "error") {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <p className="text-destructive mb-4">{error}</p>
        <Link to={exitHref} className="text-primary hover:underline">
          Back
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-3.5rem)]">
      <div className="border-b border-border bg-card/95 backdrop-blur sticky top-14 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center gap-3">
          <Link
            to={exitHref}
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="w-4 h-4" strokeWidth={2} />
            <span className="hidden sm:inline">Lesson</span>
          </Link>
          <div className="h-5 w-px bg-border" />
          <div className="min-w-0 flex-1">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Editing
            </div>
            <h1 className="text-sm font-semibold truncate">{nodeTitle}</h1>
          </div>
          {/* Mobile: opens the slide-list bottom sheet (replaces the
              desktop sidebar that's hidden below lg). */}
          <button
            onClick={() => setSlidesDrawerOpen(true)}
            className="lg:hidden inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-accent/40 tabular-nums"
            aria-haspopup="dialog"
            aria-expanded={slidesDrawerOpen}
          >
            <ListIcon className="w-3.5 h-3.5" strokeWidth={2} />
            {activeIdx + 1} / {slides.length}
          </button>
          {savedVersion !== null && (
            <span className="text-[11px] text-muted-foreground hidden sm:inline">
              Saved v{savedVersion}
            </span>
          )}
          <button
            onClick={() => setPreviewOpen(true)}
            className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/40"
            title="Preview unsaved lesson"
          >
            <Eye className="w-3.5 h-3.5" strokeWidth={2} />
            <span className="hidden sm:inline">Preview</span>
          </button>
          {pathSlug && nodeSlug && (
            <Link
              to={`/paths/${pathSlug}/lessons/${nodeSlug}/analytics`}
              className="hidden sm:inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/40"
              title="Lesson analytics"
            >
              Analytics
            </Link>
          )}
          <input
            value={editMessage}
            onChange={(e) => setEditMessage(e.target.value)}
            placeholder="Edit message (optional)"
            className="hidden md:block px-2 py-1 text-xs rounded-md border border-border bg-background w-56"
            maxLength={200}
          />
          <button
            onClick={save}
            disabled={saving}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 disabled:opacity-50"
          >
            <Save className="w-3.5 h-3.5" strokeWidth={2} />
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>

      {error && (
        <div className="max-w-7xl mx-auto px-4 mt-4">
          <div className="p-3 rounded-md bg-destructive/10 text-destructive text-sm">
            {error}
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto grid lg:grid-cols-[260px_1fr] min-h-[calc(100vh-7rem)]">
        {/* Slide list — desktop sidebar (mobile uses the drawer below) */}
        <aside className="hidden lg:block border-r border-border">
          <nav className="sticky top-[calc(3.5rem+3.5rem+0.25rem)] py-4 max-h-[calc(100vh-7.25rem)] overflow-y-auto">
            <div className="px-4 pb-2 flex items-center justify-between">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Slides · {slides.length}
              </span>
            </div>
            {renderSlideList()}
          </nav>
        </aside>

        {/* Editor */}
        <div className="px-4 sm:px-8 py-6">
          {slide && (
            <div className="space-y-5">
              <div className="flex items-center justify-between gap-3">
                <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
                  {slide.kind === "text" ? "Concept" : "Check"} · slide{" "}
                  {activeIdx + 1} of {slides.length}
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => moveSlide(activeIdx, -1)}
                    disabled={activeIdx === 0}
                    className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/40 disabled:opacity-30"
                    aria-label="Move up"
                  >
                    <ArrowUp className="w-3.5 h-3.5" strokeWidth={2} />
                  </button>
                  <button
                    onClick={() => moveSlide(activeIdx, 1)}
                    disabled={activeIdx === slides.length - 1}
                    className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/40 disabled:opacity-30"
                    aria-label="Move down"
                  >
                    <ArrowDown className="w-3.5 h-3.5" strokeWidth={2} />
                  </button>
                  <button
                    onClick={() => removeSlide(activeIdx)}
                    disabled={slides.length <= 1}
                    className="p-1.5 rounded-md text-destructive hover:bg-destructive/10 disabled:opacity-30"
                    aria-label="Delete slide"
                  >
                    <Trash2 className="w-3.5 h-3.5" strokeWidth={2} />
                  </button>
                </div>
              </div>

              {slide.kind === "text" ? (
                <TextSlideEditor
                  slide={slide}
                  onChange={(s) => updateSlide(activeIdx, s)}
                />
              ) : (
                <QuestionSlideEditor
                  slide={slide}
                  onChange={(s) => updateSlide(activeIdx, s)}
                />
              )}
            </div>
          )}

          {versions.length > 0 && (
            <div className="mt-10 border-t border-border pt-5">
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2">
                Version history · {versions.length}
              </div>
              <ul className="space-y-1.5 text-sm">
                {versions.slice(0, 10).map((v) => (
                  <li
                    key={v.version}
                    className="flex items-center justify-between gap-3 text-muted-foreground"
                  >
                    <span>
                      <span className="font-mono">v{v.version}</span> ·{" "}
                      {v.editMessage || "no message"}
                      {v.editorUsername && ` · @${v.editorUsername}`}
                    </span>
                    {savedVersion !== v.version && (
                      <button
                        onClick={() => restore(v.version)}
                        className="text-xs px-2 py-0.5 rounded border border-border hover:bg-accent/40"
                      >
                        Restore
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      {/* Mobile slide-list bottom sheet */}
      {slidesDrawerOpen && (
        <div
          className="lg:hidden fixed inset-0 z-50 bg-background/70 backdrop-blur-sm animate-fade-in"
          onClick={() => setSlidesDrawerOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label="All slides"
        >
          <div
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
                aria-label="Close"
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

      {/* Preview modal — renders the lesson with the in-memory (unsaved)
          slides so authors can validate before committing. */}
      {previewOpen && nodeId && (
        <LessonPreviewModal
          slides={slides}
          nodeTitle={nodeTitle}
          onClose={() => setPreviewOpen(false)}
        />
      )}
    </div>
  );
}

function TextSlideEditor({
  slide,
  onChange,
}: {
  slide: LessonSlide & { kind: "text" };
  onChange: (s: LessonSlide) => void;
}) {
  const [showPreview, setShowPreview] = useState(false);
  const props = useMemo(() => {
    try {
      return JSON.stringify(slide.vizProps ?? {}, null, 2);
    } catch {
      return "{}";
    }
  }, [slide.vizProps]);

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-xs font-medium text-muted-foreground mb-1">
          Title
        </label>
        <input
          value={slide.title ?? ""}
          onChange={(e) => onChange({ ...slide, title: e.target.value })}
          maxLength={200}
          className="w-full px-3 py-2 rounded-md border border-input bg-background text-base focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="block text-xs font-medium text-muted-foreground">
            Body (markdown)
          </label>
          <button
            onClick={() => setShowPreview((v) => !v)}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            {showPreview ? "Edit" : "Preview"}
          </button>
        </div>
        {showPreview ? (
          <div className="min-h-[16rem] rounded-md border border-border bg-card p-4 prose-sm max-w-none">
            <MarkdownRenderer content={slide.body} />
          </div>
        ) : (
          <textarea
            value={slide.body}
            onChange={(e) => onChange({ ...slide, body: e.target.value })}
            maxLength={20000}
            rows={14}
            className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring"
          />
        )}
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">
            Visualization (optional)
          </label>
          <select
            value={slide.viz ?? ""}
            onChange={(e) =>
              onChange({
                ...slide,
                viz: e.target.value || undefined,
                vizProps: e.target.value ? slide.vizProps ?? {} : undefined,
              })
            }
            className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="">— None —</option>
            {VIZ_NAMES.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>
        {slide.viz && (
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">
              Viz props (JSON)
            </label>
            <textarea
              defaultValue={props}
              onBlur={(e) => {
                try {
                  const parsed = JSON.parse(e.target.value);
                  onChange({ ...slide, vizProps: parsed });
                } catch {
                  // keep existing on parse failure
                }
              }}
              rows={3}
              className="w-full px-3 py-2 rounded-md border border-input bg-background text-xs font-mono focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        )}
      </div>
    </div>
  );
}

function QuestionSlideEditor({
  slide,
  onChange,
}: {
  slide: LessonSlide & { kind: "question" };
  onChange: (s: LessonSlide) => void;
}) {
  const q = slide.question as any;

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-xs font-medium text-muted-foreground mb-1">
          Question kind
        </label>
        <select
          value={q.kind ?? "multiple_choice"}
          onChange={(e) =>
            onChange({
              ...slide,
              question: { ...q, kind: e.target.value } as any,
            })
          }
          className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="multiple_choice">multiple_choice</option>
          <option value="slider">slider</option>
          <option value="drag_classify">drag_classify</option>
          <option value="code">code</option>
          <option value="puzzle_drag_build">puzzle_drag_build</option>
          <option value="math_expression">math_expression</option>
          <option value="sortable">sortable</option>
          <option value="code_completion">code_completion</option>
        </select>
      </div>
      <div>
        <label className="block text-xs font-medium text-muted-foreground mb-1">
          Question id (unique within lesson)
        </label>
        <input
          value={q.id ?? ""}
          onChange={(e) =>
            onChange({
              ...slide,
              question: { ...q, id: e.target.value } as any,
            })
          }
          className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring"
          maxLength={80}
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-muted-foreground mb-1">
          Prompt
        </label>
        <textarea
          value={q.question ?? ""}
          onChange={(e) =>
            onChange({
              ...slide,
              question: { ...q, question: e.target.value } as any,
            })
          }
          rows={3}
          maxLength={500}
          className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>
      {q.kind === "multiple_choice" ? (
        <MultipleChoiceEditor
          q={q}
          onChange={(next) => onChange({ ...slide, question: next })}
        />
      ) : q.kind === "slider" ? (
        <SliderEditor
          q={q}
          onChange={(next) => onChange({ ...slide, question: next })}
        />
      ) : q.kind === "code" ? (
        <CodeEditor
          q={q}
          onChange={(next) => onChange({ ...slide, question: next })}
        />
      ) : (
        <RawJsonEditor
          q={q}
          onChange={(next) => onChange({ ...slide, question: next })}
        />
      )}
    </div>
  );
}

function MultipleChoiceEditor({
  q,
  onChange,
}: {
  q: any;
  onChange: (next: any) => void;
}) {
  const opts: string[] = Array.isArray(q.options) ? q.options : [];
  const correctIndex: number =
    typeof q.correctIndex === "number" ? q.correctIndex : 0;

  const setOpt = (i: number, v: string) => {
    const next = opts.slice();
    next[i] = v;
    onChange({ ...q, options: next });
  };
  const addOpt = () => onChange({ ...q, options: [...opts, ""] });
  const removeOpt = (i: number) => {
    if (opts.length <= 2) return;
    const next = opts.filter((_, j) => j !== i);
    const ci = correctIndex >= next.length ? next.length - 1 : correctIndex;
    onChange({ ...q, options: next, correctIndex: ci });
  };

  return (
    <div className="space-y-2">
      <label className="block text-xs font-medium text-muted-foreground">
        Options (mark the correct one)
      </label>
      {opts.map((o, i) => (
        <div key={i} className="flex items-center gap-2">
          <input
            type="radio"
            name="correctIndex"
            checked={correctIndex === i}
            onChange={() => onChange({ ...q, correctIndex: i })}
          />
          <input
            value={o}
            onChange={(e) => setOpt(i, e.target.value)}
            className="flex-1 px-3 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <button
            onClick={() => removeOpt(i)}
            disabled={opts.length <= 2}
            className="p-1.5 rounded-md text-muted-foreground hover:text-destructive disabled:opacity-30"
            aria-label="Remove option"
          >
            <Trash2 className="w-3.5 h-3.5" strokeWidth={2} />
          </button>
        </div>
      ))}
      <button
        onClick={addOpt}
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <Plus className="w-3.5 h-3.5" strokeWidth={2} />
        Add option
      </button>
    </div>
  );
}

function NumberField({
  label,
  value,
  step,
  onChange,
}: {
  label: string;
  value: number | undefined;
  step?: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <label className="block text-[11px] font-medium text-muted-foreground mb-1">
        {label}
      </label>
      <input
        type="number"
        step={step ?? "any"}
        value={typeof value === "number" ? value : ""}
        onChange={(e) => {
          const n = parseFloat(e.target.value);
          if (Number.isFinite(n)) onChange(n);
        }}
        className="w-full px-2 py-1.5 rounded-md border border-input bg-background text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring"
      />
    </div>
  );
}

function SliderEditor({
  q,
  onChange,
}: {
  q: any;
  onChange: (next: any) => void;
}) {
  const target = (q.target ?? { min: 0, max: 1 }) as { min: number; max: number };
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <NumberField
          label="min"
          value={q.min}
          onChange={(v) => onChange({ ...q, min: v })}
        />
        <NumberField
          label="max"
          value={q.max}
          onChange={(v) => onChange({ ...q, max: v })}
        />
        <NumberField
          label="step"
          value={q.step}
          onChange={(v) => onChange({ ...q, step: v })}
        />
        <NumberField
          label="default"
          value={q.default}
          onChange={(v) => onChange({ ...q, default: v })}
        />
      </div>
      <div>
        <div className="text-[11px] font-medium text-muted-foreground mb-1">
          Accepted answer range (target)
        </div>
        <div className="grid grid-cols-2 gap-3">
          <NumberField
            label="target.min"
            value={target.min}
            onChange={(v) =>
              onChange({ ...q, target: { ...target, min: v } })
            }
          />
          <NumberField
            label="target.max"
            value={target.max}
            onChange={(v) =>
              onChange({ ...q, target: { ...target, max: v } })
            }
          />
        </div>
      </div>
      <p className="text-[11px] text-muted-foreground">
        The learner's answer is correct iff target.min ≤ value ≤ target.max.
      </p>
    </div>
  );
}

function CodeEditor({
  q,
  onChange,
}: {
  q: any;
  onChange: (next: any) => void;
}) {
  const tests: Array<{ input?: string; expected?: string }> = Array.isArray(
    q.tests,
  )
    ? q.tests
    : [];
  const setTest = (i: number, next: { input?: string; expected?: string }) => {
    const copy = tests.slice();
    copy[i] = next;
    onChange({ ...q, tests: copy });
  };
  const addTest = () =>
    onChange({ ...q, tests: [...tests, { input: "", expected: "" }] });
  const removeTest = (i: number) =>
    onChange({ ...q, tests: tests.filter((_, j) => j !== i) });

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-[11px] font-medium text-muted-foreground mb-1">
          Starter code
        </label>
        <textarea
          value={q.starterCode ?? ""}
          onChange={(e) => onChange({ ...q, starterCode: e.target.value })}
          rows={6}
          className="w-full px-3 py-2 rounded-md border border-input bg-background text-xs font-mono focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>
      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="text-[11px] font-medium text-muted-foreground">
            Tests · {tests.length}
          </span>
          <button
            onClick={addTest}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <Plus className="w-3.5 h-3.5" strokeWidth={2} />
            Add test
          </button>
        </div>
        <div className="space-y-2">
          {tests.length === 0 && (
            <p className="text-xs text-muted-foreground italic">
              No tests yet. Each test pairs an input with an expected output.
            </p>
          )}
          {tests.map((t, i) => (
            <div
              key={i}
              className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-2 items-start"
            >
              <textarea
                value={t.input ?? ""}
                onChange={(e) => setTest(i, { ...t, input: e.target.value })}
                rows={2}
                placeholder="input"
                className="px-2 py-1.5 rounded-md border border-input bg-background text-xs font-mono focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <textarea
                value={t.expected ?? ""}
                onChange={(e) =>
                  setTest(i, { ...t, expected: e.target.value })
                }
                rows={2}
                placeholder="expected"
                className="px-2 py-1.5 rounded-md border border-input bg-background text-xs font-mono focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <button
                onClick={() => removeTest(i)}
                className="self-start p-1.5 rounded-md text-muted-foreground hover:text-destructive"
                aria-label="Remove test"
              >
                <Trash2 className="w-3.5 h-3.5" strokeWidth={2} />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function RawJsonEditor({
  q,
  onChange,
}: {
  q: any;
  onChange: (next: any) => void;
}) {
  const [draft, setDraft] = useState(() => JSON.stringify(q, null, 2));
  const [err, setErr] = useState<string | null>(null);
  return (
    <div>
      <label className="block text-xs font-medium text-muted-foreground mb-1">
        Question JSON (advanced — schema depends on kind)
      </label>
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          try {
            const parsed = JSON.parse(draft);
            setErr(null);
            onChange(parsed);
          } catch (e: any) {
            setErr(e?.message ?? "Invalid JSON");
          }
        }}
        rows={10}
        className="w-full px-3 py-2 rounded-md border border-input bg-background text-xs font-mono focus:outline-none focus:ring-2 focus:ring-ring"
      />
      {err && <p className="text-xs text-destructive mt-1">{err}</p>}
      <p className="text-xs text-muted-foreground mt-1">
        Reach for this when authoring slider, drag-classify, code, or other
        non-MC kinds. Refer to existing seeded lessons for examples.
      </p>
    </div>
  );
}
