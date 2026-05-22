import { useState } from "react";

// Linear programming. Maximizing a linear objective over linear constraints
// confines the solution to a convex polygon (the feasible region); the
// optimum always sits at a VERTEX. The simplex method (George Dantzig, 1947)
// walks edge to edge, vertex to vertex, improving the objective until no
// neighbor is better. Sliding the iso-profit line (c·x = constant) until it
// last touches the region shows geometrically why the corner wins — and
// changing the objective direction moves the optimum to a different corner.

const W = 460;
const H = 320;
// Feasible polygon vertices (problem coordinates), counter-clockwise.
const V: Array<[number, number]> = [[0, 0], [7, 0], [7, 3], [3, 6], [0, 5]];

const OBJ = [
  { label: "Max 3x+2y", c: [3, 2] as const },
  { label: "Max x+4y", c: [1, 4] as const },
];

interface Props { objective?: string; }

export function SimplexLp({ objective: ctl }: Props = {}) {
  const [intObj, setIntObj] = useState("Max 3x+2y");
  const obj = ctl ?? intObj;
  const c = (OBJ.find((o) => o.label === obj) ?? OBJ[0]).c;

  const val = (v: readonly [number, number]) => c[0] * v[0] + c[1] * v[1];
  const optVertex = V.reduce((best, v) => (val(v) > val(best) ? v : best), V[0]);
  const optVal = val(optVertex);
  const [level, setLevel] = useState(14);

  const baseX = 44, baseY = 270, plotW = W - baseX - 16, plotH = 230, XMAX = 8, YMAX = 7;
  const xOf = (x: number) => baseX + (x / XMAX) * plotW;
  const yOf = (y: number) => baseY - (y / YMAX) * plotH;
  const poly = V.map((v) => `${xOf(v[0])},${yOf(v[1])}`).join(" ");

  // iso-profit line c0 x + c1 y = level → endpoints clipped to the plot box
  const lineY = (x: number) => (level - c[0] * x) / c[1];
  const lx1 = 0, lx2 = XMAX;

  return (
    <div className="my-4 p-3 rounded-lg border border-border bg-card text-card-foreground">
      <div className="flex items-center justify-between mb-2 flex-wrap gap-1">
        <div className="text-sm font-semibold">optimum at ({optVertex[0]}, {optVertex[1]}) · value {optVal}</div>
        <div className="flex gap-1">
          {OBJ.map((o) => (
            <button key={o.label} onClick={() => setIntObj(o.label)} disabled={ctl !== undefined}
              className={`px-1.5 py-0.5 rounded text-[9px] ${obj === o.label ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-accent"}`}>{o.label}</button>
          ))}
        </div>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto bg-[#0b1228] rounded-md" role="img" aria-label="Linear-programming feasible region">
        <line x1={baseX} y1={baseY} x2={baseX + plotW} y2={baseY} stroke="#334155" strokeWidth={0.8} />
        <line x1={baseX} y1={baseY - plotH} x2={baseX} y2={baseY} stroke="#334155" strokeWidth={0.8} />
        {[2, 4, 6].map((y) => (<g key={y}><line x1={baseX} y1={yOf(y)} x2={baseX + plotW} y2={yOf(y)} stroke="#1f2937" strokeWidth={0.3} /><text x={baseX - 4} y={yOf(y) + 3} fill="#9aa3b8" fontSize="8" textAnchor="end">{y}</text></g>))}
        {[2, 4, 6, 8].map((x) => (<text key={x} x={xOf(x)} y={baseY + 12} fill="#9aa3b8" fontSize="8" textAnchor="middle">{x}</text>))}
        <text x={baseX + plotW / 2} y={baseY + 26} fill="#cbd1e6" fontSize="8.5" textAnchor="middle">x</text>
        <text x={14} y={baseY - plotH / 2} fill="#cbd1e6" fontSize="8.5" textAnchor="middle" transform={`rotate(-90 14 ${baseY - plotH / 2})`}>y</text>

        {/* feasible region */}
        <polygon points={poly} fill="#38bdf8" opacity={0.14} stroke="#38bdf8" strokeWidth={1.2} />
        {V.map((v, i) => (<circle key={i} cx={xOf(v[0])} cy={yOf(v[1])} r={3} fill="#38bdf8" />))}

        {/* iso-profit line */}
        <line x1={xOf(lx1)} y1={yOf(lineY(lx1))} x2={xOf(lx2)} y2={yOf(lineY(lx2))} stroke="#fbbf24" strokeWidth={1.6} strokeDasharray="5,3" />
        <text x={xOf(lx2) - 4} y={yOf(lineY(lx2)) - 4} fill="#fbbf24" fontSize="8" textAnchor="end">c·x = {level}</text>

        {/* optimal vertex */}
        <circle cx={xOf(optVertex[0])} cy={yOf(optVertex[1])} r={6} fill="none" stroke="#4ade80" strokeWidth={2.2} />
        <text x={xOf(optVertex[0]) + 8} y={yOf(optVertex[1]) - 6} fill="#4ade80" fontSize="8.5">optimum</text>
      </svg>

      <div className="mt-2 text-xs">
        <label className="block">iso-profit level c·x = {level}
          <input type="range" min={0} max={30} step={1} value={level} onChange={(e) => setLevel(parseInt(e.target.value))} className="w-full mt-0.5" aria-label="Objective level" />
        </label>
      </div>
      <div className="mt-1 text-[10px] text-muted-foreground">
        Constraints carve out a convex <b>feasible region</b>; the objective's
        <b> iso-profit lines</b> are parallel, so pushing one as far as
        possible in the gradient direction lands on a <b>corner</b> — never
        the interior. That's the cornerstone of <b>linear programming</b> and
        why <b>Dantzig's simplex method</b> only ever examines vertices. Swap
        the objective and the optimal corner jumps from (7, 3) to (3, 6).
      </div>
    </div>
  );
}
