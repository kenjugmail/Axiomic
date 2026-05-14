// Sprint 43 — Cohorts list + create.
//
// /cohorts — public list of cohorts with member count + visibility +
// "Join" affordance for open ones. Signed-in users get a Create form.

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Plus, Users } from "lucide-react";
import { useAuthStore } from "../stores/auth";
import { toast } from "../stores/toast";
import { Skeleton } from "../components/ui";

// Phase 18D — cheap inline email validator. We're not trying to be
// RFC 5322-perfect; we just want to catch the obvious typos before
// hitting the server.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

interface InvitationRow {
  id: string;
  email: string;
  token: string;
  status: "pending" | "accepted" | "declined" | "revoked";
  message: string;
  createdAt: string;
  decidedAt: string | null;
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
      const res = await fetch(`/api/v1/cohorts/${slug}/join`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Join failed");
      await load();
      toast.success("Joined cohort");
    } catch (e: any) {
      setError(e?.message ?? "Join failed");
      toast.error("Join failed", e?.message);
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
        <div className="space-y-2">
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
        </div>
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
              {user && c.creatorUsername === user.username && (
                <CohortInvitePanel slug={c.slug} cohortName={c.name} />
              )}
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
      toast.success("Cohort created");
    } catch (e: any) {
      setError(e?.message ?? "Failed to create");
      toast.error("Couldn't create cohort", e?.message);
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
          className="text-sm px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {busy ? "Creating…" : "Create cohort"}
        </button>
      </div>
    </form>
  );
}

// Sprint 52 — Inline organizer-only invite panel rendered under each
// owned cohort. Collapsed by default; expanding loads the existing
// invitations list. "Send invitations" creates one row per email and
// surfaces the resulting URL list (the organizer copies + emails
// these themselves; SMTP integration is post-v1).
function CohortInvitePanel({
  slug,
  cohortName,
}: {
  slug: string;
  cohortName: string;
}) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<InvitationRow[] | null>(null);
  const [emails, setEmails] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = async () => {
    setError("");
    try {
      const r = await fetch(`/api/v1/cohorts/${slug}/invitations`, {
        credentials: "include",
      });
      if (!r.ok) {
        if (r.status === 403) return; // not organizer; no panel
        throw new Error(`Failed to load invitations (${r.status})`);
      }
      const data = (await r.json()) as { invitations: InvitationRow[] };
      setItems(data.invitations);
    } catch (e: any) {
      setError(e?.message ?? "Load failed");
    }
  };

  const onToggle = async () => {
    setOpen((v) => !v);
    if (!open && items === null) {
      await load();
    }
  };

  const onSend = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const list = emails
        .split(/[\s,;]+/)
        .map((s) => s.trim())
        .filter(Boolean);
      if (list.length === 0) {
        setError("Enter at least one email.");
        return;
      }
      // Phase 18D — client-side email validation. Reject before the
      // round-trip so the user sees their typo immediately instead of
      // after a server error.
      const invalid = list.filter((e) => !EMAIL_RE.test(e));
      if (invalid.length > 0) {
        setError(
          `Invalid email${invalid.length === 1 ? "" : "s"}: ${invalid.join(", ")}`,
        );
        return;
      }
      const r = await fetch(`/api/v1/cohorts/${slug}/invitations`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emails: list, message: message || undefined }),
      });
      if (!r.ok) {
        const data = await r.json().catch(() => ({}));
        throw new Error(data?.error ?? `Send failed (${r.status})`);
      }
      setEmails("");
      setMessage("");
      await load();
    } catch (e: any) {
      setError(e?.message ?? "Send failed");
    } finally {
      setBusy(false);
    }
  };

  const onRevoke = async (id: string) => {
    setBusy(true);
    setError("");
    try {
      await fetch(`/api/v1/cohorts/${slug}/invitations/${id}/revoke`, {
        method: "POST",
        credentials: "include",
      });
      await load();
    } catch (e: any) {
      setError(e?.message ?? "Revoke failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-2 border-t border-border pt-2">
      <button
        type="button"
        onClick={onToggle}
        className="text-[11px] text-muted-foreground hover:text-foreground"
      >
        {open ? "Hide invitations ▴" : "Manage invitations ▾"}
      </button>
      {open && (
        <div className="mt-2 space-y-2">
          <form onSubmit={onSend} className="space-y-2">
            <textarea
              value={emails}
              onChange={(e) => setEmails(e.target.value)}
              placeholder={`Emails to invite to ${cohortName} (comma, space, or newline separated)`}
              rows={2}
              className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
            <input
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Optional personal message"
              className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={busy || !emails.trim()}
                className="text-xs px-3 py-1 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {busy ? "Sending…" : "Send invitations"}
              </button>
            </div>
          </form>
          {error && (
            <p className="text-xs text-rose-600 dark:text-rose-400">{error}</p>
          )}
          {items && items.length > 0 && (
            <ul className="space-y-1.5">
              {items.map((inv) => {
                const url = `${typeof window !== "undefined" ? window.location.origin : ""}/invitations/${inv.token}`;
                return (
                  <li
                    key={inv.id}
                    className="rounded border border-border px-2 py-1.5 text-xs flex items-center justify-between gap-2 flex-wrap"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="font-medium">{inv.email}</div>
                      <div className="text-[10px] text-muted-foreground">
                        {inv.status}
                        {" · "}
                        {inv.status === "pending" ? (
                          <button
                            type="button"
                            onClick={() => navigator.clipboard.writeText(url)}
                            className="underline hover:text-foreground"
                            title="Copy invite URL"
                          >
                            copy URL
                          </button>
                        ) : (
                          <span>
                            decided{" "}
                            {inv.decidedAt
                              ? new Date(inv.decidedAt).toLocaleDateString()
                              : ""}
                          </span>
                        )}
                      </div>
                    </div>
                    {inv.status === "pending" && (
                      <button
                        type="button"
                        onClick={() => onRevoke(inv.id)}
                        className="text-[10px] px-2 py-0.5 rounded border border-border hover:bg-accent/40"
                      >
                        Revoke
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          {items && items.length === 0 && (
            <p className="text-[11px] text-muted-foreground">
              No invitations yet.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
