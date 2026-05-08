// Sprint 35 — Version history page.
//
// Shared between research papers and capstones. The route mounts as
// /research/:slug/versions or /capstones/:slug/versions; this page
// detects which by URL and shows the version list with edit messages
// and links to the frozen snapshots.

import { useEffect, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { ArrowLeft, History } from "lucide-react";
import type { VersionListResponse } from "@axiomic/types";
import { api } from "../lib/api";

type Kind = "paper" | "capstone";

export function VersionsPage() {
  const { slug = "" } = useParams<{ slug: string }>();
  const { pathname } = useLocation();
  const kind: Kind = pathname.startsWith("/capstones/") ? "capstone" : "paper";
  const [data, setData] = useState<VersionListResponse | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!slug) return;
    setError("");
    setData(null);
    const fetcher =
      kind === "paper" ? api.versions.paperList : api.versions.capstoneList;
    fetcher(slug)
      .then(setData)
      .catch((e: any) => setError(e?.message ?? "Failed to load history"));
  }, [slug, kind]);

  const backHref = kind === "paper" ? `/research/${slug}` : `/capstones/${slug}`;
  const versionPath = (n: number) =>
    kind === "paper"
      ? `/research/${slug}/v/${n}`
      : `/capstones/${slug}/v/${n}`;

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <div className="text-sm text-muted-foreground mb-2">
        <Link
          to={backHref}
          className="inline-flex items-center gap-1 hover:text-foreground"
        >
          <ArrowLeft className="w-3 h-3" strokeWidth={2} />
          Back to {kind}
        </Link>
      </div>
      <h1 className="font-display text-2xl font-semibold tracking-tight inline-flex items-center gap-2">
        <History className="w-5 h-5 text-primary" strokeWidth={2} />
        Version history
      </h1>
      <p className="text-sm text-muted-foreground mt-1 mb-6">
        Every published edit is snapshotted. External citations can pin to a
        specific version using <code className="px-1.5 py-0.5 rounded bg-muted">?v=N</code>.
      </p>

      {error && (
        <p className="text-sm text-rose-600 dark:text-rose-400">{error}</p>
      )}

      {!data && !error && (
        <p className="text-sm text-muted-foreground">Loading…</p>
      )}

      {data && data.versions.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No versions snapshotted yet.
        </p>
      )}

      {data && data.versions.length > 0 && (
        <ol className="space-y-2">
          {[...data.versions].reverse().map((v) => {
            const isCurrent = v.version === data.currentVersion;
            return (
              <li key={v.version}>
                <Link
                  to={isCurrent ? backHref : versionPath(v.version)}
                  className="block rounded-md border border-border p-3 hover:bg-accent/30 transition-colors"
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <div className="font-mono text-xs text-primary tabular-nums">
                      v{v.version}
                      {isCurrent && (
                        <span className="ml-2 text-[10px] uppercase tracking-wider bg-primary/15 text-primary px-1.5 py-0.5 rounded">
                          current
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-muted-foreground tabular-nums">
                      {new Date(v.createdAt).toLocaleString()}
                    </div>
                  </div>
                  <div className="text-sm font-medium mt-0.5 truncate">
                    {v.title}
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-1">
                    {v.editorUsername ? `@${v.editorUsername}` : "unknown"}
                    {v.editMessage && <> · {v.editMessage}</>}
                  </div>
                </Link>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
