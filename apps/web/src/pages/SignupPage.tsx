import { useCallback, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuthStore } from "../stores/auth";
import { TurnstileWidget } from "../components/TurnstileWidget";

export function SignupPage() {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  // S108 — Turnstile token. `null` when the captcha isn't loaded yet
  // OR when VITE_TURNSTILE_SITE_KEY is unset (dev / self-hosted-no-captcha).
  // The submit handler treats `null` as "no captcha required by the
  // server" because the server-side verify bypasses too in that case.
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const onTurnstileToken = useCallback((t: string | null) => setTurnstileToken(t), []);
  const signup = useAuthStore((s) => s.signup);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await signup(username, email, password, turnstileToken ?? undefined);
      // Brand-new users go through the onboarding wizard. Existing
      // users (re-signup is blocked) never reach this branch.
      navigate("/welcome");
    } catch (err: any) {
      setError(err.message || "Signup failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto px-4 py-16">
      <h1 className="text-2xl font-bold mb-6">Create your account</h1>
      {error && (
        <div className="mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">{error}</div>
      )}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="signup-username" className="block text-sm font-medium mb-1.5">Username</label>
          <input
            id="signup-username"
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            minLength={3}
            pattern="^[a-zA-Z0-9_-]+$"
            className="w-full px-3 py-2 rounded-lg border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <p className="text-xs text-muted-foreground mt-1">Letters, numbers, hyphens, underscores only</p>
        </div>
        <div>
          <label htmlFor="signup-email" className="block text-sm font-medium mb-1.5">Email</label>
          <input
            id="signup-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full px-3 py-2 rounded-lg border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <p className="text-xs text-muted-foreground mt-1">We'll send a one-time verify link.</p>
        </div>
        <div>
          <label htmlFor="signup-password" className="block text-sm font-medium mb-1.5">Password</label>
          <input
            id="signup-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            className="w-full px-3 py-2 rounded-lg border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <p className="text-xs text-muted-foreground mt-1">At least 8 characters</p>
        </div>
        <TurnstileWidget onToken={onTurnstileToken} />
        <button
          type="submit"
          disabled={loading}
          className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          {loading ? "Creating account..." : "Create account"}
        </button>
      </form>
      <p className="mt-4 text-sm text-muted-foreground text-center">
        Already have an account?{" "}
        <Link to="/login" className="text-primary hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
