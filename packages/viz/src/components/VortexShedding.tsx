import { useMemo, useState } from "react";

// Von Kármán vortex street behind a cylinder. The Strouhal number St =
// f·D/U ≈ 0.21 in the range 200 < Re < 200000 — vortices shed alternately
// from top and bottom at frequency f. We show a static snapshot: streamlines
// for Re < 5 (creeping), a symmetric standing-wake for 5 < Re < 40, the
// classical Kármán street for 40 < Re < 200000, and turbulent wake above.
// Drag Reynolds + cylinder diameter; the wake regime + shedding frequency
// + drag coefficient update.

const W = 460;
const H = 260;

interface Props {
  reynolds?: number;
  diameter?: number;
}

function regimeOf(Re: number): { label: string; color: string; freq: number | null; Cd: number } {
  if (Re < 1) return { label: "Stokes / creeping flow", color: "#a78bfa", freq: null, Cd: 24 / Math.max(Re, 0.01) };
  if (Re < 40) return { label: "steady recirculation", color: "#4ecdc4", freq: null, Cd: 1.4 };
  if (Re < 200) return { label: "laminar Kármán street", color: "#fbbf24", freq: 0.20, Cd: 1.0 };
  if (Re < 1e5) return { label: "turbulent wake (street persists)", color: "#fbbf24", freq: 0.21, Cd: 1.2 };
  if (Re < 4e5) return { label: "drag crisis (transition)", color: "#ff6b6b", freq: 0.3, Cd: 0.4 };
  return { label: "supercritical turbulent", color: "#ff6b6b", freq: 0.28, Cd: 0.7 };
}

export function VortexShedding({ reynolds: ctlRe, diameter: ctlD }: Props = {}) {
  const [intRe, setIntRe] = useState(100);
  const [intD, setIntD] = useState(1.0);
  const Re = ctlRe ?? intRe;
  const D = ctlD ?? intD;

  const regime = useMemo(() => regimeOf(Re), [Re]);
  // Assume U = 1 m/s implicit; freq = St·U/D
  const freqHz = regime.freq !== null ? regime.freq / D : null;

  const cylX = 100;
  const cylY = H / 2;
  const cylR = 18;

  // Sample wake pattern: alternating top/bottom vortices
  const vortices = useMemo(() => {
    const arr: Array<{ x: number; y: number; sign: number; size: number; opacity: number }> = [];
    if (Re < 40) return arr;
    const spacing = Re < 200 ? 55 : 50;
    const amplitude = Re < 200 ? 24 : 30;
    const turbulent = Re > 1000;
    for (let i = 0; i < 7; i++) {
      const x = cylX + cylR + 30 + i * spacing;
      const sign = i % 2 === 0 ? 1 : -1;
      const y = cylY + sign * amplitude;
      arr.push({
        x,
        y,
        sign,
        size: turbulent ? 8 + Math.random() * 4 : 14,
        opacity: turbulent ? 0.4 + Math.random() * 0.3 : 0.7,
      });
    }
    return arr;
  }, [Re]);

  return (
    <div className="my-4 p-3 rounded-lg border border-border bg-card text-card-foreground">
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-semibold">Re = {Re.toLocaleString()} · <span style={{ color: regime.color }}>{regime.label}</span> · C_D ≈ {regime.Cd.toFixed(2)}</div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto bg-[#0b1228] rounded-md" role="img" aria-label="Vortex shedding">
        {/* Freestream arrows */}
        {[60, 100, 140, 180, 220].map((y) => (
          <g key={`arrow-${y}`}>
            <line x1={6} y1={y} x2={36} y2={y} stroke="#475569" strokeWidth={1} />
            <polygon points={`36,${y} 32,${y - 2} 32,${y + 2}`} fill="#475569" />
          </g>
        ))}
        <text x={6} y={20} fill="#9aa3b8" fontSize="9">U∞ →</text>
        {/* Cylinder */}
        <circle cx={cylX} cy={cylY} r={cylR} fill="#1f2937" stroke="#9aa3b8" strokeWidth={1.5} />
        <text x={cylX} y={cylY + 3} fill="#9aa3b8" fontSize="8" textAnchor="middle">D</text>
        {/* Wake region indicator */}
        {Re < 40 && Re >= 5 && (
          <g>
            <ellipse cx={cylX + cylR + 35} cy={cylY} rx={28} ry={20} fill="none" stroke="#4ecdc4" strokeWidth={1} strokeDasharray="3,3" opacity={0.6} />
            <text x={cylX + cylR + 35} y={cylY + 3} fill="#4ecdc4" fontSize="8" textAnchor="middle">eddies</text>
          </g>
        )}
        {/* Stokes streamlines */}
        {Re < 5 && (
          <g opacity={0.5}>
            {[80, 120, 140, 160].map((y) => (
              <path key={`sl-${y}`} d={`M${cylX + cylR + 5},${y} Q${cylX + 60},${cylY + (y - cylY) * 1.2} ${cylX + 200},${cylY + (y - cylY) * 1.3}`} fill="none" stroke="#a78bfa" strokeWidth={1} />
            ))}
          </g>
        )}
        {/* Vortices */}
        {vortices.map((v, i) => (
          <g key={`v-${i}`}>
            <circle cx={v.x} cy={v.y} r={v.size} fill="none" stroke={v.sign > 0 ? "#ff6b6b" : "#4ecdc4"} strokeWidth={1.5} opacity={v.opacity} />
            <path d={`M${v.x},${v.y - v.size + 1} a${v.size - 2},${v.size - 2} 0 ${v.sign > 0 ? "1,1" : "1,0"} 0.1,0`} fill="none" stroke={v.sign > 0 ? "#ff6b6b" : "#4ecdc4"} strokeWidth={1} opacity={v.opacity * 0.6} />
          </g>
        ))}
        <text x={W - 10} y={H - 8} fill="#9aa3b8" fontSize="8" textAnchor="end">
          {freqHz !== null ? `St ≈ ${regime.freq?.toFixed(2)}, f ≈ ${freqHz.toFixed(2)} Hz @ U=1 m/s` : "no shedding"}
        </text>
      </svg>

      <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
        <label className="block">Reynolds: {Re}
          <input type="range" min={0.1} max={1000000} step={1} value={Re} onChange={(e) => setIntRe(parseFloat(e.target.value))} disabled={ctlRe !== undefined} className="w-full mt-0.5" aria-label="Reynolds number" />
        </label>
        <label className="block">Diameter D: {D.toFixed(2)} m
          <input type="range" min={0.1} max={5.0} step={0.1} value={D} onChange={(e) => setIntD(parseFloat(e.target.value))} disabled={ctlD !== undefined} className="w-full mt-0.5" aria-label="Cylinder diameter" />
        </label>
      </div>
      <div className="mt-2 grid grid-cols-3 gap-1 text-[10px]">
        <button className="px-2 py-1 rounded bg-muted hover:bg-accent" onClick={() => setIntRe(1)} disabled={ctlRe !== undefined}>Stokes (Re=1)</button>
        <button className="px-2 py-1 rounded bg-muted hover:bg-accent" onClick={() => setIntRe(100)} disabled={ctlRe !== undefined}>Kármán (Re=100)</button>
        <button className="px-2 py-1 rounded bg-muted hover:bg-accent" onClick={() => setIntRe(400000)} disabled={ctlRe !== undefined}>Drag crisis</button>
      </div>
      <div className="mt-2 text-[10px] text-muted-foreground">
        Bluff-body wake regimes vs Re = UD/ν. Below Re ≈ 5: Stokes flow,
        fore-aft symmetric. 5-40: steady recirculation. 40-200: laminar
        Kármán street with St ≈ 0.20. 200-2×10⁵: turbulent wake but the
        street persists (St ≈ 0.21). 2-4×10⁵: drag crisis — boundary layer
        transitions to turbulent before separation, separation point moves
        downstream, C_D drops from ~1.2 to ~0.4 (golf-ball dimples exploit
        this). Above 4×10⁵: supercritical turbulent. Tacoma Narrows (1940)
        collapsed via aeroelastic flutter coupled to vortex shedding.
      </div>
    </div>
  );
}
