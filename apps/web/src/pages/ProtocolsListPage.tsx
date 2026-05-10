import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Beaker, Plus, Sparkles } from "lucide-react";
import type { LabDiscipline, ProtocolSummary } from "@axiomic/types";
import { api } from "../lib/api";
import { useAuthStore } from "../stores/auth";
import {
  DisciplineFilterChips,
  DISCIPLINE_LABEL,
} from "../components/lab/DisciplineFilterChips";

export function ProtocolsListPage() {
  const { user } = useAuthStore();
  const [protocols, setProtocols] = useState<ProtocolSummary[] | null>(null);
  const [drafts, setDrafts] = useState<ProtocolSummary[]>([]);
  const [discipline, setDiscipline] = useState<LabDiscipline | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setProtocols(null);
    setError(null);
    api.lab.protocols
      .list(discipline ? { discipline } : undefined)
      .then((res) => {
        if (cancelled) return;
        setProtocols(res.protocols);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err?.message ?? "Failed to load protocols");
      });
    return () => {
      cancelled = true;
    };
  }, [discipline]);

  useEffect(() => {
    if (!user) {
      setDrafts([]);
      return;
    }
    let cancelled = false;
    api.lab.protocols
      .drafts()
      .then((res) => {
        if (cancelled) return;
        setDrafts(res.protocols);
      })
      .catch(() => {
        // Drafts are best-effort; failures don't block the published list.
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  const grouped = useMemo(() => {
    if (!protocols) return null;
    const out = new Map<string, ProtocolSummary[]>();
    for (const p of protocols) {
      const key = p.discipline;
      const arr = out.get(key) ?? [];
      arr.push(p);
      out.set(key, arr);
    }
    return out;
  }, [protocols]);

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
      <div className="flex items-start justify-between gap-4 mb-2">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight flex items-center gap-2">
            <Beaker className="w-7 h-7 text-primary" strokeWidth={1.75} />
            Lab protocols
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Authoritative procedures for every wet- and dry-bench discipline.
            Sign-offs and per-run logs ship in a follow-up sprint.
          </p>
        </div>
        {user && (
          <div className="flex items-center gap-2">
            <Link
              to="/lab/equipment"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Equipment manuals →
            </Link>
            <Link
              to="/lab/protocols/wizard"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-amber-500/40 text-amber-700 dark:text-amber-300 text-sm hover:bg-amber-500/10 transition-colors"
            >
              <Sparkles className="w-4 h-4" strokeWidth={2} />
              Draft with AI
            </Link>
            <Link
              to="/lab/protocols/new"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm hover:bg-primary/90 transition-colors"
            >
              <Plus className="w-4 h-4" strokeWidth={2} />
              New protocol
            </Link>
          </div>
        )}
      </div>

      <div className="my-5">
        <DisciplineFilterChips active={discipline} onChange={setDiscipline} />
      </div>

      {drafts.length > 0 && (
        <section className="mb-8 rounded-xl border border-dashed border-border bg-muted/30 p-4">
          <h2 className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-3">
            Your drafts
          </h2>
          <ul className="space-y-1">
            {drafts.map((p) => (
              <li key={p.id}>
                <Link
                  to={`/lab/protocols/${p.slug}/edit`}
                  className="text-sm text-foreground hover:underline"
                >
                  {p.title}
                </Link>
                <span className="ml-2 text-xs text-muted-foreground">
                  {DISCIPLINE_LABEL[p.discipline]}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {error && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {protocols === null ? (
        <div className="space-y-3">
          <div className="animate-pulse h-20 bg-muted rounded-xl" />
          <div className="animate-pulse h-20 bg-muted rounded-xl" />
        </div>
      ) : protocols.length === 0 ? (
        <p className="text-sm text-muted-foreground italic">
          No published protocols
          {discipline ? ` for ${DISCIPLINE_LABEL[discipline]}` : ""} yet.
        </p>
      ) : (
        Array.from(grouped!.entries()).map(([disc, list]) => (
          <section key={disc} className="mb-8">
            <h2 className="font-display text-xl font-semibold tracking-tight mb-3">
              {DISCIPLINE_LABEL[disc as LabDiscipline] ?? disc}
            </h2>
            <ul className="space-y-2">
              {list.map((p) => (
                <li key={p.id}>
                  <Link
                    to={`/lab/protocols/${p.slug}`}
                    className="block rounded-lg border border-border bg-card hover:bg-accent/40 transition-colors duration-fast p-4"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-foreground">
                          {p.title}
                        </h3>
                        {p.summary && (
                          <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                            {p.summary}
                          </p>
                        )}
                        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                          {p.category && <span>{p.category}</span>}
                          {p.estimatedMinutes && (
                            <span>~{p.estimatedMinutes} min</span>
                          )}
                          {p.biosafetyLevel && (
                            <span className="font-mono px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/30">
                              BSL-{p.biosafetyLevel}
                            </span>
                          )}
                          {p.requiredCerts.length > 0 && (
                            <span>
                              {p.requiredCerts.length} required cert
                              {p.requiredCerts.length === 1 ? "" : "s"}
                            </span>
                          )}
                          <span>v{p.version}</span>
                        </div>
                      </div>
                      <div className="text-xs text-muted-foreground whitespace-nowrap">
                        {p.authorDisplayName ?? p.authorUsername ?? ""}
                      </div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
