import { useEffect, useMemo, useRef, useState } from "react";

// Rhythmic notation grid: 16 steps × N tracks. Toggle 4/4, 3/4, or
// polyrhythm meter. Click cells to place beats; press play to step
// through visually (no audio). Used to teach choreographic composition,
// drum pattern building, and rhythmic structure across cultures.

const W = 460;
const H = 320;

type Meter = "4/4" | "3/4" | "polyrhythm";

interface Props {
  meter?: Meter;
  steps?: number;
}

const TRACK_LABELS = ["foot R", "foot L", "hand R", "hand L", "head", "torso"];
const TRACK_COLORS = ["#4ecdc4", "#fbbf24", "#a78bfa", "#f472b6", "#60a5fa", "#ff6b6b"];

// Default patterns per meter
const PRESETS: Record<Meter, boolean[][]> = {
  "4/4": [
    [true, false, false, false, true, false, false, false, true, false, false, false, true, false, false, false], // foot R on beat
    [false, false, true, false, false, false, true, false, false, false, true, false, false, false, true, false], // foot L offbeat
    [true, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false],
    [false, false, false, false, true, false, false, false, false, false, false, false, true, false, false, false],
    [false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, true],
    [false, false, true, false, false, false, true, false, false, false, true, false, false, false, true, false],
  ],
  "3/4": [
    [true, false, false, false, false, false, true, false, false, false, false, false, true, false, false, false],
    [false, false, false, false, true, false, false, false, false, false, true, false, false, false, false, false],
    [false, true, false, false, false, true, false, false, false, true, false, false, false, true, false, false],
    [false, false, true, false, false, false, false, true, false, false, false, true, false, false, false, true],
    [false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false],
    [false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false],
  ],
  polyrhythm: [
    [true, false, false, true, false, false, true, false, false, true, false, false, true, false, false, true], // 3 against 4
    [true, false, false, false, true, false, false, false, true, false, false, false, true, false, false, false],
    [true, false, false, false, false, true, false, false, false, false, true, false, false, false, false, true], // 5 against 16
    [false, false, true, false, false, false, false, true, false, false, false, false, false, true, false, false],
    [false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false],
    [false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false],
  ],
};

export function BeatGrid({ meter: ctlMeter, steps: ctlSteps }: Props = {}) {
  const [intMeter, setIntMeter] = useState<Meter>("4/4");
  const meter = ctlMeter ?? intMeter;
  const stepsN = ctlSteps ?? 16;
  const [grid, setGrid] = useState<boolean[][]>(PRESETS[meter].map((r) => r.slice(0, stepsN)));
  const [playing, setPlaying] = useState(false);
  const [head, setHead] = useState(0);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Reset grid when meter changes
  useEffect(() => {
    setGrid(PRESETS[meter].map((r) => r.slice(0, stepsN)));
    setHead(0);
  }, [meter, stepsN]);

  useEffect(() => {
    if (playing) {
      tickRef.current = setInterval(() => setHead((h) => (h + 1) % stepsN), 200);
    }
    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
    };
  }, [playing, stepsN]);

  const baseX = 90;
  const baseY = 30;
  const plotW = W - baseX - 16;
  const plotH = H - baseY - 90;
  const stepW = plotW / stepsN;
  const trackH = plotH / TRACK_LABELS.length;

  // Beat-boundary highlight (every 4 for 4/4, every 3 for 3/4)
  const beatSize = meter === "3/4" ? 3 : 4;

  // Active counts
  const activeCount = useMemo(() => grid.flat().filter(Boolean).length, [grid]);

  return (
    <div className="my-4 p-3 rounded-lg border border-border bg-card text-card-foreground">
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-semibold">Beat grid · {meter} · step {head + 1}/{stepsN} · {activeCount} active</div>
        <div className="flex gap-1">
          <button onClick={() => setPlaying((p) => !p)} className="px-2 py-0.5 rounded text-[10px] bg-primary text-primary-foreground">{playing ? "Pause" : "Play"}</button>
          {(["4/4", "3/4", "polyrhythm"] as Meter[]).map((m) => (
            <button key={m} onClick={() => setIntMeter(m)} disabled={ctlMeter !== undefined} className={`px-1.5 py-0.5 rounded text-[9px] ${meter === m ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-accent"}`}>{m}</button>
          ))}
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto bg-[#0b1228] rounded-md" role="img" aria-label="Beat grid">
        {/* Beat-boundary backgrounds */}
        {Array.from({ length: stepsN }, (_, i) => i).filter((i) => i % beatSize === 0).map((i) => (
          <rect key={`bb-${i}`} x={baseX + i * stepW} y={baseY} width={stepW * beatSize} height={plotH} fill={(i / beatSize) % 2 === 0 ? "#0b1228" : "#0e1530"} />
        ))}
        {/* Step head cursor */}
        <rect x={baseX + head * stepW} y={baseY - 4} width={stepW} height={plotH + 8} fill="#fbbf24" fillOpacity={0.18} />
        {/* Track grid + cells */}
        {TRACK_LABELS.map((label, t) => (
          <g key={`track-${t}`}>
            <text x={baseX - 6} y={baseY + (t + 0.6) * trackH} fill={TRACK_COLORS[t]} fontSize="9" textAnchor="end">{label}</text>
            <line x1={baseX} y1={baseY + (t + 1) * trackH} x2={baseX + plotW} y2={baseY + (t + 1) * trackH} stroke="#1f2937" strokeWidth={0.3} />
            {Array.from({ length: stepsN }, (_, i) => i).map((i) => {
              const filled = grid[t]?.[i] ?? false;
              return (
                <rect
                  key={`cell-${t}-${i}`}
                  x={baseX + i * stepW + 1}
                  y={baseY + t * trackH + 2}
                  width={stepW - 2}
                  height={trackH - 4}
                  fill={filled ? TRACK_COLORS[t] : "transparent"}
                  stroke="#475569"
                  strokeWidth={0.3}
                  onClick={() => {
                    const next = grid.map((r) => [...r]);
                    if (!next[t]) next[t] = Array(stepsN).fill(false);
                    next[t][i] = !next[t][i];
                    setGrid(next);
                  }}
                  style={{ cursor: "pointer" }}
                />
              );
            })}
          </g>
        ))}
        {/* Step numbers on x-axis */}
        {Array.from({ length: stepsN }, (_, i) => i).filter((i) => i % beatSize === 0).map((i) => (
          <text key={`xn-${i}`} x={baseX + i * stepW + stepW / 2} y={baseY + plotH + 12} fill="#9aa3b8" fontSize="8" textAnchor="middle">{i / beatSize + 1}</text>
        ))}
      </svg>

      <div className="mt-2 text-[10px] text-muted-foreground">
        Time signatures encode pulse: 4/4 (four quarter-notes per
        measure) is the default for most Western pop + classical;
        3/4 (waltz) emphasizes 1-2-3 1-2-3; polyrhythm overlays two
        meters at once (e.g. 3-against-4 in West African Ewe music,
        many Reich compositions). Choreographers count in 8s
        regardless of the underlying meter (4/4 measure = "1, 2, 3,
        4, 5, 6, 7, 8"). Laban Movement Analysis (1928) decomposes
        movement into Effort + Shape; Effort axes are Weight, Time,
        Space, Flow — orthogonal to but informing rhythmic phrasing.
        Click cells to toggle beats; meter switches load preset
        patterns to give you a starting palette.
      </div>
    </div>
  );
}
