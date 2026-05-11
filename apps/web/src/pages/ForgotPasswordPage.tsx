// S109 — Forgot-password landing.
//
// Single email field → POST /auth/forgot-password → success state.
// Always shows the same "if that email exists, we sent a link" copy
// so the server's enumeration-resistant 204 isn't betrayed by the UI.

import { useState } from "react";
import { Link } from "react-router-dom";
import { Mail } from "lucide-react";
import { api } from "../lib/api";

export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await api.auth.forgotPassword(email);
      setSubmitted(true);
    } catch (e: any) {
      // Network errors only — the server itself returns 204 either way.
      setError(e?.message ?? "Could not send reset email");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto px-4 py-16">
      <h1 className="text-2xl font-bold mb-2 inline-flex items-center gap-2">
        <Mail className="h-6 w-6 text-primary" /> Reset your password
      </h1>
      <p className="text-sm text-muted-foreground mb-6">
        Enter the email address on your account. We'll send a one-time link
        to reset your password. The link expires in 1 hour.
      </p>

      {submitted ? (
        <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-4 text-sm">
          <p>
            If <strong>{email}</strong> is registered, a reset link is on its way.
            Check your inbox (and spam folder).
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            In development with no email provider configured, the link is
            printed in the server logs.
          </p>
          <Link
            to="/login"
            className="mt-4 inline-flex items-center text-xs px-3 py-1.5 rounded-md border border-border hover:bg-accent/40"
          >
            Back to login
          </Link>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label htmlFor="forgot-email" className="block text-sm font-medium mb-1.5">
              Email
            </label>
            <input
              id="forgot-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              className="w-full px-3 py-2 rounded-lg border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          {error && (
            <p className="text-sm text-rose-600 dark:text-rose-400">{error}</p>
          )}
          <button
            type="submit"
            disabled={loading || !email}
            className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {loading ? "Sending…" : "Send reset link"}
          </button>
          <p className="text-xs text-muted-foreground text-center">
            <Link to="/login" className="text-primary hover:underline">
              Back to login
            </Link>
          </p>
        </form>
      )}
    </div>
  );
}
