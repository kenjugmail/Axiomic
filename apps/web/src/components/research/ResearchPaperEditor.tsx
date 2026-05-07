// Sprint 20 — Research paper editor.
//
// Three RichComposer instances under tier tabs (Intro / Undergrad /
// Grad). Author marks one tier as the canonical source-of-truth.
// Empty tiers stay empty — the reader's tier toggle will hide them.
// Mirrors the news editor's metadata strip (slug, title, summary,
// emoji, accent, references, coauthors, tags) plus a paper-structure
// disclosure for research-question / hypothesis / method / etc.

import { useState } from "react";
import { Loader2, Wand2 } from "lucide-react";
import { api } from "../../lib/api";
import { streamTokens } from "../../lib/streamTokens";
import {
  Sparkles,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Trash2,
  Plus,
} from "lucide-react";
import type {
  ResearchPaperAccent,
  ResearchPaperFormat,
  ResearchPaperReference,
  ResearchPaperStructure,
  ResearchPaperTier,
} from "@axiomic/types";
import { RichComposer } from "../composer/RichComposer";

const ACCENT_DOT: Record<ResearchPaperAccent, string> = {
  indigo: "bg-indigo-500",
  emerald: "bg-emerald-500",
  rose: "bg-rose-500",
  amber: "bg-amber-500",
  sky: "bg-sky-500",
  violet: "bg-violet-500",
};

const ACCENT_OPTIONS: ResearchPaperAccent[] = [
  "indigo",
  "emerald",
  "rose",
  "amber",
  "sky",
  "violet",
];

const FORMAT_OPTIONS: Array<{ value: ResearchPaperFormat; label: string; blurb: string }> = [
  { value: "research", label: "Research", blurb: "Original results + method." },
  { value: "explainer", label: "Explainer", blurb: "Existing concepts, made accessible." },
  { value: "survey", label: "Survey", blurb: "Lay of the land + open questions." },
  { value: "opinion", label: "Opinion", blurb: "Argued position with evidence." },
];

export interface ResearchDraft {
  slug: string;
  title: string;
  summary: string;
  format: ResearchPaperFormat;
  abstract: string;
  contentIntro: string;
  contentUndergrad: string;
  contentGrad: string;
  canonicalTier: ResearchPaperTier;
  paperStructure: ResearchPaperStructure;
  references: ResearchPaperReference[];
  coauthors: string[];
  coverEmoji: string;
  accentColor: ResearchPaperAccent;
  tags: string[];
}

interface Props {
  draft: ResearchDraft;
  onChange: (next: ResearchDraft) => void;
  slugEditable: boolean;
}

const TIER_TABS: Array<{ tier: ResearchPaperTier; label: string; blurb: string }> = [
  { tier: "intro", label: "Intro", blurb: "Plain-English, almost no math." },
  { tier: "undergrad", label: "Undergrad", blurb: "Full math + worked examples." },
  { tier: "grad", label: "Grad", blurb: "Research frontier, terse." },
];

export function ResearchPaperEditor({ draft, onChange, slugEditable }: Props) {
  const [activeTier, setActiveTier] = useState<ResearchPaperTier>(
    draft.canonicalTier,
  );
  // Sprint 24 — tier-derive: streams /ai/paper/derive-tier into the
  // empty target tier slot. `derivingTier` is the tier we're currently
  // writing; all derive buttons disable while one is in flight.
  const [derivingTier, setDerivingTier] =
    useState<ResearchPaperTier | null>(null);
  const [structureOpen, setStructureOpen] = useState(
    Object.values(draft.paperStructure).some((v) => v && v.length > 0),
  );

  const set = <K extends keyof ResearchDraft>(k: K, v: ResearchDraft[K]) =>
    onChange({ ...draft, [k]: v });

  const tierField: Record<ResearchPaperTier, keyof ResearchDraft> = {
    intro: "contentIntro",
    undergrad: "contentUndergrad",
    grad: "contentGrad",
  };

  const tierContent = draft[tierField[activeTier]] as string;
  const setTierContent = (val: string) =>
    set(tierField[activeTier] as any, val as any);

  const tierFilled = (t: ResearchPaperTier) =>
    (draft[tierField[t]] as string).trim().length > 0;

  return (
    <div className="space-y-5">
      {/* Format selector */}
      <div>
        <label className="block text-xs font-medium text-muted-foreground mb-2">
          Paper format
        </label>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {FORMAT_OPTIONS.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => set("format", f.value)}
              className={`text-left px-3 py-2 rounded-md border transition-colors ${
                draft.format === f.value
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

      {/* Title + emoji + accent */}
      <div className="grid sm:grid-cols-[1fr_auto_auto] gap-3">
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">
            Title
          </label>
          <input
            value={draft.title}
            onChange={(e) => set("title", e.target.value)}
            placeholder="A precise, descriptive paper title."
            className="w-full px-3 py-2 rounded-md border border-input bg-background text-base font-semibold focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">
            Cover
          </label>
          <input
            value={draft.coverEmoji}
            onChange={(e) => set("coverEmoji", e.target.value)}
            placeholder="📄"
            maxLength={4}
            className="w-20 px-3 py-2 rounded-md border border-input bg-background text-2xl text-center focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">
            Accent
          </label>
          <div className="flex gap-1 py-2">
            {ACCENT_OPTIONS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => set("accentColor", c)}
                aria-label={c}
                className={`w-6 h-6 rounded-full ${ACCENT_DOT[c]} transition-transform ${
                  draft.accentColor === c
                    ? "ring-2 ring-offset-2 ring-offset-background ring-foreground scale-110"
                    : "hover:scale-110"
                }`}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Slug + summary */}
      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">
            Slug{" "}
            <span className="font-mono text-[10px]">
              (/research/{draft.slug || "..."})
            </span>
          </label>
          <input
            value={draft.slug}
            onChange={(e) => slugEditable && set("slug", e.target.value)}
            placeholder="kebab-case-title"
            disabled={!slugEditable}
            className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">
            One-line summary
          </label>
          <input
            value={draft.summary}
            onChange={(e) => set("summary", e.target.value)}
            placeholder="One sentence shown on the list view."
            maxLength={500}
            className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
      </div>

      {/* Abstract */}
      <div>
        <label className="block text-xs font-medium text-muted-foreground mb-1">
          Abstract
        </label>
        <textarea
          value={draft.abstract}
          onChange={(e) => set("abstract", e.target.value)}
          rows={3}
          maxLength={8000}
          placeholder="Two or three paragraphs that frame the paper. Renders above the body."
          className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm resize-y focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      {/* Paper structure (collapsible) */}
      <details
        className="rounded-lg border border-border bg-muted/30"
        open={structureOpen}
        onToggle={(e) => setStructureOpen((e.target as HTMLDetailsElement).open)}
      >
        <summary className="px-4 py-2 cursor-pointer text-sm font-medium select-none flex items-center gap-2">
          {structureOpen ? (
            <ChevronDown className="w-3.5 h-3.5" strokeWidth={2} />
          ) : (
            <ChevronRight className="w-3.5 h-3.5" strokeWidth={2} />
          )}
          Paper structure{" "}
          <span className="text-xs text-muted-foreground font-normal">
            (research question · hypothesis · method · results · discussion · future work)
          </span>
        </summary>
        <div className="px-4 pb-4 space-y-3">
          {(
            [
              ["researchQuestion", "Research question", 1],
              ["hypothesis", "Hypothesis", 2],
              ["method", "Method", 3],
              ["results", "Results", 3],
              ["discussion", "Discussion", 3],
              ["futureWork", "Future work", 2],
            ] as const
          ).map(([key, label, rows]) => (
            <div key={key}>
              <label className="block text-xs font-medium text-muted-foreground mb-1">
                {label}
              </label>
              <textarea
                value={draft.paperStructure[key] ?? ""}
                onChange={(e) =>
                  set("paperStructure", {
                    ...draft.paperStructure,
                    [key]: e.target.value,
                  })
                }
                rows={rows}
                className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm resize-y focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          ))}
        </div>
      </details>

      {/* Tier-tabbed body editor */}
      <div>
        <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
          <div className="flex items-center gap-1 p-1 rounded-md bg-muted text-xs">
            {TIER_TABS.map((t) => {
              const filled = tierFilled(t.tier);
              const active = activeTier === t.tier;
              const canonical = draft.canonicalTier === t.tier;
              return (
                <button
                  key={t.tier}
                  type="button"
                  onClick={() => setActiveTier(t.tier)}
                  className={`px-3 py-1.5 rounded transition-colors inline-flex items-center gap-1.5 ${
                    active
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {filled ? (
                    <CheckCircle2 className="w-3 h-3 text-emerald-600" strokeWidth={2} />
                  ) : (
                    <span className="w-3 h-3 rounded-full border border-current/50 inline-block" />
                  )}
                  {t.label}
                  {canonical && (
                    <span className="text-[9px] uppercase tracking-wider text-primary">
                      canonical
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          <button
            type="button"
            onClick={() => set("canonicalTier", activeTier)}
            disabled={draft.canonicalTier === activeTier}
            className="text-xs px-2.5 py-1 rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-accent/40 disabled:opacity-50"
            title="Mark this tier as the source of truth — tier-derivation reads from here."
          >
            <Sparkles className="w-3 h-3 inline mr-1" strokeWidth={2} />
            Mark canonical
          </button>
          {(["intro", "grad"] as const)
            .filter((t) => t !== draft.canonicalTier)
            .map((target) => {
              const targetField = tierField[target] as
                | "contentIntro"
                | "contentUndergrad"
                | "contentGrad";
              const hasContent = (draft[targetField] as string).trim().length > 0;
              const canonicalHasContent =
                (draft[tierField[draft.canonicalTier]] as string).trim().length > 0;
              const targetLabel = target === "intro" ? "intro" : "grad";
              return (
                <button
                  key={target}
                  type="button"
                  onClick={async () => {
                    if (derivingTier) return;
                    if (
                      hasContent &&
                      !confirm(
                        `Replace the existing ${targetLabel} body with an AI-derived version?`,
                      )
                    )
                      return;
                    setDerivingTier(target);
                    setActiveTier(target);
                    const canonicalBody = draft[
                      tierField[draft.canonicalTier]
                    ] as string;
                    try {
                      const res = await api.ai.paperDeriveTier({
                        canonicalBody,
                        canonicalTier: draft.canonicalTier,
                        targetTier: target,
                        format: draft.format,
                      });
                      await streamTokens({
                        url: "",
                        body: undefined,
                        existingResponse: res,
                        onToken: (_t, acc) => {
                          set(targetField as any, acc as any);
                        },
                      });
                    } catch {
                      // ignore stream errors; partial body stays
                    } finally {
                      setDerivingTier(null);
                    }
                  }}
                  disabled={!canonicalHasContent || !!derivingTier}
                  className="text-xs px-2.5 py-1 rounded-md border border-primary/40 text-primary hover:bg-primary/10 disabled:opacity-50 inline-flex items-center gap-1"
                  title={`AI-derive ${targetLabel} from the canonical ${draft.canonicalTier} tier`}
                >
                  {derivingTier === target ? (
                    <Loader2 className="w-3 h-3 animate-spin" strokeWidth={2} />
                  ) : (
                    <Wand2 className="w-3 h-3" strokeWidth={2} />
                  )}
                  Derive {targetLabel}
                </button>
              );
            })}
        </div>
        <p className="text-[11px] text-muted-foreground mb-2">
          {TIER_TABS.find((t) => t.tier === activeTier)?.blurb}
        </p>
        <RichComposer
          value={tierContent}
          onChange={setTierContent}
          rows={20}
          showCodeButton
          placeholder={`${TIER_TABS.find((t) => t.tier === activeTier)?.label} body — markdown + LaTeX, plus :::viz[name] embeds, [[concept-slug]] hover cards, and :::code[python] runnable cells.`}
        />
      </div>

      {/* Coauthors + tags + references */}
      <CoauthorsRow draft={draft} setCoauthors={(c) => set("coauthors", c)} />
      <TagsRow draft={draft} setTags={(t) => set("tags", t)} />
      <ReferencesEditor
        refs={draft.references}
        setRefs={(r) => set("references", r)}
      />
    </div>
  );
}

function CoauthorsRow({
  draft,
  setCoauthors,
}: {
  draft: ResearchDraft;
  setCoauthors: (next: string[]) => void;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-muted-foreground mb-1">
        Coauthors{" "}
        <span className="text-[10px]">(comma-separated usernames; you don't need to add yourself)</span>
      </label>
      <input
        value={draft.coauthors.join(", ")}
        onChange={(e) =>
          setCoauthors(
            e.target.value
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean),
          )
        }
        placeholder="alice, bob"
        className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring"
      />
    </div>
  );
}

function TagsRow({
  draft,
  setTags,
}: {
  draft: ResearchDraft;
  setTags: (next: string[]) => void;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-muted-foreground mb-1">
        Tags <span className="text-[10px]">(lowercase kebab-case, max 8)</span>
      </label>
      <input
        value={draft.tags.join(", ")}
        onChange={(e) =>
          setTags(
            e.target.value
              .split(",")
              .map((t) => t.trim().toLowerCase().replace(/\s+/g, "-"))
              .filter(Boolean),
          )
        }
        placeholder="transformers, attention, scaling-laws"
        className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring"
      />
    </div>
  );
}

function ReferencesEditor({
  refs,
  setRefs,
}: {
  refs: ResearchPaperReference[];
  setRefs: (next: ResearchPaperReference[]) => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className="block text-xs font-medium text-muted-foreground">
          References ({refs.length})
        </label>
        <button
          type="button"
          onClick={() => setRefs([...refs, { text: "", url: "" }])}
          className="text-xs px-2 py-1 rounded border border-dashed border-border hover:bg-accent/40 inline-flex items-center gap-1"
        >
          <Plus className="w-3 h-3" strokeWidth={2} /> Add reference
        </button>
      </div>
      <ol className="space-y-2 list-decimal list-inside">
        {refs.map((ref, i) => (
          <li key={i} className="ml-2">
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_220px_auto] gap-2 items-start">
              <input
                value={ref.text}
                onChange={(e) => {
                  const next = [...refs];
                  next[i] = { ...ref, text: e.target.value };
                  setRefs(next);
                }}
                placeholder="Vaswani et al., Attention Is All You Need (2017)"
                className="px-3 py-1.5 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <input
                value={ref.url ?? ""}
                onChange={(e) => {
                  const next = [...refs];
                  next[i] = { ...ref, url: e.target.value };
                  setRefs(next);
                }}
                placeholder="https://arxiv.org/abs/1706.03762"
                className="px-3 py-1.5 rounded-md border border-input bg-background text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <button
                type="button"
                onClick={() => setRefs(refs.filter((_, idx) => idx !== i))}
                className="text-xs px-2 py-1 rounded text-muted-foreground hover:text-destructive inline-flex items-center justify-center"
                aria-label="Remove reference"
              >
                <Trash2 className="w-3.5 h-3.5" strokeWidth={2} />
              </button>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
