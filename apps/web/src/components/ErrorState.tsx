// S108 — Reusable error panel for failed API calls.
//
// Renders one of three messages keyed off HTTP status:
//   401 → "Sign in to continue" with a /login CTA
//   403 → "You don't have access to this content"
//   default → the generic error with a Try Again button
//
// Pages that previously did `if (error) return <p>...</p>` should
// move to <ErrorState error={...} status={status} onRetry={retry} />.

import { Link } from "react-router-dom";
import { AlertTriangle, LogIn, ShieldOff } from "lucide-react";

interface ErrorStateProps {
  // Free-form error message; shown as the body when nothing more
  // specific applies. Pass `null` to use a default copy.
  error: string | null;
  // HTTP status if known. Used to branch into auth-aware messaging.
  status?: number;
  // Retry handler — wires up the "Try again" button. Omit to hide.
  onRetry?: () => void;
  className?: string;
}

export function ErrorState({ error, status, onRetry, className = "" }: ErrorStateProps) {
  if (status === 401) {
    return (
      <div className={`rounded-lg border border-border bg-card p-6 text-center ${className}`} role="alert">
        <LogIn className="mx-auto h-6 w-6 text-muted-foreground" />
        <p className="mt-2 text-sm font-medium">Sign in to continue</p>
        <p className="mt-1 text-xs text-muted-foreground">
          This page is only visible to signed-in members.
        </p>
        <Link
          to="/login"
          className="mt-4 inline-flex items-center text-xs px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
        >
          Go to login
        </Link>
      </div>
    );
  }
  if (status === 403) {
    return (
      <div className={`rounded-lg border border-border bg-card p-6 text-center ${className}`} role="alert">
        <ShieldOff className="mx-auto h-6 w-6 text-muted-foreground" />
        <p className="mt-2 text-sm font-medium">You don't have access to this content</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Ask the owner for an invite, or browse public pages.
        </p>
        <Link
          to="/"
          className="mt-4 inline-flex items-center text-xs px-3 py-1.5 rounded-md border border-border hover:bg-accent/40"
        >
          Back to home
        </Link>
      </div>
    );
  }
  return (
    <div className={`rounded-lg border border-rose-500/40 bg-rose-500/5 p-6 text-center ${className}`} role="alert">
      <AlertTriangle className="mx-auto h-6 w-6 text-rose-600 dark:text-rose-400" />
      <p className="mt-2 text-sm font-medium">Something went wrong</p>
      <p className="mt-1 text-xs text-muted-foreground">{error ?? "Please try again."}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-4 inline-flex items-center text-xs px-3 py-1.5 rounded-md border border-border hover:bg-accent/40"
        >
          Try again
        </button>
      )}
    </div>
  );
}
