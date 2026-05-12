// Sprint 35 — Frozen research-paper version snapshot.
//
// /research/:slug/v/:n renders the paper as it existed at version n.
// Banner reminds the reader they're viewing a historical snapshot and
// offers a one-click jump to the current version.

import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { History } from "lucide-react";
import type {
  ResearchPaperVersionResponse,
  ResearchPaperTier,
} from "@axiomic/types";
import { api } from "../lib/api";
import { MarkdownRenderer } from "../components/MarkdownRenderer";
import { EmptyState } from "../components/EmptyState";
import { ErrorState } from "../components/ErrorState";
import { TierToggle } from "../components/research/TierToggle";

const VALID_TIERS: ResearchPaperTier[] = ["intro", "undergrad", "grad"];

export function PaperVersionPage() {
  const { slug = "", n = "" } = useParams<{ slug: string; n: string }>();
  const versionN = parseInt(n, 10);
  const [data, setData] = useState<ResearchPaperVersionResponse | null>(null);
  const [error, setError] = useState("");
  const [tier, setTier] = useState<ResearchPaperTier>("undergrad");

  useEffect(() => {
    if (!slug || !Number.isFinite(versionN)) return;
    setError("");
    setData(null);
    api.versions
      .paperGet(slug, versionN)
      .then(setData)
      .catch((e: any) => setError(e?.message ?? "Failed to load version"));
  }, [slug, versionN]);

  const available: ResearchPaperTier[] = data
    ? VALID_TIERS.filter((t) => {
        const body =
          t === "intro"
            ? data.contentIntro
            : t === "undergrad"
              ? data.contentUndergrad
              : data.contentGrad;
        return body.trim().length > 0;
      })
    : [];

  const body = data
    ? tier === "intro"
      ? data.contentIntro
      : tier === "undergrad"
        ? data.contentUndergrad
        : data.contentGrad
    : "";

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="text-sm text-muted-foreground mb-2">
        <Link to="/research" className="hover:text-foreground">
          Research
        </Link>
        {" / "}
        <Link to={`/research/${slug}`} className="hover:text-foreground">
          {slug}
        </Link>
        {" / v"}
        {versionN}
      </div>

      {error && <ErrorState error={error} />}

      {data && (
        <>
          <div className="mb-5 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs flex items-center justify-between gap-3 flex-wrap">
            <div className="inline-flex items-center gap-2 text-amber-700 dark:text-amber-300">
              <History className="w-3.5 h-3.5" strokeWidth={2} />
              You're reading version <strong>{versionN}</strong>
              {data.editMessage && <> · {data.editMessage}</>}
              {data.editorUsername && <> · by @{data.editorUsername}</>}
            </div>
            <Link
              to={`/research/${slug}`}
              className="text-xs text-amber-700 dark:text-amber-300 hover:underline"
            >
              View current version →
            </Link>
          </div>

          <h1 className="font-display text-3xl font-semibold tracking-tight mb-2">
            {data.title}
          </h1>
          {data.summary && (
            <p className="text-sm text-muted-foreground mb-4">{data.summary}</p>
          )}

          {available.length > 0 && (
            <div className="mb-4">
              <TierToggle
                active={tier}
                available={available}
                onChange={setTier}
              />
            </div>
          )}

          {data.abstract && (
            <div className="mb-6 border-l-4 border-primary/40 pl-6 py-1">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
                Abstract
              </div>
              <div className="prose-sm max-w-none italic">
                <MarkdownRenderer content={data.abstract} />
              </div>
            </div>
          )}

          <article className="prose prose-neutral dark:prose-invert max-w-none">
            <MarkdownRenderer content={body} />
          </article>

          <p className="text-xs text-muted-foreground mt-8">
            Snapshotted {new Date(data.createdAt).toLocaleString()}.
          </p>
        </>
      )}

      {!data && !error && (
        <EmptyState title="Loading…" description="Fetching this version." />
      )}
    </div>
  );
}
