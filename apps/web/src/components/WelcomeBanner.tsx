import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuthStore } from "../stores/auth";

const STORAGE_KEY = "axiomic-welcome-dismissed";

// One-time welcome banner shown to authenticated users on the homepage
// until they dismiss it. Sets a localStorage flag on dismiss so it
// never reappears for the same browser. We deliberately avoid a
// multi-step guided tour — overlays-with-spotlights consistently rank
// among the most-disliked UX patterns in product surveys, and a single
// concrete CTA outperforms them in actual conversion.
export function WelcomeBanner() {
  const { user } = useAuthStore();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!user) return;
    try {
      if (localStorage.getItem(STORAGE_KEY) !== "1") setVisible(true);
    } catch {
      // localStorage unavailable — keep banner hidden rather than spamming.
    }
  }, [user]);

  const dismiss = () => {
    setVisible(false);
    try {
      localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      // ignore
    }
  };

  if (!visible || !user) return null;

  return (
    <div className="border-b border-primary/20 bg-primary/5">
      <div className="max-w-5xl mx-auto px-4 py-4 flex items-start sm:items-center gap-4 flex-col sm:flex-row">
        <div className="flex-1">
          <div className="text-sm font-semibold mb-0.5">
            👋 Welcome to Axiomic, {user.displayName || user.username}.
          </div>
          <p className="text-xs text-muted-foreground">
            Pick up where Brilliant left off — open an interactive lesson with
            live visualizations and a Python sandbox. Softmax + temperature is a
            good place to start.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Link
            to="/paths/ml-engineer"
            onClick={dismiss}
            className="px-3 py-1.5 text-sm rounded-md bg-primary text-primary-foreground font-medium hover:bg-primary/90"
          >
            Start a lesson
          </Link>
          <button
            onClick={dismiss}
            className="text-xs text-muted-foreground hover:text-foreground px-2 py-1.5"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}
