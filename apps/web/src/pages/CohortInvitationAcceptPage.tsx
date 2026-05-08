// Sprint 52 — Cohort invitation accept page.
//
// Public-by-token URL handed out by an organizer (organizer copies it
// from the cohort dashboard's invite panel and emails it themselves;
// SMTP integration is a follow-up). Authed users can accept / decline;
// anonymous users are prompted to sign up first.

import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Check, X, Mail } from "lucide-react";
import { api } from "../lib/api";
import { useAuthStore } from "../stores/auth";
import { Skeleton } from "../components/ui";

type InvitationData = Awaited<ReturnType<typeof api.cohortInvitations.peek>>;

export function CohortInvitationAcceptPage() {
  const { token = "" } = useParams<{ token: string }>();
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const [data, setData] = useState<InvitationData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!token) return;
    api.cohortInvitations
      .peek(token)
      .then(setData)
      .catch((e) => setError(e?.message ?? "Failed to load invitation"));
  }, [token]);

  async function accept() {
    if (busy || !token) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api.cohortInvitations.accept(token);
      if (res.cohortSlug) {
        navigate(`/cohorts/${res.cohortSlug}`);
      } else {
        navigate("/cohorts");
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
    } finally {
      setBusy(false);
    }
  }

  async function decline() {
    if (busy || !token) return;
    setBusy(true);
    setError(null);
    try {
      await api.cohortInvitations.decline(token);
      // Re-fetch so the page updates the displayed status.
      const fresh = await api.cohortInvitations.peek(token);
      setData(fresh);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
    } finally {
      setBusy(false);
    }
  }

  if (error && !data) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12">
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12 space-y-3">
        <Skeleton className="h-32" />
      </div>
    );
  }

  const inviter = data.inviter.displayName ?? `@${data.inviter.username}`;
  const status = data.invitation.status;
  const settled = status !== "pending";
  const emailMismatch =
    user && user.email.toLowerCase() !== data.invitation.email.toLowerCase();

  return (
    <div className="max-w-2xl mx-auto px-4 py-12">
      <div className="rounded-lg border border-border bg-card p-6">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">
          Cohort invitation
        </div>
        <h1 className="font-display text-2xl font-semibold tracking-tight mt-1">
          {inviter} invited you to “{data.cohort.name}”
        </h1>
        {data.cohort.description && (
          <p className="text-sm text-muted-foreground mt-2">
            {data.cohort.description}
          </p>
        )}
        {data.invitation.message && (
          <blockquote className="mt-4 border-l-2 border-border pl-3 text-sm text-foreground/80 italic">
            “{data.invitation.message}”
          </blockquote>
        )}
        <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
          <Mail className="w-3.5 h-3.5" />
          Invitation issued to {data.invitation.email}
        </div>

        {settled && (
          <div className="mt-4 rounded-md border border-border bg-muted/30 px-3 py-2 text-sm">
            This invitation is{" "}
            <span className="font-medium">{status}</span>
            {data.invitation.decidedAt && (
              <span className="text-muted-foreground">
                {" "}
                — decided {new Date(data.invitation.decidedAt).toLocaleDateString()}
              </span>
            )}
            .
            {status === "accepted" && (
              <>
                {" "}
                <Link
                  to={`/cohorts/${data.cohort.slug}`}
                  className="underline"
                >
                  Visit cohort →
                </Link>
              </>
            )}
          </div>
        )}

        {!settled && !user && (
          <div className="mt-6 rounded-md border border-border bg-muted/30 p-4 text-sm">
            <p className="mb-3">
              Sign in (or sign up with the matching email) to accept this invitation.
            </p>
            <Link
              to={`/auth/signup?redirect=${encodeURIComponent(`/invitations/${token}`)}`}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90"
            >
              Sign up to accept
            </Link>
          </div>
        )}

        {!settled && user && emailMismatch && (
          <div className="mt-6 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
            You're signed in as {user.email}, but the invitation was sent to {data.invitation.email}.
            Sign out and sign in with that email to accept.
          </div>
        )}

        {!settled && user && !emailMismatch && (
          <div className="mt-6 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={accept}
              disabled={busy}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-60"
            >
              <Check className="w-3.5 h-3.5" />
              Accept
            </button>
            <button
              type="button"
              onClick={decline}
              disabled={busy}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-border text-sm hover:bg-accent/40 disabled:opacity-60"
            >
              <X className="w-3.5 h-3.5" />
              Decline
            </button>
          </div>
        )}

        {error && (
          <div className="mt-3 text-sm text-destructive">{error}</div>
        )}
      </div>
    </div>
  );
}
