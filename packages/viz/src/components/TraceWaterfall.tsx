import { useState } from "react";

// A distributed-trace waterfall. One request fans out across services; each
// unit of work is a SPAN with a start, duration, and parent. Drawn on a
// shared time axis and nested by parent/child, the waterfall makes latency
// legible: a single long bar is a slow dependency, while a staircase of
// many short sequential bars is the classic "N+1 query" anti-pattern. This
// is the core view of OpenTelemetry / Jaeger / Zipkin tracing — you read
// the critical path straight off the chart.

const W = 460;
const H = 300;

interface Span { op: string; s: number; e: number; depth: number; slow?: boolean; }
interface Scn { maxT: number; spans: Span[]; }

const SCN: Record<string, Scn> = {
  Healthy: {
    maxT: 120,
    spans: [
      { op: "GET /checkout", s: 0, e: 120, depth: 0 },
      { op: "auth", s: 5, e: 25, depth: 1 },
      { op: "cart", s: 25, e: 60, depth: 1 },
      { op: "db.query", s: 30, e: 55, depth: 2 },
      { op: "payment", s: 60, e: 110, depth: 1 },
      { op: "stripe API", s: 65, e: 105, depth: 2 },
    ],
  },
  "Slow DB": {
    maxT: 340,
    spans: [
      { op: "GET /checkout", s: 0, e: 340, depth: 0 },
      { op: "auth", s: 5, e: 25, depth: 1 },
      { op: "cart", s: 25, e: 285, depth: 1 },
      { op: "db.query", s: 30, e: 280, depth: 2, slow: true },
      { op: "payment", s: 285, e: 335, depth: 1 },
    ],
  },
  "N+1 queries": {
    maxT: 320,
    spans: [
      { op: "GET /feed", s: 0, e: 320, depth: 0 },
      { op: "feed-service", s: 5, e: 315, depth: 1 },
      { op: "db.query #1", s: 10, e: 45, depth: 2 },
      { op: "db.query #2", s: 48, e: 83, depth: 2 },
      { op: "db.query #3", s: 86, e: 121, depth: 2 },
      { op: "db.query #4", s: 124, e: 159, depth: 2 },
      { op: "…×20 more", s: 162, e: 315, depth: 2, slow: true },
    ],
  },
};
const ORDER = ["Healthy", "Slow DB", "N+1 queries"];
const DCOLOR = ["#38bdf8", "#fbbf24", "#4ade80"];

interface Props {
  scenario?: string;
}

export function TraceWaterfall({ scenario: ctl }: Props = {}) {
  const [intScn, setIntScn] = useState("Healthy");
  const key = ctl ?? intScn;
  const { maxT, spans } = SCN[key];

  const labelX = 8, plotX0 = 150, plotW = W - 24 - plotX0, top = 54, rowH = 28;
  const px = (t: number) => plotX0 + (t / maxT) * plotW;

  return (
    <div className="my-4 p-3 rounded-lg border border-border bg-card text-card-foreground">
      <div className="flex items-center justify-between mb-2 flex-wrap gap-1">
        <div className="text-sm font-semibold">total {maxT} ms · {spans.length} spans</div>
        <div className="flex gap-1">
          {ORDER.map((s) => (
            <button key={s} onClick={() => setIntScn(s)} disabled={ctl !== undefined}
              className={`px-1.5 py-0.5 rounded text-[9px] ${key === s ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-accent"}`}>{s}</button>
          ))}
        </div>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto bg-[#0b1228] rounded-md" role="img" aria-label="Distributed trace span waterfall">
        {/* time axis */}
        <line x1={plotX0} y1={top - 10} x2={plotX0 + plotW} y2={top - 10} stroke="#334155" strokeWidth={0.6} />
        {[0, 0.25, 0.5, 0.75, 1].map((f) => (
          <g key={f}>
            <line x1={plotX0 + f * plotW} y1={top - 13} x2={plotX0 + f * plotW} y2={top + spans.length * rowH} stroke="#1f2937" strokeWidth={0.3} />
            <text x={plotX0 + f * plotW} y={top - 16} fill="#64748b" fontSize="7" textAnchor="middle">{Math.round(f * maxT)}</text>
          </g>
        ))}
        <text x={plotX0 - 6} y={top - 16} fill="#9aa3b8" fontSize="7.5" textAnchor="end">ms</text>

        {spans.map((sp, i) => {
          const y = top + i * rowH;
          const color = sp.slow ? "#f87171" : DCOLOR[Math.min(sp.depth, 2)];
          const dur = sp.e - sp.s;
          return (
            <g key={i}>
              <text x={labelX + sp.depth * 12} y={y + 12} fill={sp.slow ? "#f87171" : "#cbd1e6"} fontSize="8.5" fontFamily="monospace">{sp.op}</text>
              <rect x={px(sp.s)} y={y + 3} width={Math.max(2, px(sp.e) - px(sp.s))} height={13} rx={2} fill={color} opacity={0.88} />
              <text x={px(sp.e) + 4} y={y + 13} fill="#9aa3b8" fontSize="7.5">{dur}ms</text>
            </g>
          );
        })}
        {SCN[key].spans.some((s) => s.slow) && (
          <text x={W / 2} y={H - 10} fill="#f87171" fontSize="8" textAnchor="middle">
            {key === "Slow DB" ? "one span dominates the critical path → optimize that query" : "many short sequential queries → batch them (fix the N+1)"}
          </text>
        )}
      </svg>

      <div className="mt-1 text-[10px] text-muted-foreground">
        Each <b>span</b> records a unit of work with a start, duration, and
        parent; together they form the request's call tree on a shared clock.
        A single long bar (<b>Slow DB</b>) marks a dependency on the
        <b> critical path</b> — the thing to optimize. A staircase of many
        tiny sequential bars (<b>N+1 queries</b>) is a loop issuing one query
        per item, fixed by batching. <b>OpenTelemetry</b> propagates a trace
        context across service boundaries so Jaeger/Zipkin can stitch the
        waterfall back together.
      </div>
    </div>
  );
}
