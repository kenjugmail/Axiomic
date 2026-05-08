// Sprint 43 — Cohorts list + create.
//
// /cohorts — public list of cohorts with member count + visibility +
// "Join" affordance for open ones. Signed-in users get a Create form.

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Plus, Users } from "lucide-react";
import { useAuthStore } from "../stores/auth";

interface CohortListItem {
  id: string;
  slug: string;
  name: string;
  description: string;
  capstoneSlug: string | null;
  visibility: "open" | "invite";
  creatorUsername: string;
  memberCount: number;
  myRole: string | null;
  createdAt: string;
}

export function CohortsPage() {
  const user = useAuthStore((s) => s.user);
  const [items, setItems] = useState<CohortListItem[] | null>(null);
  const [error, setError] = useState("");
  const [showCreate, setShowCreate] = useState(false);

  const load = async () => {
    setError("");
    try {
      const r = await fetch("/api/v1/cohorts", { credentials: "include" });
      if (!r.ok) throw new Error("Failed to load cohorts");
      const data = (await r.json()) as { cohorts: CohortListItem[] };
      setItems(data.cohorts);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load");
    }
  };

  useEffect(() => {
    load();
  }, []);

  const onJoin = async (slug: string) => {
    try {
      await fetch(`/api/v1/cohorts/${slug}/join`, {
        method: "POST",
        credentials: "include",
      });
      await load();
    } catch (e: any) {
      setError(e?.message ?? "Join failed");
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <header className="mb-6 flex items-baseline justify-between gap-3 flex-wrap">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight inline-flex items-center gap-2">
            <Users className="w-6 h-6 text-primary" strokeWidth={2} />
            Cohorts
          </h1>
          <p className="text-sm text-muted-foreground mt-2 max-w-prose">
            Small groups working through material together. Pair a cohort with
            a capstone or just a wiki path; share progress, ask questions, ship
            something jointly.
          </p>
        </div>
        {user && (
          <button
            type="button"
            onClick={() => setShowCreate((v) => !v)}
            className="text-sm px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 inline-flex items-center gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" strokeWidth={2} />
            Start a cohort
          </button>
        )}
      </header>

      {showCreate && user && (
        <CreateCohortForm
          onCancel={() => setShowCreate(false)}
          onCreated={async () => {
            setShowCreate(false);
            await load();
          }}
        />
      )}

      {error && (
        <p className="text-sm text-rose-600 dark:text-rose-400 mb-3">
          {error}
        </p>
      )}
      {items === null && !error && (
        <p className="text-sm text-muted-foreground">Loading…</p>
      )}
      {items && items.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No cohorts yet. Be the first to start one.
        </p>
      )}

      {items && items.length > 0 && (
        <ul className="space-y-2">
          {items.map((c) => (
            <li
              key={c.id}
              className="rounded-md border border-border p-3 hover:bg-accent/20 transition-colors"
            >
              <div className="flex items-baseline justify-between gap-3 flex-wrap">
                <div className="min-w-0 flex-1">
                  <Link
                    to={`/cohorts/${c.slug}`}
                    className="text-sm font-medium hover:underline"
                  >
                    {c.name}
                  </Link>
                  {c.description && (
                    <p className="text-xs text-muted-foreground line-clamp-2 mt-1">
                      {c.description}
                    </p>
                  )}
                  <div className="text-[10px] text-muted-foreground mt-1.5 flex flex-wrap gap-x-2">
                    <span>
                      {c.memberCount} member{c.memberCount === 1 ? "" : "s"}
                    </span>
                    <span>·</span>
                    <span>
                      organized by{" "}
                      <Link
                        to={`/profile/${c.creatorUsername}`}
                        className="hover:text-foreground"
                      >
                        @{c.creatorUsername}
                      </Link>
                    </span>
                    {c.capstoneSlug && (
                      <>
                        <span>·</span>
                        <Link
                          to={`/capstones/${c.capstoneSlug}`}
                          className="hover:text-foreground"
                        >
                          building {c.capstoneSlug}
                        </Link>
                      </>
                    )}
                    <span>·</span>
                    <span
                      className={
                        c.visibility === "open"
                          ? "text-emerald-600 dark:text-emerald-400"
                          : "text-amber-600 dark:text-amber-400"
                      }
                    >
                      {c.visibility === "open" ? "Open" : "Invite-only"}
                    </span>
                  </div>
                </div>
                <div className="shrink-0">
                  {c.myRole ? (
                    <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/30">
                      {c.myRole}
                    </span>
                  ) : (
                    user &&
                    c.visibility === "open" && (
                      <button
                        type="button"
                        onClick={() => onJoin(c.slug)}
                        className="text-xs px-3 py-1 rounded-md border border-border hover:bg-accent/40"
                      >
                        Join
                      </button>
                    )
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {!user && (
        <p className="text-xs text-muted-foreground mt-6">
          <Link to="/login" className="text-primary hover:underline">
            Sign in
          </Link>{" "}
          to create or join a cohort.
        </p>
      )}
    </div>
  );
}

function CreateCohortForm({
  onCancel,
  onCreated,
}: {
  onCancel: () => void;
  onCreated: () => void;
}) {
  const [slug, setSlug] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [capstoneSlug, setCapstoneSlug] = useState("");
  const [visibility, setVisibility] = useState<"open" | "invite">("open");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const res = await fetch("/api/v1/cohorts", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug,
          name,
          description,
          capstoneSlug: capstoneSlug || undefined,
          visibility,
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as any;
        throw new Error(data?.error ?? "Failed to create");
      }
      onCreated();
    } catch (e: any) {
      setError(e?.message ?? "Failed to create");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      onSubmit={submit}
      className="rounded-lg border border-border bg-card p-4 mb-4 space-y-3"
    >
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
        New cohort
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        <label className="block">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">
            Slug *
          </div>
          <input
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            required
            placeholder="transformer-fall-2026"
            className="w-full px-3 py-1.5 text-sm rounded-md border border-border bg-background"
          />
        </label>
        <label className="block">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">
            Name *
          </div>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            placeholder="Transformer fall '26"
            className="w-full px-3 py-1.5 text-sm rounded-md border border-border bg-background"
          />
        </label>
      </div>
      <label className="block">
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">
          Description
        </div>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          placeholder="What's the cohort working on?"
          className="w-full px-3 py-2 text-sm rounded-md border border-border bg-background"
        />
      </label>
      <div className="grid sm:grid-cols-2 gap-3">
        <label className="block">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">
            Capstone slug (optional)
          </div>
          <input
            value={capstoneSlug}
            onChange={(e) => setCapstoneSlug(e.target.value)}
            placeholder="build-a-transformer"
            className="w-full px-3 py-1.5 text-sm rounded-md border border-border bg-background"
          />
        </label>
        <label className="block">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">
            Visibility
          </div>
          <select
            value={visibility}
            onChange={(e) => setVisibility(e.target.value as "open" | "invite")}
            className="w-full px-3 py-1.5 text-sm rounded-md border border-border bg-background"
          >
            <option value="open">Open · anyone can join</option>
            <option value="invite">Invite · organizer approves</option>
          </select>
        </label>
      </div>
      {error && (
        <p className="text-xs text-rose-600 dark:text-rose-400">{error}</p>
      )}
      <div className="flex gap-2 justify-end">
        <button
          type="button"
          onClick={onCancel}
          className="text-sm px-3 py-1.5 rounded-md border border-border hover:bg-accent/40"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={busy}
          className="text-sm px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {busy ? "Creating…" : "Create cohort"}
        </button>
      </div>
    </form>
  );
}
