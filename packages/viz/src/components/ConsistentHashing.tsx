import { useMemo, useState } from "react";

// Consistent hashing — how distributed caches and databases (Amazon Dynamo,
// Cassandra, memcached clients) shard keys across nodes while staying stable
// as the cluster changes. Servers and keys are hashed onto a ring; a key is
// owned by the first server clockwise. Adding or removing a server remaps
// only ≈ 1/N of the keys (its arc), not all of them — unlike plain
// "hash mod N", which reshuffles almost everything. VIRTUAL NODES (several
// ring positions per server) even out what would otherwise be lumpy arcs.

const W = 460;
const H = 320;
const COLORS = ["#38bdf8", "#fbbf24", "#4ade80", "#a78bfa", "#f472b6"];
const KEYS = 12;

function hashAngle(seed: number): number {
  let x = ((seed + 1) * 2654435761) >>> 0;
  x ^= x >>> 15; x = (x * 2246822519) >>> 0; x ^= x >>> 13;
  return (x % 3600) / 10; // 0..360
}

const PRESETS = [
  { label: "3 nodes", n: 3 },
  { label: "4 nodes", n: 4 },
  { label: "5 nodes", n: 5 },
];

interface Props {
  servers?: number;
}

export function ConsistentHashing({ servers: ctl }: Props = {}) {
  const [intN, setIntN] = useState(3);
  const [vnodes, setVnodes] = useState(1);
  const n = ctl ?? intN;

  const cx = 175, cy = 172, r = 120;
  const pt = (ang: number, rad: number) => {
    const a = ((ang - 90) * Math.PI) / 180;
    return [cx + rad * Math.cos(a), cy + rad * Math.sin(a)] as const;
  };

  const { vnodeList, keyOwners, load } = useMemo(() => {
    const vnodeList: { server: number; ang: number }[] = [];
    for (let s = 0; s < n; s++) for (let j = 0; j < vnodes; j++) vnodeList.push({ server: s, ang: hashAngle(s * 131 + j * 977) });
    const keyOwners: { ang: number; server: number }[] = [];
    const load = new Array(n).fill(0);
    for (let k = 0; k < KEYS; k++) {
      const ka = hashAngle(10007 + k * 313);
      let best = -1, bestDist = 999;
      for (const v of vnodeList) {
        const d = (v.ang - ka + 360) % 360;
        if (d < bestDist) { bestDist = d; best = v.server; }
      }
      keyOwners.push({ ang: ka, server: best });
      if (best >= 0) load[best]++;
    }
    return { vnodeList, keyOwners, load };
  }, [n, vnodes]);

  const maxLoad = Math.max(...load), minLoad = Math.min(...load);
  const balance = maxLoad === 0 ? "—" : `${minLoad}–${maxLoad} keys/node`;

  return (
    <div className="my-4 p-3 rounded-lg border border-border bg-card text-card-foreground">
      <div className="flex items-center justify-between mb-2 flex-wrap gap-1">
        <div className="text-sm font-semibold">{n} nodes × {vnodes} vnode{vnodes > 1 ? "s" : ""} · load {balance}</div>
        <div className="flex gap-1">
          {PRESETS.map((p) => (
            <button key={p.label} onClick={() => setIntN(p.n)} disabled={ctl !== undefined}
              className={`px-1.5 py-0.5 rounded text-[9px] ${n === p.n ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-accent"}`}>{p.label}</button>
          ))}
        </div>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto bg-[#0b1228] rounded-md" role="img" aria-label="Consistent hashing ring">
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#1f2937" strokeWidth={2} />
        <text x={cx} y={cy - r - 6} fill="#64748b" fontSize="7" textAnchor="middle">0°/hash space</text>

        {/* server vnodes (ticks) */}
        {vnodeList.map((v, i) => {
          const [x1, y1] = pt(v.ang, r - 8);
          const [x2, y2] = pt(v.ang, r + 8);
          return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={COLORS[v.server]} strokeWidth={2.4} />;
        })}

        {/* keys */}
        {keyOwners.map((k, i) => {
          const [x, y] = pt(k.ang, r);
          return <circle key={i} cx={x} cy={y} r={4} fill={COLORS[k.server]} stroke="#0b1228" strokeWidth={0.8} />;
        })}

        {/* center label */}
        <text x={cx} y={cy} fill="#9aa3b8" fontSize="8" textAnchor="middle">key → next</text>
        <text x={cx} y={cy + 12} fill="#9aa3b8" fontSize="8" textAnchor="middle">node ↻</text>

        {/* legend / load */}
        <g transform="translate(320,60)">
          <text x={0} y={0} fill="#cbd1e6" fontSize="9" fontWeight="bold">load per node</text>
          {load.map((c, s) => (
            <g key={s} transform={`translate(0,${14 + s * 22})`}>
              <rect x={0} y={0} width={10} height={10} fill={COLORS[s]} rx={2} />
              <text x={15} y={9} fill="#9aa3b8" fontSize="8">node {s}</text>
              <rect x={50} y={1} width={70} height={8} fill="#111a33" rx={2} />
              <rect x={50} y={1} width={(c / KEYS) * 70} height={8} fill={COLORS[s]} rx={2} />
              <text x={124} y={9} fill="#e5e9f5" fontSize="8">{c}</text>
            </g>
          ))}
        </g>
      </svg>

      <div className="mt-2 text-xs">
        <label className="block">virtual nodes per server: {vnodes}
          <input type="range" min={1} max={8} step={1} value={vnodes} onChange={(e) => setVnodes(parseInt(e.target.value))} className="w-full mt-0.5" aria-label="Virtual nodes per server" />
        </label>
      </div>
      <div className="mt-1 text-[10px] text-muted-foreground">
        Each key is owned by the first server <b>clockwise</b> on the ring, so
        adding or removing a node only reassigns the keys in its arc — about
        <b> 1/N</b> of them — instead of the near-total reshuffle that
        <span className="font-mono"> hash mod N</span> causes. With one point
        per server the arcs are lumpy (uneven load); raising <b>virtual
        nodes</b> scatters each server across many small arcs and evens the
        distribution. This is the partitioning scheme behind Dynamo,
        Cassandra, and consistent-hashing memcached clients.
      </div>
    </div>
  );
}
