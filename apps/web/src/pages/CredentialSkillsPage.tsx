// Phase 29C — recruiter-facing skills rollup.
//
// Public view at /u/:username/skills: every skill the person has
// proven, and exactly which signed credentials prove it. The
// strongest standalone moat — an employer opens this, sees
// evidence, and clicks through to verify, without an account.

import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { BadgeCheck, Download, ExternalLink } from "lucide-react";
import { api, ApiError } from "../lib/api";
import { Skeleton } from "../components/ui";
import { EmptyState } from "../components/ui/EmptyState";

type Summary = Awaited<ReturnType<typeof api.credentials.skillsSummary>>;

export function CredentialSkillsPage() {
  const { username = "" } = useParams<{ username: string }>();
  const [data, setData] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.credentials
      .skillsSummary(username)
      .then((r) => {
        if (!cancelled) setData(r);
      })
      .catch((e) => {
        if (!cancelled) {
          setError(
            e instanceof ApiError ? e.message : "Failed to load skills",
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [username]);

  if (error) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <BadgeCheck
          className="w-10 h-10 mx-auto mb-3 text-muted-foreground"
          strokeWidth={1.5}
        />
        <h1 className="font-display text-2xl font-semibold tracking-tight mb-2">
          Skills
        </h1>
        <p className="text-sm text-muted-foreground">{error}</p>
      </div>
    );
  }

  const ownerName = data
    ? data.user.displayName || `@${data.user.username}`
    : username;

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <header className="mb-6 flex items-baseline justify-between gap-3 flex-wrap">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight inline-flex items-center gap-2">
            <BadgeCheck className="w-7 h-7 text-primary" />
            {ownerName} — skills proven
          </h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-prose">
            Every skill backed by at least one cryptographically
            signed credential. Click any credential to verify it —
            no account required.
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            to={`/u/${username}/credentials`}
            className="text-xs px-3 py-1.5 rounded-md border border-border hover:bg-accent/40"
          >
            Full wallet
          </Link>
          <a
            href={`/api/v1/credentials/${username}/portfolio.html`}
            target="_blank"
            rel="noreferrer"
            className="text-xs px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 inline-flex items-center gap-1.5"
          >
            <Download className="w-3 h-3" />
            Portfolio (print → PDF)
          </a>
        </div>
      </header>

      {data === null && (
        <div className="space-y-3">
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
        </div>
      )}

      {data && data.skills.length === 0 && (
        <EmptyState
          icon={BadgeCheck}
          title="No mapped skills yet"
          description="Credentials this person earns will surface here, grouped by the concepts they prove."
        />
      )}

      {data && data.skills.length > 0 && (
        <ul className="space-y-3">
          {data.skills.map((s) => (
            <li
              key={s.slug}
              className="rounded-lg border border-border bg-card p-4"
              data-testid="skill-row"
            >
              <div className="flex items-baseline justify-between gap-3 flex-wrap">
                <h2 className="font-display text-base font-semibold">
                  {s.skill}
                </h2>
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  {s.provenBy.length} credential
                  {s.provenBy.length === 1 ? "" : "s"}
                </span>
              </div>
              <ul className="mt-2 space-y-1">
                {s.provenBy.map((p, i) => (
                  <li
                    key={i}
                    className="text-sm text-muted-foreground flex items-center gap-2"
                  >
                    <ExternalLink className="w-3 h-3 shrink-0" />
                    <span className="text-foreground">{p.title}</span>
                    <span className="text-[11px]">
                      · {p.kind} ·{" "}
                      {new Date(p.earnedAt).toLocaleDateString()}
                    </span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
