import { useState } from "react";

// B-Tree vs LSM-Tree storage engines. A B-tree updates pages in place:
// reads follow the tree height (low read amplification) but updates do
// random page writes (write amplification) — this powers most SQL engines
// (PostgreSQL, MySQL/InnoDB, SQLite). An LSM-tree buffers writes in an
// in-memory memtable, flushes immutable sorted SSTables, and merges them
// with background compaction: writes are sequential and fast, but a read
// may probe several levels (read amplification, mitigated by Bloom filters)
// and obsolete keys linger until compaction (space amplification) — this
// powers RocksDB, LevelDB, Cassandra, and HBase. The RUM conjecture
// (Athanassoulis et al., 2016) formalizes that you cannot minimize Read,
// Update, and Memory overhead simultaneously.

const W = 480;
const H = 366;

type Engine = "btree" | "lsm";

const AMP: Record<Engine, { read: number; write: number; space: number }> = {
  btree: { read: 1.1, write: 8, space: 1.3 },
  lsm: { read: 4, write: 20, space: 1.8 },
};

interface Props {
  engine?: Engine;
}

export function BtreeVsLsm({ engine: ctl }: Props = {}) {
  const [intEng, setIntEng] = useState<Engine>("btree");
  const [readPct, setReadPct] = useState(50);
  const eng = ctl ?? intEng;
  const amp = AMP[eng];

  const verdict =
    readPct >= 65
      ? "Read-heavy → B-Tree (in-place, low read amp)"
      : readPct <= 35
        ? "Write-heavy → LSM-Tree (sequential writes)"
        : "Mixed workload → measure before choosing";

  const barMaxW = 150;
  const barX = 150;
  const scale = (v: number) => (v / 24) * barMaxW;
  const bars: Array<{ label: string; v: number; color: string }> = [
    { label: "Read amp", v: amp.read, color: "#38bdf8" },
    { label: "Write amp", v: amp.write, color: "#fbbf24" },
    { label: "Space amp", v: amp.space, color: "#a78bfa" },
  ];

  const dim = (forEng: Engine) => (eng === forEng ? 1 : 0.28);

  return (
    <div className="my-4 p-3 rounded-lg border border-border bg-card text-card-foreground">
      <div className="flex items-center justify-between mb-2 flex-wrap gap-1">
        <div className="text-sm font-semibold">{verdict}</div>
        <div className="flex gap-1">
          {(["btree", "lsm"] as Engine[]).map((e) => (
            <button
              key={e}
              onClick={() => setIntEng(e)}
              disabled={ctl !== undefined}
              className={`px-1.5 py-0.5 rounded text-[9px] ${
                eng === e
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted hover:bg-accent"
              }`}
            >
              {e === "btree" ? "B-Tree" : "LSM-Tree"}
            </button>
          ))}
        </div>
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-auto bg-[#0b1228] rounded-md"
        role="img"
        aria-label="B-tree versus LSM-tree storage engine comparison"
      >
        {/* divider */}
        <line x1={W / 2} y1={8} x2={W / 2} y2={196} stroke="#1f2937" strokeWidth={0.5} />

        {/* ---- B-TREE (left) ---- */}
        <g opacity={dim("btree")}>
          <text x={120} y={22} fill="#cbd1e6" fontSize="10" textAnchor="middle" fontWeight="bold">B-Tree (update in place)</text>
          <rect x={84} y={34} width={72} height={20} rx={3} fill="#0e1a3a" stroke="#38bdf8" strokeWidth={1} />
          <text x={120} y={48} fill="#e5e9f5" fontSize="9" textAnchor="middle">45 · 78</text>
          {/* children */}
          {[{ x: 26, t: "12 · 30" }, { x: 96, t: "60 · 71" }, { x: 166, t: "85 · 92" }].map((c) => (
            <g key={c.x}>
              <line x1={120} y1={54} x2={c.x + 30} y2={92} stroke="#334155" strokeWidth={0.7} />
              <rect x={c.x} y={92} width={60} height={18} rx={3} fill="#0e1a3a" stroke="#38bdf8" strokeWidth={0.8} />
              <text x={c.x + 30} y={105} fill="#cbd1e6" fontSize="8" textAnchor="middle">{c.t}</text>
            </g>
          ))}
          <text x={120} y={138} fill="#fbbf24" fontSize="8" textAnchor="middle">a full node SPLITS → random page write</text>
          <text x={120} y={154} fill="#9aa3b8" fontSize="7.5" textAnchor="middle">lookup = O(log n) page reads, height ≈ 3-4</text>
          <text x={120} y={170} fill="#9aa3b8" fontSize="7.5" textAnchor="middle">point read touches ONE leaf</text>
        </g>

        {/* ---- LSM-TREE (right) ---- */}
        <g opacity={dim("lsm")}>
          <text x={360} y={22} fill="#cbd1e6" fontSize="10" textAnchor="middle" fontWeight="bold">LSM-Tree (log-structured)</text>
          <rect x={312} y={32} width={96} height={18} rx={3} fill="#1a2e1a" stroke="#4ade80" strokeWidth={1} />
          <text x={360} y={45} fill="#e5e9f5" fontSize="8" textAnchor="middle">memtable (RAM)</text>
          <line x1={360} y1={50} x2={360} y2={62} stroke="#4ade80" strokeWidth={0.8} markerEnd="url(#lsmArrow)" />
          <text x={416} y={60} fill="#9aa3b8" fontSize="7" textAnchor="end">flush ↓</text>
          {/* L0 */}
          {[300, 360].map((x) => (
            <rect key={x} x={x} y={64} width={48} height={14} rx={2} fill="#0e1a3a" stroke="#64748b" strokeWidth={0.7} />
          ))}
          <text x={264} y={75} fill="#9aa3b8" fontSize="7.5" textAnchor="end">L0</text>
          {/* L1 */}
          {[286, 336, 386].map((x) => (
            <rect key={x} x={x} y={92} width={44} height={14} rx={2} fill="#0e1a3a" stroke="#64748b" strokeWidth={0.7} />
          ))}
          <text x={264} y={103} fill="#9aa3b8" fontSize="7.5" textAnchor="end">L1</text>
          <line x1={324} y1={78} x2={324} y2={90} stroke="#fbbf24" strokeWidth={0.8} />
          <line x1={384} y1={78} x2={384} y2={90} stroke="#fbbf24" strokeWidth={0.8} />
          <text x={360} y={124} fill="#fbbf24" fontSize="8" textAnchor="middle">compaction MERGES SSTables (sequential)</text>
          <text x={360} y={140} fill="#9aa3b8" fontSize="7.5" textAnchor="middle">a read may probe every level…</text>
          <text x={360} y={156} fill="#9aa3b8" fontSize="7.5" textAnchor="middle">…Bloom filters skip levels that lack the key</text>
          <text x={360} y={172} fill="#9aa3b8" fontSize="7.5" textAnchor="middle">obsolete keys linger until compaction</text>
        </g>

        <defs>
          <marker id="lsmArrow" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto">
            <path d="M0,0 L6,3 L0,6 Z" fill="#4ade80" />
          </marker>
        </defs>

        {/* ---- amplification bars (selected engine) ---- */}
        <line x1={8} y1={204} x2={W - 8} y2={204} stroke="#1f2937" strokeWidth={0.5} />
        <text x={12} y={222} fill="#cbd1e6" fontSize="9.5" fontWeight="bold">
          {eng === "btree" ? "B-Tree" : "LSM-Tree"} amplification (×, lower is better)
        </text>
        {bars.map((b, i) => {
          const y = 238 + i * 34;
          return (
            <g key={b.label}>
              <text x={12} y={y + 11} fill="#9aa3b8" fontSize="9">{b.label}</text>
              <rect x={barX} y={y} width={barMaxW} height={14} fill="#111a33" rx={2} />
              <rect x={barX} y={y} width={scale(b.v)} height={14} fill={b.color} rx={2} />
              <text x={barX + scale(b.v) + 5} y={y + 11} fill="#e5e9f5" fontSize="9">{b.v}×</text>
            </g>
          );
        })}
      </svg>

      <div className="mt-2 text-xs">
        <label className="block">
          workload mix: {readPct}% reads / {100 - readPct}% writes
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={readPct}
            onChange={(e) => setReadPct(parseInt(e.target.value))}
            className="w-full mt-0.5"
            aria-label="Read/write workload mix"
          />
        </label>
      </div>
      <div className="mt-1 text-[10px] text-muted-foreground">
        A <b>B-tree</b> mutates pages in place — cheap point reads (one leaf,
        height ≈ 3–4) but random write I/O and node splits. An <b>LSM-tree</b>
        turns writes into sequential SSTable flushes from a memtable, then
        pays it back as <b>read amplification</b> (probing levels, softened by
        Bloom filters) and <b>space amplification</b> (obsolete keys until
        compaction). The <b>RUM conjecture</b> (Athanassoulis et al., 2016)
        says Read, Update, and Memory overheads trade off — you pick two.
        SQL engines lean B-tree; RocksDB, LevelDB, Cassandra lean LSM.
      </div>
    </div>
  );
}
