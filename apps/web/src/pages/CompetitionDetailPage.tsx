// S87 — Competition detail.
//
// Standings (live during active, frozen at end), prize info,
// instructor controls (publish / end), countdown / ended badge.

import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Trophy, Clock, PlayCircle, StopCircle } from "lucide-react";
import type { CompetitionDetailResponse } from "@axiomic/types";
import { api, ApiError } from "../lib/api";
import { useAuthStore } from "../stores/auth";
import { Skeleton } from "../components/ui";
import { MarkdownRenderer } from "../components/MarkdownRenderer";
import { CompetitionStandings } from "../components/class/CompetitionStandings";
import { toast } from "../stores/toast";

export function CompetitionDetailPage() {
  const { slug = "", competitionId = "" } = useParams<{ slug: string; competitionId: string }>();
  const { user } = useAuthStore();
  const [data, setData] = useState<CompetitionDetailResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [myRole, setMyRole] = useState<"instructor" | "ta" | "student" | "observer" | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = async () => {
    try {
      const [detail, classDetail] = await Promise.all([
        api.classes.getCompetition(slug, competitionId),
        api.classes.get(slug),
      ]);
      setData(detail);
      setMyRole(classDetail.myRole);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    }
  };

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, competitionId]);

  const publish = async () => {
    setBusy(true);
    try {
      await api.classes.publishCompetition(slug, competitionId);
      toast.success("Published");
      reload();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Publish failed");
    } finally {
      setBusy(false);
    }
  };

  const end = async () => {
    if (!confirm("End the competition now and distribute prizes?")) return;
    setBusy(true);
    try {
      const r = await api.classes.endCompetition(slug, competitionId);
      const winnerCount = r.winners?.length ?? 0;
      toast.success(
        winnerCount > 0
          ? `Ended. Prize awarded to ${winnerCount} winner${winnerCount === 1 ? "" : "s"}.`
          : "Ended (no winners qualified).",
      );
      reload();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "End failed");
    } finally {
      setBusy(false);
    }
  };

  if (error) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center">
        <p className="text-sm text-destructive">{error}</p>
        <Link to={`/classes/${slug}`} className="text-sm text-primary hover:underline mt-4 inline-block">
          Back to class
        </Link>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8">
        <Skeleton variant="card" className="h-32 mb-6" />
        <Skeleton variant="card" className="h-72" />
      </div>
    );
  }

  const c = data.competition;
  const isStaff = myRole === "instructor" || myRole === "ta";
  const status = c.status;

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="text-xs text-muted-foreground mb-3">
        <Link to="/classes" className="hover:text-foreground">Classes</Link>
        {" / "}
        <Link to={`/classes/${slug}`} className="hover:text-foreground">{slug}</Link>
        {" / competition"}
      </div>

      <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">{c.title}</h1>
          <div className="text-xs text-muted-foreground mt-1 flex items-center gap-3 flex-wrap">
            <span>
              {formatDate(c.startsAt)} → {formatDate(c.endsAt)}
            </span>
            <Countdown competition={c} />
            <span
              className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded ${
                status === "active"
                  ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                  : status === "ended"
                    ? "bg-violet-500/15 text-violet-700 dark:text-violet-300"
                    : "bg-muted text-muted-foreground"
              }`}
            >
              {status}
            </span>
          </div>
        </div>
        {isStaff && (
          <div className="flex items-center gap-2">
            {status === "draft" && (
              <button
                type="button"
                onClick={publish}
                disabled={busy}
                className="text-xs px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 inline-flex items-center gap-1.5 disabled:opacity-60"
              >
                <PlayCircle className="w-3.5 h-3.5" />
                Publish
              </button>
            )}
            {status === "active" && (
              <button
                type="button"
                onClick={end}
                disabled={busy}
                className="text-xs px-3 py-1.5 rounded-md border border-border hover:bg-accent/40 inline-flex items-center gap-1.5 disabled:opacity-60"
              >
                <StopCircle className="w-3.5 h-3.5" />
                End now
              </button>
            )}
          </div>
        )}
      </div>

      <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 mb-6 flex items-center gap-3">
        <Trophy className="w-5 h-5 text-amber-500 shrink-0" />
        <div className="text-sm flex-1">
          <span className="font-medium">Top {c.prizeWinnerCount}</span>{" "}
          {status === "ended" ? "won" : "win"}{" "}
          <span className="text-base">{c.prizeCosmeticEmoji ?? "🎁"}</span>{" "}
          <span className="font-medium">{c.prizeCosmeticName ?? c.prizeCosmeticSlug}</span>
        </div>
      </div>

      {c.descriptionMd && (
        <div className="prose-sm max-w-none mb-6 rounded-md bg-muted/30 border border-border p-3">
          <MarkdownRenderer
            content={c.descriptionMd}
            codeKernelKey={`competition:${c.id}`}
          />
        </div>
      )}

      <h2 className="text-sm font-semibold mb-3">Standings</h2>
      <CompetitionStandings
        entries={data.standings}
        prizeCosmeticEmoji={c.prizeCosmeticEmoji}
        prizeWinnerCount={c.prizeWinnerCount}
        currentUserId={user?.id ?? null}
      />
    </div>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function Countdown({ competition }: { competition: CompetitionDetailResponse["competition"] }) {
  const now = Date.now();
  const startsAt = Date.parse(competition.startsAt);
  const endsAt = Date.parse(competition.endsAt);
  let label: string | null = null;
  if (competition.status === "active") {
    if (now < startsAt) label = `starts in ${humanDuration(startsAt - now)}`;
    else if (now < endsAt) label = `${humanDuration(endsAt - now)} left`;
  }
  if (!label) return null;
  return (
    <span className="inline-flex items-center gap-1 text-foreground font-medium">
      <Clock className="w-3 h-3" />
      {label}
    </span>
  );
}

function humanDuration(ms: number): string {
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}
