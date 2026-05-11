// S109 — Verify-email-change landing.
//
// User clicked the link sent to their NEW email. We POST the token
// to /auth/verify-email-change; on success the new address becomes
// the login email and every existing session is revoked (so the old
// address can't keep using its cookie). The user lands on /login.

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, AlertTriangle, Loader2 } from "lucide-react";
import { api } from "../lib/api";

type State = "loading" | "ok" | "error";

export function VerifyEmailChangePage() {
  const [state, setState] = useState<State>("loading");
  const [newEmail, setNewEmail] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token");
    if (!token) {
      setState("error");
      setErrorMessage("Missing verification token.");
      return;
    }
    api.auth
      .verifyEmailChange(token)
      .then((r) => {
        setNewEmail(r.newEmail);
        setState("ok");
      })
      .catch((e: { message?: string }) => {
        setState("error");
        setErrorMessage(e?.message ?? "Verification failed");
      });
  }, []);

  return (
    <div className="max-w-md mx-auto px-4 py-16">
      <h1 className="text-2xl font-bold mb-6">Confirm new email</h1>
      {state === "loading" && (
        <div className="rounded-lg border border-border p-6 text-center">
          <Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" />
          <p className="mt-3 text-sm text-muted-foreground">Verifying…</p>
        </div>
      )}
      {state === "ok" && (
        <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-6 text-center">
          <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-600 dark:text-emerald-400" />
          <p className="mt-3 text-sm font-medium">Email updated.</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Your login email is now <strong>{newEmail}</strong>. For security,
            all of your other devices have been signed out.
          </p>
          <Link
            to="/login"
            className="mt-5 inline-flex items-center text-xs px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
          >
            Sign in with new email
          </Link>
        </div>
      )}
      {state === "error" && (
        <div className="rounded-lg border border-rose-500/40 bg-rose-500/5 p-6 text-center">
          <AlertTriangle className="mx-auto h-8 w-8 text-rose-600 dark:text-rose-400" />
          <p className="mt-3 text-sm font-medium">Verification failed</p>
          <p className="mt-1 text-xs text-muted-foreground">{errorMessage}</p>
          <p className="mt-3 text-xs text-muted-foreground">
            Sign in and request the change again from Settings.
          </p>
          <Link
            to="/settings"
            className="mt-5 inline-flex items-center text-xs px-3 py-1.5 rounded-md border border-border hover:bg-accent/40"
          >
            Open settings
          </Link>
        </div>
      )}
    </div>
  );
}
