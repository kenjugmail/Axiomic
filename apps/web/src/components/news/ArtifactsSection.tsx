import { useState } from "react";
import {
  Code2,
  FlaskConical,
  Container,
  Database,
  FileText,
  Link as LinkIcon,
  Plus,
  X,
  Trash2,
} from "lucide-react";
import { api } from "../../lib/api";
import type {
  RunnableArtifact,
  RunnableArtifactKind,
} from "@axiomic/types";

const KIND_LABELS: Record<RunnableArtifactKind, string> = {
  github: "GitHub",
  colab: "Colab",
  docker: "Docker",
  dataset: "Dataset",
  arxiv: "arXiv",
  other: "Other",
};

const KIND_ORDER: RunnableArtifactKind[] = [
  "github",
  "colab",
  "docker",
  "dataset",
  "arxiv",
  "other",
];

function KindIcon({ kind, className }: { kind: RunnableArtifactKind; className?: string }) {
  const Icon =
    kind === "github"
      ? Code2
      : kind === "colab"
        ? FlaskConical
        : kind === "docker"
          ? Container
          : kind === "dataset"
            ? Database
            : kind === "arxiv"
              ? FileText
              : LinkIcon;
  return <Icon className={className} strokeWidth={1.8} />;
}

interface Props {
  articleSlug: string;
  initialArtifacts: RunnableArtifact[];
  // True when the current viewer can author/delete artifacts (article
  // author or coauthor).
  canEdit: boolean;
  onChange?: (next: RunnableArtifact[]) => void;
}

export function ArtifactsSection({
  articleSlug,
  initialArtifacts,
  canEdit,
  onChange,
}: Props) {
  const [artifacts, setArtifacts] = useState<RunnableArtifact[]>(initialArtifacts);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState({
    kind: "github" as RunnableArtifactKind,
    url: "",
    label: "",
    description: "",
  });

  // Hide the entire section for anonymous viewers when there's nothing
  // to show — keeps the article view uncluttered.
  if (artifacts.length === 0 && !canEdit) return null;

  const sync = (next: RunnableArtifact[]) => {
    setArtifacts(next);
    onChange?.(next);
  };

  const submit = async () => {
    if (!draft.url.trim() || !draft.label.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api.news.addArtifact(articleSlug, {
        kind: draft.kind,
        url: draft.url.trim(),
        label: draft.label.trim(),
        description: draft.description.trim() || undefined,
      });
      const newArtifact: RunnableArtifact = {
        id: r.artifactId,
        kind: draft.kind,
        url: draft.url.trim(),
        label: draft.label.trim(),
        description: draft.description.trim() || null,
        createdAt: new Date().toISOString(),
      };
      sync([...artifacts, newArtifact]);
      setDraft({ kind: "github", url: "", label: "", description: "" });
      setAdding(false);
    } catch (e: any) {
      setError(e?.message ?? "Failed to add artifact");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    if (!confirm("Remove this artifact? Receipts that referenced it stay attached to the article.")) return;
    setBusy(true);
    try {
      await api.news.deleteArtifact(articleSlug, id);
      sync(artifacts.filter((a) => a.id !== id));
    } catch (e: any) {
      alert(e?.message ?? "Delete failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mt-10 pt-6 border-t border-border">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-[10px] uppercase tracking-wider text-muted-foreground">
          How to reproduce
        </h2>
        {canEdit && !adding && (
          <button
            onClick={() => setAdding(true)}
            className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-md border border-dashed border-border hover:bg-accent/40"
          >
            <Plus className="w-3 h-3" strokeWidth={2} />
            Attach artifact
          </button>
        )}
      </div>

      {artifacts.length === 0 && !adding && canEdit && (
        <p className="text-sm text-muted-foreground italic">
          Attach the runnable bits — Colab notebook, GitHub repo, Docker
          image, dataset hash — so other researchers can verify your work
          and earn a "Reproduced ✓" badge on this article.
        </p>
      )}

      {artifacts.length > 0 && (
        <ul className="space-y-2">
          {artifacts.map((a) => (
            <li
              key={a.id}
              className="flex items-start gap-3 p-3 rounded-md border border-border bg-card hover:bg-accent/20 transition-colors"
            >
              <KindIcon
                kind={a.kind}
                className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-0.5"
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2 flex-wrap">
                  <a
                    href={a.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm font-medium hover:underline truncate"
                  >
                    {a.label}
                  </a>
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    {KIND_LABELS[a.kind]}
                  </span>
                </div>
                <a
                  href={a.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block text-xs text-muted-foreground font-mono truncate hover:underline"
                >
                  {a.url}
                </a>
                {a.description && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {a.description}
                  </p>
                )}
              </div>
              {canEdit && (
                <button
                  onClick={() => remove(a.id)}
                  disabled={busy}
                  className="text-muted-foreground hover:text-destructive disabled:opacity-50"
                  title="Remove artifact"
                  aria-label="Remove artifact"
                >
                  <Trash2 className="w-3.5 h-3.5" strokeWidth={2} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {adding && canEdit && (
        <div className="mt-3 p-3 rounded-md border border-border bg-muted/30 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium">New artifact</span>
            <button
              onClick={() => {
                setAdding(false);
                setDraft({ kind: "github", url: "", label: "", description: "" });
                setError(null);
              }}
              className="text-muted-foreground hover:text-foreground"
              aria-label="Cancel"
            >
              <X className="w-4 h-4" strokeWidth={1.8} />
            </button>
          </div>

          <div className="flex flex-wrap gap-1">
            {KIND_ORDER.map((k) => (
              <button
                key={k}
                onClick={() => setDraft({ ...draft, kind: k })}
                className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs ${
                  draft.kind === k
                    ? "bg-primary text-primary-foreground"
                    : "bg-card text-muted-foreground hover:text-foreground border border-border"
                }`}
              >
                <KindIcon kind={k} className="w-3 h-3" />
                {KIND_LABELS[k]}
              </button>
            ))}
          </div>

          <input
            value={draft.label}
            onChange={(e) => setDraft({ ...draft, label: e.target.value })}
            placeholder="Label (e.g. 'Training code', 'Eval notebook')"
            maxLength={120}
            className="w-full px-3 py-1.5 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <input
            value={draft.url}
            onChange={(e) => setDraft({ ...draft, url: e.target.value })}
            placeholder="https://github.com/… or https://colab.research.google.com/…"
            className="w-full px-3 py-1.5 rounded-md border border-input bg-background text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <textarea
            value={draft.description}
            onChange={(e) => setDraft({ ...draft, description: e.target.value })}
            placeholder="Optional notes — env requirements, expected runtime, etc."
            rows={2}
            maxLength={800}
            className="w-full px-3 py-1.5 rounded-md border border-input bg-background text-xs resize-y focus:outline-none focus:ring-2 focus:ring-ring"
          />
          {error && <div className="text-xs text-destructive">{error}</div>}
          <div className="flex justify-end">
            <button
              onClick={submit}
              disabled={busy || !draft.url.trim() || !draft.label.trim()}
              className="px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-medium disabled:opacity-50"
            >
              {busy ? "Saving…" : "Save artifact"}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
