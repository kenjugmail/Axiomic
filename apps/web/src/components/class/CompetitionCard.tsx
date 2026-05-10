// S87 — Competition card used in CompetitionsList.

import { Link } from "react-router-dom";
import { Trophy, Clock, Calendar } from "lucide-react";
import type { CompetitionSummary } from "@axiomic/types";

const STATUS_BADGE: Record<CompetitionSummary["status"], string> = {
  draft: "bg-muted text-muted-foreground",
  active: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  ended: "bg-violet-500/15 text-violet-700 dark:text-violet-300",
};

interface CompetitionCardProps {
  classSlug: string;
  competition: CompetitionSummary;
}

export function CompetitionCard({ classSlug, competition }: CompetitionCardProps) {
  const start = formatDate(competition.startsAt);
  const end = formatDate(competition.endsAt);
  const countdown = getCountdown(competition);

  return (
    <Link
      to={`/classes/${classSlug}/competitions/${competition.id}`}
      className="block p-4 rounded-md border border-border hover:shadow-soft transition-shadow"
    >
      <div className="flex items-start justify-between gap-3 mb-2">
        <h3 className="text-sm font-medium leading-snug">{competition.title}</h3>
        <span
          className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded ${STATUS_BADGE[competition.status]}`}
        >
          {competition.status}
        </span>
      </div>
      <div className="text-xs text-muted-foreground mb-2 flex items-center gap-3 flex-wrap">
        <span className="inline-flex items-center gap-1">
          <Calendar className="w-3 h-3" />
          {start} → {end}
        </span>
        {countdown && (
          <span className="inline-flex items-center gap-1 text-foreground font-medium">
            <Clock className="w-3 h-3" />
            {countdown}
          </span>
        )}
      </div>
      <div className="flex items-center gap-2 text-xs">
        <Trophy className="w-3 h-3 text-amber-500" />
        <span className="text-muted-foreground">
          Top {competition.prizeWinnerCount} get
        </span>
        <span className="text-base">{competition.prizeCosmeticEmoji ?? "🎁"}</span>
        <span className="text-muted-foreground">{competition.prizeCosmeticName ?? competition.prizeCosmeticSlug}</span>
      </div>
    </Link>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function getCountdown(c: CompetitionSummary): string | null {
  const now = Date.now();
  const startsAt = Date.parse(c.startsAt);
  const endsAt = Date.parse(c.endsAt);
  if (c.status === "draft") return null;
  if (c.status === "ended") return "ended";
  if (now < startsAt) return `starts in ${humanDuration(startsAt - now)}`;
  if (now < endsAt) return `${humanDuration(endsAt - now)} left`;
  return "ending now";
}

function humanDuration(ms: number): string {
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}
