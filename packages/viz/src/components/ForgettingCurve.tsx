import { useMemo, useState } from "react";

// Ebbinghaus 1885 forgetting curve R(t) = exp(-t / S), where S is
// memory stability (in days). Successful spaced reviews increase S
// (Anki / SuperMemo SM-2): on a hit the new interval is roughly
// previous_interval × ease (≈ 2.5 by default); on a miss the
// interval resets toward 1 day.

const W = 460;
const H = 320;

interface Props {
  reviews?: number;
  algorithm?: "sm2" | "leitner";
}

interface ReviewEvent {
  day: number;
  interval: number;
  S: number;
}

function sm2Schedule(numReviews: number, easeFactor = 2.5): ReviewEvent[] {
  const events: ReviewEvent[] = [];
  let S = 1; // initial stability ~ 1 day
  let day = 0;
  events.push({ day, interval: 0, S });
  let interval = 1;
  for (let i = 0; i < numReviews; i++) {
    day += interval;
    S = S * easeFactor;
    events.push({ day, interval, S });
    interval = Math.round(S);
  }
  return events;
}

export function ForgettingCurve({ reviews: ctlR, algorithm: ctlAlgo }: Props = {}) {
  const [intReviews, setIntReviews] = useState(4);
  const [intEase, setIntEase] = useState(2.5);
  const N = ctlR ?? intReviews;
  const algo = ctlAlgo ?? "sm2";

  const schedule = useMemo(() => sm2Schedule(N, intEase), [N, intEase, algo]);
  const totalDays = Math.max(30, (schedule[schedule.length - 1]?.day ?? 30) + 7);

  // Build the retention curve: between review k and k+1, R(t) = exp(-(t - day_k) / S_k)
  const curve = useMemo(() => {
    const pts: Array<{ t: number; r: number }> = [];
    const days = 200;
    for (let i = 0; i <= days; i++) {
      const t = (i / days) * totalDays;
      // Find the latest review at or before t
      let last = schedule[0];
      for (const e of schedule) {
        if (e.day <= t) last = e;
        else break;
      }
      const dt = t - last.day;
      const r = Math.exp(-dt / last.S);
      pts.push({ t, r });
    }
    return pts;
  }, [schedule, totalDays]);

  // Compare against no-review (single decay) for the same total period
  const baseline = useMemo(() => {
    const pts: Array<{ t: number; r: number }> = [];
    const S0 = 1;
    for (let i = 0; i <= 200; i++) {
      const t = (i / 200) * totalDays;
      pts.push({ t, r: Math.exp(-t / S0) });
    }
    return pts;
  }, [totalDays]);

  const baseX = 40;
  const baseY = 16;
  const plotW = W - baseX - 16;
  const plotH = H - baseY - 80;
  const xOf = (t: number) => baseX + (t / totalDays) * plotW;
  const yOf = (r: number) => baseY + plotH - r * plotH;

  const pathStr = (pts: Array<{ t: number; r: number }>) =>
    pts.map((p, i) => `${i === 0 ? "M" : "L"}${xOf(p.t).toFixed(1)},${yOf(p.r).toFixed(1)}`).join(" ");

  const finalR = curve[curve.length - 1]?.r ?? 0;

  return (
    <div className="my-4 p-3 rounded-lg border border-border bg-card text-card-foreground">
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-semibold">Forgetting curve · SM-2 spaced repetition · {N} reviews over {totalDays.toFixed(0)} days · final retention {(finalR * 100).toFixed(0)}%</div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto bg-[#0b1228] rounded-md" role="img" aria-label="Forgetting curve">
        <rect x={baseX} y={baseY} width={plotW} height={plotH} fill="none" stroke="#1f2937" strokeWidth={0.5} />
        {/* Y-axis labels */}
        {[0, 0.5, 1].map((r) => (
          <g key={r}>
            <line x1={baseX - 3} y1={yOf(r)} x2={baseX} y2={yOf(r)} stroke="#475569" strokeWidth={0.5} />
            <text x={baseX - 5} y={yOf(r) + 3} fill="#9aa3b8" fontSize="8" textAnchor="end">{(r * 100).toFixed(0)}%</text>
          </g>
        ))}
        {/* No-review baseline */}
        <path d={pathStr(baseline)} fill="none" stroke="#ff6b6b" strokeWidth={1} strokeDasharray="3,3" opacity={0.5} />
        {/* Spaced-review curve */}
        <path d={pathStr(curve)} fill="none" stroke="#4ecdc4" strokeWidth={2} />
        {/* Review event markers */}
        {schedule.map((e, i) => (
          <g key={i}>
            <line x1={xOf(e.day)} y1={baseY} x2={xOf(e.day)} y2={baseY + plotH} stroke="#fbbf24" strokeWidth={0.5} strokeDasharray="2,2" opacity={0.6} />
            <circle cx={xOf(e.day)} cy={yOf(1)} r={3} fill="#fbbf24" />
            {i > 0 && <text x={xOf(e.day)} y={yOf(1) - 5} fill="#fbbf24" fontSize="7" textAnchor="middle">+{e.interval}d</text>}
          </g>
        ))}
        <text x={baseX + plotW / 2} y={H - 28} fill="#cbd1e6" fontSize="10" textAnchor="middle">days since initial study</text>
        <text x={14} y={baseY + plotH / 2} fill="#cbd1e6" fontSize="10" textAnchor="middle" transform={`rotate(-90, 14, ${baseY + plotH / 2})`}>retention R(t)</text>
        <g transform={`translate(${baseX + 16}, ${H - 56})`}>
          <line x1={0} y1={4} x2={14} y2={4} stroke="#4ecdc4" strokeWidth={2} /><text x={18} y={7} fill="#cbd1e6" fontSize="9">with spaced review</text>
          <line x1={146} y1={4} x2={160} y2={4} stroke="#ff6b6b" strokeWidth={1} strokeDasharray="3,3" /><text x={164} y={7} fill="#cbd1e6" fontSize="9">no review</text>
        </g>
      </svg>

      <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
        <label className="block">number of reviews: {N}
          <input type="range" min={1} max={10} step={1} value={N} onChange={(e) => setIntReviews(parseInt(e.target.value))} disabled={ctlR !== undefined} className="w-full mt-0.5" aria-label="Reviews" />
        </label>
        <label className="block">ease factor: {intEase.toFixed(2)}
          <input type="range" min={1.3} max={4} step={0.05} value={intEase} onChange={(e) => setIntEase(parseFloat(e.target.value))} className="w-full mt-0.5" aria-label="Ease" />
        </label>
      </div>
      <div className="mt-2 text-[10px] text-muted-foreground">
        Ebbinghaus 1885 (Über das Gedächtnis): self-experimenting on
        nonsense syllables, he showed retention R(t) ≈ exp(-t/S)
        with stability S that grows with each successful retrieval.
        Spaced-repetition systems (Leitner 1972 box, SuperMemo SM-2
        Woźniak 1985, Anki 2006, Duolingo half-life regression
        Settles-Meeder 2016) exploit this by scheduling reviews just
        before expected forgetting — Bjork's "desirable difficulty."
        Roediger-Karpicke (2006) showed testing-as-learning beats
        re-reading. Empirically, the spaced + retrieval combo can
        give long-term retention several × the bang-per-minute of
        massed practice. Modern adaptive systems (Duolingo, FSRS,
        Pimsleur) infer per-item half-lives from response history.
      </div>
    </div>
  );
}
