import { useMemo, useState } from "react";

// Airfoil lift curve + drag polar. CL rises ~linearly with angle of
// attack (thin-airfoil theory, dCL/dα ≈ 2π per radian) until the
// critical AoA, where flow separates and the wing stalls — CL collapses
// while CD climbs. Drag polar: CD = CD0 + k·CL² (parasite + induced).

const W = 460;
const H = 330;

const STALL_DEG = 15;
const CL_PER_DEG = 0.1; // ~ within the 2π/rad linear range
const CL_MAX = STALL_DEG * CL_PER_DEG; // 1.5 at the stall
const CD0 = 0.02;
const K = 0.05;

interface Props {
  alphaDeg?: number;
}

const PRESETS: Array<{ id: string; label: string; alpha: number }> = [
  { id: "cruise", label: "Cruise 4°", alpha: 4 },
  { id: "climb", label: "Climb 10°", alpha: 10 },
  { id: "stall", label: "Stall 16°", alpha: 16 },
];

function clOf(alpha: number): number {
  if (alpha <= STALL_DEG) return CL_PER_DEG * alpha;
  // Post-stall: CL drops from CL_MAX (1.5) toward ~0.9 by 20°.
  const t = Math.min((alpha - STALL_DEG) / 5, 1);
  return CL_MAX - t * 0.6;
}

function cdOf(alpha: number): number {
  const cl = clOf(alpha);
  const separation = alpha > STALL_DEG ? 0.03 * (alpha - STALL_DEG) : 0;
  return CD0 + K * cl * cl + separation;
}

export function AirfoilPolar({ alphaDeg: ctlAlpha }: Props = {}) {
  const [intAlpha, setIntAlpha] = useState(4);
  const alpha = ctlAlpha ?? intAlpha;
  const cl = clOf(alpha);
  const cd = cdOf(alpha);
  const ld = cd > 0 ? cl / cd : 0;
  const stalled = alpha >= STALL_DEG;

  const curve = useMemo(() => {
    const pts: Array<{ a: number; cl: number }> = [];
    for (let a = -5; a <= 20; a += 0.5) pts.push({ a, cl: clOf(a) });
    return pts;
  }, []);

  const baseX = 40;
  const baseY = 16;
  const plotW = W - baseX - 150;
  const plotH = H - baseY - 60;
  const aMin = -5;
  const aMax = 20;
  const clMin = -0.6;
  const clMax = 1.7;
  const xOf = (a: number) => baseX + ((a - aMin) / (aMax - aMin)) * plotW;
  const yOf = (c: number) => baseY + plotH - ((c - clMin) / (clMax - clMin)) * plotH;

  // Airfoil glyph centre (inset, right side), rotated by -alpha.
  const insetCx = W - 75;
  const insetCy = 80;

  return (
    <div className="my-4 p-3 rounded-lg border border-border bg-card text-card-foreground">
      <div className="flex items-center justify-between mb-2 flex-wrap gap-1">
        <div className="text-sm font-semibold">
          α {alpha.toFixed(1)}° · CL={cl.toFixed(2)} · CD={cd.toFixed(3)} · L/D=
          {ld.toFixed(1)}
          {stalled && <span className="ml-2 text-rose-400">STALL</span>}
        </div>
        <div className="flex gap-1">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              onClick={() => setIntAlpha(p.alpha)}
              disabled={ctlAlpha !== undefined}
              className={`px-1.5 py-0.5 rounded text-[9px] ${
                alpha === p.alpha
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted hover:bg-accent"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-auto bg-[#0b1228] rounded-md"
        role="img"
        aria-label="Airfoil lift curve and drag polar"
      >
        <rect x={baseX} y={baseY} width={plotW} height={plotH} fill="none" stroke="#1f2937" strokeWidth={0.5} />
        {/* CL gridlines */}
        {[0, 0.5, 1, 1.5].map((c) => (
          <g key={c}>
            <line x1={baseX} y1={yOf(c)} x2={baseX + plotW} y2={yOf(c)} stroke="#1f2937" strokeWidth={0.3} />
            <text x={baseX - 4} y={yOf(c) + 3} fill="#9aa3b8" fontSize="8" textAnchor="end">{c.toFixed(1)}</text>
          </g>
        ))}
        {/* alpha gridlines */}
        {[-5, 0, 5, 10, 15, 20].map((a) => (
          <g key={a}>
            <line x1={xOf(a)} y1={baseY} x2={xOf(a)} y2={baseY + plotH} stroke="#1f2937" strokeWidth={0.3} />
            <text x={xOf(a)} y={baseY + plotH + 11} fill="#9aa3b8" fontSize="8" textAnchor="middle">{a}°</text>
          </g>
        ))}
        {/* zero-lift axis */}
        <line x1={baseX} y1={yOf(0)} x2={baseX + plotW} y2={yOf(0)} stroke="#374151" strokeWidth={0.6} />
        {/* stall marker */}
        <line x1={xOf(STALL_DEG)} y1={baseY} x2={xOf(STALL_DEG)} y2={baseY + plotH} stroke="#ff6b6b" strokeWidth={0.6} strokeDasharray="3,2" />
        <text x={xOf(STALL_DEG)} y={baseY - 3} fill="#ff6b6b" fontSize="8" textAnchor="middle">stall</text>
        {/* CL-alpha curve */}
        <path
          d={curve.map((p, i) => `${i === 0 ? "M" : "L"}${xOf(p.a).toFixed(1)},${yOf(p.cl).toFixed(1)}`).join(" ")}
          fill="none"
          stroke="#4ecdc4"
          strokeWidth={2}
        />
        {/* current-alpha marker */}
        <line x1={xOf(alpha)} y1={baseY} x2={xOf(alpha)} y2={baseY + plotH} stroke="#fbbf24" strokeWidth={0.6} strokeDasharray="2,2" />
        <circle cx={xOf(alpha)} cy={yOf(cl)} r={4} fill="#fbbf24" />
        <text x={baseX + plotW / 2} y={H - 36} fill="#cbd1e6" fontSize="9" textAnchor="middle">angle of attack α</text>
        <text x={12} y={baseY + plotH / 2} fill="#cbd1e6" fontSize="9" textAnchor="middle" transform={`rotate(-90 12 ${baseY + plotH / 2})`}>lift coefficient C_L</text>

        {/* Airfoil inset: chord rotated by -alpha, relative wind from the left */}
        <g transform={`translate(${insetCx} ${insetCy})`}>
          <text x={0} y={-46} fill="#9aa3b8" fontSize="8" textAnchor="middle">section · α to wind</text>
          {/* relative wind */}
          <line x1={-60} y1={0} x2={-18} y2={0} stroke="#60a5fa" strokeWidth={1.5} markerEnd="url(#wind)" />
          <text x={-58} y={-4} fill="#60a5fa" fontSize="7">wind</text>
          <g transform={`rotate(${-alpha})`}>
            <path d="M -34,0 C -16,-9 22,-7 40,0 C 22,5 -16,4 -34,0 Z" fill={stalled ? "#7f1d1d" : "#334155"} stroke={stalled ? "#ff6b6b" : "#94a3b8"} strokeWidth={1} />
            <line x1={-34} y1={0} x2={40} y2={0} stroke="#cbd5e1" strokeWidth={0.4} strokeDasharray="2,2" />
          </g>
          {stalled && <text x={0} y={34} fill="#ff6b6b" fontSize="9" textAnchor="middle" fontWeight="bold">separated flow</text>}
        </g>
        <defs>
          <marker id="wind" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
            <path d="M0,0 L6,3 L0,6 Z" fill="#60a5fa" />
          </marker>
        </defs>
      </svg>

      <div className="mt-2 text-xs">
        <label className="block">
          angle of attack: {alpha.toFixed(1)}°
          <input
            type="range"
            min={-5}
            max={20}
            step={0.5}
            value={alpha}
            onChange={(e) => setIntAlpha(parseFloat(e.target.value))}
            disabled={ctlAlpha !== undefined}
            className="w-full mt-0.5"
            aria-label="Angle of attack"
          />
        </label>
      </div>
      <div className="mt-1 text-[10px] text-muted-foreground">
        Lift coefficient grows almost linearly with angle of attack —
        thin-airfoil theory (Ludwig Prandtl, Max Munk, ~1920s) gives
        dC_L/dα ≈ 2π per radian — until the <b>critical angle of attack</b>{" "}
        (~15° here), where the boundary layer separates and the wing{" "}
        <b>stalls</b>: C_L collapses while C_D climbs. The Wright brothers
        (1903) achieved control where others failed; the Kutta-Joukowski
        theorem ties lift to circulation, and the parabolic drag polar
        C_D = C_D0 + kC_L² splits parasite from induced drag. A stall is
        about angle, not speed — a wing can stall at any airspeed if α
        exceeds critical.
      </div>
    </div>
  );
}
