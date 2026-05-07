import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, BarChart3, TriangleAlert } from "lucide-react";
import { api } from "../lib/api";
import { Skeleton } from "../components/ui";

interface SlideRow {
  slideIdx: number;
  views: number;
  answeredCorrect: number;
  answeredWrong: number;
  dropOff: number;
  incorrectRate: number;
}

export function LessonAnalyticsPage() {
  const { pathSlug, nodeSlug } = useParams<{
    pathSlug: string;
    nodeSlug: string;
  }>();
  const [phase, setPhase] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [nodeTitle, setNodeTitle] = useState("");
  const [rows, setRows] = useState<SlideRow[]>([]);

  useEffect(() => {
    if (!pathSlug || !nodeSlug) return;
    let cancelled = false;
    setPhase("loading");
    api.mastery
      .getPath(pathSlug)
      .then((p) => {
        const node = p.nodes.find((n) => n.slug === nodeSlug);
        if (!node) {
          setError("Node not found");
          setPhase("error");
          return;
        }
        setNodeTitle(node.title);
        return api.mastery.lessonAnalytics(node.id).then((a) => {
          if (cancelled) return;
          setRows(a.slides);
          setPhase("ready");
        });
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e?.message ?? "Failed to load");
        setPhase("error");
      });
    return () => {
      cancelled = true;
    };
  }, [pathSlug, nodeSlug]);

  const exitHref = pathSlug
    ? `/paths/${pathSlug}/lessons/${nodeSlug}/edit`
    : "/paths";

  const maxViews = rows.reduce((m, r) => Math.max(m, r.views), 0);
  const worstDropOffIdx = (() => {
    let idx = -1;
    let worst = 0;
    for (const r of rows) {
      if (r.dropOff > worst) {
        worst = r.dropOff;
        idx = r.slideIdx;
      }
    }
    return idx;
  })();

  if (phase === "loading") {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12 space-y-4">
        <Skeleton className="h-8 w-1/3" />
        <Skeleton className="h-64" />
      </div>
    );
  }
  if (phase === "error") {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <p className="text-destructive mb-4">{error}</p>
        <Link to={exitHref} className="text-primary hover:underline">
          Back
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <Link
        to={exitHref}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="w-4 h-4" strokeWidth={2} />
        Editor
      </Link>
      <div className="mt-4 mb-6">
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground inline-flex items-center gap-1.5 mb-1">
          <BarChart3 className="w-3 h-3" strokeWidth={2} />
          Analytics
        </div>
        <h1 className="font-display text-3xl sm:text-4xl font-semibold tracking-tight leading-tight">
          {nodeTitle}
        </h1>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No data yet. Once learners step through this lesson, slide-level
          stats will appear here.
        </p>
      ) : (
        <>
          {worstDropOffIdx >= 0 && (
            <div className="mb-6 rounded-lg border border-accent-amber/30 bg-accent-amber/10 p-4 flex items-start gap-3 text-sm">
              <TriangleAlert
                className="w-4 h-4 text-accent-amber shrink-0 mt-0.5"
                strokeWidth={2}
              />
              <div>
                <span className="font-medium text-foreground">
                  Slide {worstDropOffIdx + 1} has the highest drop-off.
                </span>{" "}
                <span className="text-muted-foreground">
                  {rows[worstDropOffIdx].dropOff} learners viewed it but didn't
                  reach slide {worstDropOffIdx + 2}. Consider trimming or
                  rephrasing this slide.
                </span>
              </div>
            </div>
          )}

          <div className="rounded-lg border border-border overflow-x-auto">
            <table className="w-full text-sm min-w-[480px]">
              <thead className="bg-muted/40 text-[11px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="text-left px-3 py-2 min-w-[40px]">#</th>
                  <th className="text-left px-3 py-2 min-w-[120px]">Views</th>
                  <th className="text-left px-3 py-2 min-w-[80px]">Drop-off</th>
                  <th className="hidden sm:table-cell text-left px-3 py-2 min-w-[120px]">
                    Correct / wrong
                  </th>
                  <th className="text-left px-3 py-2 min-w-[80px]">% wrong</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const widthPct =
                    maxViews > 0 ? (r.views / maxViews) * 100 : 0;
                  return (
                    <tr
                      key={r.slideIdx}
                      className="border-t border-border hover:bg-accent/20"
                    >
                      <td className="px-3 py-2 font-mono text-xs text-muted-foreground tabular-nums">
                        {String(r.slideIdx + 1).padStart(2, "0")}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-16 sm:w-32 bg-muted rounded-full overflow-hidden">
                            <div
                              className="h-full bg-primary rounded-full"
                              style={{ width: `${widthPct}%` }}
                            />
                          </div>
                          <span className="tabular-nums">{r.views}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2 tabular-nums">
                        {r.dropOff > 0 ? (
                          <span className="text-accent-rose">
                            −{r.dropOff}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="hidden sm:table-cell px-3 py-2 tabular-nums text-muted-foreground">
                        {r.answeredCorrect + r.answeredWrong > 0 ? (
                          <>
                            <span className="text-accent-emerald">
                              {r.answeredCorrect}
                            </span>{" "}
                            /{" "}
                            <span className="text-accent-rose">
                              {r.answeredWrong}
                            </span>
                          </>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-3 py-2 tabular-nums">
                        {r.answeredCorrect + r.answeredWrong > 0
                          ? `${Math.round(r.incorrectRate * 100)}%`
                          : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
