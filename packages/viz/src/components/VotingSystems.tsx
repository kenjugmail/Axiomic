import { useMemo, useState } from "react";

// Interactive comparison of voting systems on a fixed multi-candidate
// election. Voters rank 4 candidates; choose a tally method:
//   FPTP — only first preferences count; classic spoiler dynamics
//   IRV/RCV — iteratively eliminate the lowest first-preference candidate
//   Borda — points by rank position
//   Condorcet — pairwise majority winner (if exists; else cycle)
//   Approval — any candidate above a per-voter threshold
// Drag the voter-block sizes; see how the winner changes. Demonstrates
// Arrow's impossibility, Condorcet paradox, and Duverger's law.

const W = 460;
const H = 320;

type Candidate = "A" | "B" | "C" | "D";
const CANDS: Candidate[] = ["A", "B", "C", "D"];
const CAND_COLORS: Record<Candidate, string> = {
  A: "#ff6b6b",
  B: "#4ecdc4",
  C: "#fbbf24",
  D: "#a78bfa",
};

// 5 voter blocks with preorderings (each block votes identically)
type Block = { id: string; size: number; pref: Candidate[] };

const INITIAL_BLOCKS: Block[] = [
  { id: "left", size: 35, pref: ["A", "B", "C", "D"] },
  { id: "center-left", size: 20, pref: ["B", "A", "C", "D"] },
  { id: "center", size: 15, pref: ["B", "C", "A", "D"] },
  { id: "center-right", size: 15, pref: ["C", "B", "D", "A"] },
  { id: "right", size: 15, pref: ["D", "C", "B", "A"] },
];

type Method = "fptp" | "irv" | "borda" | "condorcet" | "approval";

const METHODS: Array<{ id: Method; label: string }> = [
  { id: "fptp", label: "FPTP" },
  { id: "irv", label: "IRV / RCV" },
  { id: "borda", label: "Borda" },
  { id: "condorcet", label: "Condorcet" },
  { id: "approval", label: "Approval (top 2)" },
];

function tallyFPTP(blocks: Block[]) {
  const counts: Record<string, number> = { A: 0, B: 0, C: 0, D: 0 };
  for (const b of blocks) counts[b.pref[0]] += b.size;
  let winner: Candidate = "A";
  let max = -1;
  for (const c of CANDS) if (counts[c] > max) { max = counts[c]; winner = c; }
  return { winner, counts, notes: "winner takes plurality" };
}

function tallyIRV(blocks: Block[]) {
  const remaining = new Set<Candidate>(CANDS);
  const rounds: Array<Record<string, number>> = [];
  while (remaining.size > 1) {
    const counts: Record<string, number> = { A: 0, B: 0, C: 0, D: 0 };
    for (const b of blocks) {
      const top = b.pref.find((c) => remaining.has(c));
      if (top !== undefined) counts[top] += b.size;
    }
    rounds.push({ ...counts });
    const total = Object.values(counts).reduce((s, n) => s + n, 0);
    let leader: Candidate = "A";
    let leadV = -1;
    let trail: Candidate = "A";
    let trailV = Infinity;
    for (const c of remaining) {
      if (counts[c] > leadV) { leadV = counts[c]; leader = c; }
      if (counts[c] < trailV) { trailV = counts[c]; trail = c; }
    }
    if (leadV > total / 2) return { winner: leader, counts, rounds, notes: `majority in round ${rounds.length}` };
    remaining.delete(trail);
  }
  const winner = Array.from(remaining)[0];
  return { winner, counts: rounds[rounds.length - 1] ?? {}, rounds, notes: `${rounds.length} elimination rounds` };
}

function tallyBorda(blocks: Block[]) {
  const counts: Record<string, number> = { A: 0, B: 0, C: 0, D: 0 };
  const N = CANDS.length;
  for (const b of blocks) {
    for (let i = 0; i < N; i++) {
      counts[b.pref[i]] += b.size * (N - 1 - i);
    }
  }
  let winner: Candidate = "A";
  let max = -1;
  for (const c of CANDS) if (counts[c] > max) { max = counts[c]; winner = c; }
  return { winner, counts, notes: "points = sum of (N-1-rank)" };
}

function tallyCondorcet(blocks: Block[]) {
  const wins: Record<string, number> = { A: 0, B: 0, C: 0, D: 0 };
  for (let i = 0; i < CANDS.length; i++) {
    for (let j = i + 1; j < CANDS.length; j++) {
      const a = CANDS[i];
      const b = CANDS[j];
      let aOver = 0;
      let bOver = 0;
      for (const block of blocks) {
        const ai = block.pref.indexOf(a);
        const bi = block.pref.indexOf(b);
        if (ai < bi) aOver += block.size; else bOver += block.size;
      }
      if (aOver > bOver) wins[a] += 1;
      else if (bOver > aOver) wins[b] += 1;
    }
  }
  let winner: Candidate = "A";
  let max = -1;
  let tie = false;
  for (const c of CANDS) {
    if (wins[c] > max) { max = wins[c]; winner = c; tie = false; }
    else if (wins[c] === max && wins[c] === CANDS.length - 1) tie = true;
  }
  return { winner: tie ? ("—" as Candidate) : winner, counts: wins, notes: tie ? "Condorcet paradox (cycle)" : `${max}/${CANDS.length - 1} pairwise wins` };
}

function tallyApproval(blocks: Block[]) {
  // Each voter approves their top 2
  const counts: Record<string, number> = { A: 0, B: 0, C: 0, D: 0 };
  for (const b of blocks) {
    counts[b.pref[0]] += b.size;
    counts[b.pref[1]] += b.size;
  }
  let winner: Candidate = "A";
  let max = -1;
  for (const c of CANDS) if (counts[c] > max) { max = counts[c]; winner = c; }
  return { winner, counts, notes: "approve top 2 preferences" };
}

interface Props {
  method?: Method;
}

export function VotingSystems({ method: ctlMethod }: Props = {}) {
  const [blocks, setBlocks] = useState<Block[]>(INITIAL_BLOCKS);
  const [method, setMethod] = useState<Method>("fptp");
  const effective = ctlMethod ?? method;

  const totalVotes = blocks.reduce((s, b) => s + b.size, 0);

  const results = useMemo(() => {
    switch (effective) {
      case "fptp": return tallyFPTP(blocks);
      case "irv": return tallyIRV(blocks);
      case "borda": return tallyBorda(blocks);
      case "condorcet": return tallyCondorcet(blocks);
      case "approval": return tallyApproval(blocks);
    }
  }, [blocks, effective]);

  const maxCount = Math.max(1, ...Object.values(results.counts ?? {}).map((n) => Number(n)));

  return (
    <div className="my-4 p-3 rounded-lg border border-border bg-card text-card-foreground">
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-semibold">Voting · {METHODS.find((m) => m.id === effective)?.label} · winner <span style={{ color: (CAND_COLORS as Record<string, string>)[results.winner as string] ?? "#ff6b6b" }}>{results.winner}</span> · {results.notes}</div>
      </div>
      <div className="mb-2 flex flex-wrap gap-1 text-[10px]">
        {METHODS.map((m) => (
          <button key={m.id} onClick={() => setMethod(m.id)} disabled={ctlMethod !== undefined} className={`px-2 py-0.5 rounded ${effective === m.id ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-accent"}`}>{m.label}</button>
        ))}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto bg-[#0b1228] rounded-md" role="img" aria-label="Voting tally">
        <text x={20} y={20} fill="#cbd1e6" fontSize="10">Tally</text>
        {CANDS.map((c, i) => {
          const value = Number(results.counts?.[c] ?? 0);
          const w = (value / maxCount) * (W - 100);
          const y = 32 + i * 32;
          return (
            <g key={c}>
              <text x={16} y={y + 14} fill={CAND_COLORS[c]} fontSize="11" fontWeight={600}>{c}</text>
              <rect x={32} y={y + 4} width={w} height={16} fill={CAND_COLORS[c]} fillOpacity={results.winner === c ? 0.9 : 0.5} />
              <text x={32 + w + 4} y={y + 16} fill="#cbd1e6" fontSize="9">{value}{effective === "fptp" || effective === "approval" || effective === "irv" ? ` (${((value / totalVotes) * 100).toFixed(0)}%)` : ""}</text>
            </g>
          );
        })}
        <text x={20} y={H - 60} fill="#cbd1e6" fontSize="10">{totalVotes} total votes · {blocks.length} blocks</text>
      </svg>

      <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-1 text-[10px]">
        {blocks.map((b) => (
          <label key={b.id} className="block">
            <span className="text-muted-foreground">{b.id}</span> {b.pref.join("&gt;")}: {b.size}
            <input type="range" min={0} max={50} value={b.size} onChange={(e) => {
              setBlocks((bs) => bs.map((x) => x.id === b.id ? { ...x, size: parseInt(e.target.value) } : x));
            }} className="w-full mt-0.5" aria-label={b.id} />
          </label>
        ))}
      </div>
      <div className="mt-2 text-[10px] text-muted-foreground">
        Same ranked ballots, five voting methods, often five different
        winners. Arrow's 1951 impossibility theorem shows no rank-based
        method satisfying universality + non-dictatorship + IIA +
        Pareto exists with ≥ 3 candidates. Gibbard-Satterthwaite (1973,
        1975): every non-dictatorial deterministic rule is manipulable
        (strategic voting). Condorcet paradox: pairwise majorities can
        cycle (A &gt; B, B &gt; C, C &gt; A) even when each voter is
        consistent. Duverger's law (1954): FPTP tends to two-party
        outcomes; PR sustains multi-party systems. Modern alternatives:
        STAR voting, range/score, liquid democracy.
      </div>
    </div>
  );
}
