import { useState } from "react";
import { Flag, X } from "lucide-react";
import { api } from "../../lib/api";

const REASONS: Array<{ value: "vandalism" | "spam" | "accuracy" | "other"; label: string }> = [
  { value: "vandalism", label: "Vandalism — content is destroyed or replaced with garbage" },
  { value: "spam", label: "Spam — promotional or off-topic content" },
  { value: "accuracy", label: "Accuracy — factual error or misleading claim" },
  { value: "other", label: "Other" },
];

interface Props {
  nodeId: string;
  version: number;
  onClose: () => void;
}

export function ReportEditModal({ nodeId, version, onClose }: Props) {
  const [reason, setReason] = useState<typeof REASONS[number]["value"]>("vandalism");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const submit = async () => {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await api.mastery.reportLessonVersion(nodeId, version, {
        reason,
        message: message.trim() || undefined,
      });
      setSubmitted(true);
    } catch (e: any) {
      setError(e?.message ?? "Couldn't submit report");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-background/70 backdrop-blur-sm animate-fade-in flex items-center justify-center px-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Report this edit"
    >
      <div
        className="w-full max-w-md bg-card border border-border rounded-xl shadow-floating overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 h-12 border-b border-border">
          <span className="inline-flex items-center gap-1.5 text-sm font-semibold">
            <Flag className="w-4 h-4" strokeWidth={2} />
            Report this edit
          </span>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/40"
            aria-label="Close"
          >
            <X className="w-4 h-4" strokeWidth={2} />
          </button>
        </div>

        {submitted ? (
          <div className="p-6 text-center space-y-3">
            <p className="text-sm text-muted-foreground">
              Thanks. Reports go to the moderation queue and get reviewed
              periodically.
            </p>
            <button
              onClick={onClose}
              className="px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm font-medium"
            >
              Close
            </button>
          </div>
        ) : (
          <div className="p-4 space-y-4">
            {error && (
              <div className="p-3 rounded-md bg-destructive/10 text-destructive text-sm">
                {error}
              </div>
            )}
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                Reason
              </label>
              <div className="space-y-1.5">
                {REASONS.map((r) => (
                  <label
                    key={r.value}
                    className="flex items-start gap-2 text-sm cursor-pointer"
                  >
                    <input
                      type="radio"
                      name="reason"
                      checked={reason === r.value}
                      onChange={() => setReason(r.value)}
                      className="mt-1"
                    />
                    <span>{r.label}</span>
                  </label>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">
                Notes (optional)
              </label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={3}
                maxLength={500}
                placeholder="Anything that helps a reviewer understand the issue."
                className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div className="flex items-center justify-end gap-2">
              <button
                onClick={onClose}
                className="text-sm text-muted-foreground hover:text-foreground"
              >
                Cancel
              </button>
              <button
                onClick={submit}
                disabled={submitting}
                className="px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50"
              >
                {submitting ? "Submitting…" : "Submit report"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
