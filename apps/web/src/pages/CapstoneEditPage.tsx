// Sprint 26 — Capstone author editor.
//
// Three-tab tier editor for the brief + a stacked milestone editor
// underneath. Authors compose milestones one at a time; rubric
// criteria are inline forms, runnable tests live in a Python textarea.

import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { Plus, Trash2, ChevronDown, ChevronRight, Code2 } from "lucide-react";
import type {
  Capstone,
  CapstoneMilestone,
  CapstoneRubric,
  CapstoneRubricCriterion,
  CapstoneTier,
  CapstoneArtifactKind,
} from "@axiomic/types";
import { api } from "../lib/api";
import { Skeleton } from "../components/ui";

const ARTIFACT_KINDS: CapstoneArtifactKind[] = [
  "github",
  "colab",
  "docker",
  "dataset",
  "writeup",
  "arxiv",
  "other",
];

export function CapstoneEditPage() {
  const { slug = "" } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const [capstone, setCapstone] = useState<Capstone | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tier, setTier] = useState<CapstoneTier>("undergrad");
  const [savingBrief, setSavingBrief] = useState(false);
  const [briefDirty, setBriefDirty] = useState(false);

  const [briefIntro, setBriefIntro] = useState("");
  const [briefUndergrad, setBriefUndergrad] = useState("");
  const [briefGrad, setBriefGrad] = useState("");
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [estimatedWeeks, setEstimatedWeeks] = useState(6);
  const [prereqWikiSlugs, setPrereqWikiSlugs] = useState("");
  const [tags, setTags] = useState("");
  const [status, setStatus] = useState<"draft" | "published">("draft");

  useEffect(() => {
    api.capstones
      .get(slug)
      .then((r) => {
        const c = r.capstone;
        setCapstone(c);
        setTitle(c.title);
        setSummary(c.summary);
        setBriefIntro(c.allContent.intro);
        setBriefUndergrad(c.allContent.undergrad);
        setBriefGrad(c.allContent.grad);
        setEstimatedWeeks(c.estimatedWeeks);
        setPrereqWikiSlugs(c.prerequisiteWikiSlugs.join(", "));
        setTags(c.tags.join(", "));
        setStatus(c.status);
      })
      .catch((e) => setError(e?.message ?? "Failed to load capstone"));
  }, [slug]);

  const reload = async () => {
    const r = await api.capstones.get(slug);
    setCapstone(r.capstone);
  };

  const saveBrief = async () => {
    setSavingBrief(true);
    try {
      await api.capstones.update(slug, {
        title,
        summary,
        contentIntro: briefIntro,
        contentUndergrad: briefUndergrad,
        contentGrad: briefGrad,
        estimatedWeeks,
        prerequisiteWikiSlugs: prereqWikiSlugs
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        tags: tags
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        status,
      });
      setBriefDirty(false);
      await reload();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Save failed";
      setError(message);
    } finally {
      setSavingBrief(false);
    }
  };

  if (error && !capstone) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center">
        <p className="text-sm text-destructive">{error}</p>
      </div>
    );
  }
  if (!capstone) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8">
        <Skeleton variant="card" className="h-32 mb-6" />
        <Skeleton variant="card" className="h-72" />
      </div>
    );
  }

  if (!capstone.isAuthor) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center">
        <p className="text-sm text-muted-foreground">Only the author can edit this capstone.</p>
        <Link to={`/capstones/${capstone.slug}`} className="text-sm text-primary hover:underline mt-4 inline-block">
          View capstone
        </Link>
      </div>
    );
  }

  const briefValueFor = (t: CapstoneTier) =>
    t === "intro" ? briefIntro : t === "grad" ? briefGrad : briefUndergrad;
  const setBriefValueFor = (t: CapstoneTier, v: string) => {
    if (t === "intro") setBriefIntro(v);
    else if (t === "grad") setBriefGrad(v);
    else setBriefUndergrad(v);
    setBriefDirty(true);
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="text-xs text-muted-foreground mb-3">
        <Link to="/capstones" className="hover:text-foreground">
          Capstones
        </Link>
        {" / "}
        <Link to={`/capstones/${capstone.slug}`} className="hover:text-foreground">
          {capstone.title}
        </Link>
        {" / edit"}
      </div>

      <h1 className="font-display text-2xl font-semibold tracking-tight mb-6">Edit capstone</h1>

      <section className="space-y-3 mb-8">
        <Field label="Title">
          <input
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              setBriefDirty(true);
            }}
            className="w-full text-sm px-3 py-2 rounded-md border border-border bg-background"
          />
        </Field>
        <Field label="Summary">
          <input
            value={summary}
            onChange={(e) => {
              setSummary(e.target.value);
              setBriefDirty(true);
            }}
            className="w-full text-sm px-3 py-2 rounded-md border border-border bg-background"
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Estimated weeks">
            <input
              type="number"
              min={1}
              max={52}
              value={estimatedWeeks}
              onChange={(e) => {
                setEstimatedWeeks(parseInt(e.target.value, 10) || 6);
                setBriefDirty(true);
              }}
              className="w-full text-sm px-3 py-2 rounded-md border border-border bg-background"
            />
          </Field>
          <Field label="Status">
            <select
              value={status}
              onChange={(e) => {
                setStatus(e.target.value as "draft" | "published");
                setBriefDirty(true);
              }}
              className="w-full text-sm px-3 py-2 rounded-md border border-border bg-background"
            >
              <option value="draft">Draft</option>
              <option value="published">Published</option>
            </select>
          </Field>
        </div>
        <Field label="Tags (comma-separated)">
          <input
            value={tags}
            onChange={(e) => {
              setTags(e.target.value);
              setBriefDirty(true);
            }}
            placeholder="transformers, deep-learning"
            className="w-full text-sm px-3 py-2 rounded-md border border-border bg-background"
          />
        </Field>
        <Field label="Prerequisite wiki slugs (comma-separated)">
          <input
            value={prereqWikiSlugs}
            onChange={(e) => {
              setPrereqWikiSlugs(e.target.value);
              setBriefDirty(true);
            }}
            placeholder="softmax, attention"
            className="w-full text-sm px-3 py-2 rounded-md border border-border bg-background"
          />
        </Field>
      </section>

      <section className="mb-8">
        <h2 className="text-sm font-semibold mb-2">Brief</h2>
        <div className="inline-flex gap-1 p-1 rounded-md bg-muted text-xs mb-3">
          {(["intro", "undergrad", "grad"] as CapstoneTier[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTier(t)}
              className={`px-3 py-1 rounded transition-colors ${
                tier === t ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
        <textarea
          value={briefValueFor(tier)}
          onChange={(e) => setBriefValueFor(tier, e.target.value)}
          rows={14}
          placeholder="Markdown-rendered brief at this tier."
          className="w-full text-sm px-3 py-2 rounded-md border border-border bg-background font-mono"
        />
      </section>

      <div className="flex justify-end mb-12">
        <button
          type="button"
          onClick={saveBrief}
          disabled={!briefDirty || savingBrief}
          className="text-sm px-4 py-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
        >
          {savingBrief ? "Saving…" : "Save brief"}
        </button>
      </div>

      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold">Milestones</h2>
        </div>
        <ul className="space-y-3">
          {capstone.milestones.map((m, i) => (
            <MilestoneRow
              key={m.id}
              slug={capstone.slug}
              milestone={m}
              index={i}
              onChanged={reload}
            />
          ))}
        </ul>

        <NewMilestoneForm slug={capstone.slug} onCreated={reload} />
      </section>

      <div className="mt-10 pt-4 border-t border-border text-center">
        <button
          type="button"
          onClick={() => navigate(`/capstones/${capstone.slug}`)}
          className="text-xs px-3 py-1.5 rounded-md border border-border hover:bg-accent/40"
        >
          Back to capstone
        </button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 block">
        {label}
      </span>
      {children}
    </label>
  );
}

function defaultRubric(): CapstoneRubric {
  return {
    criteria: [
      {
        id: "correctness",
        weight: 0.6,
        description: "Does the submission solve the problem correctly?",
        aiPrompt: "Score correctness of the artifacts + writeup against the milestone description.",
      },
      {
        id: "writeup",
        weight: 0.4,
        description: "Does the writeup explain the approach clearly?",
        aiPrompt: "Score the depth + clarity of the writeup.",
      },
    ],
    passingScore: 0.6,
  };
}

function MilestoneRow({
  slug,
  milestone,
  index,
  onChanged,
}: {
  slug: string;
  milestone: CapstoneMilestone;
  index: number;
  onChanged: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [title, setTitle] = useState(milestone.title);
  const [description, setDescription] = useState(milestone.description);
  const [rubric, setRubric] = useState<CapstoneRubric>(milestone.rubric);
  const [requiredKinds, setRequiredKinds] = useState<CapstoneArtifactKind[]>(
    milestone.requiredArtifactKinds,
  );
  const [runnableTests, setRunnableTests] = useState(milestone.runnableTests ?? "");
  const [estimatedDays, setEstimatedDays] = useState(milestone.estimatedDays);
  const [saving, setSaving] = useState(false);

  const dirty = useMemo(() => {
    return (
      title !== milestone.title ||
      description !== milestone.description ||
      JSON.stringify(rubric) !== JSON.stringify(milestone.rubric) ||
      JSON.stringify(requiredKinds) !== JSON.stringify(milestone.requiredArtifactKinds) ||
      runnableTests !== (milestone.runnableTests ?? "") ||
      estimatedDays !== milestone.estimatedDays
    );
  }, [title, description, rubric, requiredKinds, runnableTests, estimatedDays, milestone]);

  const save = async () => {
    setSaving(true);
    try {
      await api.capstones.updateMilestone(slug, milestone.id, {
        title,
        description,
        rubric,
        requiredArtifactKinds: requiredKinds,
        runnableTests: runnableTests.trim() ? runnableTests : null,
        estimatedDays,
      });
      onChanged();
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!confirm(`Delete milestone "${milestone.title}"?`)) return;
    await api.capstones.deleteMilestone(slug, milestone.id);
    onChanged();
  };

  return (
    <li className="rounded-md border border-border">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full px-3 py-2 flex items-center gap-3 text-left hover:bg-accent/30"
      >
        {expanded ? (
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="w-4 h-4 text-muted-foreground" />
        )}
        <span className="text-xs font-mono text-muted-foreground tabular-nums">
          {String(index + 1).padStart(2, "0")}
        </span>
        <span className="text-sm font-medium flex-1">{title}</span>
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
          {milestone.rubric.criteria.length}c · {milestone.estimatedDays}d
        </span>
      </button>
      {expanded && (
        <div className="px-3 pb-3 pt-2 border-t border-border space-y-3">
          <Field label="Title">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full text-sm px-3 py-2 rounded-md border border-border bg-background"
            />
          </Field>
          <Field label="Description (markdown)">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={6}
              placeholder="What the learner builds in this milestone."
              className="w-full text-sm px-3 py-2 rounded-md border border-border bg-background font-mono"
            />
          </Field>
          <Field label="Rubric criteria">
            <RubricEditor rubric={rubric} onChange={setRubric} />
          </Field>
          <Field label="Required artifact kinds">
            <div className="flex flex-wrap gap-1.5">
              {ARTIFACT_KINDS.map((k) => {
                const active = requiredKinds.includes(k);
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() =>
                      setRequiredKinds(
                        active ? requiredKinds.filter((x) => x !== k) : [...requiredKinds, k],
                      )
                    }
                    className={`text-xs px-2 py-1 rounded-full border transition-colors ${
                      active
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {k}
                  </button>
                );
              })}
            </div>
          </Field>
          <Field label="Runnable tests (Python, optional)">
            <textarea
              value={runnableTests}
              onChange={(e) => setRunnableTests(e.target.value)}
              rows={6}
              placeholder="# Optional Pyodide test harness — assertions go here."
              className="w-full text-xs px-3 py-2 rounded-md border border-border bg-muted/30 font-mono"
            />
          </Field>
          <Field label="Estimated days">
            <input
              type="number"
              min={1}
              max={60}
              value={estimatedDays}
              onChange={(e) => setEstimatedDays(parseInt(e.target.value, 10) || 7)}
              className="w-full text-sm px-3 py-2 rounded-md border border-border bg-background"
            />
          </Field>
          <div className="flex justify-between gap-2">
            <button
              type="button"
              onClick={remove}
              className="text-xs px-3 py-1.5 rounded-md border border-destructive/50 text-destructive hover:bg-destructive/10 inline-flex items-center gap-1.5"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Delete
            </button>
            <button
              type="button"
              onClick={save}
              disabled={!dirty || saving}
              className="text-xs px-4 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
            >
              {saving ? "Saving…" : "Save milestone"}
            </button>
          </div>
        </div>
      )}
    </li>
  );
}

function NewMilestoneForm({
  slug,
  onCreated,
}: {
  slug: string;
  onCreated: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!title.trim()) return;
    setSubmitting(true);
    try {
      await api.capstones.addMilestone(slug, { title, rubric: defaultRubric() });
      setTitle("");
      setOpen(false);
      onCreated();
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-3 text-xs px-3 py-1.5 rounded-md border border-dashed border-border hover:border-primary hover:bg-accent/30 inline-flex items-center gap-1.5"
      >
        <Plus className="w-3.5 h-3.5" />
        Add milestone
      </button>
    );
  }
  return (
    <div className="mt-3 rounded-md border border-border p-3 space-y-2">
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        autoFocus
        placeholder="Milestone title (e.g. 'Scaled dot-product attention')"
        className="w-full text-sm px-3 py-2 rounded-md border border-border bg-background"
      />
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setTitle("");
          }}
          className="text-xs px-3 py-1.5 rounded-md border border-border hover:bg-accent/40"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={!title.trim() || submitting}
          className="text-xs px-4 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
        >
          {submitting ? "Creating…" : "Create"}
        </button>
      </div>
    </div>
  );
}

function RubricEditor({
  rubric,
  onChange,
}: {
  rubric: CapstoneRubric;
  onChange: (r: CapstoneRubric) => void;
}) {
  const updateCriterion = (i: number, patch: Partial<CapstoneRubricCriterion>) => {
    const next = [...rubric.criteria];
    next[i] = { ...next[i], ...patch };
    onChange({ ...rubric, criteria: next });
  };
  const addCriterion = () => {
    onChange({
      ...rubric,
      criteria: [
        ...rubric.criteria,
        {
          id: `c${rubric.criteria.length + 1}`,
          weight: 0.2,
          description: "",
          aiPrompt: "",
        },
      ],
    });
  };
  const removeCriterion = (i: number) => {
    onChange({ ...rubric, criteria: rubric.criteria.filter((_, j) => j !== i) });
  };

  const totalWeight = rubric.criteria.reduce((s, c) => s + c.weight, 0);
  return (
    <div className="space-y-2">
      <ul className="space-y-2">
        {rubric.criteria.map((c, i) => (
          <li key={i} className="rounded border border-border p-2 space-y-1.5">
            <div className="grid grid-cols-[1fr_5rem_2rem] gap-2 items-center">
              <input
                value={c.id}
                onChange={(e) => updateCriterion(i, { id: e.target.value })}
                placeholder="id"
                className="text-xs px-2 py-1 rounded border border-border bg-background font-mono"
              />
              <input
                type="number"
                step={0.05}
                min={0}
                max={1}
                value={c.weight}
                onChange={(e) =>
                  updateCriterion(i, { weight: parseFloat(e.target.value) || 0 })
                }
                className="text-xs px-2 py-1 rounded border border-border bg-background"
              />
              <button
                type="button"
                onClick={() => removeCriterion(i)}
                className="text-destructive hover:bg-destructive/10 rounded p-1"
                title="Remove criterion"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
            <input
              value={c.description}
              onChange={(e) => updateCriterion(i, { description: e.target.value })}
              placeholder="What's being evaluated"
              className="w-full text-xs px-2 py-1 rounded border border-border bg-background"
            />
            <textarea
              value={c.aiPrompt}
              onChange={(e) => updateCriterion(i, { aiPrompt: e.target.value })}
              placeholder="AI grader prompt — what should the model look for?"
              rows={2}
              className="w-full text-xs px-2 py-1 rounded border border-border bg-background font-mono"
            />
          </li>
        ))}
      </ul>
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={addCriterion}
          className="text-xs px-2 py-1 rounded border border-dashed border-border hover:border-primary inline-flex items-center gap-1"
        >
          <Plus className="w-3 h-3" />
          Add criterion
        </button>
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
          weight sum: {totalWeight.toFixed(2)}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Passing score">
          <input
            type="number"
            step={0.05}
            min={0}
            max={1}
            value={rubric.passingScore}
            onChange={(e) =>
              onChange({ ...rubric, passingScore: parseFloat(e.target.value) || 0 })
            }
            className="w-full text-xs px-2 py-1 rounded border border-border bg-background"
          />
        </Field>
        <Field label="Notes">
          <input
            value={rubric.notes ?? ""}
            onChange={(e) => onChange({ ...rubric, notes: e.target.value })}
            placeholder="Free-text guidance for the grader"
            className="w-full text-xs px-2 py-1 rounded border border-border bg-background"
          />
        </Field>
      </div>
    </div>
  );
}

void Code2;
