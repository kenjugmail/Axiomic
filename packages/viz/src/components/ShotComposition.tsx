import { useMemo, useState } from "react";

// Cinematographer's composition aid: an empty frame at a chosen aspect
// ratio with toggle-able overlays — rule of thirds, golden ratio +
// golden spiral, leading lines, dynamic-symmetry diagonals, safe-action
// + title-safe zones (broadcast TV legacy).

const W = 460;
const H = 320;

type Ratio = "1.85" | "2.39" | "16:9" | "4:3" | "1.43";
const ASPECTS: Record<Ratio, { ratio: number; label: string; name: string }> = {
  "1.85": { ratio: 1.85, label: "1.85:1", name: "Academy widescreen" },
  "2.39": { ratio: 2.39, label: "2.39:1", name: "Anamorphic / Scope" },
  "16:9": { ratio: 16 / 9, label: "16:9", name: "HDTV" },
  "4:3": { ratio: 4 / 3, label: "4:3", name: "Academy 1.33 (silent / TV)" },
  "1.43": { ratio: 1.43, label: "1.43:1", name: "IMAX" },
};

interface Props {
  aspectRatio?: Ratio;
}

export function ShotComposition({ aspectRatio: ctlA }: Props = {}) {
  const [intA, setIntA] = useState<Ratio>("2.39");
  const [showThirds, setShowThirds] = useState(true);
  const [showGolden, setShowGolden] = useState(false);
  const [showDynamicSymmetry, setShowDynamicSymmetry] = useState(false);
  const [showSafeArea, setShowSafeArea] = useState(false);
  const aspectKey = ctlA ?? intA;
  const aspect = ASPECTS[aspectKey];

  // Maximize frame within the SVG plot area; centered
  const baseX = 20;
  const baseY = 28;
  const plotW = W - baseX - 20;
  const plotH = H - baseY - 80;
  const frame = useMemo(() => {
    const targetW = Math.min(plotW, plotH * aspect.ratio);
    const targetH = targetW / aspect.ratio;
    const x = baseX + (plotW - targetW) / 2;
    const y = baseY + (plotH - targetH) / 2;
    return { x, y, w: targetW, h: targetH };
  }, [aspect, plotW, plotH]);

  // Golden ratio
  const φ = 1.618033988;

  return (
    <div className="my-4 p-3 rounded-lg border border-border bg-card text-card-foreground">
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-semibold">Shot · {aspect.label} ({aspect.name})</div>
        <div className="flex gap-1">
          {(Object.keys(ASPECTS) as Ratio[]).map((r) => (
            <button key={r} onClick={() => setIntA(r)} disabled={ctlA !== undefined} className={`px-1.5 py-0.5 rounded text-[9px] ${aspectKey === r ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-accent"}`}>{r}</button>
          ))}
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto bg-[#0b1228] rounded-md" role="img" aria-label="Shot composition">
        {/* Faint background fill */}
        <rect x={baseX} y={baseY} width={plotW} height={plotH} fill="#1f2937" fillOpacity={0.3} />
        {/* Frame */}
        <rect x={frame.x} y={frame.y} width={frame.w} height={frame.h} fill="#0b1228" stroke="#cbd1e6" strokeWidth={1.5} />
        {/* Subject placeholder — third intersection */}
        {showThirds && (
          <>
            <line x1={frame.x + frame.w / 3} y1={frame.y} x2={frame.x + frame.w / 3} y2={frame.y + frame.h} stroke="#fbbf24" strokeWidth={0.8} strokeDasharray="3,2" />
            <line x1={frame.x + 2 * frame.w / 3} y1={frame.y} x2={frame.x + 2 * frame.w / 3} y2={frame.y + frame.h} stroke="#fbbf24" strokeWidth={0.8} strokeDasharray="3,2" />
            <line x1={frame.x} y1={frame.y + frame.h / 3} x2={frame.x + frame.w} y2={frame.y + frame.h / 3} stroke="#fbbf24" strokeWidth={0.8} strokeDasharray="3,2" />
            <line x1={frame.x} y1={frame.y + 2 * frame.h / 3} x2={frame.x + frame.w} y2={frame.y + 2 * frame.h / 3} stroke="#fbbf24" strokeWidth={0.8} strokeDasharray="3,2" />
            {[1, 2].map((i) => [1, 2].map((j) => (
              <circle key={`t-${i}-${j}`} cx={frame.x + (i * frame.w) / 3} cy={frame.y + (j * frame.h) / 3} r={3} fill="#fbbf24" />
            )))}
          </>
        )}
        {/* Golden ratio + golden spiral */}
        {showGolden && (() => {
          const gx = frame.w / φ;
          const gy = frame.h / φ;
          return (
            <g>
              <line x1={frame.x + gx} y1={frame.y} x2={frame.x + gx} y2={frame.y + frame.h} stroke="#4ecdc4" strokeWidth={0.8} />
              <line x1={frame.x + frame.w - gx} y1={frame.y} x2={frame.x + frame.w - gx} y2={frame.y + frame.h} stroke="#4ecdc4" strokeWidth={0.8} />
              <line x1={frame.x} y1={frame.y + gy} x2={frame.x + frame.w} y2={frame.y + gy} stroke="#4ecdc4" strokeWidth={0.8} />
              <line x1={frame.x} y1={frame.y + frame.h - gy} x2={frame.x + frame.w} y2={frame.y + frame.h - gy} stroke="#4ecdc4" strokeWidth={0.8} />
              {/* Spiral via quarter-arcs (approximate) */}
              <path
                d={`M ${frame.x},${frame.y + gy}
                    A ${gx} ${gy} 0 0 0 ${frame.x + gx},${frame.y}`}
                fill="none"
                stroke="#4ecdc4"
                strokeWidth={1}
              />
            </g>
          );
        })()}
        {/* Dynamic symmetry diagonals */}
        {showDynamicSymmetry && (
          <g>
            <line x1={frame.x} y1={frame.y} x2={frame.x + frame.w} y2={frame.y + frame.h} stroke="#a78bfa" strokeWidth={0.6} />
            <line x1={frame.x + frame.w} y1={frame.y} x2={frame.x} y2={frame.y + frame.h} stroke="#a78bfa" strokeWidth={0.6} />
            {/* Reciprocals */}
            <line x1={frame.x} y1={frame.y + frame.h} x2={frame.x + frame.w * 0.5} y2={frame.y} stroke="#a78bfa" strokeWidth={0.5} strokeDasharray="2,2" />
            <line x1={frame.x + frame.w} y1={frame.y + frame.h} x2={frame.x + frame.w * 0.5} y2={frame.y} stroke="#a78bfa" strokeWidth={0.5} strokeDasharray="2,2" />
          </g>
        )}
        {/* Safe-action + title-safe zones (SMPTE / EBU 10/20% inset) */}
        {showSafeArea && (
          <g>
            <rect x={frame.x + frame.w * 0.05} y={frame.y + frame.h * 0.05} width={frame.w * 0.9} height={frame.h * 0.9} fill="none" stroke="#ff6b6b" strokeWidth={0.7} strokeDasharray="4,2" />
            <rect x={frame.x + frame.w * 0.1} y={frame.y + frame.h * 0.1} width={frame.w * 0.8} height={frame.h * 0.8} fill="none" stroke="#ff6b6b" strokeWidth={0.7} strokeDasharray="2,2" />
            <text x={frame.x + 4} y={frame.y + frame.h * 0.05 + 8} fill="#ff6b6b" fontSize="8">action safe</text>
            <text x={frame.x + 4} y={frame.y + frame.h * 0.1 + 8} fill="#ff6b6b" fontSize="8">title safe</text>
          </g>
        )}
        {/* Frame stats */}
        <text x={frame.x} y={frame.y - 4} fill="#cbd1e6" fontSize="9">{frame.w.toFixed(0)} × {frame.h.toFixed(0)} ({aspect.ratio.toFixed(2)}:1)</text>
      </svg>

      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px]">
        <label className="inline-flex items-center gap-1">
          <input type="checkbox" checked={showThirds} onChange={(e) => setShowThirds(e.target.checked)} /> <span style={{ color: "#fbbf24" }}>thirds</span>
        </label>
        <label className="inline-flex items-center gap-1">
          <input type="checkbox" checked={showGolden} onChange={(e) => setShowGolden(e.target.checked)} /> <span style={{ color: "#4ecdc4" }}>golden ratio + spiral</span>
        </label>
        <label className="inline-flex items-center gap-1">
          <input type="checkbox" checked={showDynamicSymmetry} onChange={(e) => setShowDynamicSymmetry(e.target.checked)} /> <span style={{ color: "#a78bfa" }}>dynamic symmetry</span>
        </label>
        <label className="inline-flex items-center gap-1">
          <input type="checkbox" checked={showSafeArea} onChange={(e) => setShowSafeArea(e.target.checked)} /> <span style={{ color: "#ff6b6b" }}>safe zones</span>
        </label>
      </div>
      <div className="mt-2 text-[10px] text-muted-foreground">
        Aspect ratios: Academy 1.85:1 became the post-1953 widescreen
        norm; anamorphic 2.39:1 (originally CinemaScope 2.55, now Scope)
        uses ~2× squeeze lenses. 16:9 (1.78) is the HDTV/streaming
        default. IMAX 1.43 plays only in full-domed IMAX houses. The
        rule of thirds (Smith 1797 painting tradition) places points
        of interest on third-line intersections. Golden ratio φ ≈ 1.618
        — overlay shows the 1/φ inset lines + a quarter-arc spiral.
        Safe-action (90%) and title-safe (80%) zones predate digital
        broadcasting — CRT overscan cropped 10-20%; still used
        defensively by broadcast standards. Modern DPs (Deakins,
        Lubezki, Khondji, Hoyte van Hoytema) compose for the full
        frame + crop minimally.
      </div>
    </div>
  );
}
