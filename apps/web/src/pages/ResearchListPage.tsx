// Sprint 20 — Research papers list (published articles, public).
//
// Mirrors NewsListPage.tsx in structure but tuned for research:
// format pill row, tag filter, reading-depth chip on each card.

import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { GraduationCap } from "lucide-react";
import type { ResearchPaperFormat, ResearchPaperSummary } from "@axiomic/types";
import { api } from "../lib/api";
import { useAuthStore } from "../stores/auth";
import { Skeleton } from "../components/ui";

const FORMAT_LABEL: Record<ResearchPaperFormat, string> = {
  research: "Research",
  explainer: "Explainer",
  survey: "Survey",
  opinion: "Opinion",
};

const ACCENT_BG: Record<string, string> = {
  indigo: "from-indigo-500/15 to-indigo-500/5",
  emerald: "from-emerald-500/15 to-emerald-500/5",
  rose: "from-rose-500/15 to-rose-500/5",
  amber: "from-amber-500/15 to-amber-500/5",
  sky: "from-sky-500/15 to-sky-500/5",
  violet: "from-violet-500/15 to-violet-500/5",
};

export function ResearchListPage() {
  const { user } = useAuthStore();
  const [papers, setPapers] = useState<ResearchPaperSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [format, setFormat] = useState<ResearchPaperFormat | "all">("all");
  const [tag, setTag] = useState<string | null>(null);

  useEffect(() => {
    api.research
      .list({
        format: format === "all" ? undefined : format,
        tag: tag ?? undefined,
      })
      .then((r) => setPapers(r.papers))
      .catch((e) => setError(e?.message ?? "Failed to load papers"));
  }, [format, tag]);

  const allTags = useMemo(() => {
    if (!papers) return [];
    const counts = new Map<string, number>();
    for (const p of papers) {
      for (const t of p.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
  }, [papers]);

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between flex-wrap gap-3 mb-6">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">
            Research papers
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Tiered, viz-rich, runnable papers — read at your depth.
          </p>
        </div>
        {user && (
          <div className="flex gap-2">
            <Link
              to="/research/me/drafts"
              className="text-xs px-3 py-1.5 rounded-md border border-border hover:bg-accent/40"
            >
              My drafts
            </Link>
            <Link
              to="/research/new"
              className="text-xs px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 font-medium inline-flex items-center gap-1.5"
            >
              <GraduationCap className="w-3.5 h-3.5" strokeWidth={2} />
              New paper
            </Link>
          </div>
        )}
      </div>

      <div className="flex items-center gap-1.5 mb-3 flex-wrap">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground mr-1">
          Format
        </span>
        {(["all", "research", "explainer", "survey", "opinion"] as const).map(
          (f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFormat(f as any)}
              className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                format === f
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {f === "all" ? "All" : FORMAT_LABEL[f as ResearchPaperFormat]}
            </button>
          ),
        )}
      </div>

      {allTags.length > 0 && (
        <div className="flex items-center gap-1.5 mb-6 flex-wrap">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground mr-1">
            Tags
          </span>
          <button
            type="button"
            onClick={() => setTag(null)}
            className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
              tag === null
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            All
          </button>
          {allTags.map(([t]) => (
            <button
              key={t}
              type="button"
              onClick={() => setTag(tag === t ? null : t)}
              className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                tag === t
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              #{t}
            </button>
          ))}
        </div>
      )}

      {error && (
        <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm mb-4">
          {error}
        </div>
      )}

      {papers === null ? (
        <div className="grid sm:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} variant="card" className="h-48" />
          ))}
        </div>
      ) : papers.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-12">
          No papers yet. Be the first to publish one.
        </p>
      ) : (
        <ul className="grid sm:grid-cols-2 gap-4">
          {papers.map((p) => (
            <li key={p.id}>
              <Link
                to={`/research/${p.slug}`}
                className="block rounded-lg border border-border overflow-hidden hover:shadow-soft transition-shadow"
              >
                <div
                  className={`px-5 py-4 bg-gradient-to-br ${
                    ACCENT_BG[p.accentColor] ?? ACCENT_BG.violet
                  }`}
                >
                  <div className="text-3xl">{p.coverEmoji}</div>
                </div>
                <div className="px-5 py-4">
                  <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
                    <span className="font-medium text-primary">
                      {FORMAT_LABEL[p.format]}
                    </span>
                    {p.tags.slice(0, 2).map((t) => (
                      <span key={t}>· #{t}</span>
                    ))}
                  </div>
                  <h2 className="font-semibold leading-snug mb-1">{p.title}</h2>
                  {p.summary && (
                    <p className="text-sm text-muted-foreground line-clamp-2 leading-relaxed">
                      {p.summary}
                    </p>
                  )}
                  <div className="text-xs text-muted-foreground mt-2">
                    by{" "}
                    <span className="font-medium text-foreground">
                      {p.authorDisplayName || p.authorUsername}
                    </span>
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
