import { useEffect, useState } from "react";
import { CheckCircle2, X, AlertTriangle, XCircle } from "lucide-react";
import { api } from "../../lib/api";
import type {
  ReproductionStatus,
  RunnableArtifact,
} from "@axiomic/types";

interface Props {
  articleSlug: string;
  // Lets the reader scope a receipt to a specific artifact (Colab,
  // GitHub, etc). Submitting with no scope means "I reproduced the
  // overall result" — useful when no artifacts are attached.
  artifacts: RunnableArtifact[];
  // Sprint 23.5 — switches between /news/:slug/reproductions and
  // /research/:slug/reproductions (same shape, polymorphic table).
  surface?: "news" | "research";
  onClose: () => void;
  onSubmitted: () => void;
}

const STATUS_OPTIONS: Array<{
  value: ReproductionStatus;
  label: string;
  description: string;
  Icon: typeof CheckCircle2;
  className: string;
}> = [
  {
    value: "success",
    label: "Reproduced",
    description: "Got the same result.",
    Icon: CheckCircle2,
    className: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  },
  {
    value: "partial",
    label: "Partial",
    description: "Some results matched; some didn't.",
    Icon: AlertTriangle,
    className: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  },
  {
    value: "failed",
    label: "Failed",
    description: "Couldn't reproduce.",
    Icon: XCircle,
    className: "border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300",
  },
];

export function ReproduceDialog({
  articleSlug,
  artifacts,
  surface = "news",
  onClose,
  onSubmitted,
}: Props) {
  const apiSurface = surface === "research" ? api.research : api.news;
  const [status, setStatus] = useState<ReproductionStatus>("success");
  const [artifactId, setArtifactId] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [evidenceUrl, setEvidenceUrl] = useState("");
  const [busy, setBusy] = useState(false);

  // Sprint 64a-4 — Escape closes the dialog (a11y).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await apiSurface.addReproduction(articleSlug, {
        artifactId: artifactId || undefined,
        status,
        notes: notes.trim() || undefined,
        evidenceUrl: evidenceUrl.trim() || undefined,
      });
      onSubmitted();
    } catch (e: any) {
      setError(e?.message ?? "Failed to submit");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh]">
      <button
        type="button"
        aria-label="Close dialog"
        onClick={onClose}
        className="absolute inset-0 bg-background/70 backdrop-blur-sm animate-fade-in"
      />
      <div
        className="relative w-full max-w-lg bg-card border border-border rounded-xl shadow-floating animate-fade-in flex flex-col max-h-[80vh]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="repro-dialog-title"
      >
        <div className="px-5 py-3 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-600" strokeWidth={1.8} />
            <h2 id="repro-dialog-title" className="text-base font-semibold">File a reproduction receipt</h2>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
            aria-label="Close"
          >
            <X className="w-5 h-5" strokeWidth={1.8} />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4 flex-1 overflow-y-auto">
          <p className="text-sm text-muted-foreground">
            Tell other researchers what you found when you tried to reproduce
            the result. Receipts are public and contribute to the article's
            reproducibility badge.
          </p>

          <div className="grid grid-cols-3 gap-2">
            {STATUS_OPTIONS.map((opt) => {
              const selected = status === opt.value;
              return (
                <button
                  key={opt.value}
                  onClick={() => setStatus(opt.value)}
                  className={`text-left px-3 py-2 rounded-md border transition-colors ${
                    selected
                      ? opt.className + " ring-2 ring-offset-2 ring-offset-background ring-current"
                      : "border-border hover:bg-accent/40"
                  }`}
                >
                  <div className="flex items-center gap-1.5 text-sm font-medium">
                    <opt.Icon className="w-4 h-4" strokeWidth={1.8} />
                    {opt.label}
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {opt.description}
                  </p>
                </button>
              );
            })}
          </div>

          {artifacts.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">
                Which artifact? (optional)
              </label>
              <select
                value={artifactId}
                onChange={(e) => setArtifactId(e.target.value)}
                className="w-full px-3 py-1.5 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">Whole article</option>
                {artifacts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">
              Notes (optional)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              maxLength={2000}
              placeholder="What did you do? Any tweaks needed? Hardware?"
              className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm resize-y focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">
              Evidence URL (optional)
            </label>
            <input
              value={evidenceUrl}
              onChange={(e) => setEvidenceUrl(e.target.value)}
              placeholder="Link to your own Colab, gist, log, write-up, etc."
              className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          {error && <div className="text-sm text-destructive">{error}</div>}
        </div>

        <div className="px-5 py-3 border-t border-border flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={busy}
            className="px-4 py-1.5 rounded-md bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50"
          >
            {busy ? "Submitting…" : "File receipt"}
          </button>
        </div>
      </div>
    </div>
  );
}
