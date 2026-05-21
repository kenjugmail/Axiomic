import { useMemo, useState } from "react";

// Dynamic-programming sequence alignment matrix. The
// Needleman-Wunsch (global) + Smith-Waterman (local) algorithms
// compute the optimal alignment of two sequences in O(mn) time via
// the recurrence
//   F(i,j) = max( F(i-1,j-1) + s(x_i, y_j),     match/mismatch
//                 F(i-1,j) + gap,               vertical gap
//                 F(i,j-1) + gap,               horizontal gap
//                 0 [local only] )
// We visualize the filled score matrix + the optimal traceback
// for two short DNA sequences. Foundation of bioinformatics; same
// recurrence underlies BLAST seeds, profile HMMs, sequence DB
// search, RNA folding (different scoring), and modern aligners.

const W = 460;
const H = 280;

interface Props {
  seq1?: string;
  seq2?: string;
  match?: number;
  mismatch?: number;
  gap?: number;
  mode?: "global" | "local";
}

function buildMatrix(s1: string, s2: string, match: number, mismatch: number, gap: number, mode: "global" | "local") {
  const m = s1.length;
  const n = s2.length;
  const F: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  // trace: 0=none, 1=diag, 2=up, 3=left
  const T: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  if (mode === "global") {
    for (let i = 1; i <= m; i++) {
      F[i][0] = i * gap;
      T[i][0] = 2;
    }
    for (let j = 1; j <= n; j++) {
      F[0][j] = j * gap;
      T[0][j] = 3;
    }
  }
  let best = { i: m, j: n, v: F[m][n] };
  if (mode === "local") best = { i: 0, j: 0, v: 0 };
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const s = s1[i - 1] === s2[j - 1] ? match : mismatch;
      const diag = F[i - 1][j - 1] + s;
      const up = F[i - 1][j] + gap;
      const left = F[i][j - 1] + gap;
      let v = Math.max(diag, up, left);
      let t = v === diag ? 1 : v === up ? 2 : 3;
      if (mode === "local") {
        if (v < 0) {
          v = 0;
          t = 0;
        }
      }
      F[i][j] = v;
      T[i][j] = t;
      if (mode === "global" && i === m && j === n) best = { i, j, v };
      if (mode === "local" && v > best.v) best = { i, j, v };
    }
  }

  // Traceback
  const path: Array<{ i: number; j: number }> = [];
  let ti = best.i;
  let tj = best.j;
  while (ti > 0 || tj > 0) {
    if (mode === "local" && F[ti][tj] === 0) break;
    path.push({ i: ti, j: tj });
    const t = T[ti][tj];
    if (t === 1) { ti--; tj--; }
    else if (t === 2) { ti--; }
    else if (t === 3) { tj--; }
    else break;
  }
  path.push({ i: ti, j: tj });
  path.reverse();
  return { F, T, best, path };
}

export function AlignmentMatrix({ seq1: ctlS1, seq2: ctlS2, match: ctlM, mismatch: ctlMM, gap: ctlG, mode: ctlMode }: Props = {}) {
  const [intS1, setIntS1] = useState("GATTACA");
  const [intS2, setIntS2] = useState("GCATGCU");
  const [intMatch, setIntMatch] = useState(1);
  const [intMismatch, setIntMismatch] = useState(-1);
  const [intGap, setIntGap] = useState(-2);
  const [intMode, setIntMode] = useState<"global" | "local">("global");

  const s1 = (ctlS1 ?? intS1).toUpperCase().slice(0, 12);
  const s2 = (ctlS2 ?? intS2).toUpperCase().slice(0, 12);
  const match = ctlM ?? intMatch;
  const mismatch = ctlMM ?? intMismatch;
  const gap = ctlG ?? intGap;
  const mode = ctlMode ?? intMode;

  const { F, best, path } = useMemo(() => buildMatrix(s1, s2, match, mismatch, gap, mode), [s1, s2, match, mismatch, gap, mode]);

  const cellW = (W - 60) / (s2.length + 1);
  const cellH = (H - 60) / (s1.length + 1);
  const baseX = 50;
  const baseY = 40;

  const inPath = new Set(path.map((p) => `${p.i},${p.j}`));

  // Score color: gradient from cool (low) to warm (high)
  const allScores = F.flat();
  const minS = Math.min(...allScores);
  const maxS = Math.max(...allScores);
  const colorFor = (v: number) => {
    if (maxS === minS) return "#1f2937";
    const t = (v - minS) / (maxS - minS);
    const r = Math.round(20 + t * 200);
    const g = Math.round(40 + (1 - Math.abs(t - 0.5) * 2) * 120);
    const b = Math.round(200 - t * 180);
    return `rgb(${r},${g},${b})`;
  };

  return (
    <div className="my-4 p-3 rounded-lg border border-border bg-card text-card-foreground">
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-semibold">{mode === "global" ? "Needleman-Wunsch (global)" : "Smith-Waterman (local)"} · best {best.v}</div>
        <div className="flex gap-1">
          {(["global", "local"] as const).map((m) => (
            <button key={m} onClick={() => setIntMode(m)} disabled={ctlMode !== undefined} className={`px-2 py-0.5 rounded text-[10px] ${mode === m ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-accent"}`}>{m}</button>
          ))}
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto bg-[#0b1228] rounded-md" role="img" aria-label="Sequence alignment matrix">
        {/* Header row (s2) */}
        <text x={baseX - 8} y={baseY - 18} fill="#9aa3b8" fontSize="9" textAnchor="end">s1↓ s2→</text>
        <text x={baseX + cellW / 2} y={baseY - 4} fill="#cbd1e6" fontSize="10" textAnchor="middle">∅</text>
        {s2.split("").map((c, j) => (
          <text key={`h-${j}`} x={baseX + (j + 1.5) * cellW} y={baseY - 4} fill="#cbd1e6" fontSize="10" textAnchor="middle">{c}</text>
        ))}
        {/* Header col (s1) */}
        <text x={baseX - 8} y={baseY + cellH / 2 + 3} fill="#cbd1e6" fontSize="10" textAnchor="end">∅</text>
        {s1.split("").map((c, i) => (
          <text key={`v-${i}`} x={baseX - 8} y={baseY + (i + 1.5) * cellH + 3} fill="#cbd1e6" fontSize="10" textAnchor="end">{c}</text>
        ))}
        {/* Cells */}
        {F.map((row, i) => row.map((v, j) => (
          <g key={`c-${i}-${j}`}>
            <rect x={baseX + j * cellW} y={baseY + i * cellH} width={cellW - 1} height={cellH - 1} fill={colorFor(v)} stroke={inPath.has(`${i},${j}`) ? "#ffd166" : "#0b1228"} strokeWidth={inPath.has(`${i},${j}`) ? 2 : 0.5} />
            <text x={baseX + j * cellW + cellW / 2} y={baseY + i * cellH + cellH / 2 + 3} fill="#fff" fontSize="9" textAnchor="middle" fontWeight={inPath.has(`${i},${j}`) ? "bold" : "normal"}>{v}</text>
          </g>
        )))}
      </svg>

      <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
        <label className="block">s1: <input type="text" value={s1} onChange={(e) => setIntS1(e.target.value)} disabled={ctlS1 !== undefined} className="ml-1 px-1 py-0.5 rounded bg-muted text-foreground text-xs w-24 font-mono" maxLength={12} /></label>
        <label className="block">s2: <input type="text" value={s2} onChange={(e) => setIntS2(e.target.value)} disabled={ctlS2 !== undefined} className="ml-1 px-1 py-0.5 rounded bg-muted text-foreground text-xs w-24 font-mono" maxLength={12} /></label>
        <label className="block">Match: {match}
          <input type="range" min={1} max={5} step={1} value={match} onChange={(e) => setIntMatch(parseInt(e.target.value))} disabled={ctlM !== undefined} className="w-full mt-0.5" aria-label="Match score" /></label>
        <label className="block">Mismatch: {mismatch}
          <input type="range" min={-5} max={0} step={1} value={mismatch} onChange={(e) => setIntMismatch(parseInt(e.target.value))} disabled={ctlMM !== undefined} className="w-full mt-0.5" aria-label="Mismatch score" /></label>
        <label className="block col-span-2">Gap penalty: {gap}
          <input type="range" min={-5} max={0} step={1} value={gap} onChange={(e) => setIntGap(parseInt(e.target.value))} disabled={ctlG !== undefined} className="w-full mt-0.5" aria-label="Gap penalty" /></label>
      </div>
      <div className="mt-2 text-[10px] text-muted-foreground">
        O(mn) dynamic-programming alignment. Needleman-Wunsch (1970) global:
        align entire sequences end-to-end. Smith-Waterman (1981) local: find
        the best local substring match by clamping scores at 0. Golden path
        (yellow border) = optimal traceback. Same recurrence underlies BLAST
        seeds, BLOSUM/PAM substitution matrices, profile HMMs, structure +
        Hi-C contact matrices, and many modern transformer-based variants.
      </div>
    </div>
  );
}
