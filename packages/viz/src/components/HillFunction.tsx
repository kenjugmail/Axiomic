import { useMemo, useState } from "react";

// Interactive Hill-function activator / repressor curve. The
// canonical gene-regulation + ligand-binding equation:
//   Activator:  f(L) = L^n / (K^n + L^n)
//   Repressor:  f(L) = K^n / (K^n + L^n)
// L = ligand/TF concentration; K = half-max concentration; n = Hill
// coefficient (cooperativity). Used in: enzyme kinetics (MM is n=1
// activator), gene regulation, hemoglobin O₂ binding (n≈2.8),
// dose-response pharmacology. Higher n = steeper switch.

const W = 460;
const H = 280;
const PAD_L = 50;
const PAD_R = 14;
const PAD_T = 16;
const PAD_B = 34;

const L_MIN = 0.01;
const L_MAX = 100; // log scale

interface Props {
  K?: number;
  n?: number;
  mode?: "activator" | "repressor";
}

function hill(L: number, K: number, n: number, mode: "activator" | "repressor"): number {
  const Ln = Math.pow(L, n);
  const Kn = Math.pow(K, n);
  if (mode === "activator") return Ln / (Kn + Ln);
  return Kn / (Kn + Ln);
}

export function HillFunction({ K: ctlK, n: ctlN, mode: ctlMode }: Props = {}) {
  const [intK, setIntK] = useState(1);
  const [intN, setIntN] = useState(2);
  const [intMode, setIntMode] = useState<"activator" | "repressor">("activator");

  const K = ctlK ?? intK;
  const n = ctlN ?? intN;
  const mode = ctlMode ?? intMode;

  const curve = useMemo(() => {
    const arr: { L: number; f: number }[] = [];
    const N = 400;
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const L = L_MIN * Math.pow(L_MAX / L_MIN, t);
      arr.push({ L, f: hill(L, K, n, mode) });
    }
    return arr;
  }, [K, n, mode]);

  const xFor = (L: number) => {
    const t = Math.log(L / L_MIN) / Math.log(L_MAX / L_MIN);
    return PAD_L + t * (W - PAD_L - PAD_R);
  };
  const yFor = (f: number) => PAD_T + (1 - f) * (H - PAD_T - PAD_B);

  const path = useMemo(() => {
    let d = "";
    curve.forEach((p, i) => {
      const x = xFor(p.L);
      const y = yFor(p.f);
      d += i === 0 ? `M ${x.toFixed(1)} ${y.toFixed(1)}` : ` L ${x.toFixed(1)} ${y.toFixed(1)}`;
    });
    return d;
  }, [curve]);

  // Hill-slope at K (max steepness) = n/4 for activator
  const slopeAtK = mode === "activator" ? n / 4 : -n / 4;

  return (
    <div className="my-4 p-3 rounded-lg border border-border bg-card text-card-foreground">
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-semibold">Hill function: {mode === "activator" ? "f = Lⁿ/(Kⁿ+Lⁿ)" : "f = Kⁿ/(Kⁿ+Lⁿ)"}</div>
        <div className="text-xs font-mono text-muted-foreground">slope at K: {slopeAtK.toFixed(2)}</div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto bg-[#0b1228] rounded-md" role="img" aria-label="Hill function curve">
        {/* Half-max line */}
        <line x1={PAD_L} y1={yFor(0.5)} x2={W - PAD_R} y2={yFor(0.5)} stroke="#444a66" strokeDasharray="2,3" />
        <text x={W - PAD_R - 4} y={yFor(0.5) - 3} fill="#9aa3b8" fontSize="9" textAnchor="end">½ max</text>

        {/* K marker (vertical) */}
        <line x1={xFor(K)} y1={PAD_T} x2={xFor(K)} y2={H - PAD_B} stroke="#ffd166" strokeDasharray="3,3" opacity={0.6} />
        <text x={xFor(K) + 3} y={PAD_T + 10} fill="#ffd166" fontSize="9">K = {K.toFixed(2)}</text>

        <path d={path} fill="none" stroke={mode === "activator" ? "#aaffbf" : "#ff7a7a"} strokeWidth={2.5} />

        {/* Axes */}
        <line x1={PAD_L} y1={H - PAD_B} x2={W - PAD_R} y2={H - PAD_B} stroke="#444a66" />
        <line x1={PAD_L} y1={PAD_T} x2={PAD_L} y2={H - PAD_B} stroke="#444a66" />

        {[0.01, 0.1, 1, 10, 100].map((L) => (
          <g key={`x-${L}`}>
            <line x1={xFor(L)} y1={H - PAD_B} x2={xFor(L)} y2={H - PAD_B + 3} stroke="#666" />
            <text x={xFor(L)} y={H - PAD_B + 14} fill="#9aa3b8" fontSize="9" textAnchor="middle">{L < 1 ? L : L.toFixed(0)}</text>
          </g>
        ))}
        {[0, 0.25, 0.5, 0.75, 1].map((f) => (
          <g key={`y-${f}`}>
            <line x1={PAD_L - 4} y1={yFor(f)} x2={PAD_L} y2={yFor(f)} stroke="#666" />
            <text x={PAD_L - 6} y={yFor(f) + 3} fill="#9aa3b8" fontSize="9" textAnchor="end">{f.toFixed(2)}</text>
          </g>
        ))}

        <text x={(PAD_L + W - PAD_R) / 2} y={H - 4} fill="#cbd1e6" fontSize="10" textAnchor="middle">ligand / TF concentration L (log scale)</text>
        <text x={14} y={H / 2} fill="#cbd1e6" fontSize="10" transform={`rotate(-90 14 ${H / 2})`} textAnchor="middle">fractional response f</text>
      </svg>

      <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
        <label className="block">
          K (half-max): {K.toFixed(2)}
          <input type="range" min={0.1} max={10} step={0.05} value={K} onChange={(e) => setIntK(parseFloat(e.target.value))} disabled={ctlK !== undefined} className="w-full mt-0.5" aria-label="Half-max concentration" />
        </label>
        <label className="block">
          n (cooperativity): {n.toFixed(1)}
          <input type="range" min={0.5} max={8} step={0.1} value={n} onChange={(e) => setIntN(parseFloat(e.target.value))} disabled={ctlN !== undefined} className="w-full mt-0.5" aria-label="Hill coefficient" />
        </label>
        <div className="col-span-2 flex gap-1">
          {(["activator", "repressor"] as const).map((m) => (
            <button key={m} onClick={() => setIntMode(m)} disabled={ctlMode !== undefined} className={`flex-1 px-2 py-1 rounded text-xs ${mode === m ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-accent"} disabled:opacity-50`}>{m}</button>
          ))}
        </div>
      </div>
      <div className="mt-2 text-[10px] text-muted-foreground">
        n = 1: hyperbolic (Michaelis-Menten enzyme kinetics; single-site binding). n = 2-4: cooperative (hemoglobin O₂ binding ~2.8; many TFs bind as dimers/tetramers). n &gt; 4: ultrasensitive switch (cell-fate decisions, signaling cascades). Higher n → steeper transition near K → robust digital switching from analog inputs. Hill function is the universal gene-regulation + ligand-binding curve in biology.
      </div>
    </div>
  );
}
