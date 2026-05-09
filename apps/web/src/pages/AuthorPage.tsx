// Sprint 72 — Author profile aggregator.
//
// Single-page rollup of: bio + social handles + h-index, internal
// research papers, claimed external papers (arXiv/OpenAlex/PubMed),
// recent BlueSky mentions of papers. Routes at /authors/:username.

import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ExternalLink,
  GraduationCap,
  Megaphone,
  ShieldCheck,
} from "lucide-react";
import type {
  AuthorProfileResponse,
  AuthorExternalPaperRef,
  AuthorInternalPaper,
  AuthorSocialPost,
} from "@axiomic/types";
import { api } from "../lib/api";
import { Skeleton } from "../components/ui";

function formatDate(iso: string | null): string {
  if (!iso) return "";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return iso;
  return new Date(t).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
  });
}

function InternalPaperRow({ p }: { p: AuthorInternalPaper }) {
  return (
    <Link
      to={`/research/${p.slug}`}
      className="block rounded-lg border border-border bg-card p-3 hover:border-primary/40 transition-colors"
    >
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {p.format} · {formatDate(p.createdAt)}
        {p.citationCount > 0 ? ` · ${p.citationCount} cites` : ""}
      </div>
      <div className="font-display font-semibold text-sm leading-snug mt-1">
        {p.title}
      </div>
      {p.summary && (
        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
          {p.summary}
        </p>
      )}
    </Link>
  );
}

function ExternalPaperRow({ ref }: { ref: AuthorExternalPaperRef }) {
  const verifiedLabel =
    ref.verifiedVia === "orcid_auto" ? "ORCID-verified" : "Admin-verified";
  return (
    <a
      href={ref.paper.htmlUrl ?? "#"}
      target="_blank"
      rel="noreferrer"
      className="block rounded-lg border border-border bg-card p-3 hover:border-primary/40 transition-colors"
    >
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-muted-foreground">
        <span>{ref.paper.source}</span>
        {ref.paper.venue && (
          <>
            <span>·</span>
            <span>{ref.paper.venue}</span>
          </>
        )}
        {ref.paper.publishedAt && (
          <>
            <span>·</span>
            <span>{formatDate(ref.paper.publishedAt)}</span>
          </>
        )}
        {ref.paper.citationCount > 0 && (
          <>
            <span>·</span>
            <span>{ref.paper.citationCount} cites</span>
          </>
        )}
      </div>
      <div className="font-display font-semibold text-sm leading-snug mt-1 inline-flex items-center gap-1.5">
        {ref.paper.title}
        <ExternalLink className="w-3 h-3 text-muted-foreground" />
      </div>
      <div className="text-[10px] text-emerald-500 mt-1 inline-flex items-center gap-1">
        <ShieldCheck className="w-3 h-3" />
        {verifiedLabel}
      </div>
    </a>
  );
}

function SocialPostRow({ p }: { p: AuthorSocialPost }) {
  return (
    <a
      href={p.url}
      target="_blank"
      rel="noreferrer"
      className="block rounded-lg border border-border bg-card p-3 hover:border-primary/40 transition-colors"
    >
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground inline-flex items-center gap-1.5">
        <Megaphone className="w-3 h-3" />
        {p.source} · {formatDate(p.postedAt)}
      </div>
      <p className="text-sm text-foreground mt-1 line-clamp-3 whitespace-pre-wrap">
        {p.text}
      </p>
      {p.referencedSource && p.referencedSourceId && (
        <div className="text-[10px] text-muted-foreground mt-1">
          References: {p.referencedSource}:{p.referencedSourceId}
          {p.referencedPaperId ? " (in our corpus)" : " (not yet ingested)"}
        </div>
      )}
    </a>
  );
}

export function AuthorPage() {
  const { username } = useParams<{ username: string }>();
  const [data, setData] = useState<AuthorProfileResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!username) return;
    setError(null);
    api.authors
      .get(username)
      .then(setData)
      .catch((e: unknown) => {
        setData(null);
        setError(e instanceof Error ? e.message : "Failed to load profile");
      });
  }, [username]);

  if (error) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-500">
          {error}
        </div>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <Skeleton className="h-12 w-1/2 mb-4" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  const { user, papers, socialPosts } = data;
  const totalPapers = papers.internal.length + papers.external.length;

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <header>
        <h1 className="font-display text-3xl font-semibold tracking-tight inline-flex items-center gap-2">
          <GraduationCap className="w-6 h-6 text-primary" />
          {user.displayName ?? user.username}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          @{user.username}
          {user.institution ? ` · ${user.institution}` : ""}
          {user.hIndex != null && (
            <span className="ml-2">
              h-index <span className="font-mono">{user.hIndex}</span>
            </span>
          )}
        </p>
        {user.bio && (
          <p className="text-sm text-foreground mt-3 max-w-2xl">{user.bio}</p>
        )}
        <div className="flex items-center gap-2 mt-3 flex-wrap text-xs">
          {user.orcid && (
            <a
              href={`https://orcid.org/${user.orcid}`}
              target="_blank"
              rel="noreferrer"
              className="px-2 py-1 rounded border border-border hover:bg-accent/40 inline-flex items-center gap-1 text-muted-foreground"
            >
              ORCID {user.orcid}
              <ExternalLink className="w-3 h-3" />
            </a>
          )}
          {user.scholarUrl && (
            <a
              href={user.scholarUrl}
              target="_blank"
              rel="noreferrer"
              className="px-2 py-1 rounded border border-border hover:bg-accent/40 inline-flex items-center gap-1 text-muted-foreground"
            >
              Google Scholar
              <ExternalLink className="w-3 h-3" />
            </a>
          )}
          {user.blueskyHandle && (
            <a
              href={`https://bsky.app/profile/${user.blueskyHandle.replace(/^@/, "")}`}
              target="_blank"
              rel="noreferrer"
              className="px-2 py-1 rounded border border-border hover:bg-accent/40 inline-flex items-center gap-1 text-muted-foreground"
            >
              @{user.blueskyHandle.replace(/^@/, "")}
              <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>
      </header>

      {totalPapers === 0 && socialPosts.length === 0 && (
        <p className="text-sm text-muted-foreground italic mt-8">
          No papers or social mentions yet. {!user.orcid && "Add an ORCID in settings to auto-claim external papers."}
        </p>
      )}

      {papers.internal.length > 0 && (
        <section className="mt-8">
          <h2 className="font-display text-lg font-semibold mb-3">
            Papers on Axiomic ({papers.internal.length})
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {papers.internal.map((p) => (
              <InternalPaperRow key={p.id} p={p} />
            ))}
          </div>
        </section>
      )}

      {papers.external.length > 0 && (
        <section className="mt-8">
          <h2 className="font-display text-lg font-semibold mb-3">
            Claimed external papers ({papers.external.length})
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {papers.external.map((ref) => (
              <ExternalPaperRow key={ref.externalPaperId} ref={ref} />
            ))}
          </div>
        </section>
      )}

      {socialPosts.length > 0 && (
        <section className="mt-8">
          <h2 className="font-display text-lg font-semibold mb-3">
            Recent paper mentions ({socialPosts.length})
          </h2>
          <div className="space-y-3">
            {socialPosts.map((p) => (
              <SocialPostRow key={p.id} p={p} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
