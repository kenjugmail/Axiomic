import { useMemo, useState } from "react";

// Ice-sheet flowline + mass balance. Steady-state shallow-ice profile
// h(x) for a continental ice sheet of half-width L:
//   h(x) = h₀ · [1 - (x/L)²]^(1/(n+1))   with n=3 (Glen's flow law)
// Mass balance integrates accumulation vs ablation across the surface;
// ELA (equilibrium-line altitude) determines whether the ice sheet
// grows or shrinks. Drag accumulation rate + temperature; see the
// profile change and net mass-balance trend.

const W = 460;
const H = 260;

interface Props {
  accumulation?: number;       // m/yr ice equiv at center
  iceTemperature?: number;     // °C — controls Glen rate factor A
}

export function IceSheetDynamics({ accumulation: ctlAcc, iceTemperature: ctlT }: Props = {}) {
  const [intAcc, setIntAcc] = useState(0.5);
  const [intT, setIntT] = useState(-10);
  const acc = ctlAcc ?? intAcc;
  const T = ctlT ?? intT;

  const data = useMemo(() => {
    const n = 3;
    const L = 1500; // km half-width
    // Glen rate factor A increases with T (Arrhenius). Warmer ice flows faster → lower profile.
    const A = Math.exp((T + 30) / 8);
    // Vialov-like profile: h0 ~ (acc · L / A)^(n/(2(n+1)))
    const h0 = 2000 * Math.pow(Math.max(acc, 0.05) / Math.max(A, 0.1), 0.25);
    const pts: Array<{ x: number; h: number; bal: number }> = [];
    const ELA_frac = 0.65 - acc * 0.2 + T * 0.01; // ELA position as fraction of L
    for (let i = -50; i <= 50; i++) {
      const x = (i / 50) * L;
      const xRel = Math.abs(x) / L;
      if (xRel >= 1) {
        pts.push({ x, h: 0, bal: -acc });
        continue;
      }
      const h = h0 * Math.pow(1 - xRel * xRel, n / (2 * (n + 1)));
      const elevationEffect = h / h0;
      const localBal = acc * 2 * (elevationEffect - ELA_frac);
      pts.push({ x, h, bal: localBal });
    }
    // Total mass balance (sum across positions)
    const totalBal = pts.reduce((s, p) => s + p.bal, 0) / pts.length;
    return { pts, h0, totalBal, ELA_frac };
  }, [acc, T]);

  const baseX = 30;
  const baseY = 30;
  const plotW = W - 50;
  const plotH = H - 80;
  const xMin = -1500;
  const xMax = 1500;
  const yMax = 4500;
  const xOf = (x: number) => baseX + ((x - xMin) / (xMax - xMin)) * plotW;
  const yOf = (h: number) => baseY + ((yMax - h) / yMax) * plotH;

  const fillPath = `${data.pts.map((p, i) => `${i === 0 ? "M" : "L"}${xOf(p.x).toFixed(2)},${yOf(p.h).toFixed(2)}`).join(" ")} L${xOf(xMax).toFixed(2)},${yOf(0).toFixed(2)} L${xOf(xMin).toFixed(2)},${yOf(0).toFixed(2)} Z`;

  const trendColor = data.totalBal > 0.02 ? "#4ecdc4" : data.totalBal < -0.02 ? "#ff6b6b" : "#fbbf24";
  const trendLabel = data.totalBal > 0.02 ? "growing" : data.totalBal < -0.02 ? "shrinking" : "near equilibrium";

  return (
    <div className="my-4 p-3 rounded-lg border border-border bg-card text-card-foreground">
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-semibold">Ice sheet · max h = {data.h0.toFixed(0)} m · net balance = <span style={{ color: trendColor }}>{data.totalBal > 0 ? "+" : ""}{data.totalBal.toFixed(2)} m/yr — {trendLabel}</span></div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto bg-[#0b1228] rounded-md" role="img" aria-label="Ice sheet flowline">
        {/* Sky to ground gradient */}
        <rect x={baseX} y={baseY} width={plotW} height={plotH} fill="#0b1228" stroke="#475569" strokeWidth={0.4} />
        {/* Ice */}
        <path d={fillPath} fill="#4ecdc4" opacity={0.45} stroke="#4ecdc4" strokeWidth={1.5} />
        {/* ELA line */}
        <line x1={baseX} y1={yOf(data.h0 * data.ELA_frac)} x2={baseX + plotW} y2={yOf(data.h0 * data.ELA_frac)} stroke="#fbbf24" strokeWidth={1} strokeDasharray="4,3" />
        <text x={baseX + plotW - 4} y={yOf(data.h0 * data.ELA_frac) - 4} fill="#fbbf24" fontSize="8" textAnchor="end">ELA</text>
        {/* Accumulation/ablation labels */}
        <text x={xOf(0)} y={yOf(data.h0) - 6} fill="#cbd1e6" fontSize="8" textAnchor="middle">accumulation zone</text>
        <text x={xOf(-1200)} y={yOf(50)} fill="#cbd1e6" fontSize="8" textAnchor="middle">ablation</text>
        <text x={xOf(1200)} y={yOf(50)} fill="#cbd1e6" fontSize="8" textAnchor="middle">ablation</text>
        {/* Axes labels */}
        <text x={baseX + plotW / 2} y={baseY + plotH + 14} fill="#9aa3b8" fontSize="9" textAnchor="middle">distance from center (km)</text>
        <text x={14} y={baseY + plotH / 2} fill="#9aa3b8" fontSize="9" textAnchor="middle" transform={`rotate(-90, 14, ${baseY + plotH / 2})`}>elevation (m)</text>
        {/* Tick marks */}
        {[-1500, -750, 0, 750, 1500].map((x) => (
          <text key={`x-${x}`} x={xOf(x)} y={baseY + plotH + 4} fill="#9aa3b8" fontSize="8" textAnchor="middle">{x}</text>
        ))}
        {[0, 1000, 2000, 3000, 4000].map((y) => (
          <text key={`y-${y}`} x={baseX - 3} y={yOf(y) + 3} fill="#9aa3b8" fontSize="8" textAnchor="end">{y}</text>
        ))}
        {/* Flow arrows */}
        {data.pts.length > 0 && [-1000, -500, 500, 1000].map((x) => {
          const idx = Math.round((x - xMin) / (xMax - xMin) * (data.pts.length - 1));
          const h = data.pts[idx]?.h ?? 0;
          if (h < 100) return null;
          const sign = x < 0 ? -1 : 1;
          return (
            <g key={`flow-${x}`}>
              <line x1={xOf(x)} y1={yOf(h / 2)} x2={xOf(x) + sign * 20} y2={yOf(h / 2)} stroke="#cbd1e6" strokeWidth={1} />
              <polygon points={`${xOf(x) + sign * 20},${yOf(h / 2)} ${xOf(x) + sign * 16},${yOf(h / 2) - 2} ${xOf(x) + sign * 16},${yOf(h / 2) + 2}`} fill="#cbd1e6" />
            </g>
          );
        })}
      </svg>

      <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
        <label className="block">Accumulation: {acc.toFixed(2)} m/yr
          <input type="range" min={0.05} max={2.0} step={0.05} value={acc} onChange={(e) => setIntAcc(parseFloat(e.target.value))} disabled={ctlAcc !== undefined} className="w-full mt-0.5" aria-label="Accumulation rate" />
        </label>
        <label className="block">Ice temperature: {T} °C
          <input type="range" min={-40} max={0} step={1} value={T} onChange={(e) => setIntT(parseFloat(e.target.value))} disabled={ctlT !== undefined} className="w-full mt-0.5" aria-label="Ice temperature" />
        </label>
      </div>
      <div className="mt-2 text-[10px] text-muted-foreground">
        Vialov 1958 / Nye-Paterson shallow-ice profile h(x) = h₀ · [1 - (x/L)²]^(1/(n+1))
        with Glen's n=3. Center height h₀ ∝ (accumulation × L / A)^(1/4); warmer
        ice (higher Arrhenius rate factor A) flows faster → lower domes. ELA
        separates net accumulation (snow exceeds melt) from ablation zone. Real
        ice sheets (Greenland, Antarctica) are forced by climate via ELA
        shift; Greenland is currently far above ELA balance, losing ~270
        Gt/yr (GRACE/GRACE-FO 2002-now). MISI Marine Ice Sheet Instability
        (Pine Island/Thwaites): once grounding line retreats into a deepening
        basin, runaway loss can follow.
      </div>
    </div>
  );
}
