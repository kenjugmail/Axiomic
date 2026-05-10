// S99 — Shareable class join URL.
//
// Instructors can hand out a single link (/join/:slug/:joinCode)
// instead of asking students to type a slug + code into a dialog.
// Logged-in users get auto-enrolled and bounced to the class page;
// guests get sent to /login with the join URL as the redirect
// target so they land back here after auth.

import { useEffect, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { api, ApiError } from "../lib/api";
import { useAuthStore } from "../stores/auth";
import { Skeleton } from "../components/ui";

export function JoinClassPage() {
  const { slug = "", joinCode = "" } = useParams<{ slug: string; joinCode: string }>();
  const { user, loading: authLoading } = useAuthStore();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!user) return;
    if (!slug || !joinCode) {
      setError("Invalid join link");
      return;
    }
    let cancelled = false;
    api.classes
      .enroll(slug, joinCode)
      .then(() => {
        if (cancelled) return;
        setDone(true);
        navigate(`/classes/${slug}`);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        // Already-enrolled returns the same enroll endpoint; if the
        // server says "already enrolled" we still navigate. Otherwise
        // surface the error so the student can adjust.
        const msg = e instanceof ApiError ? e.message : "Failed to join";
        if (/already/i.test(msg)) {
          navigate(`/classes/${slug}`);
          return;
        }
        setError(msg);
      });
    return () => { cancelled = true; };
  }, [authLoading, user, slug, joinCode, navigate]);

  if (authLoading) {
    return (
      <div className="max-w-md mx-auto px-4 py-16">
        <Skeleton variant="card" className="h-32" />
      </div>
    );
  }
  if (!user) {
    // Bounce to login with this URL as the post-auth destination.
    return <Navigate to={`/login?redirect=/join/${slug}/${joinCode}`} replace />;
  }

  return (
    <div className="max-w-md mx-auto px-4 py-16 text-center">
      {error ? (
        <>
          <p className="text-sm text-destructive mb-3">{error}</p>
          <Link to="/classes" className="text-sm text-primary hover:underline">
            Browse my classes
          </Link>
        </>
      ) : done ? (
        <p className="text-sm text-muted-foreground">Joined! Redirecting…</p>
      ) : (
        <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" />
          Joining {slug}…
        </div>
      )}
    </div>
  );
}
