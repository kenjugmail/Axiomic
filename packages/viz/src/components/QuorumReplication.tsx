import { useState } from "react";

// Quorum replication. Data is copied to N replicas. A write must be
// acknowledged by W of them and a read must gather R of them. When
// R + W > N the read set and write set are guaranteed to OVERLAP on at
// least one replica, so a read always sees the most recent acknowledged
// write — strong consistency. When R + W ≤ N the sets can miss each other
// and a read may return stale data — the eventual-consistency regime. This
// tunable trade-off (Dynamo, Cassandra) is the operational face of the CAP
// theorem (Eric Brewer, 2000; proved by Gilbert & Lynch, 2002): under a
// network partition you choose consistency or availability.

const W = 480;
const H = 360;

type Preset = "Read-optimized" | "Write-optimized" | "Quorum";
const ORDER: Preset[] = ["Read-optimized", "Write-optimized", "Quorum"];

function rwFor(preset: Preset, n: number): { r: number; w: number } {
  const maj = Math.ceil((n + 1) / 2);
  if (preset === "Read-optimized") return { r: 1, w: n };
  if (preset === "Write-optimized") return { r: n, w: 1 };
  return { r: maj, w: maj };
}

interface Props {
  preset?: Preset;
}

export function QuorumReplication({ preset: ctl }: Props = {}) {
  const [intPreset, setIntPreset] = useState<Preset>("Quorum");
  const [n, setN] = useState(5);
  const sel = ctl ?? intPreset;
  const { r, w } = rwFor(sel, n);
  const strong = r + w > n;

  // write set = first W replicas; read set = last R replicas
  const inWrite = (i: number) => i < w;
  const inRead = (i: number) => i >= n - r;

  const cx = 175;
  const cy = 168;
  const radius = 116;

  return (
    <div className="my-4 p-3 rounded-lg border border-border bg-card text-card-foreground">
      <div className="flex items-center justify-between mb-2 flex-wrap gap-1">
        <div className="text-sm font-semibold">
          N={n} · W={w} · R={r} → R+W={r + w} {strong ? `> N=${n}: strong` : `≤ N=${n}: eventual`}
        </div>
        <div className="flex gap-1">
          {ORDER.map((k) => (
            <button
              key={k}
              onClick={() => setIntPreset(k)}
              disabled={ctl !== undefined}
              className={`px-1.5 py-0.5 rounded text-[9px] ${
                sel === k ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-accent"
              }`}
            >
              {k}
            </button>
          ))}
        </div>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto bg-[#0b1228] rounded-md" role="img" aria-label="Quorum replication overlap">
        {/* ring guideline */}
        <circle cx={cx} cy={cy} r={radius} fill="none" stroke="#1f2937" strokeWidth={0.5} />
        {Array.from({ length: n }).map((_, i) => {
          const ang = (i / n) * 2 * Math.PI - Math.PI / 2;
          const x = cx + radius * Math.cos(ang);
          const y = cy + radius * Math.sin(ang);
          const inW = inWrite(i);
          const inR = inRead(i);
          const both = inW && inR;
          const fill = both ? "#14321f" : inW ? "#3a2a10" : inR ? "#0e1f3a" : "#111a33";
          const stroke = both ? "#4ade80" : inW ? "#fbbf24" : inR ? "#38bdf8" : "#334155";
          return (
            <g key={i}>
              <circle cx={x} cy={y} r={22} fill={fill} stroke={stroke} strokeWidth={both ? 2.2 : 1.3} />
              <text x={x} y={y - 2} fill="#e5e9f5" fontSize="9" textAnchor="middle">R{i}</text>
              <text x={x} y={y + 10} fill={stroke} fontSize="7" textAnchor="middle">
                {both ? "W∩R" : inW ? "W" : inR ? "R" : "—"}
              </text>
            </g>
          );
        })}
        <text x={cx} y={cy + 3} fill={strong ? "#4ade80" : "#f87171"} fontSize="9" textAnchor="middle" fontWeight="bold">
          {strong ? "overlap ✓" : "no overlap"}
        </text>

        {/* legend */}
        <g transform="translate(320,40)">
          <circle cx={8} cy={6} r={7} fill="#3a2a10" stroke="#fbbf24" strokeWidth={1.2} />
          <text x={22} y={9} fill="#9aa3b8" fontSize="8.5">write set (W replicas ack)</text>
          <circle cx={8} cy={30} r={7} fill="#0e1f3a" stroke="#38bdf8" strokeWidth={1.2} />
          <text x={22} y={33} fill="#9aa3b8" fontSize="8.5">read set (R replicas queried)</text>
          <circle cx={8} cy={54} r={7} fill="#14321f" stroke="#4ade80" strokeWidth={1.4} />
          <text x={22} y={57} fill="#9aa3b8" fontSize="8.5">overlap → fresh read</text>
        </g>

        {/* verdict box */}
        <rect x={310} y={120} width={150} height={120} rx={6} fill={strong ? "#14321f" : "#2a1414"} stroke={strong ? "#4ade80" : "#f87171"} strokeWidth={1.2} />
        <text x={385} y={142} fill={strong ? "#4ade80" : "#f87171"} fontSize="10" textAnchor="middle" fontWeight="bold">
          {strong ? "STRONG" : "EVENTUAL"}
        </text>
        <text x={385} y={164} fill="#cbd1e6" fontSize="8" textAnchor="middle">R + W = {r + w}</text>
        <text x={385} y={180} fill="#cbd1e6" fontSize="8" textAnchor="middle">N = {n}</text>
        <text x={320} y={202} fill="#9aa3b8" fontSize="7.5">{strong ? "every read intersects" : "read set can miss"}</text>
        <text x={320} y={216} fill="#9aa3b8" fontSize="7.5">{strong ? "the latest write →" : "the latest write →"}</text>
        <text x={320} y={230} fill="#9aa3b8" fontSize="7.5">{strong ? "no stale reads" : "stale reads possible"}</text>
      </svg>

      <div className="mt-2 text-xs">
        <label className="block">
          replicas N = {n}
          <input type="range" min={3} max={7} step={1} value={n} onChange={(e) => setN(parseInt(e.target.value))} className="w-full mt-0.5" aria-label="Number of replicas" />
        </label>
      </div>
      <div className="mt-1 text-[10px] text-muted-foreground">
        With N replicas, a write needs <b>W</b> acks and a read queries
        <b> R</b>. The key inequality is <b>R + W &gt; N</b>: it forces the
        read and write sets to share a replica, so a read always observes the
        latest acknowledged write (<b>strong consistency</b>). Drop below it
        and you gain availability/latency but risk <b>stale reads</b>
        (<b>eventual consistency</b>). Amazon's <b>Dynamo</b> and
        <b> Cassandra</b> expose R and W per query; this is the operational
        dial behind the <b>CAP theorem</b> (Brewer 2000; Gilbert &amp; Lynch 2002).
      </div>
    </div>
  );
}
