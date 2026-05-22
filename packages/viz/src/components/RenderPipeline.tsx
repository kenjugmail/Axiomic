import { useState } from "react";

// The browser rendering pipeline: JS → Style → Layout → Paint → Composite.
// Which CSS property you change decides how much of the pipeline must re-run.
// Geometry changes (width, top, font-size) force a REFLOW — Layout and
// everything after it. Visual-only changes (color, background) skip Layout
// but still REPAINT. Transform + opacity can be handled by the compositor
// thread alone, skipping Style/Layout/Paint entirely — the cheap, 60fps-
// friendly path. This is why animations should prefer transform/opacity
// (see csstriggers.com; the model is shared by Blink + WebKit + Gecko).

const W = 480;
const H = 280;

const STAGES = ["JS", "Style", "Layout", "Paint", "Composite"] as const;
type Change = "Reflow" | "Repaint" | "Composite";
const ACTIVE: Record<Change, boolean[]> = {
  // JS always runs (it triggered the change).
  Reflow: [true, true, true, true, true],
  Repaint: [true, true, false, true, true],
  Composite: [true, false, false, false, true],
};
const META: Record<Change, { prop: string; cost: string }> = {
  Reflow: { prop: "width · top · font-size · display", cost: "most expensive — re-lays out the page" },
  Repaint: { prop: "color · background · box-shadow · visibility", cost: "medium — skips layout, repaints pixels" },
  Composite: { prop: "transform · opacity", cost: "cheapest — compositor/GPU only, 60fps-friendly" },
};
const ORDER: Change[] = ["Reflow", "Repaint", "Composite"];

interface Props {
  change?: Change;
}

export function RenderPipeline({ change: ctl }: Props = {}) {
  const [intChange, setIntChange] = useState<Change>("Reflow");
  const change = ctl ?? intChange;
  const active = ACTIVE[change];
  const meta = META[change];

  const boxW = 80;
  const gap = 14;
  const totalW = STAGES.length * boxW + (STAGES.length - 1) * gap;
  const startX = (W - totalW) / 2;
  const y = 84;

  return (
    <div className="my-4 p-3 rounded-lg border border-border bg-card text-card-foreground">
      <div className="flex items-center justify-between mb-2 flex-wrap gap-1">
        <div className="text-sm font-semibold">{change} · {active.filter(Boolean).length}/5 stages run</div>
        <div className="flex gap-1">
          {ORDER.map((c) => (
            <button key={c} onClick={() => setIntChange(c)} disabled={ctl !== undefined}
              className={`px-1.5 py-0.5 rounded text-[9px] ${change === c ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-accent"}`}>{c}</button>
          ))}
        </div>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto bg-[#0b1228] rounded-md" role="img" aria-label="Browser rendering pipeline">
        {STAGES.map((s, i) => {
          const x = startX + i * (boxW + gap);
          const on = active[i];
          const color = !on ? "#334155" : i === 0 ? "#38bdf8" : i === STAGES.length - 1 ? "#4ade80" : "#fbbf24";
          return (
            <g key={s} opacity={on ? 1 : 0.35}>
              <rect x={x} y={y} width={boxW} height={44} rx={5} fill="#0e1a3a" stroke={color} strokeWidth={on ? 1.8 : 1} />
              <text x={x + boxW / 2} y={y + 21} fill="#e5e9f5" fontSize="10" textAnchor="middle" fontWeight="bold">{s}</text>
              <text x={x + boxW / 2} y={y + 35} fill={color} fontSize="7.5" textAnchor="middle">{on ? "runs" : "skipped"}</text>
              {i < STAGES.length - 1 && (
                <line x1={x + boxW} y1={y + 22} x2={x + boxW + gap} y2={y + 22} stroke={active[i + 1] ? "#64748b" : "#334155"} strokeWidth={1} markerEnd="url(#rpA)" />
              )}
            </g>
          );
        })}
        <defs>
          <marker id="rpA" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 Z" fill="#64748b" /></marker>
        </defs>
        <text x={W / 2} y={56} fill="#9aa3b8" fontSize="9" textAnchor="middle">changing: <tspan fill="#e5e9f5">{meta.prop}</tspan></text>
        <rect x={40} y={172} width={W - 80} height={36} rx={5} fill="#111a33" />
        <text x={W / 2} y={194} fill="#e5e9f5" fontSize="9" textAnchor="middle">{meta.cost}</text>
        <text x={W / 2} y={240} fill="#9aa3b8" fontSize="8" textAnchor="middle">a skipped Layout (reflow avoided) is the single biggest rendering win</text>
      </svg>

      <div className="mt-1 text-[10px] text-muted-foreground">
        Every visual update flows <b>JS → Style → Layout → Paint →
        Composite</b>, but the browser only re-runs the stages your change
        invalidates. Touching geometry (<b>width</b>, <b>top</b>) forces a
        <b> reflow</b> (relayout); a color change forces a <b>repaint</b> but
        skips layout; <b>transform</b> and <b>opacity</b> can be composited on
        the GPU alone. Animating the cheap properties is how you hold 60fps —
        the practical lesson behind the <b>performance budget</b>.
      </div>
    </div>
  );
}
