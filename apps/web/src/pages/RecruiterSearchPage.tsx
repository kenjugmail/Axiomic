// Phase 30C — recruiter dashboard.
//
// Search candidates by *proven* skill (every result is backed by
// signed credentials — click through to the public skills page /
// portfolio to verify). Browse the skill catalog; save candidates
// into talent pools. Discovery-only, no payments.

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Search, Users, BadgeCheck, FolderPlus } from "lucide-react";
import { api, ApiError } from "../lib/api";
import { useAuthStore } from "../stores/auth";
import { Skeleton } from "../components/ui";
import { EmptyState } from "../components/ui/EmptyState";
import { toast } from "../stores/toast";

type SearchResult = Awaited<ReturnType<typeof api.recruiter.search>>;
type SkillCatalog = Awaited<ReturnType<typeof api.recruiter.skills>>;
type Pools = Awaited<ReturnType<typeof api.recruiter.pools>>;

export function RecruiterSearchPage() {
  const user = useAuthStore((s) => s.user);
  const [catalog, setCatalog] = useState<SkillCatalog | null>(null);
  const [skill, setSkill] = useState("");
  const [minProofs, setMinProofs] = useState(1);
  const [results, setResults] = useState<SearchResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [pools, setPools] = useState<Pools | null>(null);
  const [roles, setRoles] = useState<
    Array<{ slug: string; title: string }>
  >([]);
  const [sent, setSent] = useState<
    Awaited<ReturnType<typeof api.recruiter.sentOffers>>["offers"]
  >([]);

  const reloadSent = () =>
    api.recruiter
      .sentOffers()
      .then((r) => setSent(r.offers))
      .catch(() => {});

  useEffect(() => {
    api.recruiter
      .skills()
      .then(setCatalog)
      .catch(() => setCatalog({ skills: [] }));
    api.recruiter
      .roles()
      .then((r) => setRoles(r.roles))
      .catch(() => setRoles([]));
    if (user) {
      api.recruiter
        .pools()
        .then(setPools)
        .catch(() => setPools({ pools: [] }));
      reloadSent();
    }
  }, [user?.id]);

  const runSearch = async (slug?: string) => {
    const q = (slug ?? skill).trim();
    if (!q) return;
    setSkill(q);
    setBusy(true);
    try {
      setResults(await api.recruiter.search(q, minProofs));
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Search failed");
    } finally {
      setBusy(false);
    }
  };

  const addToPool = async (poolId: string, username: string) => {
    try {
      await api.recruiter.addToPool(poolId, username);
      toast.success("Added to pool");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Couldn't add");
    }
  };

  const sendOffer = async (username: string, roleSlug: string) => {
    if (!roleSlug) return;
    try {
      const r = await api.recruiter.sendOffer(username, roleSlug);
      toast.success(
        `Offer sent — ${Math.round(r.coverage * 100)}% verified coverage`,
      );
      reloadSent();
    } catch (e) {
      toast.error(
        e instanceof ApiError ? e.message : "Couldn't send offer",
      );
    }
  };

  const withdrawOffer = async (id: string) => {
    try {
      await api.recruiter.withdrawOffer(id);
      toast.success("Offer withdrawn");
      reloadSent();
    } catch (e) {
      toast.error(
        e instanceof ApiError ? e.message : "Couldn't withdraw",
      );
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <header className="mb-6">
        <h1 className="font-display text-3xl font-semibold tracking-tight inline-flex items-center gap-2">
          <Users className="w-7 h-7 text-primary" />
          Recruiter search
        </h1>
        <p className="text-sm text-muted-foreground mt-1 max-w-prose">
          Find people by skills they've <em>proven</em> — every match
          is backed by Ed25519-signed credentials anyone can verify.
          Only public portfolios are searchable.
        </p>
      </header>

      <div className="rounded-lg border border-border bg-card p-4 mb-6">
        <div className="flex gap-2 flex-wrap items-end">
          <label className="flex-1 min-w-[12rem]">
            <span className="block text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
              Skill
            </span>
            <input
              list="skill-catalog"
              value={skill}
              onChange={(e) => setSkill(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && runSearch()}
              placeholder="transformers, distributed-systems, …"
              className="w-full text-sm px-3 py-2 rounded-md border border-border bg-background"
            />
            <datalist id="skill-catalog">
              {catalog?.skills.map((s) => (
                <option key={s.slug} value={s.slug}>
                  {s.title} ({s.candidates})
                </option>
              ))}
            </datalist>
          </label>
          <label>
            <span className="block text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
              Min proofs
            </span>
            <input
              type="number"
              min={1}
              max={20}
              value={minProofs}
              onChange={(e) =>
                setMinProofs(
                  Math.max(1, Math.min(20, parseInt(e.target.value, 10) || 1)),
                )
              }
              className="w-24 text-sm px-3 py-2 rounded-md border border-border bg-background"
            />
          </label>
          <button
            type="button"
            onClick={() => runSearch()}
            disabled={busy || !skill.trim()}
            className="text-sm px-4 py-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 inline-flex items-center gap-1.5"
          >
            <Search className="w-4 h-4" />
            {busy ? "Searching…" : "Search"}
          </button>
        </div>
      </div>

      {catalog && catalog.skills.length > 0 && !results && (
        <div className="mb-6">
          <h2 className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
            Browse skills
          </h2>
          <div className="flex flex-wrap gap-2">
            {catalog.skills.slice(0, 30).map((s) => (
              <button
                key={s.slug}
                type="button"
                onClick={() => runSearch(s.slug)}
                className="text-xs px-2.5 py-1 rounded-full border border-border hover:border-primary/40 hover:bg-primary/5"
              >
                {s.title}{" "}
                <span className="text-muted-foreground">
                  · {s.candidates}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {results && (
        <section>
          <h2 className="text-sm font-semibold mb-3">
            {results.candidates.length} candidate
            {results.candidates.length === 1 ? "" : "s"} proven in{" "}
            <span className="text-primary">{results.skill}</span>
          </h2>
          {results.candidates.length === 0 ? (
            <EmptyState
              icon={Search}
              title="No public candidates yet"
              description="Nobody with a public portfolio has proven this skill at the requested depth."
            />
          ) : (
            <ul className="space-y-3">
              {results.candidates.map((cand) => (
                <li
                  key={cand.username}
                  className="rounded-lg border border-border bg-card p-4"
                  data-testid="candidate-row"
                >
                  <div className="flex items-baseline justify-between gap-3 flex-wrap">
                    <Link
                      to={`/u/${cand.username}/skills`}
                      className="font-display text-base font-semibold hover:text-primary inline-flex items-center gap-1.5"
                    >
                      <BadgeCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                      {cand.displayName ?? `@${cand.username}`}
                    </Link>
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      {cand.proofCount} proof
                      {cand.proofCount === 1 ? "" : "s"}
                      {cand.latestProofAt &&
                        ` · latest ${new Date(
                          cand.latestProofAt,
                        ).toLocaleDateString()}`}
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-3 text-xs">
                    <Link
                      to={`/u/${cand.username}/skills`}
                      className="text-primary hover:underline"
                    >
                      View proof chain →
                    </Link>
                    <a
                      href={`/api/v1/credentials/${cand.username}/portfolio.html`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-muted-foreground hover:text-foreground"
                    >
                      Portfolio (PDF)
                    </a>
                    {pools && pools.pools.length > 0 && (
                      <select
                        defaultValue=""
                        onChange={(e) => {
                          if (e.target.value)
                            addToPool(e.target.value, cand.username);
                          e.target.value = "";
                        }}
                        className="text-xs bg-transparent border border-border rounded-md px-1.5 py-0.5"
                      >
                        <option value="" disabled>
                          + Add to pool
                        </option>
                        {pools.pools.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    )}
                    {roles.length > 0 && (
                      <select
                        defaultValue=""
                        aria-label={`Send ${cand.username} a match offer for a role`}
                        onChange={(e) => {
                          if (e.target.value)
                            sendOffer(cand.username, e.target.value);
                          e.target.value = "";
                        }}
                        className="text-xs bg-primary text-primary-foreground rounded-md px-1.5 py-0.5"
                      >
                        <option value="" disabled>
                          + Send match offer
                        </option>
                        {roles.map((r) => (
                          <option key={r.slug} value={r.slug}>
                            {r.title}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {!results && !catalog && (
        <div className="space-y-3">
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
        </div>
      )}

      {user && sent.length > 0 && (
        <section className="mt-10 pt-6 border-t border-border">
          <h2 className="text-sm font-semibold mb-3">
            Sent match offers ({sent.length})
          </h2>
          <ul className="space-y-2">
            {sent.map((o) => (
              <li
                key={o.id}
                className="text-sm flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2 flex-wrap"
              >
                <span>
                  <strong>@{o.candidateUsername}</strong> — {o.roleTitle}{" "}
                  <span
                    className={`text-xs px-1.5 py-0.5 rounded-full ${
                      o.status === "accepted"
                        ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                        : o.status === "pending"
                          ? "bg-amber-500/15 text-amber-700 dark:text-amber-300"
                          : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {o.status}
                  </span>
                  {o.status === "accepted" && o.shareUrl && (
                    <a
                      href={o.shareUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="ml-2 text-xs text-primary hover:underline"
                    >
                      View verified portfolio →
                    </a>
                  )}
                </span>
                {o.status === "pending" && (
                  <button
                    type="button"
                    onClick={() => withdrawOffer(o.id)}
                    className="text-xs px-2 py-1 rounded-md border border-border hover:bg-accent/40 shrink-0"
                  >
                    Withdraw
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {user && (
        <PoolManager
          pools={pools}
          onCreated={() =>
            api.recruiter.pools().then(setPools).catch(() => {})
          }
        />
      )}
    </div>
  );
}

function PoolManager({
  pools,
  onCreated,
}: {
  pools: Pools | null;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [open, setOpen] = useState(false);
  const create = async () => {
    if (!name.trim()) return;
    try {
      await api.recruiter.createPool(name.trim());
      setName("");
      setOpen(false);
      onCreated();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Couldn't create");
    }
  };
  return (
    <section className="mt-10 pt-6 border-t border-border">
      <div className="flex items-center justify-between gap-3 mb-3">
        <h2 className="text-sm font-semibold inline-flex items-center gap-1.5">
          <FolderPlus className="w-4 h-4 text-primary" />
          Talent pools
        </h2>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="text-xs px-3 py-1.5 rounded-md border border-border hover:bg-accent/40"
        >
          {open ? "Cancel" : "New pool"}
        </button>
      </div>
      {open && (
        <div className="flex gap-2 mb-3">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Pool name (e.g. ML hires Q3)"
            className="flex-1 text-sm px-3 py-2 rounded-md border border-border bg-background"
          />
          <button
            type="button"
            onClick={create}
            disabled={!name.trim()}
            className="text-xs px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            Create
          </button>
        </div>
      )}
      {pools && pools.pools.length > 0 ? (
        <ul className="grid sm:grid-cols-2 gap-2">
          {pools.pools.map((p) => (
            <li
              key={p.id}
              className="rounded-md border border-border bg-card px-3 py-2 text-sm flex items-center justify-between"
            >
              <span>{p.name}</span>
              <span className="text-xs text-muted-foreground">
                {p.count} saved
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">
          No pools yet — create one, then add candidates from search
          results.
        </p>
      )}
    </section>
  );
}
