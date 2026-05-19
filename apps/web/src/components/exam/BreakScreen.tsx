// Digital-SAT-parity: between-sections break screen. Mirrors the
// real Digital SAT — a fixed 10-min countdown, "Skip break" lets
// the learner end it early, and "Begin next section" enables only
// once now >= breakUntilAt.

import { useEffect, useState } from "react";
import { Coffee } from "lucide-react";

interface Props {
  breakUntilAt: string;
  nextSectionTitle: string | null;
  onAdvance: () => void;
  advancing?: boolean;
}

function formatMmSs(ms: number): string {
  if (ms < 0) ms = 0;
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function BreakScreen({
  breakUntilAt,
  nextSectionTitle,
  onAdvance,
  advancing,
}: Props) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const endsAt = Date.parse(breakUntilAt);
  const remaining = Number.isFinite(endsAt) ? endsAt - now : 0;
  const breakOver = remaining <= 0;

  return (
    <div
      data-testid="break-screen"
      className="min-h-screen flex flex-col items-center justify-center px-4 bg-background text-center"
    >
      <div className="rounded-full bg-primary/10 p-4 mb-4">
        <Coffee className="w-10 h-10 text-primary" />
      </div>
      <h1 className="font-display text-3xl font-semibold tracking-tight">
        Section break
      </h1>
      <p className="text-sm text-muted-foreground mt-2 max-w-md">
        Stretch, grab water, breathe. The next section
        {nextSectionTitle ? ` (${nextSectionTitle})` : ""} starts when
        the timer hits zero — or you can skip ahead.
      </p>
      <div
        className="font-mono font-semibold text-6xl mt-8 tabular-nums"
        data-testid="break-countdown"
      >
        {formatMmSs(remaining)}
      </div>
      <div className="mt-8 flex items-center gap-2">
        <button
          type="button"
          onClick={onAdvance}
          disabled={advancing}
          className="text-sm px-4 py-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 font-medium"
          data-testid="break-skip-or-begin"
        >
          {breakOver ? "Begin next section" : "Skip break"}
        </button>
      </div>
    </div>
  );
}
