// Phase 28C — research bounty marketplace directory.
//
// Three tabs:
// - Discover: open, discoverable bounties (public, no auth).
// - Posted: bounties I posted (auth).
// - Claimed: bounties I've claimed (auth).

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Plus, Target } from "lucide-react";
import { api, ApiError } from "../lib/api";
import { useAuthStore } from "../stores/auth";
import { Skeleton } from "../components/ui";
import { EmptyState } from "../components/ui/EmptyState";

type Tab = "discover" | "posted" | "claimed";

type Summary = {
  id: string;
  slug: string;
  title: string;
  kind: string;
  status: string;
  rewardXp: number;
  maxClaimants: number;
  deadlineAt: string | null;
  createdAt: string;
};

const KIND_LABEL: Record<string, string> = {
  reproduce: "reproduce",
  extend: "extend",
  analyze: "analyze",
  other: "other",
};

export function BountiesListPage() {
  const user = useAuthStore((s) => s.user);
  const [tab, setTab] = useState<Tab>("discover");
  const [discover, setDiscover] = useState<Summary[] | null>(null);
  const [posted, setPosted] = useState<Summary[] | null>(null);
  const [claimed, setClaimed] = useState<Summary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.bounties
      .discover()
      .then((r) => {
        if (!cancelled) setDiscover(r.bounties);
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
    api.bounties
      .list()
      .then((r) => {
        if (cancelled) return;
        setPosted(r.posted);
        setClaimed(r.claimed);
      })
      .catch(() => {
        if (cancelled) return;
        setPosted([]);
        setClaimed([]);
      });
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const active =
    tab === "discover" ? discover : tab === "posted" ? posted : claimed;

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <header className="flex items-baseline justify-between gap-3 flex-wrap mb-6">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight inline-flex items-center gap-2">
            <Target className="w-7 h-7 text-primary" />
            Research bounties
          </h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-prose">
            Researchers post real work — reproduce a result, extend a
            method, analyze a dataset. Complete one to earn XP, a badge,
            and a signed credential in your wallet.
          </p>
        </div>
        {user && (
          <Link
            to="/bounties/new"
            className="text-sm px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 inline-flex items-center gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" />
            Post a bounty
          </Link>
        )}
      </header>

      <div className="flex gap-1 border-b border-border mb-4 flex-wrap">
        <TabButton
          active={tab === "discover"}
          onClick={() => setTab("discover")}
        >
          Discover
        </TabButton>
        {user && (
          <>
            <TabButton
              active={tab === "posted"}
              onClick={() => setTab("posted")}
            >
              Posted{posted ? ` (${posted.length})` : ""}
            </TabButton>
            <TabButton
              active={tab === "claimed"}
              onClick={() => setTab("claimed")}
            >
              Claimed{claimed ? ` (${claimed.length})` : ""}
            </TabButton>
          </>
        )}
      </div>

      {error && (
        <p className="text-sm text-rose-600 dark:text-rose-400 mb-3">
          {error}
        </p>
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
          icon={Target}
          title={
            tab === "discover"
              ? "No open bounties yet"
              : tab === "posted"
                ? "You haven't posted a bounty yet"
                : "You haven't claimed a bounty yet"
          }
          description={
            tab === "posted" && user
              ? "Click 'Post a bounty' to put work in front of learners."
              : "Check the Discover tab for open research work."
          }
        />
      )}

      {active && active.length > 0 && (
        <ul className="grid gap-3 sm:grid-cols-2">
          {active.map((b) => (
            <li
              key={b.id}
              className="rounded-lg border border-border bg-card p-4 hover:border-primary/40 transition-colors"
            >
              <Link to={`/bounties/${b.slug}`} className="block">
                <div className="flex items-baseline justify-between gap-3 flex-wrap">
                  <h2 className="font-display text-base font-semibold leading-snug min-w-0">
                    {b.title}
                  </h2>
                  <span className="text-xs font-semibold tabular-nums text-primary shrink-0">
                    {b.rewardXp} XP
                  </span>
                </div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground mt-1.5 flex flex-wrap items-center gap-2">
                  <span className="px-1.5 py-0.5 rounded-full border border-border">
                    {KIND_LABEL[b.kind] ?? b.kind}
                  </span>
                  <span>{b.status}</span>
                  {b.maxClaimants > 1 && (
                    <>
                      <span>·</span>
                      <span>{b.maxClaimants} slots</span>
                    </>
                  )}
                </div>
                {b.deadlineAt && (
                  <div className="text-xs text-muted-foreground mt-1.5">
                    deadline {new Date(b.deadlineAt).toLocaleDateString()}
                  </div>
                )}
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
