// S108 — Verify-email reminder banner.
//
// Shown across the whole app when the signed-in user has not yet
// verified their email. Renders nothing for anonymous visitors and
// for already-verified users. Includes a "Resend" button that hits
// /auth/resend-verify and gives a small confirmation.

import { useState } from "react";
import { Mail } from "lucide-react";
import { api } from "../lib/api";
import { useAuthStore } from "../stores/auth";

export function VerifyEmailBanner() {
  const user = useAuthStore((s) => s.user);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!user) return null;
  // Already verified; nothing to show.
  if (user.emailVerifiedAt) return null;

  const onResend = async () => {
    setSending(true);
    setError(null);
    try {
      await api.auth.resendVerify();
      setSent(true);
      setTimeout(() => setSent(false), 5000);
    } catch (e: any) {
      setError(e?.message ?? "Resend failed");
    } finally {
      setSending(false);
    }
  };

  return (
    <div
      role="status"
      className="border-b border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-200 text-xs"
    >
      <div className="max-w-7xl mx-auto px-4 py-2 flex items-center gap-3 flex-wrap">
        <Mail className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span className="flex-1 min-w-0">
          Verify your email ({user.email}) to publish edits and upload files.
        </span>
        <button
          type="button"
          onClick={onResend}
          disabled={sending}
          className="px-2 py-0.5 rounded border border-amber-500/40 hover:bg-amber-500/20 disabled:opacity-50"
        >
          {sending ? "Sending…" : sent ? "Sent — check your inbox" : "Resend"}
        </button>
        {error && <span className="text-rose-700 dark:text-rose-300">{error}</span>}
      </div>
    </div>
  );
}
