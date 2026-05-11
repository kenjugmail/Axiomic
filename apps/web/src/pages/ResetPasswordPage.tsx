// S109 — Reset-password landing.
//
// Parses ?token=… from the URL, asks for a new password + confirm,
// POSTs to /auth/reset-password. On success: redirect to /login with
// a flash message that all other sessions have been signed out.

import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { KeyRound } from "lucide-react";
import { api } from "../lib/api";
import { toast } from "../stores/toast";

export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!token) setError("Missing reset token.");
  }, [token]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await api.auth.resetPassword(token, password);
      toast.success(
        "Password updated. Any other devices signed in to this account were logged out.",
      );
      navigate("/login");
    } catch (e: any) {
      setError(e?.message ?? "Reset failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto px-4 py-16">
      <h1 className="text-2xl font-bold mb-2 inline-flex items-center gap-2">
        <KeyRound className="h-6 w-6 text-primary" /> Set a new password
      </h1>
      <p className="text-sm text-muted-foreground mb-6">
        Choose a new password. All other devices currently signed in to this
        account will be logged out.
      </p>

      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <label htmlFor="reset-password" className="block text-sm font-medium mb-1.5">
            New password
          </label>
          <input
            id="reset-password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            className="w-full px-3 py-2 rounded-lg border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <p className="text-xs text-muted-foreground mt-1">At least 8 characters</p>
        </div>
        <div>
          <label htmlFor="reset-confirm" className="block text-sm font-medium mb-1.5">
            Confirm new password
          </label>
          <input
            id="reset-confirm"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
            minLength={8}
            className="w-full px-3 py-2 rounded-lg border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        {error && <p className="text-sm text-rose-600 dark:text-rose-400">{error}</p>}
        <button
          type="submit"
          disabled={loading || !token || !password || !confirm}
          className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          {loading ? "Resetting…" : "Reset password"}
        </button>
        <p className="text-xs text-muted-foreground text-center">
          <Link to="/login" className="text-primary hover:underline">
            Back to login
          </Link>
        </p>
      </form>
    </div>
  );
}
