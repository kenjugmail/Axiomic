// Sprint 64c — mentor relationships dashboard.
//
// Surfaces the user's incoming + outgoing mentorship relationships.
// Two columns: "My mentors" (relationships where I'm the mentee) and
// "My mentees" (where I'm the mentor). Mentors accept / decline /
// end requests; mentees can end an accepted relationship.
//
// The mentor_relationships schema landed in S43; this is the first
// frontend surface for it.

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Users, UserPlus, GraduationCap } from "lucide-react";
import { api } from "../lib/api";
import { toast } from "../stores/toast";
import { Skeleton } from "../components/ui";
import { EmptyState } from "../components/ui/EmptyState";
import { useAuthStore } from "../stores/auth";

type MeRow = Awaited<ReturnType<typeof api.mentors.me>>;

const STATUS_BADGE: Record<
  "pending" | "accepted" | "declined" | "ended",
  { label: string; cls: string }
> = {
  pending: { label: "Pending", cls: "bg-amber-500/15 text-amber-700 dark:text-amber-300" },
  accepted: { label: "Active", cls: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" },
  declined: { label: "Declined", cls: "bg-muted text-muted-foreground" },
  ended: { label: "Ended", cls: "bg-muted text-muted-foreground" },
};

export function MentorDashboardPage() {
  const user = useAuthStore((s) => s.user);
  const [data, setData] = useState<MeRow | null>(null);
  const [error, setError] = useState("");
  const [suggested, setSuggested] = useState<Awaited<
    ReturnType<typeof api.mentors.candidates>
  > | null>(null);
  const [reqOpen, setReqOpen] = useState<string | null>(null);
  const [scope, setScope] = useState("");
  const [busy, setBusy] = useState(false);

  const load = () => {
    api.mentors
      .me()
      .then((r) => setData(r))
      .catch((e: any) => setError(e?.message ?? "Failed to load"));
    api.mentors
      .candidates()
      .then((r) => setSuggested(r))
      .catch(() => setSuggested({ personalized: false, candidates: [] }));
  };

  useEffect(() => {
    if (!user) return;
    load();
  }, [user]);

  const sendRequest = async (username: string) => {
    if (!scope.trim()) return;
    setBusy(true);
    try {
      await api.mentors.request(username, scope.trim());
      toast.success("Request sent");
      setReqOpen(null);
      setScope("");
      load();
    } catch (e: any) {
      toast.error("Couldn't send", e?.message);
    } finally {
      setBusy(false);
    }
  };

  if (!user) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-12">
        <p className="text-sm text-muted-foreground">Sign in to view your mentor relationships.</p>
      </div>
    );
  }

  const respond = async (
    id: string,
    status: "accepted" | "declined" | "ended",
    label: string,
  ) => {
    try {
      await api.mentors.respond(id, status);
      toast.success(label);
      load();
    } catch (e: any) {
      toast.error("Couldn't update", e?.message);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <header className="mb-8">
        <h1 className="font-display text-3xl font-semibold tracking-tight inline-flex items-center gap-2">
          <Users className="w-7 h-7 text-primary" strokeWidth={1.8} />
          Mentor relationships
        </h1>
        <p className="text-sm text-muted-foreground mt-2 max-w-2xl">
          One-to-one mentorship outside of cohorts. Mentees request a mentor +
          state a scope; mentors accept or decline. Active relationships surface
          on each side's profile.
        </p>
      </header>

      {suggested && suggested.candidates.length > 0 && (
        <section className="mb-8">
          <h2 className="text-xs uppercase tracking-wider text-muted-foreground mb-3 inline-flex items-center gap-1.5">
            <UserPlus className="w-3.5 h-3.5" strokeWidth={2} />
            Suggested mentors
          </h2>
          <p className="text-sm text-muted-foreground mb-3 max-w-2xl">
            Ranked by who proved strength exactly where you're working,
            plus community reputation and a shared track.
          </p>
          <ul className="grid sm:grid-cols-2 gap-3">
            {suggested.candidates.map((m) => (
              <li
                key={m.username}
                className="rounded-lg border border-border bg-card p-4"
                data-testid="mentor-candidate"
              >
                <div className="flex items-baseline justify-between gap-3 flex-wrap">
                  <Link
                    to={`/u/${m.username}/credentials`}
                    className="font-display text-base font-semibold hover:text-primary"
                  >
                    {m.displayName ?? `@${m.username}`}
                  </Link>
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    match {Math.round(m.score * 100)}%
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {m.rationale}
                </p>
                {reqOpen === m.username ? (
                  <div className="mt-3 space-y-2">
                    <textarea
                      value={scope}
                      onChange={(e) => setScope(e.target.value)}
                      rows={2}
                      placeholder="What do you want guidance on?"
                      className="w-full text-sm px-3 py-2 rounded-md border border-border bg-background"
                    />
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setReqOpen(null)}
                        className="text-xs px-3 py-1.5 rounded-md border border-border hover:bg-accent/40"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => sendRequest(m.username)}
                        disabled={busy || !scope.trim()}
                        className="text-xs px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                      >
                        {busy ? "Sending…" : "Send request"}
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setReqOpen(m.username);
                      setScope("");
                    }}
                    className="mt-3 text-xs px-3 py-1.5 rounded-md border border-primary/40 text-primary hover:bg-primary/10"
                  >
                    Request mentorship
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {error && (
        <div className="mb-6 rounded-md border border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300 px-4 py-2 text-sm">
          {error}
        </div>
      )}

      {!data && !error && (
        <div className="grid md:grid-cols-2 gap-6">
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
        </div>
      )}

      {data && (
        <div className="grid md:grid-cols-2 gap-6">
          {/* My mentors (I'm the mentee) */}
          <section>
            <h2 className="text-xs uppercase tracking-wider text-muted-foreground mb-3 inline-flex items-center gap-1.5">
              <GraduationCap className="w-3.5 h-3.5" strokeWidth={2} />
              My mentors ({data.asMentee.length})
            </h2>
            {data.asMentee.length === 0 ? (
              <EmptyState
                icon={UserPlus}
                title="No mentors yet"
                description="Find a mentor in the directory and request guidance on a specific scope."
                cta={
                  <Link
                    to="/mentors"
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md bg-foreground text-background text-sm font-medium hover:bg-foreground/90"
                  >
                    Browse mentors
                  </Link>
                }
              />
            ) : (
              <ul className="space-y-3">
                {data.asMentee.map((r) => (
                  <li
                    key={r.id}
                    className="rounded-lg border border-border bg-card p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <Link
                          to={`/u/${r.mentorUsername}`}
                          className="font-medium hover:underline"
                        >
                          @{r.mentorUsername}
                        </Link>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Scope: {r.scope || "—"}
                        </p>
                      </div>
                      <span
                        className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${STATUS_BADGE[r.status].cls}`}
                      >
                        {STATUS_BADGE[r.status].label}
                      </span>
                    </div>
                    {r.status === "accepted" && (
                      <div className="mt-3 flex justify-end">
                        <button
                          onClick={() => respond(r.id, "ended", "Mentorship ended")}
                          className="text-xs text-muted-foreground hover:text-foreground hover:underline"
                        >
                          End relationship
                        </button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* My mentees (I'm the mentor) */}
          <section>
            <h2 className="text-xs uppercase tracking-wider text-muted-foreground mb-3 inline-flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5" strokeWidth={2} />
              My mentees ({data.asMentor.length})
            </h2>
            {data.asMentor.length === 0 ? (
              <EmptyState
                icon={Users}
                title="No mentees yet"
                description="When someone requests you as a mentor, the request will appear here for you to accept or decline."
              />
            ) : (
              <ul className="space-y-3">
                {data.asMentor.map((r) => (
                  <li
                    key={r.id}
                    className="rounded-lg border border-border bg-card p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <Link
                          to={`/u/${r.menteeUsername}`}
                          className="font-medium hover:underline"
                        >
                          @{r.menteeUsername}
                        </Link>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Scope: {r.scope || "—"}
                        </p>
                      </div>
                      <span
                        className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${STATUS_BADGE[r.status].cls}`}
                      >
                        {STATUS_BADGE[r.status].label}
                      </span>
                    </div>
                    {r.status === "pending" && (
                      <div className="mt-3 flex gap-2 justify-end">
                        <button
                          onClick={() => respond(r.id, "declined", "Request declined")}
                          className="text-xs px-3 py-1.5 rounded-md border border-border hover:bg-accent/50"
                        >
                          Decline
                        </button>
                        <button
                          onClick={() => respond(r.id, "accepted", `Now mentoring @${r.menteeUsername}`)}
                          className="text-xs px-3 py-1.5 rounded-md bg-foreground text-background hover:bg-foreground/90"
                        >
                          Accept
                        </button>
                      </div>
                    )}
                    {r.status === "accepted" && (
                      <div className="mt-3 flex justify-end">
                        <button
                          onClick={() => respond(r.id, "ended", "Mentorship ended")}
                          className="text-xs text-muted-foreground hover:text-foreground hover:underline"
                        >
                          End relationship
                        </button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
