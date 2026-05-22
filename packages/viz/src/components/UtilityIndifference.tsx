import { useMemo, useState } from "react";

// Consumer-choice problem: maximize Cobb-Douglas utility
//   U(x,y) = x^α · y^(1-α)
// subject to px·x + py·y ≤ income. Drag prices + income; see
// indifference curves, budget line, and the optimal bundle move.
// The MRS at the optimum equals the price ratio (FOC).

const W = 460;
const H = 320;

interface Props {
  px?: number;
  py?: number;
  income?: number;
}

export function UtilityIndifference({ px: ctlPx, py: ctlPy, income: ctlInc }: Props = {}) {
  const [intPx, setIntPx] = useState(1);
  const [intPy, setIntPy] = useState(1);
  const [intInc, setIntInc] = useState(10);
  const [alpha, setAlpha] = useState(0.5);
  const px = ctlPx ?? intPx;
  const py = ctlPy ?? intPy;
  const income = ctlInc ?? intInc;

  // Optimum: x* = α·m/px, y* = (1-α)·m/py
  const xStar = (alpha * income) / px;
  const yStar = ((1 - alpha) * income) / py;
  const uStar = Math.pow(xStar, alpha) * Math.pow(yStar, 1 - alpha);

  // Budget line endpoints
  const xMaxBudget = income / px;
  const yMaxBudget = income / py;

  // Plot bounds
  const xMax = Math.max(15, xMaxBudget * 1.3);
  const yMax = Math.max(15, yMaxBudget * 1.3);

  const baseX = 40;
  const baseY = 20;
  const plotW = W - baseX - 30;
  const plotH = H - baseY - 80;
  const xOf = (x: number) => baseX + (x / xMax) * plotW;
  const yOf = (y: number) => baseY + plotH - (y / yMax) * plotH;

  // Three indifference curves: at U = u*·{0.7, 1.0, 1.3}
  const curves = useMemo(() => {
    const levels = [0.7, 1.0, 1.3].map((k) => k * uStar);
    return levels.map((U) => {
      const pts: Array<{ x: number; y: number }> = [];
      const N = 200;
      for (let i = 1; i <= N; i++) {
        const x = (i / N) * xMax;
        // U = x^α · y^(1-α) → y = (U / x^α)^(1/(1-α))
        const y = Math.pow(U / Math.pow(x, alpha), 1 / (1 - alpha));
        if (y > 0 && y < yMax * 2) pts.push({ x, y });
      }
      return { U, pts };
    });
  }, [alpha, uStar, xMax, yMax]);

  return (
    <div className="my-4 p-3 rounded-lg border border-border bg-card text-card-foreground">
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-semibold">U = x<sup>{alpha.toFixed(2)}</sup>·y<sup>{(1 - alpha).toFixed(2)}</sup> · optimum ({xStar.toFixed(2)}, {yStar.toFixed(2)}) · U* = {uStar.toFixed(2)}</div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto bg-[#0b1228] rounded-md" role="img" aria-label="Utility maximization">
        <rect x={baseX} y={baseY} width={plotW} height={plotH} fill="none" stroke="#1f2937" strokeWidth={0.5} />
        {/* Grid lines */}
        {[5, 10, 15].map((v) => (
          <g key={v}>
            <line x1={xOf(v)} y1={baseY} x2={xOf(v)} y2={baseY + plotH} stroke="#1f2937" strokeWidth={0.3} />
            <text x={xOf(v)} y={baseY + plotH + 10} fill="#9aa3b8" fontSize="8" textAnchor="middle">{v}</text>
            <line x1={baseX} y1={yOf(v)} x2={baseX + plotW} y2={yOf(v)} stroke="#1f2937" strokeWidth={0.3} />
            <text x={baseX - 4} y={yOf(v) + 3} fill="#9aa3b8" fontSize="8" textAnchor="end">{v}</text>
          </g>
        ))}
        {/* Indifference curves */}
        {curves.map((c, i) => {
          const path = c.pts.map((p, j) => `${j === 0 ? "M" : "L"}${xOf(p.x).toFixed(1)},${yOf(p.y).toFixed(1)}`).join(" ");
          const isOpt = Math.abs(c.U - uStar) < 1e-9;
          return <path key={i} d={path} fill="none" stroke={isOpt ? "#fbbf24" : "#4ecdc4"} strokeWidth={isOpt ? 2 : 1} strokeOpacity={isOpt ? 1 : 0.5} />;
        })}
        {/* Budget line */}
        <line x1={xOf(0)} y1={yOf(yMaxBudget)} x2={xOf(xMaxBudget)} y2={yOf(0)} stroke="#ff6b6b" strokeWidth={2} />
        <text x={xOf(xMaxBudget) - 30} y={yOf(0) - 4} fill="#ff6b6b" fontSize="9">budget</text>
        {/* Optimum point */}
        <circle cx={xOf(xStar)} cy={yOf(yStar)} r={5} fill="#fbbf24" stroke="#0b1228" strokeWidth={1.5} />
        <text x={xOf(xStar) + 6} y={yOf(yStar) - 6} fill="#fbbf24" fontSize="10">optimum</text>
        {/* Axis labels */}
        <text x={baseX + plotW / 2} y={baseY + plotH + 24} fill="#cbd1e6" fontSize="10" textAnchor="middle">x (good 1)</text>
        <text x={14} y={baseY + plotH / 2} fill="#cbd1e6" fontSize="10" textAnchor="middle" transform={`rotate(-90, 14, ${baseY + plotH / 2})`}>y (good 2)</text>
      </svg>

      <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
        <label className="block">px (price of x): {px.toFixed(2)}
          <input type="range" min={0.1} max={4} step={0.1} value={px} onChange={(e) => setIntPx(parseFloat(e.target.value))} disabled={ctlPx !== undefined} className="w-full mt-0.5" aria-label="px" />
        </label>
        <label className="block">py (price of y): {py.toFixed(2)}
          <input type="range" min={0.1} max={4} step={0.1} value={py} onChange={(e) => setIntPy(parseFloat(e.target.value))} disabled={ctlPy !== undefined} className="w-full mt-0.5" aria-label="py" />
        </label>
        <label className="block">m (income): {income.toFixed(1)}
          <input type="range" min={2} max={30} step={0.5} value={income} onChange={(e) => setIntInc(parseFloat(e.target.value))} disabled={ctlInc !== undefined} className="w-full mt-0.5" aria-label="income" />
        </label>
        <label className="block">α (preference): {alpha.toFixed(2)}
          <input type="range" min={0.1} max={0.9} step={0.05} value={alpha} onChange={(e) => setAlpha(parseFloat(e.target.value))} className="w-full mt-0.5" aria-label="alpha" />
        </label>
      </div>
      <div className="mt-2 text-[10px] text-muted-foreground">
        Consumer maximizes U(x,y) = x^α · y^(1-α) subject to budget
        px·x + py·y = m. The Lagrangian first-order conditions give
        MRS = (α/(1-α)) · (y/x) = px/py, so at the optimum the
        indifference curve is tangent to the budget line. Closed-form
        Cobb-Douglas demand: x* = α·m/px, y* = (1-α)·m/py — each
        good takes a constant expenditure share. Try doubling income
        (curves shift up; demand scales linearly), then dropping px
        (substitute toward x while still spending share α). Slutsky
        1915 + Hicks 1939 decompose price changes into substitution
        (curve slide along same indifference curve) + income (move
        to a different curve).
      </div>
    </div>
  );
}
