import { useEffect, useState } from "react";
import { CheckCircle2, AlertTriangle, X, XCircle } from "lucide-react";
import { Link } from "react-router-dom";
import { api } from "../../lib/api";
import type {
  ReproductionsResponse,
  ReproStats,
} from "@axiomic/types";

interface Props {
  articleSlug: string;
  stats: ReproStats;
  // Sprint 23.5 — switches the listing fetch between
  // /news/:slug/reproductions and /research/:slug/reproductions.
  surface?: "news" | "research";
}

// Small chip in the byline that opens a modal listing receipts. Hidden
// when there are no receipts at all (the article has nothing to brag
// about yet).
export function ReproductionsBadge({ articleSlug, stats, surface = "news" }: Props) {
  if (stats.total === 0) return null;
  const tone =
    stats.success >= stats.failed
      ? "text-emerald-700 dark:text-emerald-300 border-emerald-500/40 bg-emerald-500/10"
      : "text-amber-700 dark:text-amber-300 border-amber-500/40 bg-amber-500/10";

  return (
    <BadgeButton
      articleSlug={articleSlug}
      stats={stats}
      tone={tone}
      surface={surface}
    />
  );
}

function BadgeButton({
  articleSlug,
  stats,
  tone,
  surface,
}: {
  articleSlug: string;
  stats: ReproStats;
  tone: string;
  surface: "news" | "research";
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border ${tone} hover:bg-accent/30 transition-colors`}
        title="View reproduction receipts"
      >
        <CheckCircle2 className="w-3 h-3" strokeWidth={2} />
        Reproduced by {stats.total}{" "}
        researcher{stats.total === 1 ? "" : "s"}
      </button>

      {open && (
        <ReproductionsListModal
          articleSlug={articleSlug}
          surface={surface}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function ReproductionsListModal({
  articleSlug,
  surface,
  onClose,
}: {
  articleSlug: string;
  surface: "news" | "research";
  onClose: () => void;
}) {
  const [data, setData] = useState<ReproductionsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const apiSurface = surface === "research" ? api.research : api.news;
    apiSurface
      .listReproductions(articleSlug)
      .then(setData)
      .catch((e) => setError(e?.message ?? "Failed to load"));
  }, [articleSlug, surface]);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh]">
      <button type="button" aria-label="Close dialog" onClick={onClose} className="absolute inset-0 bg-background/70 backdrop-blur-sm animate-fade-in" />
      <div className="relative w-full max-w-2xl bg-card border border-border rounded-xl shadow-floating animate-fade-in flex flex-col max-h-[80vh]">
        <div className="px-5 py-3 border-b border-border flex items-center justify-between">
          <h2 className="text-base font-semibold flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-600" strokeWidth={1.8} />
            Reproduction receipts
          </h2>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
            aria-label="Close"
          >
            <X className="w-5 h-5" strokeWidth={1.8} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          {error && (
            <div className="text-sm text-destructive">{error}</div>
          )}
          {!data && !error && (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-16 animate-pulse bg-muted rounded-md" />
              ))}
            </div>
          )}
          {data && (
            <>
              <div className="grid grid-cols-3 gap-2 text-center text-xs">
                <div className="p-2 rounded-md border border-border">
                  <div className="text-emerald-700 dark:text-emerald-300 font-semibold text-base">
                    {data.stats.success}
                  </div>
                  <div className="text-muted-foreground">Success</div>
                </div>
                <div className="p-2 rounded-md border border-border">
                  <div className="text-amber-700 dark:text-amber-300 font-semibold text-base">
                    {data.stats.partial}
                  </div>
                  <div className="text-muted-foreground">Partial</div>
                </div>
                <div className="p-2 rounded-md border border-border">
                  <div className="text-rose-700 dark:text-rose-300 font-semibold text-base">
                    {data.stats.failed}
                  </div>
                  <div className="text-muted-foreground">Failed</div>
                </div>
              </div>
              {data.reproductions.length === 0 ? (
                <p className="text-sm text-muted-foreground italic">
                  No receipts yet.
                </p>
              ) : (
                <ul className="space-y-3">
                  {data.reproductions.map((r) => {
                    const Icon =
                      r.status === "success"
                        ? CheckCircle2
                        : r.status === "partial"
                          ? AlertTriangle
                          : XCircle;
                    const tone =
                      r.status === "success"
                        ? "text-emerald-600"
                        : r.status === "partial"
                          ? "text-amber-600"
                          : "text-rose-600";
                    return (
                      <li
                        key={r.id}
                        className="p-3 rounded-md border border-border"
                      >
                        <div className="flex items-baseline gap-2 text-xs text-muted-foreground mb-1">
                          <Icon className={`w-3.5 h-3.5 ${tone}`} strokeWidth={2} />
                          <Link
                            to={`/profile/${r.reproducerUsername}`}
                            className="text-foreground font-medium hover:underline"
                          >
                            @{r.reproducerUsername}
                          </Link>
                          <span>·</span>
                          <span className="capitalize">{r.status}</span>
                          <span>·</span>
                          <span>{new Date(r.createdAt).toLocaleDateString()}</span>
                        </div>
                        {r.notes && (
                          <p className="text-sm whitespace-pre-wrap mt-1">
                            {r.notes}
                          </p>
                        )}
                        {r.evidenceUrl && (
                          <a
                            href={r.evidenceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block text-xs text-primary hover:underline font-mono mt-1 truncate"
                          >
                            {r.evidenceUrl}
                          </a>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
