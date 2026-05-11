// S108 — Floating bug-report / feedback widget.
//
// Renders a small button bottom-right on every page. Click → modal
// with kind selector (bug | idea | praise) + message field. Submits
// to /api/v1/feedback which writes a `feedback_reports` row. Admin
// reviews at /admin/feedback.
//
// Anonymous reports are allowed — the server tolerates a null userId.

import { useState } from "react";
import { MessageSquare, X as XIcon } from "lucide-react";
import { api } from "../lib/api";

type FeedbackKind = "bug" | "idea" | "praise";

export function FeedbackWidget() {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<FeedbackKind>("bug");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setKind("bug");
    setMessage("");
    setSubmitted(false);
    setError(null);
  };

  const close = () => {
    setOpen(false);
    // Defer reset so the modal exit animation doesn't reveal a half-stale form.
    setTimeout(reset, 200);
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      await api.feedback.submit({ kind, message: message.trim() });
      setSubmitted(true);
    } catch (e: any) {
      setError(e?.message ?? "Submit failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Send feedback"
        className="fixed bottom-4 right-4 z-40 inline-flex items-center gap-2 rounded-full border border-border bg-card shadow-lg px-3 py-2 text-xs hover:bg-accent/40"
      >
        <MessageSquare className="h-4 w-4" aria-hidden="true" />
        <span className="hidden sm:inline">Feedback</span>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-background/60 backdrop-blur-sm p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Send feedback"
        >
          <div className="w-full max-w-md rounded-xl border border-border bg-card shadow-2xl p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-semibold">Send feedback</h2>
              <button
                type="button"
                onClick={close}
                aria-label="Close feedback"
                className="p-1 rounded hover:bg-accent/40"
              >
                <XIcon className="h-4 w-4" />
              </button>
            </div>

            {submitted ? (
              <div className="text-center py-6">
                <p className="text-sm font-medium">Thanks — we got it.</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  We read every report during the beta.
                </p>
                <button
                  type="button"
                  onClick={close}
                  className="mt-4 inline-flex items-center text-xs px-3 py-1.5 rounded-md border border-border hover:bg-accent/40"
                >
                  Close
                </button>
              </div>
            ) : (
              <form onSubmit={onSubmit} className="space-y-3">
                <div>
                  <span className="block text-xs font-medium mb-1">Type</span>
                  <div className="flex gap-1 text-xs">
                    {(["bug", "idea", "praise"] as FeedbackKind[]).map((k) => (
                      <button
                        type="button"
                        key={k}
                        onClick={() => setKind(k)}
                        className={`px-2.5 py-1 rounded border capitalize ${
                          kind === k
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border hover:bg-accent/40"
                        }`}
                      >
                        {k}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label htmlFor="feedback-message" className="block text-xs font-medium mb-1">
                    Message
                  </label>
                  <textarea
                    id="feedback-message"
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    rows={4}
                    maxLength={2000}
                    required
                    placeholder="What happened? What did you expect?"
                    className="w-full px-3 py-2 rounded-md border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    {message.length}/2000 — we'll see the current URL and your browser automatically.
                  </p>
                </div>
                {error && <p className="text-xs text-rose-600 dark:text-rose-400">{error}</p>}
                <div className="flex justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={close}
                    className="text-xs px-3 py-1.5 rounded-md border border-border hover:bg-accent/40"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting || !message.trim()}
                    className="text-xs px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                  >
                    {submitting ? "Sending…" : "Send"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
