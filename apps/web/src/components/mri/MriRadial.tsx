// Sprint 33 — Knowledge MRI radial summary.
//
// Small SVG donut: one wedge per mastery path, fill % = mastered /
// total. A red rim tick appears on a wedge that has any active
// misconceptions. No D3 dep — straight SVG arcs.

import type { KnowledgeMriPath } from "@axiomic/types";

interface Props {
  paths: KnowledgeMriPath[];
  size?: number;
}

const SIZE = 160;
const STROKE = 18;

function polar(cx: number, cy: number, r: number, deg: number) {
  const rad = (deg - 90) * (Math.PI / 180);
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function arcPath(
  cx: number,
  cy: number,
  r: number,
  startDeg: number,
  endDeg: number,
): string {
  const start = polar(cx, cy, r, startDeg);
  const end = polar(cx, cy, r, endDeg);
  const large = endDeg - startDeg > 180 ? 1 : 0;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${large} 1 ${end.x} ${end.y}`;
}

export function MriRadial({ paths, size = SIZE }: Props) {
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - STROKE / 2;
  const visible = paths.filter((p) => p.nodes.length > 0);
  if (visible.length === 0) {
    return (
      <div
        className="flex items-center justify-center text-xs text-muted-foreground"
        style={{ width: size, height: size }}
      >
        No data
      </div>
    );
  }

  // Each path gets an equal-sized wedge of the circle. Fill is a ring
  // segment whose length encodes mastered/total.
  const segDeg = 360 / visible.length;
  const totalMastered = visible.reduce(
    (s, p) => s + p.summary.completedNodes,
    0,
  );
  const totalNodes = visible.reduce((s, p) => s + p.summary.totalNodes, 0);
  const overallPct =
    totalNodes > 0 ? Math.round((totalMastered / totalNodes) * 100) : 0;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className="shrink-0"
    >
      {/* Background ring */}
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill="none"
        stroke="currentColor"
        strokeWidth={STROKE}
        className="text-muted opacity-30"
      />
      {visible.map((p, i) => {
        const start = i * segDeg;
        const end = start + segDeg;
        const fillPct =
          p.summary.totalNodes > 0
            ? p.summary.completedNodes / p.summary.totalNodes
            : 0;
        const fillEnd = start + segDeg * fillPct;
        const hasMisconceptions = p.summary.activeDiagnoses > 0;
        const tickPos = polar(cx, cy, r + STROKE / 2 + 3, start + segDeg / 2);
        return (
          <g key={p.slug}>
            {fillPct > 0 && (
              <path
                d={arcPath(cx, cy, r, start + 1, Math.max(start + 1.1, fillEnd - 1))}
                fill="none"
                stroke="currentColor"
                strokeWidth={STROKE}
                strokeLinecap="butt"
                className="text-emerald-500/80 dark:text-emerald-400/80"
              >
                <title>
                  {p.title}: {p.summary.completedNodes}/{p.summary.totalNodes}
                </title>
              </path>
            )}
            {hasMisconceptions && (
              <circle
                cx={tickPos.x}
                cy={tickPos.y}
                r={2.5}
                className="fill-rose-500"
              >
                <title>
                  {p.title}: {p.summary.activeDiagnoses} active misconception
                  {p.summary.activeDiagnoses === 1 ? "" : "s"}
                </title>
              </circle>
            )}
          </g>
        );
      })}
      {/* Center label */}
      <text
        x={cx}
        y={cy - 4}
        textAnchor="middle"
        className="fill-foreground text-2xl font-semibold"
      >
        {overallPct}%
      </text>
      <text
        x={cx}
        y={cy + 14}
        textAnchor="middle"
        className="fill-muted-foreground text-[10px] uppercase tracking-wider"
      >
        mastered
      </text>
    </svg>
  );
}
