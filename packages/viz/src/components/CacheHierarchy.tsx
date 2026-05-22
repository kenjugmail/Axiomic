import { useState } from "react";

// The memory/cache hierarchy. A lookup probes the fastest level first; on a
// miss it falls through to the next, slower-but-larger level, paying each
// level's access latency along the way. Latency grows by orders of
// magnitude down the stack — the "memory wall" that makes caching the
// central trick of systems performance. The same shape recurs in content
// delivery: a request hits the browser cache, then a CDN edge PoP, then the
// origin. Average memory access time (AMAT) = hit_time + miss_rate ×
// miss_penalty, so a high hit ratio near the top dominates performance.

const W = 480;
const H = 348;

interface Level {
  key: string;
  name: string;
  lat: number; // ns
  size: string;
}
const LEVELS: Level[] = [
  { key: "L1", name: "L1 cache", lat: 1, size: "~64 KB" },
  { key: "L2", name: "L2 cache", lat: 4, size: "~512 KB" },
  { key: "L3", name: "L3 cache", lat: 12, size: "~32 MB" },
  { key: "RAM", name: "Main memory (RAM)", lat: 100, size: "~32 GB" },
  { key: "Disk", name: "SSD / origin", lat: 16000, size: "~TB" },
];

interface Props {
  level?: string;
}

export function CacheHierarchy({ level: ctl }: Props = {}) {
  const [intLevel, setIntLevel] = useState("L1");
  const sel = ctl ?? intLevel;
  const hitIdx = Math.max(0, LEVELS.findIndex((l) => l.key === sel));
  const cumulative = LEVELS.slice(0, hitIdx + 1).reduce((a, l) => a + l.lat, 0);
  const best = LEVELS[0].lat;
  const slowdown = (cumulative / best).toFixed(0);

  const rowY = (i: number) => 30 + i * 56;

  return (
    <div className="my-4 p-3 rounded-lg border border-border bg-card text-card-foreground">
      <div className="flex items-center justify-between mb-2 flex-wrap gap-1">
        <div className="text-sm font-semibold">
          found at {LEVELS[hitIdx].name} · {cumulative.toLocaleString()} ns (~{slowdown}× an L1 hit)
        </div>
        <div className="flex gap-1">
          {LEVELS.map((l) => (
            <button
              key={l.key}
              onClick={() => setIntLevel(l.key)}
              disabled={ctl !== undefined}
              className={`px-1.5 py-0.5 rounded text-[9px] ${
                sel === l.key ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-accent"
              }`}
            >
              {l.key}
            </button>
          ))}
        </div>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto bg-[#0b1228] rounded-md" role="img" aria-label="Memory cache hierarchy">
        <text x={28} y={18} fill="#9aa3b8" fontSize="9">request enters at the top, falls through on each miss</text>

        {/* request spine */}
        <line x1={16} y1={26} x2={16} y2={rowY(hitIdx) + 18} stroke="#38bdf8" strokeWidth={1.4} markerEnd="url(#chA)" />

        {LEVELS.map((l, i) => {
          const isHit = i === hitIdx;
          const isMiss = i < hitIdx;
          const idle = i > hitIdx;
          const stroke = isHit ? "#4ade80" : isMiss ? "#fbbf24" : "#334155";
          const widthFrac = 0.42 + i * 0.13; // wider = larger/slower
          const bw = (W - 150) * widthFrac;
          return (
            <g key={l.key} opacity={idle ? 0.4 : 1}>
              <rect x={30} y={rowY(i)} width={bw} height={38} rx={4} fill="#0e1a3a" stroke={stroke} strokeWidth={isHit ? 1.8 : 1} />
              <text x={42} y={rowY(i) + 17} fill="#e5e9f5" fontSize="10" fontWeight="bold">{l.name}</text>
              <text x={42} y={rowY(i) + 31} fill="#9aa3b8" fontSize="8">{l.size} · {l.lat.toLocaleString()} ns</text>
              <text x={30 + bw + 8} y={rowY(i) + 23} fill={stroke} fontSize="9" fontWeight="bold">
                {isHit ? "HIT ✓" : isMiss ? "miss ✗" : ""}
              </text>
              {isMiss && i < LEVELS.length - 1 && (
                <text x={42} y={rowY(i) + 50} fill="#fbbf24" fontSize="7.5">↓ fall through (+{LEVELS[i + 1].lat.toLocaleString()} ns)</text>
              )}
            </g>
          );
        })}

        <defs>
          <marker id="chA" markerWidth="7" markerHeight="7" refX="3.5" refY="6" orient="auto"><path d="M0,0 L7,0 L3.5,7 Z" fill="#38bdf8" /></marker>
        </defs>
      </svg>

      <div className="mt-1 text-[10px] text-muted-foreground">
        Each level is faster but smaller than the one below it; a miss falls
        through and pays the next level's latency. The jump from L3 (~12 ns)
        to RAM (~100 ns) to SSD (~16 µs) is the <b>memory wall</b> — which is
        why a high <b>hit ratio</b> near the top matters so much:
        <b> AMAT = hit_time + miss_rate × miss_penalty</b>. The identical
        pattern drives <b>CDNs</b>: browser cache → edge PoP → origin, where
        an edge hit saves a round-trip across the continent. Maurice Wilkes
        described the cache concept (the "slave memory") in 1965.
      </div>
    </div>
  );
}
