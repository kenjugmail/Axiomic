import { useMemo, useState } from "react";

// Locating an earthquake from one seismogram. Primary (P) waves are
// compressional and fast (~8 km/s); secondary (S) waves are shear and
// slower (~4.6 km/s). Because they leave the source together but travel at
// different speeds, the gap between their arrivals — the S−P time — grows
// with distance: Δt = d(1/v_S − 1/v_P), so distance ≈ Δt × 10.8 km/s here.
// Three stations' distances triangulate the epicenter. Richard Oldham first
// separated P, S, and surface waves on seismograms in 1900.

const W = 460;
const H = 300;
const VP = 8.0; // km/s
const VS = 4.6; // km/s

const PRESETS = [
  { label: "Local 100 km", d: 100 },
  { label: "Regional 500 km", d: 500 },
  { label: "Distant 1500 km", d: 1500 },
];

interface Props {
  distance?: number;
}

export function SeismicWaves({ distance: ctl }: Props = {}) {
  const [intD, setIntD] = useState(100);
  const d = ctl ?? intD;
  const tp = d / VP;
  const ts = d / VS;
  const dt = ts - tp;
  const tmax = ts * 1.45;

  const baseX = 20, baseW = W - 40, midY = 120, amp0 = 52;
  const xOf = (t: number) => baseX + (t / tmax) * baseW;

  const trace = useMemo(() => {
    const pts: string[] = [];
    const N = 360;
    for (let i = 0; i <= N; i++) {
      const t = (i / N) * tmax;
      let env = 0.05;
      if (t >= tp && t < ts) env = 0.32 * Math.exp(-(t - tp) / Math.max(1, (ts - tp) * 0.7));
      else if (t >= ts) env = 1.0 * Math.exp(-(t - ts) / Math.max(1, (tmax - ts) * 0.45));
      const y = midY - env * amp0 * Math.sin(i * 0.7);
      pts.push(`${i === 0 ? "M" : "L"}${xOf(t).toFixed(1)},${y.toFixed(1)}`);
    }
    return pts.join(" ");
  }, [d]);

  return (
    <div className="my-4 p-3 rounded-lg border border-border bg-card text-card-foreground">
      <div className="flex items-center justify-between mb-2 flex-wrap gap-1">
        <div className="text-sm font-semibold">S−P = {dt.toFixed(1)} s → distance ≈ {Math.round(dt * 10.8)} km</div>
        <div className="flex gap-1">
          {PRESETS.map((p) => (
            <button key={p.label} onClick={() => setIntD(p.d)} disabled={ctl !== undefined}
              className={`px-1.5 py-0.5 rounded text-[9px] ${Math.round(d) === p.d ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-accent"}`}>{p.label}</button>
          ))}
        </div>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto bg-[#0b1228] rounded-md" role="img" aria-label="Seismogram with P and S wave arrivals">
        <line x1={baseX} y1={midY} x2={baseX + baseW} y2={midY} stroke="#1f2937" strokeWidth={0.5} />

        {/* S−P shaded interval */}
        <rect x={xOf(tp)} y={50} width={xOf(ts) - xOf(tp)} height={140} fill="#fbbf24" opacity={0.08} />

        {/* trace */}
        <path d={trace} fill="none" stroke="#cbd1e6" strokeWidth={1.1} />

        {/* P + S markers */}
        <line x1={xOf(tp)} y1={50} x2={xOf(tp)} y2={190} stroke="#38bdf8" strokeWidth={1.2} />
        <text x={xOf(tp)} y={44} fill="#38bdf8" fontSize="9" textAnchor="middle" fontWeight="bold">P</text>
        <text x={xOf(tp)} y={204} fill="#38bdf8" fontSize="7.5" textAnchor="middle">{tp.toFixed(1)}s</text>
        <line x1={xOf(ts)} y1={50} x2={xOf(ts)} y2={190} stroke="#f87171" strokeWidth={1.2} />
        <text x={xOf(ts)} y={44} fill="#f87171" fontSize="9" textAnchor="middle" fontWeight="bold">S</text>
        <text x={xOf(ts)} y={204} fill="#f87171" fontSize="7.5" textAnchor="middle">{ts.toFixed(1)}s</text>

        {/* S-P bracket */}
        <line x1={xOf(tp)} y1={224} x2={xOf(ts)} y2={224} stroke="#fbbf24" strokeWidth={1} markerStart="url(#swL)" markerEnd="url(#swR)" />
        <text x={(xOf(tp) + xOf(ts)) / 2} y={238} fill="#fbbf24" fontSize="8.5" textAnchor="middle">S−P = {dt.toFixed(1)} s</text>

        <text x={baseX} y={264} fill="#9aa3b8" fontSize="8">surface waves (largest) arrive last →</text>
        <text x={W / 2} y={284} fill="#9aa3b8" fontSize="8" textAnchor="middle">v_P = {VP} km/s · v_S = {VS} km/s · time →</text>

        <defs>
          <marker id="swL" markerWidth="6" markerHeight="6" refX="1" refY="3" orient="auto"><path d="M6,0 L0,3 L6,6 Z" fill="#fbbf24" /></marker>
          <marker id="swR" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 Z" fill="#fbbf24" /></marker>
        </defs>
      </svg>

      <div className="mt-2 text-xs">
        <label className="block">distance to epicenter: {Math.round(d)} km
          <input type="range" min={50} max={2000} step={10} value={d} onChange={(e) => setIntD(parseInt(e.target.value))} className="w-full mt-0.5" aria-label="Distance to epicenter" />
        </label>
      </div>
      <div className="mt-1 text-[10px] text-muted-foreground">
        Fast <b>P waves</b> arrive first, slower <b>S waves</b> second; the
        <b> S−P interval</b> widens with distance because the speed
        difference accumulates over the travel path. One station's S−P time
        gives a <b>distance</b> (a circle of possible epicenters); three
        stations <b>triangulate</b> the location. <b>Richard Oldham</b>
        distinguished these phases in 1900, and <b>Inge Lehmann</b> later used
        them to discover Earth's solid inner core.
      </div>
    </div>
  );
}
