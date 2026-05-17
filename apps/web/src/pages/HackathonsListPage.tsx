// Phase 27D — hackathon directory + "my hackathons" tabs.
//
// Three tabs:
// - Discover: public discoverable hackathons (server filters to
//   non-draft + discoverable=true). Anyone can see.
// - Hosting: hackathons I created. Requires auth.
// - Registered: hackathons I'm on a team in. Requires auth.

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Plus, Trophy } from "lucide-react";
import { api, ApiError } from "../lib/api";
import { useAuthStore } from "../stores/auth";
import { Skeleton } from "../components/ui";
import { EmptyState } from "../components/ui/EmptyState";

type Tab = "discover" | "hosting" | "registered";

type Summary = Awaited<
  ReturnType<typeof api.hackathons.discover>
>["hackathons"][number];

export function HackathonsListPage() {
  const user = useAuthStore((s) => s.user);
  const [tab, setTab] = useState<Tab>("discover");
  const [discover, setDiscover] = useState<Summary[] | null>(null);
  const [hosting, setHosting] = useState<Summary[] | null>(null);
  const [registered, setRegistered] = useState<Summary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.hackathons
      .discover()
      .then((r) => {
        if (!cancelled) setDiscover(r.hackathons);
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof ApiError ? e.message : "Discover load failed");
          setDiscover([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    api.hackathons
      .list()
      .then((r) => {
        if (cancelled) return;
        setHosting(r.hosting);
        setRegistered(r.registered);
      })
      .catch(() => {
        if (cancelled) return;
        setHosting([]);
        setRegistered([]);
      });
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const active =
    tab === "discover"
      ? discover
      : tab === "hosting"
        ? hosting
        : registered;

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <header className="flex items-baseline justify-between gap-3 flex-wrap mb-6">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight inline-flex items-center gap-2">
            <Trophy className="w-7 h-7 text-primary" />
            Hackathons
          </h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-prose">
            Cross-field engineering competitions on Axiomic. Online or
            hosted by an institution. Build something, submit it, win XP
            + pet rewards + badges.
          </p>
        </div>
        {user && (
          <Link
            to="/hackathons/new"
            className="text-sm px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 inline-flex items-center gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" />
            Host a hackathon
          </Link>
        )}
      </header>

      <div className="flex gap-1 border-b border-border mb-4 flex-wrap">
        <TabButton active={tab === "discover"} onClick={() => setTab("discover")}>
          Discover
        </TabButton>
        {user && (
          <>
            <TabButton active={tab === "hosting"} onClick={() => setTab("hosting")}>
              Hosting{hosting ? ` (${hosting.length})` : ""}
            </TabButton>
            <TabButton
              active={tab === "registered"}
              onClick={() => setTab("registered")}
            >
              Registered{registered ? ` (${registered.length})` : ""}
            </TabButton>
          </>
        )}
      </div>

      {error && (
        <p className="text-sm text-rose-600 dark:text-rose-400 mb-3">{error}</p>
      )}

      {active === null && (
        <div className="space-y-3">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
      )}

      {active && active.length === 0 && (
        <EmptyState
          icon={Trophy}
          title={
            tab === "discover"
              ? "No public hackathons yet"
              : tab === "hosting"
                ? "You haven't hosted a hackathon yet"
                : "You haven't joined a hackathon yet"
          }
          description={
            tab === "hosting" && user
              ? "Click 'Host a hackathon' to create your first one."
              : "Browse the Discover tab when public ones land."
          }
        />
      )}

      {active && active.length > 0 && (
        <ul className="grid gap-3 sm:grid-cols-2">
          {active.map((h) => (
            <li
              key={h.id}
              className="rounded-lg border border-border bg-card p-4 hover:border-primary/40 transition-colors"
            >
              <Link to={`/hackathons/${h.slug}`} className="block">
                <div className="flex items-start gap-3">
                  <span className="text-3xl shrink-0" aria-hidden>
                    {h.coverEmoji}
                  </span>
                  <div className="min-w-0 flex-1">
                    <h2 className="font-display text-base font-semibold leading-snug">
                      {h.title}
                    </h2>
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground mt-1 flex flex-wrap items-center gap-2">
                      <span className="px-1.5 py-0.5 rounded-full border border-border">
                        {h.fieldTag}
                      </span>
                      <span>{h.hostMode}</span>
                      <span>·</span>
                      <span>{h.status}</span>
                      {h.maxTeamSize > 1 && (
                        <>
                          <span>·</span>
                          <span>teams up to {h.maxTeamSize}</span>
                        </>
                      )}
                    </div>
                    {(h.startsAt || h.endsAt) && (
                      <div className="text-xs text-muted-foreground mt-1.5">
                        {h.startsAt && (
                          <>starts {new Date(h.startsAt).toLocaleDateString()}</>
                        )}
                        {h.startsAt && h.endsAt && " · "}
                        {h.endsAt && (
                          <>ends {new Date(h.endsAt).toLocaleDateString()}</>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1.5 text-xs font-medium border-b-2 ${
        active
          ? "border-primary text-foreground"
          : "border-transparent text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}
