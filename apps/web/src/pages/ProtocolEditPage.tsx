import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, GripVertical, Plus, Trash2 } from "lucide-react";
import type {
  CreateProtocolRequest,
  LabDiscipline,
  ProtocolStepInput,
} from "@axiomic/types";
import { api } from "../lib/api";
import { useAuthStore } from "../stores/auth";

type Mode = "new" | "edit";

const DISCIPLINES: LabDiscipline[] = [
  "biology",
  "chemistry",
  "mechanical",
  "electrical",
  "materials",
  "cs-lab",
  "physics",
];

interface FormState {
  slug: string;
  title: string;
  discipline: LabDiscipline;
  category: string;
  summary: string;
  contentUndergrad: string;
  biosafetyLevel: string;
  hazardsMd: string;
  estimatedMinutes: string;
  requiredCerts: string;
  equipmentRequired: string;
  steps: ProtocolStepInput[];
  status: "draft" | "published";
}

const EMPTY_STEP: ProtocolStepInput = {
  title: "",
  instructionMd: "",
  safetyNotesMd: "",
  verificationMd: "",
};

const DEFAULT_FORM: FormState = {
  slug: "",
  title: "",
  discipline: "biology",
  category: "",
  summary: "",
  contentUndergrad: "",
  biosafetyLevel: "",
  hazardsMd: "",
  estimatedMinutes: "",
  requiredCerts: "",
  equipmentRequired: "",
  steps: [{ ...EMPTY_STEP }],
  status: "draft",
};

function splitCsv(input: string): string[] {
  return input
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function ProtocolEditPage({ mode }: { mode: Mode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { slug: routeSlug } = useParams<{ slug: string }>();
  const { user } = useAuthStore();
  const initial = useMemo<FormState>(() => {
    // Sprint 83 — when arriving from /lab/protocols/wizard, the
    // wizard navigates with `state.prefill` so the editor opens with
    // the streamed draft already filled in.
    if (mode === "new") {
      const prefill = (location.state as { prefill?: any } | null)
        ?.prefill;
      if (prefill) {
        return {
          ...DEFAULT_FORM,
          discipline: prefill.discipline ?? DEFAULT_FORM.discipline,
          summary: prefill.summary ?? "",
          contentUndergrad: prefill.contentUndergrad ?? "",
          hazardsMd: prefill.hazardsMd ?? "",
          steps:
            Array.isArray(prefill.steps) && prefill.steps.length > 0
              ? prefill.steps
              : DEFAULT_FORM.steps,
        };
      }
    }
    return DEFAULT_FORM;
  }, [mode, location.state]);
  const [form, setForm] = useState<FormState>(initial);
  const [loading, setLoading] = useState(mode === "edit");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (mode !== "edit" || !routeSlug) return;
    let cancelled = false;
    setLoading(true);
    api.lab.protocols
      .get(routeSlug)
      .then((res) => {
        if (cancelled) return;
        const p = res.protocol;
        setForm({
          slug: p.slug,
          title: p.title,
          discipline: p.discipline,
          category: p.category ?? "",
          summary: p.summary,
          contentUndergrad: p.contentUndergrad,
          biosafetyLevel: p.biosafetyLevel?.toString() ?? "",
          hazardsMd: p.hazardsMd,
          estimatedMinutes: p.estimatedMinutes?.toString() ?? "",
          requiredCerts: p.requiredCerts.join(", "),
          equipmentRequired: p.equipmentRequired.join(", "),
          steps: res.steps.map((s) => ({
            title: s.title,
            instructionMd: s.instructionMd,
            safetyNotesMd: s.safetyNotesMd,
            verificationMd: s.verificationMd,
            inlineQuizJson: s.inlineQuizJson,
            attachmentRefs: s.attachmentRefs,
          })),
          status: p.status,
        });
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err?.message ?? "Failed to load protocol");
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [mode, routeSlug]);

  const setStep = (index: number, patch: Partial<ProtocolStepInput>) => {
    setForm((prev) => ({
      ...prev,
      steps: prev.steps.map((s, i) => (i === index ? { ...s, ...patch } : s)),
    }));
  };

  const moveStep = (index: number, dir: -1 | 1) => {
    setForm((prev) => {
      const target = index + dir;
      if (target < 0 || target >= prev.steps.length) return prev;
      const next = [...prev.steps];
      [next[index], next[target]] = [next[target], next[index]];
      return { ...prev, steps: next };
    });
  };

  const removeStep = (index: number) => {
    setForm((prev) => ({
      ...prev,
      steps: prev.steps.filter((_, i) => i !== index),
    }));
  };

  const addStep = () => {
    setForm((prev) => ({ ...prev, steps: [...prev.steps, { ...EMPTY_STEP }] }));
  };

  const canSubmit = useMemo(() => {
    if (!form.title.trim()) return false;
    if (mode === "new" && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(form.slug)) {
      return false;
    }
    if (form.status === "published" && form.steps.length === 0) return false;
    return true;
  }, [form, mode]);

  if (!user) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-12">
        <p className="text-muted-foreground">
          You must be signed in to author protocols.
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-12 space-y-3">
        <div className="animate-pulse h-10 bg-muted rounded-md w-2/3" />
        <div className="animate-pulse h-64 bg-muted rounded-xl" />
      </div>
    );
  }

  const submit = async (status: "draft" | "published") => {
    setSaving(true);
    setError(null);
    try {
      const cleanedSteps = form.steps
        .filter((s) => s.title.trim() && s.instructionMd.trim())
        .map((s) => ({
          title: s.title.trim(),
          instructionMd: s.instructionMd,
          safetyNotesMd: s.safetyNotesMd ?? "",
          verificationMd: s.verificationMd ?? "",
        }));
      const biosafety = form.biosafetyLevel.trim()
        ? Number(form.biosafetyLevel)
        : null;
      const minutes = form.estimatedMinutes.trim()
        ? Number(form.estimatedMinutes)
        : null;

      if (mode === "new") {
        const payload: CreateProtocolRequest = {
          slug: form.slug,
          title: form.title.trim(),
          discipline: form.discipline,
          category: form.category.trim() || null,
          summary: form.summary,
          contentUndergrad: form.contentUndergrad,
          biosafetyLevel: biosafety,
          hazardsMd: form.hazardsMd,
          equipmentRequired: splitCsv(form.equipmentRequired),
          estimatedMinutes: minutes,
          requiredCerts: splitCsv(form.requiredCerts),
          steps: cleanedSteps,
          status,
        };
        const res = await api.lab.protocols.create(payload);
        navigate(`/lab/protocols/${res.slug}`);
      } else {
        await api.lab.protocols.update(routeSlug!, {
          title: form.title.trim(),
          discipline: form.discipline,
          category: form.category.trim() || null,
          summary: form.summary,
          contentUndergrad: form.contentUndergrad,
          biosafetyLevel: biosafety,
          hazardsMd: form.hazardsMd,
          equipmentRequired: splitCsv(form.equipmentRequired),
          estimatedMinutes: minutes,
          requiredCerts: splitCsv(form.requiredCerts),
          status,
        });
        await api.lab.protocols.replaceSteps(routeSlug!, {
          steps: cleanedSteps,
        });
        navigate(`/lab/protocols/${routeSlug}`);
      }
    } catch (err) {
      setError((err as Error)?.message ?? "Save failed");
      setSaving(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
      <Link
        to={mode === "edit" && routeSlug ? `/lab/protocols/${routeSlug}` : "/lab/protocols"}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="w-3.5 h-3.5" strokeWidth={2} />
        Back
      </Link>
      <h1 className="font-display text-3xl font-semibold tracking-tight mt-3 mb-6">
        {mode === "new" ? "New protocol" : "Edit protocol"}
      </h1>

      {error && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 mb-4 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="space-y-4">
        {mode === "new" && (
          <div>
            <label htmlFor="proto-slug" className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
              Slug (kebab-case, immutable)
            </label>
            <input
              id="proto-slug"
              type="text"
              value={form.slug}
              onChange={(e) =>
                setForm((p) => ({ ...p, slug: e.target.value.toLowerCase() }))
              }
              placeholder="agarose-gel-electrophoresis"
              className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm font-mono"
            />
          </div>
        )}

        <div>
          <label htmlFor="proto-title" className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
            Title
          </label>
          <input
            id="proto-title"
            type="text"
            value={form.title}
            onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
            className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm"
          />
        </div>

        <div className="grid sm:grid-cols-3 gap-3">
          <div>
            <label htmlFor="proto-discipline" className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
              Discipline
            </label>
            <select
              id="proto-discipline"
              value={form.discipline}
              onChange={(e) =>
                setForm((p) => ({
                  ...p,
                  discipline: e.target.value as LabDiscipline,
                }))
              }
              className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm"
            >
              {DISCIPLINES.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="proto-category" className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
              Category
            </label>
            <input
              id="proto-category"
              type="text"
              value={form.category}
              onChange={(e) =>
                setForm((p) => ({ ...p, category: e.target.value }))
              }
              placeholder="Molecular biology"
              className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm"
            />
          </div>
          <div>
            <label htmlFor="proto-minutes" className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
              Estimated minutes
            </label>
            <input
              id="proto-minutes"
              type="number"
              min={1}
              value={form.estimatedMinutes}
              onChange={(e) =>
                setForm((p) => ({ ...p, estimatedMinutes: e.target.value }))
              }
              className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm"
            />
          </div>
        </div>

        <div>
          <label htmlFor="proto-summary" className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
            Summary
          </label>
          <input
            id="proto-summary"
            type="text"
            value={form.summary}
            onChange={(e) =>
              setForm((p) => ({ ...p, summary: e.target.value }))
            }
            className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm"
          />
        </div>

        <div>
          <label htmlFor="proto-body" className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
            Body (Markdown — undergrad tier)
          </label>
          <textarea
            id="proto-body"
            value={form.contentUndergrad}
            onChange={(e) =>
              setForm((p) => ({ ...p, contentUndergrad: e.target.value }))
            }
            rows={8}
            className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm font-mono"
          />
        </div>

        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label htmlFor="proto-bsl" className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
              Biosafety level (1-4, optional)
            </label>
            <input
              id="proto-bsl"
              type="number"
              min={1}
              max={4}
              value={form.biosafetyLevel}
              onChange={(e) =>
                setForm((p) => ({ ...p, biosafetyLevel: e.target.value }))
              }
              className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm"
            />
          </div>
          <div>
            <label htmlFor="proto-certs" className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
              Required certs (CSV of slugs)
            </label>
            <input
              id="proto-certs"
              type="text"
              value={form.requiredCerts}
              onChange={(e) =>
                setForm((p) => ({ ...p, requiredCerts: e.target.value }))
              }
              placeholder="bsl-2, biohazard-waste"
              className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm font-mono"
            />
          </div>
        </div>

        <div>
          <label htmlFor="proto-equipment" className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
            Equipment required (CSV of slugs)
          </label>
          <input
            id="proto-equipment"
            type="text"
            value={form.equipmentRequired}
            onChange={(e) =>
              setForm((p) => ({ ...p, equipmentRequired: e.target.value }))
            }
            placeholder="thermal-cycler, gel-imager"
            className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm font-mono"
          />
        </div>

        <div>
          <label htmlFor="proto-hazards" className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
            Hazards (Markdown)
          </label>
          <textarea
            id="proto-hazards"
            value={form.hazardsMd}
            onChange={(e) =>
              setForm((p) => ({ ...p, hazardsMd: e.target.value }))
            }
            rows={3}
            className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm font-mono"
          />
        </div>

        <div>
          <h2 className="font-display text-xl font-semibold tracking-tight mt-6 mb-3">
            Procedure steps
          </h2>
          <ol className="space-y-3">
            {form.steps.map((step, i) => (
              <li
                key={i}
                className="rounded-lg border border-border bg-card p-3"
              >
                <div className="flex items-start gap-2">
                  <div className="flex flex-col items-center gap-1 text-muted-foreground pt-1">
                    <span className="text-xs font-mono">{i + 1}</span>
                    <button
                      type="button"
                      onClick={() => moveStep(i, -1)}
                      aria-label="Move step up"
                      disabled={i === 0}
                      className="p-1 rounded hover:bg-accent/40 disabled:opacity-30"
                    >
                      <GripVertical className="w-3.5 h-3.5" strokeWidth={2} />
                    </button>
                  </div>
                  <div className="flex-1 min-w-0 space-y-2">
                    <input
                      type="text"
                      value={step.title}
                      onChange={(e) =>
                        setStep(i, { title: e.target.value })
                      }
                      placeholder={`Step ${i + 1} title`}
                      className="w-full px-2 py-1.5 rounded-md border border-input bg-background text-sm"
                    />
                    <textarea
                      value={step.instructionMd}
                      onChange={(e) =>
                        setStep(i, { instructionMd: e.target.value })
                      }
                      rows={3}
                      placeholder="What to do (Markdown)"
                      className="w-full px-2 py-1.5 rounded-md border border-input bg-background text-sm font-mono"
                    />
                    <details className="text-xs">
                      <summary className="cursor-pointer text-muted-foreground">
                        Optional safety + verification
                      </summary>
                      <div className="mt-2 space-y-2">
                        <textarea
                          value={step.safetyNotesMd ?? ""}
                          onChange={(e) =>
                            setStep(i, { safetyNotesMd: e.target.value })
                          }
                          rows={2}
                          placeholder="Safety notes (Markdown)"
                          className="w-full px-2 py-1.5 rounded-md border border-input bg-background text-sm font-mono"
                        />
                        <textarea
                          value={step.verificationMd ?? ""}
                          onChange={(e) =>
                            setStep(i, { verificationMd: e.target.value })
                          }
                          rows={2}
                          placeholder="How to verify it worked"
                          className="w-full px-2 py-1.5 rounded-md border border-input bg-background text-sm font-mono"
                        />
                      </div>
                    </details>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeStep(i)}
                    aria-label="Remove step"
                    className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="w-3.5 h-3.5" strokeWidth={2} />
                  </button>
                </div>
              </li>
            ))}
          </ol>
          <button
            type="button"
            onClick={addStep}
            className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border text-sm hover:bg-accent/40 transition-colors"
          >
            <Plus className="w-4 h-4" strokeWidth={2} />
            Add step
          </button>
        </div>

        <div className="flex items-center justify-end gap-2 pt-4 border-t border-border">
          <button
            type="button"
            disabled={saving || !canSubmit}
            onClick={() => submit("draft")}
            className="px-4 py-2 rounded-md border border-border text-sm hover:bg-accent/40 transition-colors disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save draft"}
          </button>
          <button
            type="button"
            disabled={saving || !canSubmit || form.steps.length === 0}
            onClick={() => submit("published")}
            className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {saving ? "Saving…" : "Publish"}
          </button>
        </div>
      </div>
    </div>
  );
}
