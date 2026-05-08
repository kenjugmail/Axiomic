// Sprint 52 — Public capstone-track completion artifact.
//
// Reads /tracks/c/:artifactSlug; renders the bundled credential
// (track + learner + per-capstone artifact links + signed manifest).
// Public — no auth required.

import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Award, ExternalLink, ShieldCheck } from "lucide-react";
import { api } from "../lib/api";
import { Skeleton } from "../components/ui";

type Manifest = {
  issuer: string;
  kind: string;
  trackSlug: string;
  trackTitle: string;
  learnerUsername: string;
  capstones: Array<{
    slug: string;
    optional: boolean;
    artifactPageSlug: string | null;
    completedAt: string | null;
  }>;
  completedAt: string;
};

type Artifact = Awaited<ReturnType<typeof api.tracks.artifact>>;

const ACCENT_BG: Record<string, string> = {
  indigo: "from-indigo-500/15 to-indigo-500/5",
  emerald: "from-emerald-500/15 to-emerald-500/5",
  rose: "from-rose-500/15 to-rose-500/5",
  amber: "from-amber-500/15 to-amber-500/5",
  sky: "from-sky-500/15 to-sky-500/5",
  violet: "from-violet-500/15 to-violet-500/5",
};

export function CapstoneTrackArtifactPage() {
  const { artifactSlug = "" } = useParams<{ artifactSlug: string }>();
  const [data, setData] = useState<Artifact | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!artifactSlug) return;
    api.tracks
      .artifact(artifactSlug)
      .then(setData)
      .catch((e) => setError(e?.message ?? "Failed to load artifact"));
  }, [artifactSlug]);

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
      <div className="max-w-3xl mx-auto px-4 py-8 space-y-3">
        <Skeleton className="h-32" />
        <Skeleton className="h-48" />
      </div>
    );
  }

  const accent = ACCENT_BG[data.track.accentColor] ?? ACCENT_BG.violet;
  const manifest = (data.manifest as Manifest | null) ?? null;
  const learnerName = data.learner.displayName ?? `@${data.learner.username}`;

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div
        className={`rounded-lg border border-border bg-gradient-to-br ${accent} p-6 mb-6`}
      >
        <div className="flex items-start gap-4">
          <span className="text-5xl shrink-0" aria-hidden>
            {data.track.coverEmoji}
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">
              Capstone-track artifact
            </div>
            <h1 className="font-display text-3xl font-semibold tracking-tight mt-1">
              {learnerName} earned the {data.track.title}
            </h1>
            <p className="text-sm text-muted-foreground mt-2">{data.track.summary}</p>
            <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <Award className="w-3.5 h-3.5" />
                Completed {new Date(data.completedAt).toLocaleDateString()}
              </span>
              {data.signature && (
                <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  Signed
                </span>
              )}
              <Link
                to={`/tracks/${data.track.slug}`}
                className="underline inline-flex items-center gap-1"
              >
                View track <ExternalLink className="w-3 h-3" />
              </Link>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card p-5 mb-6">
        <h2 className="font-display text-lg font-semibold tracking-tight mb-3">
          Capstones in this credential
        </h2>
        <ol className="space-y-2">
          {(manifest?.capstones ?? []).map((c, idx) => (
            <li
              key={c.slug}
              className="flex items-start gap-3 border border-border rounded-md p-3"
            >
              <span className="text-xs font-mono text-muted-foreground w-6 text-right shrink-0">
                {idx + 1}.
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <Link
                    to={`/capstones/${c.slug}`}
                    className="font-medium hover:underline"
                  >
                    {c.slug}
                  </Link>
                  {c.optional && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full border border-border text-muted-foreground">
                      optional
                    </span>
                  )}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {c.completedAt
                    ? `Completed ${new Date(c.completedAt).toLocaleDateString()}`
                    : "Not completed"}
                  {c.artifactPageSlug && (
                    <>
                      {" · "}
                      <Link
                        to={`/capstones/c/${c.artifactPageSlug}`}
                        className="underline hover:text-foreground"
                      >
                        artifact →
                      </Link>
                    </>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ol>
      </div>

      {data.signature && manifest && (
        <details className="rounded-lg border border-border bg-card p-5">
          <summary className="cursor-pointer text-sm font-medium">
            Signed manifest (verifiable via{" "}
            <Link to="/verify" className="underline">
              /verify
            </Link>
            )
          </summary>
          <pre className="mt-3 text-xs overflow-x-auto bg-muted/40 p-3 rounded">
            {JSON.stringify({ manifest, signature: data.signature }, null, 2)}
          </pre>
        </details>
      )}
    </div>
  );
}
