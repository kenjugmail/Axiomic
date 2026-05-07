// Sprint 20 — Research paper reader.
//
// Sticky tier toggle (intro / undergrad / grad), structured paper-
// metadata panel, references list, byline. Reuses MarkdownRenderer
// for the body so :::viz embeds + [[concept-link]] popovers + LaTeX
// + code highlighting all just work.

import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { Pencil, Sparkles } from "lucide-react";
import type { ResearchPaper, ResearchPaperTier } from "@axiomic/types";
import { api } from "../lib/api";
import { useAuthStore } from "../stores/auth";
import { Skeleton } from "../components/ui";
import { MarkdownRenderer } from "../components/MarkdownRenderer";
import { TierToggle } from "../components/research/TierToggle";

const FORMAT_LABEL: Record<string, string> = {
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

const TIER_PREF_KEY = "axiomic.research.tier";

function readTierPref(): ResearchPaperTier {
  try {
    const v = localStorage.getItem(TIER_PREF_KEY);
    if (v === "intro" || v === "undergrad" || v === "grad") return v;
  } catch {}
  return "undergrad";
}

export function ResearchPaperPage() {
  const { slug } = useParams<{ slug: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const user = useAuthStore((s) => s.user);

  const queryTier = (searchParams.get("tier") as ResearchPaperTier) || null;
  const [tier, setTier] = useState<ResearchPaperTier>(
    queryTier ?? readTierPref(),
  );

  const [paper, setPaper] = useState<ResearchPaper | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!slug) return;
    api.research
      .get(slug, tier)
      .then((r) => setPaper(r.paper))
      .catch((e) => setError(e?.message ?? "Failed to load paper"));
  }, [slug, tier]);

  // Persist + reflect in URL.
  useEffect(() => {
    try {
      localStorage.setItem(TIER_PREF_KEY, tier);
    } catch {}
    if (queryTier !== tier) {
      const next = new URLSearchParams(searchParams);
      next.set("tier", tier);
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tier]);

  if (error) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center">
        <h1 className="text-xl font-semibold mb-2">Paper not found</h1>
        <p className="text-muted-foreground mb-4">{error}</p>
        <Link to="/research" className="text-primary hover:underline">
          Back to research
        </Link>
      </div>
    );
  }

  if (!paper) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8">
        <Skeleton variant="card" className="h-56 mb-6" />
        <div className="space-y-3">
          <Skeleton className="h-8 w-2/3" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      </div>
    );
  }

  // The server may have served a different tier than we asked for if
  // the requested tier was empty. Show a tiny note when that happens.
  const fellBack = paper.tier !== paper.requestedTier;

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <Link
        to="/research"
        className="text-sm text-muted-foreground hover:text-foreground"
      >
        &larr; All research
      </Link>

      <div
        className={`mt-4 rounded-xl px-6 py-8 bg-gradient-to-br ${
          ACCENT_BG[paper.accentColor] ?? ACCENT_BG.violet
        } border border-border`}
      >
        <div className="text-5xl mb-2">{paper.coverEmoji}</div>
        <div className="text-[10px] uppercase tracking-wider text-primary font-medium">
          {FORMAT_LABEL[paper.format] ?? "Research"} · paper
        </div>
      </div>

      <h1 className="font-display text-3xl sm:text-4xl font-semibold mt-6 leading-tight tracking-tight">
        {paper.title}
      </h1>
      {paper.summary && (
        <p className="text-base text-muted-foreground mt-3 leading-relaxed">
          {paper.summary}
        </p>
      )}

      <div className="flex items-center gap-3 text-sm text-muted-foreground mt-4 flex-wrap">
        <span>
          By{" "}
          <Link
            to={`/profile/${paper.authorUsername}`}
            className="font-medium text-foreground hover:underline"
          >
            {paper.authorDisplayName || paper.authorUsername}
          </Link>
          {paper.coauthors.length > 0 && (
            <>
              {" with "}
              {paper.coauthors.map((co, i) => (
                <span key={co}>
                  {i > 0 && ", "}
                  <Link
                    to={`/profile/${co}`}
                    className="font-medium text-foreground hover:underline"
                  >
                    {co}
                  </Link>
                </span>
              ))}
            </>
          )}
        </span>
        <span>·</span>
        <span>{paper.readingMinutes} min read</span>
        {paper.lastEditorUsername &&
          paper.lastEditorUsername !== paper.authorUsername && (
            <>
              <span>·</span>
              <span>
                last edited by{" "}
                <Link
                  to={`/profile/${paper.lastEditorUsername}`}
                  className="text-foreground hover:underline"
                >
                  @{paper.lastEditorUsername}
                </Link>
              </span>
            </>
          )}
      </div>

      {paper.isAuthor && (
        <div className="flex items-center gap-2 mt-4">
          <Link
            to={`/research/${paper.slug}/edit`}
            className="text-xs px-3 py-1.5 rounded-md border border-border hover:bg-accent/40 inline-flex items-center gap-1.5"
          >
            <Pencil className="w-3 h-3" strokeWidth={2} />
            Edit
          </Link>
          {paper.status === "draft" && (
            <span className="text-xs px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/40">
              Draft · only you see this
            </span>
          )}
        </div>
      )}

      {/* Tier toggle (sticky on scroll) */}
      <div className="mt-6">
        <TierToggle
          active={paper.tier}
          available={paper.availableTiers}
          onChange={setTier}
          sticky
        />
        {fellBack && (
          <p className="text-[10px] text-muted-foreground mt-1.5 italic">
            No {paper.requestedTier} version yet — showing {paper.tier} instead.
          </p>
        )}
      </div>

      {/* Abstract */}
      {paper.abstract && (
        <div className="mt-6 border-l-4 border-primary/40 pl-6 py-1">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
            Abstract
          </div>
          <div className="prose-sm max-w-none italic [&_p]:text-base [&_p]:leading-relaxed [&_p]:text-foreground/85">
            <MarkdownRenderer content={paper.abstract} />
          </div>
        </div>
      )}

      {/* Paper structure (compact) */}
      {hasAnyStructure(paper.paperStructure) && (
        <div className="mt-6 grid sm:grid-cols-2 gap-3">
          {(
            [
              ["researchQuestion", "Research question"],
              ["hypothesis", "Hypothesis"],
              ["method", "Method"],
              ["results", "Results"],
              ["discussion", "Discussion"],
              ["futureWork", "Future work"],
            ] as const
          )
            .filter(([k]) => paper.paperStructure[k])
            .map(([k, label]) => (
              <div
                key={k}
                className="p-3 rounded-md border border-border bg-muted/30"
              >
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
                  {label}
                </div>
                <div className="text-sm leading-relaxed text-foreground/90">
                  {paper.paperStructure[k]}
                </div>
              </div>
            ))}
        </div>
      )}

      {/* Body */}
      <article className="mt-8 prose-sm max-w-none">
        {paper.content ? (
          <MarkdownRenderer content={paper.content} />
        ) : (
          <p className="text-sm text-muted-foreground italic">
            No content at this tier yet.
          </p>
        )}
      </article>

      {/* References */}
      {paper.references.length > 0 && (
        <section className="mt-12 pt-6 border-t border-border">
          <h2 className="text-[10px] uppercase tracking-wider text-muted-foreground mb-3">
            References
          </h2>
          <ol className="space-y-2 text-sm">
            {paper.references.map((r, i) => (
              <li
                key={r.label ?? String(i + 1)}
                className="grid grid-cols-[2.5rem_1fr] gap-1 leading-relaxed"
              >
                <span className="font-mono text-xs text-muted-foreground tabular-nums">
                  [{r.label ?? i + 1}]
                </span>
                <span>
                  {r.text}
                  {r.url && (
                    <>
                      {" "}
                      <a
                        href={r.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline break-all"
                      >
                        {r.url}
                      </a>
                    </>
                  )}
                </span>
              </li>
            ))}
          </ol>
        </section>
      )}

      {/* Tags */}
      {paper.tags.length > 0 && (
        <div className="mt-10 pt-4 border-t border-border flex items-center gap-1.5 flex-wrap">
          {paper.tags.map((t) => (
            <Link
              key={t}
              to={`/research?tag=${encodeURIComponent(t)}`}
              className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-muted text-muted-foreground hover:text-foreground"
            >
              #{t}
            </Link>
          ))}
        </div>
      )}

      {/* Footer CTA — link out to news side */}
      <div className="mt-10 pt-6 border-t border-border text-xs text-muted-foreground">
        <Sparkles className="w-3 h-3 inline mr-1" strokeWidth={2} />
        Research papers on Axiomic embed runnable code cells, interactive viz,
        and tier-aware reading. <Link to="/research" className="text-primary hover:underline">Browse more</Link>.
      </div>
    </div>
  );
}

function hasAnyStructure(s: ResearchPaper["paperStructure"]): boolean {
  return Object.values(s).some(
    (v): v is string => typeof v === "string" && v.trim().length > 0,
  );
}
