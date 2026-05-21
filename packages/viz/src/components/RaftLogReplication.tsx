import { useMemo, useState } from "react";

// Raft consensus log replication. We render 5 server nodes arranged in
// a circle; one is the leader (gold), the rest are followers (teal). Logs
// are shown beneath each node. Drag the term number + log length;
// nodes step into agreement via AppendEntries RPCs. A simulated partition
// disables one follower; the leader still commits with quorum (3 of 5).

const W = 460;
const H = 320;

interface Props {
  nodes?: number;
  leader?: number;
  logLength?: number;
  partitionedNode?: number | null;
}

export function RaftLogReplication({ nodes: ctlN, leader: ctlL, logLength: ctlLL, partitionedNode: ctlPart }: Props = {}) {
  const [intN, _setIntN] = useState(5);
  const [intL, setIntL] = useState(0);
  const [intLL, setIntLL] = useState(4);
  const [intPart, setIntPart] = useState<number | null>(2);
  const n = ctlN ?? intN;
  const leader = ctlL ?? intL;
  const ll = ctlLL ?? intLL;
  const partitioned = ctlPart !== undefined ? ctlPart : intPart;

  const term = 3;
  const cx = W / 2;
  const cy = 130;
  const R = 95;

  const positions = useMemo(() => {
    const arr: Array<{ x: number; y: number; id: number }> = [];
    for (let i = 0; i < n; i++) {
      const angle = (i / n) * 2 * Math.PI - Math.PI / 2;
      arr.push({ x: cx + R * Math.cos(angle), y: cy + R * Math.sin(angle), id: i });
    }
    return arr;
  }, [n]);

  // Log entries — each follower has up to ll entries; partitioned node has fewer
  const logs = useMemo(() => {
    return positions.map((p) => {
      if (p.id === partitioned) return Array(Math.max(0, ll - 2)).fill(0).map((_, j) => ({ term: term, value: `x=${j + 1}`, committed: false }));
      return Array(ll).fill(0).map((_, j) => ({ term: term, value: `x=${j + 1}`, committed: j < ll - 1 }));
    });
  }, [positions, ll, partitioned]);

  // Quorum check: leader commits entry j if a majority have it (excluding partitioned)
  const quorum = Math.floor(n / 2) + 1;

  return (
    <div className="my-4 p-3 rounded-lg border border-border bg-card text-card-foreground">
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-semibold">Raft · term {term} · leader = N{leader} · quorum {quorum}/{n} · {partitioned !== null ? `N${partitioned} partitioned` : "all connected"}</div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto bg-[#0b1228] rounded-md" role="img" aria-label="Raft replication">
        {/* RPC arrows from leader to followers */}
        {positions.map((p) => {
          if (p.id === leader) return null;
          const partition = p.id === partitioned;
          const lp = positions[leader];
          return (
            <line key={`rpc-${p.id}`} x1={lp.x} y1={lp.y} x2={p.x} y2={p.y} stroke={partition ? "#ff6b6b" : "#475569"} strokeWidth={partition ? 1 : 0.8} strokeDasharray={partition ? "4,3" : "0"} opacity={partition ? 0.5 : 0.7} />
          );
        })}
        {/* Nodes */}
        {positions.map((p) => {
          const isLeader = p.id === leader;
          const isPart = p.id === partitioned;
          return (
            <g key={`n-${p.id}`}>
              <circle cx={p.x} cy={p.y} r={20} fill={isLeader ? "#fbbf24" : "#4ecdc4"} stroke="#0b1228" strokeWidth={2} opacity={isPart ? 0.4 : 1} />
              <text x={p.x} y={p.y - 2} fill="#000" fontSize="10" textAnchor="middle" fontWeight="bold">N{p.id}</text>
              <text x={p.x} y={p.y + 9} fill="#000" fontSize="7" textAnchor="middle">{isLeader ? "leader" : isPart ? "off" : "follower"}</text>
            </g>
          );
        })}
        {/* Log entries beneath each node */}
        {positions.map((p, i) => (
          <g key={`log-${i}`} transform={`translate(${p.x - 35}, ${p.y + 28})`}>
            {logs[i].slice(0, 5).map((entry, j) => (
              <g key={`e-${j}`}>
                <rect x={j * 14} y={0} width={12} height={11} fill={entry.committed ? "#4ecdc4" : "#1f2937"} stroke={entry.committed ? "#4ecdc4" : "#475569"} strokeWidth={0.6} />
                <text x={j * 14 + 6} y={8} fill={entry.committed ? "#000" : "#cbd1e6"} fontSize="5.5" textAnchor="middle">{entry.term}</text>
              </g>
            ))}
          </g>
        ))}
        {/* Legend */}
        <g transform={`translate(20, ${H - 50})`}>
          <rect x={0} y={0} width={11} height={11} fill="#4ecdc4" />
          <text x={16} y={9} fill="#cbd1e6" fontSize="8">committed</text>
          <rect x={90} y={0} width={11} height={11} fill="#1f2937" stroke="#475569" strokeWidth={0.6} />
          <text x={106} y={9} fill="#cbd1e6" fontSize="8">pending</text>
          <text x={170} y={9} fill="#fbbf24" fontSize="8">● leader</text>
          <text x={240} y={9} fill="#4ecdc4" fontSize="8">● follower</text>
          <text x={320} y={9} fill="#ff6b6b" fontSize="8">--- partition</text>
        </g>
      </svg>

      <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
        <label className="block">Leader: N{leader}
          <input type="range" min={0} max={n - 1} step={1} value={leader} onChange={(e) => setIntL(parseInt(e.target.value))} disabled={ctlL !== undefined} className="w-full mt-0.5" aria-label="Leader node" />
        </label>
        <label className="block">Log length: {ll}
          <input type="range" min={1} max={5} step={1} value={ll} onChange={(e) => setIntLL(parseInt(e.target.value))} disabled={ctlLL !== undefined} className="w-full mt-0.5" aria-label="Log length" />
        </label>
        <label className="block col-span-2">Partitioned node: {partitioned === null ? "none" : `N${partitioned}`}
          <input type="range" min={-1} max={n - 1} step={1} value={partitioned ?? -1} onChange={(e) => setIntPart(parseInt(e.target.value) === -1 ? null : parseInt(e.target.value))} disabled={ctlPart !== undefined} className="w-full mt-0.5" aria-label="Partitioned node" />
        </label>
      </div>
      <div className="mt-2 text-[10px] text-muted-foreground">
        Raft (Ongaro-Ousterhout 2014) — leader-based consensus designed
        for understandability vs Multi-Paxos. Leader replicates log
        entries to followers via AppendEntries RPCs; an entry commits
        when stored on a majority (quorum ⌊n/2⌋+1). With n=5, 1
        partitioned node is fine: 4 connected nodes form a quorum.
        With 2 down, only 3 left — still quorum. With 3 down, no
        progress (safety preserved over liveness — FLP). On leader
        failure, candidates election in next term using RequestVote
        RPCs. Used in etcd, Consul, CockroachDB, MongoDB, RethinkDB.
      </div>
    </div>
  );
}
