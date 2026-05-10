// S94 — Student progress dashboard.
//
// Mirror of the S93 instructor analytics, scoped to the current user.
// Five widgets stitched together in a single round-trip:
//   1. HeaderStats — lifetime XP, streak, competition wins.
//   2. XpByDayChart — last-30-day bar chart of personal XP earned.
//   3. XpBySourceList — lifetime breakdown by source.
//   4. ClassStandingsList — my rank in each enrolled class.
//   5. CosmeticProgressBar — collection % with link to shop.

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Flame, Trophy, BarChart3, ListChecks, Sparkles, Award } from "lucide-react";
import type { MyProgressResponse } from "@axiomic/types";
import { api } from "../lib/api";
import { useAuthStore } from "../stores/auth";
import { Skeleton } from "../components/ui";

// Pretty labels for the source slugs that come back from xp_grants.
const SOURCE_LABEL: Record<string, string> = {
  "reading-done": "Reading completions",
  "homework-submitted": "Homework submissions",
  "homework-graded-pass": "Homework graded pass",
  "attendance-present": "Class attendance",
  "attendance-late": "Class attendance (late)",
  "lesson-completed": "Lesson completions",
  "quiz-passed": "Quizzes passed",
  "code-question-passed": "Code challenges",
  "daily-challenge-correct": "Daily challenges",
  "streak-day-bonus": "Streak bonus",
};

export function MyProgressPage() {
  const { user } = useAuthStore();
  const [data, setData] = useState<MyProgressResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    api.me
      .progress()
      .then((r) => { if (!cancelled) setData(r); })
      .catch((e) => { if (!cancelled) setError(e?.message ?? "Failed"); });
    return () => { cancelled = true; };
  }, [user]);

  if (!user) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center">
        <p className="text-sm text-muted-foreground">Sign in to see your progress.</p>
      </div>
    );
  }
  if (error) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center">
        <p className="text-sm text-destructive">{error}</p>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
        <Skeleton variant="card" className="h-24" />
        <Skeleton variant="card" className="h-48" />
        <Skeleton variant="card" className="h-48" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <h1 className="font-display text-2xl font-semibold tracking-tight mb-1">
        My progress
      </h1>
      <p className="text-xs text-muted-foreground mb-6">
        Last {data.windowDays} days
      </p>

      <HeaderStats data={data} />

      <Section title="XP earned per day" icon={<BarChart3 className="w-4 h-4" />}>
        <XpByDayChart days={data.xpByDay} />
      </Section>

      {data.xpBySource.length > 0 && (
        <Section title="Where my XP comes from" icon={<ListChecks className="w-4 h-4" />}>
          <XpBySourceList rows={data.xpBySource} lifetimeXp={data.lifetimeXp} />
        </Section>
      )}

      {data.classStandings.length > 0 && (
        <Section title="My class standings" icon={<Trophy className="w-4 h-4" />}>
          <ClassStandingsList rows={data.classStandings} />
        </Section>
      )}

      <Section title="Cosmetic collection" icon={<Sparkles className="w-4 h-4" />}>
        <CosmeticProgressBar
          ownedCount={data.cosmeticProgress.ownedCount}
          totalCosmetics={data.cosmeticProgress.totalCosmetics}
        />
      </Section>
    </div>
  );
}

function HeaderStats({ data }: { data: MyProgressResponse }) {
  return (
    <div className="grid grid-cols-3 gap-3 mb-8">
      <Stat
        icon={<Award className="w-4 h-4 text-amber-500" />}
        label="Lifetime XP"
        value={data.lifetimeXp.toLocaleString()}
      />
      <Stat
        icon={<Flame className="w-4 h-4 text-orange-500" />}
        label="Day streak"
        value={String(data.streak)}
      />
      <Stat
        icon={<Trophy className="w-4 h-4 text-violet-500" />}
        label="Competition wins"
        value={String(data.competitionWins)}
      />
    </div>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="p-3 rounded-md border border-border">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="text-2xl font-semibold tabular-nums mt-1">{value}</div>
    </div>
  );
}

function Section({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="mb-6">
      <h2 className="text-sm font-semibold flex items-center gap-2 mb-3">
        {icon}
        {title}
      </h2>
      <div className="rounded-md border border-border p-4">{children}</div>
    </section>
  );
}

function XpByDayChart({ days }: { days: MyProgressResponse["xpByDay"] }) {
  const max = Math.max(1, ...days.map((d) => d.totalXp));
  const total = days.reduce((acc, d) => acc + d.totalXp, 0);
  if (total === 0) {
    return (
      <p className="text-sm text-muted-foreground py-4 text-center">
        No XP earned in the last {days.length} days. Knock out a daily challenge or a reading to get rolling.
      </p>
    );
  }
  return (
    <div>
      <div className="flex items-end gap-0.5 h-28 mb-2">
        {days.map((d) => (
          <div
            key={d.day}
            className="flex-1 bg-primary/30 hover:bg-primary/50 transition-colors rounded-sm"
            style={{ height: `${(d.totalXp / max) * 100}%`, minHeight: d.totalXp > 0 ? 2 : 0 }}
            title={`${d.day}: ${d.totalXp} XP`}
          />
        ))}
      </div>
      <div className="flex justify-between text-[10px] text-muted-foreground tabular-nums">
        <span>{days[0]?.day}</span>
        <span>{total.toLocaleString()} XP this window</span>
        <span>{days[days.length - 1]?.day}</span>
      </div>
    </div>
  );
}

function XpBySourceList({ rows, lifetimeXp }: { rows: MyProgressResponse["xpBySource"]; lifetimeXp: number }) {
  return (
    <ul className="space-y-1.5">
      {rows.map((r) => {
        const pct = lifetimeXp > 0 ? Math.round((r.totalXp / lifetimeXp) * 100) : 0;
        return (
          <li key={r.source} className="flex items-center gap-3">
            <span className="text-sm flex-1 min-w-0 truncate">
              {SOURCE_LABEL[r.source] ?? r.source}
            </span>
            <span className="text-xs tabular-nums text-muted-foreground w-12 text-right">
              ×{r.count}
            </span>
            <div className="w-32 h-1.5 bg-muted rounded-full overflow-hidden">
              <div className="h-full bg-primary/60" style={{ width: `${pct}%` }} />
            </div>
            <span className="text-xs tabular-nums font-medium w-16 text-right">
              {r.totalXp} XP
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function ClassStandingsList({ rows }: { rows: MyProgressResponse["classStandings"] }) {
  return (
    <ul className="space-y-1">
      {rows.map((r) => {
        const isTop3 = r.myRank <= 3 && r.totalMembers >= 3;
        return (
          <li key={r.classSlug} className="flex items-center gap-3 px-2 py-1.5 rounded-md hover:bg-accent/30">
            <span className={`font-mono text-sm tabular-nums w-12 text-right ${isTop3 ? "text-amber-500 font-semibold" : "text-muted-foreground"}`}>
              #{r.myRank}
            </span>
            <Link to={`/classes/${r.classSlug}`} className="text-sm hover:underline flex-1 min-w-0 truncate">
              {r.classTitle}
            </Link>
            <span className="text-xs tabular-nums text-muted-foreground">
              of {r.totalMembers}
            </span>
            <span className="text-xs tabular-nums font-medium w-16 text-right">
              {r.myXp} XP
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function CosmeticProgressBar({ ownedCount, totalCosmetics }: { ownedCount: number; totalCosmetics: number }) {
  const pct = totalCosmetics > 0 ? Math.round((ownedCount / totalCosmetics) * 100) : 0;
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium tabular-nums">
          {ownedCount} / {totalCosmetics}
        </span>
        <span className="text-xs text-muted-foreground tabular-nums">{pct}%</span>
      </div>
      <div className="h-2 bg-muted rounded-full overflow-hidden mb-3">
        <div className="h-full bg-amber-500" style={{ width: `${pct}%` }} />
      </div>
      <div className="flex gap-3 text-xs">
        <Link to="/me/pet" className="text-primary hover:underline">View inventory</Link>
        <Link to="/shop" className="text-primary hover:underline">Browse shop</Link>
      </div>
    </div>
  );
}
