// Sprint 52 — Capstone track detail page.
//
// Reads /tracks/:slug; renders the brief at the chosen tier, the
// ordered capstone list with the caller's per-capstone status, and
// (when completed) a link to the public artifact.

import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { CheckCircle2, Circle, Pencil, ExternalLink, Award } from "lucide-react";
import { api } from "../lib/api";
import { useAuthStore } from "../stores/auth";
import { MarkdownRenderer } from "../components/MarkdownRenderer";
import { Skeleton } from "../components/ui";

type Tier = "intro" | "undergrad" | "grad";

type TrackDetail = Awaited<ReturnType<typeof api.tracks.get>>;

const ACCENT_BG: Record<string, string> = {
  indigo: "from-indigo-500/15 to-indigo-500/5",
  emerald: "from-emerald-500/15 to-emerald-500/5",
  rose: "from-rose-500/15 to-rose-500/5",
  amber: "from-amber-500/15 to-amber-500/5",
  sky: "from-sky-500/15 to-sky-500/5",
  violet: "from-violet-500/15 to-violet-500/5",
};

export function CapstoneTrackPage() {
  const { slug = "" } = useParams<{ slug: string }>();
  const { user } = useAuthStore();
  const [tier, setTier] = useState<Tier>("undergrad");
  const [data, setData] = useState<TrackDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!slug) return;
    api.tracks
      .get(slug, tier)
      .then(setData)
      .catch((e) => setError(e?.message ?? "Failed to load track"));
  }, [slug, tier]);

  const availableTiers = useMemo<Tier[]>(() => {
    if (!data) return ["undergrad"];
    const out: Tier[] = [];
    if (data.track.allContent.intro?.trim()) out.push("intro");
    if (data.track.allContent.undergrad?.trim()) out.push("undergrad");
    if (data.track.allContent.grad?.trim()) out.push("grad");
    return out.length ? out : ["undergrad"];
  }, [data]);

  if (error) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8 space-y-4">
        <Skeleton className="h-24" />
        <Skeleton className="h-48" />
      </div>
    );
  }

  const accent = ACCENT_BG[data.track.accentColor] ?? ACCENT_BG.violet;
  const isAuthor = user?.id === data.track.authorId;
  const completed = data.myCompletion;
  const firstUnstarted = data.capstones.find((c) => c.status === "not_started");

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <header
        className={`rounded-lg border border-border bg-gradient-to-br ${accent} p-6 mb-6`}
      >
        <div className="flex items-start gap-4">
          <span className="text-5xl shrink-0" aria-hidden>
            {data.track.coverEmoji}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h1 className="font-display text-3xl font-semibold tracking-tight">
                {data.track.title}
              </h1>
              {isAuthor && (
                <Link
                  to={`/tracks/${data.track.slug}/edit`}
                  className="text-xs px-3 py-1.5 rounded-md border border-border bg-background hover:bg-accent/40 inline-flex items-center gap-1.5"
                >
                  <Pencil className="w-3.5 h-3.5" />
                  Edit
                </Link>
              )}
            </div>
            <p className="text-sm text-muted-foreground mt-2">{data.track.summary}</p>
            <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              <span>
                {data.capstones.filter((c) => !c.optional).length} required
                {data.capstones.some((c) => c.optional) &&
                  ` · ${data.capstones.filter((c) => c.optional).length} optional`}
              </span>
              {data.track.totalEstimatedWeeks > 0 && (
                <span>~{data.track.totalEstimatedWeeks} weeks total</span>
              )}
              {data.track.tags.map((t) => (
                <span
                  key={t}
                  className="px-1.5 py-0.5 rounded-full border border-border text-muted-foreground"
                >
                  {t}
                </span>
              ))}
            </div>
            {completed && (
              <div className="mt-4 flex items-center gap-2 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm">
                <Award className="w-4 h-4 text-emerald-600" />
                <span>
                  You earned this track on {new Date(completed.completedAt).toLocaleDateString()}.
                </span>
                <Link
                  to={`/tracks/c/${completed.artifactPageSlug}`}
                  className="ml-auto text-xs underline inline-flex items-center gap-1"
                >
                  View public artifact <ExternalLink className="w-3 h-3" />
                </Link>
              </div>
            )}
          </div>
        </div>
      </header>

      {availableTiers.length > 1 && (
        <div className="mb-4 flex gap-1 rounded-md border border-border p-1 w-fit">
          {availableTiers.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTier(t)}
              className={`text-xs px-3 py-1 rounded transition-colors ${
                tier === t
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      )}

      {data.track.content.trim() && (
        <div className="rounded-lg border border-border bg-card p-6 mb-6 prose prose-sm max-w-none dark:prose-invert">
          <MarkdownRenderer content={data.track.content} />
        </div>
      )}

      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-display text-xl font-semibold tracking-tight">
            Capstones in this track
          </h2>
          {!completed && firstUnstarted && user && (
            <Link
              to={`/capstones/${firstUnstarted.slug}`}
              className="text-xs px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 font-medium"
            >
              Start track →
            </Link>
          )}
        </div>
        <ol className="space-y-2">
          {data.capstones.map((c, idx) => {
            const Icon =
              c.status === "completed"
                ? CheckCircle2
                : c.status === "in_progress"
                  ? Circle
                  : Circle;
            const iconClass =
              c.status === "completed"
                ? "text-emerald-600"
                : c.status === "in_progress"
                  ? "text-amber-500"
                  : "text-muted-foreground";
            return (
              <li
                key={c.slug}
                className="rounded-md border border-border bg-card p-4 flex items-start gap-3"
              >
                <span
                  className="shrink-0 text-xs font-mono text-muted-foreground w-6 text-right"
                  aria-hidden
                >
                  {idx + 1}.
                </span>
                <Icon className={`w-5 h-5 shrink-0 ${iconClass} mt-0.5`} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Link
                      to={`/capstones/${c.slug}`}
                      className="font-medium hover:underline"
                    >
                      {c.coverEmoji} {c.title}
                    </Link>
                    {c.optional && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full border border-border text-muted-foreground">
                        optional
                      </span>
                    )}
                    {c.status === "completed" && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-400">
                        completed
                      </span>
                    )}
                    {c.status === "in_progress" && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-400">
                        in progress
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                    {c.summary}
                  </p>
                  <div className="mt-1 text-xs text-muted-foreground">
                    ~{c.estimatedWeeks} weeks
                    {c.artifactPageSlug && (
                      <>
                        {" · "}
                        <Link
                          to={`/capstones/c/${c.artifactPageSlug}`}
                          className="underline hover:text-foreground"
                        >
                          your artifact →
                        </Link>
                      </>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
