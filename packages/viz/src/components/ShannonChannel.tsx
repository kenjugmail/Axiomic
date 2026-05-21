import { useMemo, useState } from "react";

// Interactive binary symmetric channel (BSC) — the simplest channel
// in information theory + the canonical pedagogy for Shannon's
// noisy-channel theorem. Drag bit-error probability p; see binary
// entropy H(p), channel capacity C(p) = 1 − H(p), and channel
// diagram with 0→0 / 0→1 / 1→0 / 1→1 transitions weighted by p +
// (1−p). C(p) curve plotted from p=0 (perfect channel, C=1) to
// p=0.5 (useless channel, C=0) and back to p=1 (also useless but
// just inverted; C=1 if you flip all bits).

const W = 460;
const H_VIZ = 280;
const PAD_L = 50;
const PAD_R = 14;
const PAD_T = 16;
const PAD_B = 34;

function binaryEntropy(p: number): number {
  if (p <= 0 || p >= 1) return 0;
  return -p * Math.log2(p) - (1 - p) * Math.log2(1 - p);
}

interface Props {
  p?: number; // bit-error probability
}

export function ShannonChannel({ p: ctlP }: Props = {}) {
  const [intP, setIntP] = useState(0.1);
  const p = ctlP ?? intP;

  const H = binaryEntropy(p);
  const C = 1 - H;

  // Capacity curve C(p) for plotting
  const curve = useMemo(() => {
    const arr: { p: number; C: number }[] = [];
    for (let q = 0; q <= 1.0; q += 0.005) {
      arr.push({ p: q, C: 1 - binaryEntropy(q) });
    }
    return arr;
  }, []);

  const xFor = (q: number) => PAD_L + q * (W - PAD_L - PAD_R);
  const yFor = (c: number) => PAD_T + (1 - c) * (H_VIZ - PAD_T - PAD_B);

  const path = useMemo(() => {
    let d = "";
    curve.forEach((pt, i) => {
      const x = xFor(pt.p);
      const y = yFor(pt.C);
      d += i === 0 ? `M ${x.toFixed(1)} ${y.toFixed(1)}` : ` L ${x.toFixed(1)} ${y.toFixed(1)}`;
    });
    return d;
  }, [curve]);

  // Channel diagram coords
  const diagW = 180;
  const diagX = W - diagW - 20;
  const diagY = 30;
  const inY0 = diagY + 30;
  const inY1 = diagY + 90;
  const outY0 = diagY + 30;
  const outY1 = diagY + 90;
  const inX = diagX + 20;
  const outX = diagX + diagW - 20;

  return (
    <div className="my-4 p-3 rounded-lg border border-border bg-card text-card-foreground">
      <div className="text-sm font-semibold mb-2">Shannon binary symmetric channel</div>
      <svg viewBox={`0 0 ${W} ${H_VIZ}`} className="w-full h-auto bg-[#0b1228] rounded-md" role="img" aria-label="Binary symmetric channel + capacity curve">
        {/* Capacity curve */}
        <path d={path} fill="none" stroke="#7bcbff" strokeWidth={2} />

        {/* Marker at current p */}
        <line x1={xFor(p)} y1={PAD_T} x2={xFor(p)} y2={H_VIZ - PAD_B} stroke="#ff9b6a" strokeDasharray="3,3" />
        <circle cx={xFor(p)} cy={yFor(C)} r={5} fill="#ff9b6a" stroke="#fff" strokeWidth={1.5} />

        {/* Vertical 0.5 mark */}
        <line x1={xFor(0.5)} y1={PAD_T} x2={xFor(0.5)} y2={H_VIZ - PAD_B} stroke="#444a66" strokeDasharray="2,4" />
        <text x={xFor(0.5) - 4} y={H_VIZ - PAD_B + 12} fill="#9aa3b8" fontSize="9" textAnchor="end">0.5 (useless)</text>

        {/* Axes */}
        <line x1={PAD_L} y1={H_VIZ - PAD_B} x2={W - PAD_R} y2={H_VIZ - PAD_B} stroke="#444a66" />
        <line x1={PAD_L} y1={PAD_T} x2={PAD_L} y2={H_VIZ - PAD_B} stroke="#444a66" />

        {[0, 0.25, 0.5, 0.75, 1].map((q) => (
          <g key={`x-${q}`}>
            <line x1={xFor(q)} y1={H_VIZ - PAD_B} x2={xFor(q)} y2={H_VIZ - PAD_B + 3} stroke="#666" />
            <text x={xFor(q)} y={H_VIZ - PAD_B + 14} fill="#9aa3b8" fontSize="9" textAnchor="middle">{q.toFixed(2)}</text>
          </g>
        ))}
        {[0, 0.25, 0.5, 0.75, 1].map((c) => (
          <g key={`y-${c}`}>
            <line x1={PAD_L - 4} y1={yFor(c)} x2={PAD_L} y2={yFor(c)} stroke="#666" />
            <text x={PAD_L - 6} y={yFor(c) + 3} fill="#9aa3b8" fontSize="9" textAnchor="end">{c.toFixed(2)}</text>
          </g>
        ))}

        <text x={(PAD_L + W - PAD_R) / 2} y={H_VIZ - 4} fill="#cbd1e6" fontSize="10" textAnchor="middle">bit-error probability p</text>
        <text x={14} y={H_VIZ / 2} fill="#cbd1e6" fontSize="10" transform={`rotate(-90 14 ${H_VIZ / 2})`} textAnchor="middle">capacity C (bits / channel use)</text>

        {/* Channel diagram on the right */}
        <g>
          <text x={diagX + diagW / 2} y={diagY + 10} fill="#cbd1e6" fontSize="10" textAnchor="middle">BSC(p)</text>
          {/* Input nodes */}
          <circle cx={inX} cy={inY0} r={10} fill="#0b1228" stroke="#7bcbff" strokeWidth={1.5} />
          <text x={inX} y={inY0 + 3} fill="#7bcbff" fontSize="11" textAnchor="middle">0</text>
          <circle cx={inX} cy={inY1} r={10} fill="#0b1228" stroke="#7bcbff" strokeWidth={1.5} />
          <text x={inX} y={inY1 + 3} fill="#7bcbff" fontSize="11" textAnchor="middle">1</text>
          {/* Output nodes */}
          <circle cx={outX} cy={outY0} r={10} fill="#0b1228" stroke="#aaffbf" strokeWidth={1.5} />
          <text x={outX} y={outY0 + 3} fill="#aaffbf" fontSize="11" textAnchor="middle">0</text>
          <circle cx={outX} cy={outY1} r={10} fill="#0b1228" stroke="#aaffbf" strokeWidth={1.5} />
          <text x={outX} y={outY1 + 3} fill="#aaffbf" fontSize="11" textAnchor="middle">1</text>
          {/* Straight (correct) edges */}
          <line x1={inX + 10} y1={inY0} x2={outX - 10} y2={outY0} stroke="#aaffbf" strokeWidth={Math.max(0.5, (1 - p) * 3)} />
          <text x={(inX + outX) / 2} y={inY0 - 4} fill="#aaffbf" fontSize="9" textAnchor="middle">1−p = {(1 - p).toFixed(2)}</text>
          <line x1={inX + 10} y1={inY1} x2={outX - 10} y2={outY1} stroke="#aaffbf" strokeWidth={Math.max(0.5, (1 - p) * 3)} />
          <text x={(inX + outX) / 2} y={inY1 + 14} fill="#aaffbf" fontSize="9" textAnchor="middle">1−p</text>
          {/* Flip (error) edges */}
          <line x1={inX + 10} y1={inY0 + 4} x2={outX - 10} y2={outY1 - 4} stroke="#ff7a7a" strokeWidth={Math.max(0.5, p * 3)} />
          <line x1={inX + 10} y1={inY1 - 4} x2={outX - 10} y2={outY0 + 4} stroke="#ff7a7a" strokeWidth={Math.max(0.5, p * 3)} />
          <text x={(inX + outX) / 2} y={(inY0 + inY1) / 2 + 3} fill="#ff7a7a" fontSize="9" textAnchor="middle">p = {p.toFixed(2)}</text>

          {/* Labels */}
          <text x={inX} y={inY1 + 28} fill="#9aa3b8" fontSize="9" textAnchor="middle">input X</text>
          <text x={outX} y={outY1 + 28} fill="#9aa3b8" fontSize="9" textAnchor="middle">output Y</text>
        </g>
      </svg>

      <div className="mt-3">
        <label className="block text-xs">
          Bit-error probability p: {p.toFixed(3)}
          <input
            type="range"
            min={0}
            max={1}
            step={0.005}
            value={p}
            onChange={(e) => setIntP(parseFloat(e.target.value))}
            disabled={ctlP !== undefined}
            className="w-full mt-0.5"
            aria-label="Bit error probability"
          />
        </label>
      </div>

      <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
        <div className="rounded bg-muted/40 p-2">
          <div className="text-muted-foreground">H(p) entropy</div>
          <div className="font-semibold">{H.toFixed(3)} bits</div>
        </div>
        <div className="rounded bg-muted/40 p-2">
          <div className="text-muted-foreground">C = 1 − H(p)</div>
          <div className="font-semibold">{C.toFixed(3)} bits/use</div>
        </div>
        <div className="rounded bg-muted/40 p-2">
          <div className="text-muted-foreground">Status</div>
          <div className="font-semibold" style={{ color: p < 0.05 ? "#aaffbf" : p < 0.45 ? "#ffd166" : "#ff7a7a" }}>
            {p < 0.05 ? "near-perfect" : p < 0.45 ? "noisy" : Math.abs(p - 0.5) < 0.05 ? "useless" : "noisy (or invert!)"}
          </div>
        </div>
      </div>
      <div className="mt-2 text-[10px] text-muted-foreground">
        Shannon's noisy-channel theorem: for any rate R &lt; C, codes exist with arbitrarily small error. At R &gt; C, error inevitable. C = 1 − H(p) for BSC. p = 0 or 1: perfect channel (C = 1; at p=1 just invert all bits). p = 0.5: output independent of input → no information, C = 0. Real channels (5G, fiber, DSL) approach C via LDPC + polar codes + iterative decoding.
      </div>
    </div>
  );
}
