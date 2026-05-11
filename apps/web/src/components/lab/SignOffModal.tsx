import { useEffect, useState } from "react";
import { Check, X } from "lucide-react";

interface Props {
  open: boolean;
  mode: "approve" | "reject";
  protocolTitle: string;
  internName: string;
  onCancel: () => void;
  onSubmit: (notesMd: string) => Promise<void>;
}

// Lightweight confirmation modal for mentor sign-off / reject. Notes
// are required for reject (so the intern knows what to fix) and
// optional for approve.
export function SignOffModal({
  open,
  mode,
  protocolTitle,
  internName,
  onCancel,
  onSubmit,
}: Props) {
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setNotes("");
      setError(null);
      setSubmitting(false);
    }
  }, [open]);

  if (!open) return null;

  const isReject = mode === "reject";
  const requiresNotes = isReject;
  const canSubmit = !submitting && (!requiresNotes || notes.trim().length > 0);

  const handleSubmit = async () => {
    setError(null);
    setSubmitting(true);
    try {
      await onSubmit(notes.trim());
    } catch (err) {
      setError((err as Error)?.message ?? "Submit failed");
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in"
      role="dialog"
      aria-modal="true"
    >
      <button
        type="button"
        aria-label="Close dialog"
        onClick={onCancel}
        className="absolute inset-0 bg-background/70 backdrop-blur-sm"
      />
      <div className="relative w-full max-w-md rounded-xl border border-border bg-card shadow-floating">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold tracking-tight">
            {isReject ? "Send back for changes" : "Sign off on this run"}
          </h2>
          <button
            type="button"
            onClick={onCancel}
            className="p-1 rounded-md hover:bg-accent/40 text-muted-foreground"
            aria-label="Close"
          >
            <X className="w-4 h-4" strokeWidth={2} />
          </button>
        </div>
        <div className="px-5 py-4 space-y-3">
          <p className="text-sm text-muted-foreground">
            {isReject
              ? "The intern will see your notes and can resume the run after addressing them."
              : "The run will be marked complete and added to the intern's portfolio."}
          </p>
          <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">
            <div className="text-muted-foreground text-xs">Protocol</div>
            <div className="font-medium text-foreground">{protocolTitle}</div>
            <div className="text-muted-foreground text-xs mt-1">Intern</div>
            <div className="font-medium text-foreground">{internName}</div>
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
              Notes {requiresNotes ? "(required)" : "(optional)"}
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
              placeholder={
                isReject
                  ? "What does the intern need to redo or document?"
                  : "Optional comments — visible to the intern."
              }
              className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm font-mono"
            />
          </div>
          {error && (
            <div className="text-sm text-destructive">{error}</div>
          )}
        </div>
        <div className="px-5 py-3 border-t border-border flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="px-3 py-1.5 rounded-md border border-border text-sm hover:bg-accent/40 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition-colors disabled:opacity-50 ${
              isReject
                ? "bg-amber-500 text-white hover:bg-amber-600"
                : "bg-emerald-500 text-white hover:bg-emerald-600"
            }`}
          >
            {isReject ? (
              <>
                <X className="w-4 h-4" strokeWidth={2} />
                {submitting ? "Sending…" : "Send back"}
              </>
            ) : (
              <>
                <Check className="w-4 h-4" strokeWidth={2} />
                {submitting ? "Signing…" : "Sign off"}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
