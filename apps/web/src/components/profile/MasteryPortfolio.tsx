// Sprint 31 — MasteryPortfolio.
//
// Aggregates a single user's strongest evidence across surfaces:
// completed capstone artifact pages, published research papers, wiki
// pages they've authored, and total reproductions contributed. Reads
// /users/:username/portfolio. Public; renders on any profile.

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { GraduationCap, FileText, BookOpen, CheckCircle2 } from "lucide-react";
import type { PortfolioEntry } from "@axiomic/types";
import { api } from "../../lib/api";

interface Props {
  username: string;
}

export function MasteryPortfolio({ username }: Props) {
  const [entries, setEntries] = useState<PortfolioEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.users
      .portfolio(username)
      .then((r) => setEntries(r.entries))
      .catch((e) => setError(e?.message ?? "Failed to load portfolio"));
  }, [username]);

  if (error) {
    return (
      <div className="text-xs text-destructive">{error}</div>
    );
  }
  if (entries === null) {
    return (
      <div className="text-xs text-muted-foreground">Loading portfolio…</div>
    );
  }
  if (entries.length === 0) {
    return null;
  }

  const capstoneEntries = entries.filter((e) => e.kind === "capstone") as Extract<
    PortfolioEntry,
    { kind: "capstone" }
  >[];
  const researchEntries = entries.filter((e) => e.kind === "research") as Extract<
    PortfolioEntry,
    { kind: "research" }
  >[];
  const wikiEntries = entries.filter((e) => e.kind === "wiki") as Extract<
    PortfolioEntry,
    { kind: "wiki" }
  >[];
  const reproEntry = entries.find((e) => e.kind === "reproduction") as
    | Extract<PortfolioEntry, { kind: "reproduction" }>
    | undefined;

  return (
    <section className="rounded-lg border border-border p-4">
      <h2 className="text-sm font-semibold mb-3 inline-flex items-center gap-2">
        <GraduationCap className="w-4 h-4 text-primary" />
        Mastery portfolio
      </h2>

      <div className="space-y-4">
        {capstoneEntries.length > 0 && (
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
              Capstones · {capstoneEntries.length}
            </div>
            <ul className="grid sm:grid-cols-2 gap-2">
              {capstoneEntries.map((c) => (
                <li key={c.artifactPageSlug}>
                  <Link
                    to={`/capstones/c/${c.artifactPageSlug}`}
                    className="block rounded-md border border-border p-2.5 hover:bg-accent/30"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-xl">{c.coverEmoji}</span>
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate">{c.capstoneTitle}</div>
                        <div className="text-[10px] text-muted-foreground">
                          completed {new Date(c.completedAt).toLocaleDateString()}
                        </div>
                      </div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}

        {researchEntries.length > 0 && (
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2 inline-flex items-center gap-1.5">
              <FileText className="w-3 h-3" />
              Research papers · {researchEntries.length}
            </div>
            <ul className="space-y-1">
              {researchEntries.slice(0, 5).map((r) => (
                <li key={r.slug} className="text-sm">
                  <Link to={`/research/${r.slug}`} className="text-primary hover:underline">
                    {r.title}
                  </Link>{" "}
                  <span className="text-[10px] text-muted-foreground">
                    · {r.format}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {wikiEntries.length > 0 && (
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2 inline-flex items-center gap-1.5">
              <BookOpen className="w-3 h-3" />
              Authored wiki pages · {wikiEntries.length}
            </div>
            <ul className="space-y-1">
              {wikiEntries.slice(0, 5).map((w) => (
                <li key={w.slug} className="text-sm">
                  <Link to={`/wiki/${w.slug}`} className="text-primary hover:underline">
                    {w.title}
                  </Link>{" "}
                  <span className="text-[10px] text-muted-foreground">
                    · {(w.authoredFraction * 100).toFixed(0)}% authored
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {reproEntry && (
          <div className="text-xs inline-flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="w-3.5 h-3.5" />
            {reproEntry.count} reproduction{reproEntry.count === 1 ? "" : "s"} contributed
          </div>
        )}
      </div>
    </section>
  );
}
