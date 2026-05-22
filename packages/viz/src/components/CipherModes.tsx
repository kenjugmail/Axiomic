import { useState } from "react";

// Block-cipher modes of operation. A block cipher (AES, DES) only encrypts
// one fixed-size block; a "mode" extends it to a message. ECB encrypts each
// block independently, so identical plaintext blocks produce identical
// ciphertext blocks — large-scale structure leaks straight through (the
// infamous "ECB penguin"). CBC XORs each plaintext block with the previous
// ciphertext block (needs a random IV; encryption is sequential). CTR
// encrypts an incrementing counter and XORs it with the plaintext (a stream
// cipher: parallelizable, random-access). Lesson: never use ECB.

const W = 460;
const H = 300;
const N = 16;
const CELL = 8;

// A recognizable plaintext "image" (a face) so the ECB leak is visible.
function isDark(r: number, c: number): boolean {
  const eye = (r >= 4 && r <= 6) && ((c >= 4 && c <= 5) || (c >= 10 && c <= 11));
  const mouth = (r === 11 && c >= 5 && c <= 10) || (r === 12 && (c === 4 || c === 5 || c === 10 || c === 11));
  return eye || mouth;
}
function noise(i: number): number {
  let x = ((i + 1) * 2654435761) >>> 0;
  x ^= x >>> 15;
  x = (x * 2246822519) >>> 0;
  x ^= x >>> 13;
  return x % 256;
}

type Mode = "ECB" | "CBC" | "CTR";
const ORDER: Mode[] = ["ECB", "CBC", "CTR"];
const NOTE: Record<Mode, string> = {
  ECB: "C_i = E(P_i) — identical blocks → identical ciphertext (pattern leaks)",
  CBC: "C_i = E(P_i ⊕ C_{i-1}) — chained via IV; sequential, hides structure",
  CTR: "C_i = P_i ⊕ E(nonce ‖ i) — counter stream; parallel, hides structure",
};

interface Props {
  mode?: Mode;
}

export function CipherModes({ mode: ctl }: Props = {}) {
  const [intMode, setIntMode] = useState<Mode>("ECB");
  const mode = ctl ?? intMode;

  // ciphertext cell shade
  const cipherShade = (r: number, c: number): number => {
    if (mode === "ECB") return isDark(r, c) ? 40 : 205; // 2 fixed blocks → leak
    return noise(r * N + c + (mode === "CBC" ? 0 : 7919)); // random-looking
  };
  const leaks = mode === "ECB";
  const gridX = (gx: number, c: number) => gx + c * CELL;

  const Grid = ({ x, label, shade }: { x: number; label: string; shade: (r: number, c: number) => number }) => (
    <g>
      <text x={x + (N * CELL) / 2} y={36} fill="#cbd1e6" fontSize="9" textAnchor="middle">{label}</text>
      {Array.from({ length: N }).map((_, r) =>
        Array.from({ length: N }).map((__, c) => {
          const v = shade(r, c);
          return <rect key={`${r}-${c}`} x={gridX(x, c)} y={44 + r * CELL} width={CELL} height={CELL} fill={`rgb(${v},${v},${v})`} />;
        }),
      )}
      <rect x={x} y={44} width={N * CELL} height={N * CELL} fill="none" stroke="#334155" strokeWidth={0.8} />
    </g>
  );

  return (
    <div className="my-4 p-3 rounded-lg border border-border bg-card text-card-foreground">
      <div className="flex items-center justify-between mb-2 flex-wrap gap-1">
        <div className="text-sm font-semibold" style={{ color: leaks ? "#f87171" : "#4ade80" }}>
          {mode}: {leaks ? "⚠ plaintext pattern leaks" : "✓ structure hidden"}
        </div>
        <div className="flex gap-1">
          {ORDER.map((m) => (
            <button key={m} onClick={() => setIntMode(m)} disabled={ctl !== undefined}
              className={`px-1.5 py-0.5 rounded text-[9px] ${mode === m ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-accent"}`}>{m}</button>
          ))}
        </div>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto bg-[#0b1228] rounded-md" role="img" aria-label="Block cipher modes: ECB versus CBC versus CTR">
        <Grid x={70} label="plaintext" shade={(r, c) => (isDark(r, c) ? 30 : 215)} />
        {/* arrow */}
        <text x={232} y={110} fill="#9aa3b8" fontSize="9" textAnchor="middle">encrypt</text>
        <line x1={210} y1={116} x2={254} y2={116} stroke="#64748b" strokeWidth={1} markerEnd="url(#cmA)" />
        <text x={232} y={132} fill="#9aa3b8" fontSize="8" textAnchor="middle">({mode})</text>
        <Grid x={262} label="ciphertext" shade={cipherShade} />
        <defs><marker id="cmA" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 Z" fill="#64748b" /></marker></defs>

        <rect x={20} y={188} width={W - 40} height={34} rx={5} fill="#111a33" />
        <text x={W / 2} y={209} fill="#e5e9f5" fontSize="8.2" textAnchor="middle">{NOTE[mode]}</text>
      </svg>

      <div className="mt-1 text-[10px] text-muted-foreground">
        <b>ECB</b> encrypts every block with the same key and no chaining, so
        repeated plaintext blocks become repeated ciphertext blocks — the
        bitmap above survives encryption (the "<b>ECB penguin</b>", Tux).
        <b> CBC</b> feeds each previous ciphertext block back via XOR (with a
        random <b>IV</b>), and <b>CTR</b> turns the block cipher into a stream
        by encrypting a counter — both destroy the visible structure. CTR is
        parallelizable and supports random access; CBC encryption is strictly
        sequential. The takeaway every cryptographer repeats: <b>never use
        ECB</b> for real data.
      </div>
    </div>
  );
}
