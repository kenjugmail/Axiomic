// S108 — Email verification landing page.
//
// User clicks the link from their inbox; React Router routes them
// here. The page extracts `?token=` and POSTs it to /auth/verify-email.
// On success, refreshes the auth store so the banner disappears and
// gated routes (publish / upload) unlock.

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, AlertTriangle, Loader2 } from "lucide-react";
import { api } from "../lib/api";
import { useAuthStore } from "../stores/auth";

type VerifyState = "loading" | "ok" | "error";

export function VerifyEmailPage() {
  const [state, setState] = useState<VerifyState>("loading");
  const [errorMessage, setErrorMessage] = useState<string>("");
  const fetchUser = useAuthStore((s) => s.fetchUser);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token");
    if (!token) {
      setState("error");
      setErrorMessage("Missing verification token.");
      return;
    }
    api.auth
      .verifyEmail(token)
      .then(() => {
        setState("ok");
        // Refresh user so the banner disappears and emailVerifiedAt
        // shows up in the store.
        return fetchUser();
      })
      .catch((e: { message?: string }) => {
        setState("error");
        setErrorMessage(e?.message ?? "Verification failed");
      });
  }, [fetchUser]);

  return (
    <div className="max-w-md mx-auto px-4 py-16">
      <h1 className="text-2xl font-bold mb-6">Verify your email</h1>
      {state === "loading" && (
        <div className="rounded-lg border border-border p-6 text-center">
          <Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" />
          <p className="mt-3 text-sm text-muted-foreground">Verifying…</p>
        </div>
      )}
      {state === "ok" && (
        <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-6 text-center">
          <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-600 dark:text-emerald-400" />
          <p className="mt-3 text-sm font-medium">Email verified.</p>
          <p className="mt-1 text-xs text-muted-foreground">
            You can now publish wiki edits, upload files, and use the full beta.
          </p>
          <Link
            to="/"
            className="mt-5 inline-flex items-center text-xs px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
          >
            Continue
          </Link>
        </div>
      )}
      {state === "error" && (
        <div className="rounded-lg border border-rose-500/40 bg-rose-500/5 p-6 text-center">
          <AlertTriangle className="mx-auto h-8 w-8 text-rose-600 dark:text-rose-400" />
          <p className="mt-3 text-sm font-medium">Verification failed</p>
          <p className="mt-1 text-xs text-muted-foreground">{errorMessage}</p>
          <p className="mt-3 text-xs text-muted-foreground">
            Sign in and request a new verification email from the banner at the top of any page.
          </p>
          <Link
            to="/login"
            className="mt-5 inline-flex items-center text-xs px-3 py-1.5 rounded-md border border-border hover:bg-accent/40"
          >
            Go to login
          </Link>
        </div>
      )}
    </div>
  );
}
