import { useMemo, useState } from "react";

// Interactive drift-diffusion model (DDM) of perceptual decisions.
// Canonical model in cognitive psychology: evidence accumulates over
// time as a noisy random walk; decision when it crosses an upper or
// lower threshold. Sliders: drift rate v (signal strength), threshold
// a (decision boundary distance), starting point z (bias), noise σ.
// Simulates many trials; shows trajectories + decision-time
// histogram. Predicts: easier tasks (higher v) → faster + more
// accurate; speed-accuracy trade-off via threshold a.

const W = 460;
const H = 320;
const PAD_L = 50;
const PAD_R = 14;
const PAD_T = 18;
const PAD_B = 40;
const MAX_T = 2.5; // seconds

interface Props {
  v?: number;
  a?: number;
  z?: number;
  sigma?: number;
}

function simulateTrial(v: number, a: number, z: number, sigma: number, dt = 0.005): { traj: number[]; rt: number; choice: 1 | -1 } {
  let x = z;
  const traj: number[] = [x];
  const maxSteps = Math.floor(MAX_T / dt);
  for (let i = 0; i < maxSteps; i++) {
    const dw = (Math.random() < 0.5 ? -1 : 1) * Math.sqrt(dt);
    x += v * dt + sigma * dw;
    traj.push(x);
    if (x >= a) return { traj, rt: (i + 1) * dt, choice: 1 };
    if (x <= -a) return { traj, rt: (i + 1) * dt, choice: -1 };
  }
  return { traj, rt: MAX_T, choice: x > 0 ? 1 : -1 };
}

export function DriftDiffusion({ v: ctlV, a: ctlA, z: ctlZ, sigma: ctlSigma }: Props = {}) {
  const [intV, setIntV] = useState(1.5);
  const [intA, setIntA] = useState(1.0);
  const [intZ, setIntZ] = useState(0);
  const [intSigma, setIntSigma] = useState(1.0);
  const [seed, setSeed] = useState(0);

  const v = ctlV ?? intV;
  const a = ctlA ?? intA;
  const z = ctlZ ?? intZ;
  const sigma = ctlSigma ?? intSigma;

  const trials = useMemo(() => {
    void seed;
    const N = 80;
    const arr: { traj: number[]; rt: number; choice: 1 | -1 }[] = [];
    for (let i = 0; i < N; i++) arr.push(simulateTrial(v, a, z, sigma));
    return arr;
  }, [v, a, z, sigma, seed]);

  const accuracy = useMemo(() => trials.filter((t) => t.choice === 1).length / trials.length, [trials]);
  const meanRT = useMemo(() => trials.reduce((s, t) => s + t.rt, 0) / trials.length, [trials]);

  const xFor = (t: number) => PAD_L + (t / MAX_T) * (W - PAD_L - PAD_R);
  const yFor = (x: number) => {
    const range = a * 1.4;
    return PAD_T + (1 - (x + range) / (2 * range)) * (H - PAD_T - PAD_B);
  };

  return (
    <div className="my-4 p-3 rounded-lg border border-border bg-card text-card-foreground">
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-semibold">Drift-diffusion decision model</div>
        <div className="text-xs font-mono text-muted-foreground">
          accuracy {(accuracy * 100).toFixed(0)}% · mean RT {(meanRT * 1000).toFixed(0)} ms
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto bg-[#0b1228] rounded-md" role="img" aria-label="Drift-diffusion model trajectories">
        {/* Thresholds */}
        <line x1={PAD_L} y1={yFor(a)} x2={W - PAD_R} y2={yFor(a)} stroke="#aaffbf" strokeWidth={1.5} />
        <text x={W - PAD_R - 4} y={yFor(a) - 3} fill="#aaffbf" fontSize="9" textAnchor="end">+a (choice 1)</text>
        <line x1={PAD_L} y1={yFor(-a)} x2={W - PAD_R} y2={yFor(-a)} stroke="#ff7a7a" strokeWidth={1.5} />
        <text x={W - PAD_R - 4} y={yFor(-a) + 12} fill="#ff7a7a" fontSize="9" textAnchor="end">-a (choice -1)</text>

        {/* Zero line */}
        <line x1={PAD_L} y1={yFor(0)} x2={W - PAD_R} y2={yFor(0)} stroke="#444a66" strokeDasharray="2,3" />

        {/* Starting point */}
        <circle cx={PAD_L} cy={yFor(z)} r={3} fill="#ffd166" />

        {/* Trajectories */}
        {trials.slice(0, 60).map((trial, idx) => {
          let d = "";
          trial.traj.forEach((x, i) => {
            const px = xFor(i * 0.005);
            const py = yFor(x);
            d += i === 0 ? `M ${px.toFixed(1)} ${py.toFixed(1)}` : ` L ${px.toFixed(1)} ${py.toFixed(1)}`;
          });
          return <path key={idx} d={d} fill="none" stroke={trial.choice === 1 ? "#aaffbf" : "#ff7a7a"} strokeWidth={0.6} strokeOpacity={0.4} />;
        })}

        {/* Axes */}
        <line x1={PAD_L} y1={H - PAD_B} x2={W - PAD_R} y2={H - PAD_B} stroke="#444a66" />
        <line x1={PAD_L} y1={PAD_T} x2={PAD_L} y2={H - PAD_B} stroke="#444a66" />

        {[0, 0.5, 1, 1.5, 2, 2.5].map((t) => (
          <g key={`x-${t}`}>
            <line x1={xFor(t)} y1={H - PAD_B} x2={xFor(t)} y2={H - PAD_B + 3} stroke="#666" />
            <text x={xFor(t)} y={H - PAD_B + 14} fill="#9aa3b8" fontSize="9" textAnchor="middle">{t.toFixed(1)}</text>
          </g>
        ))}
        <text x={(PAD_L + W - PAD_R) / 2} y={H - 4} fill="#cbd1e6" fontSize="10" textAnchor="middle">time (s)</text>
        <text x={14} y={H / 2} fill="#cbd1e6" fontSize="10" transform={`rotate(-90 14 ${H / 2})`} textAnchor="middle">evidence x(t)</text>
      </svg>

      <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
        <label className="block">
          Drift v (signal): {v.toFixed(2)}
          <input type="range" min={-3} max={3} step={0.05} value={v} onChange={(e) => setIntV(parseFloat(e.target.value))} disabled={ctlV !== undefined} className="w-full mt-0.5" aria-label="Drift rate" />
        </label>
        <label className="block">
          Threshold a: {a.toFixed(2)}
          <input type="range" min={0.3} max={2.0} step={0.05} value={a} onChange={(e) => setIntA(parseFloat(e.target.value))} disabled={ctlA !== undefined} className="w-full mt-0.5" aria-label="Decision threshold" />
        </label>
        <label className="block">
          Start z (bias): {z.toFixed(2)}
          <input type="range" min={-0.5} max={0.5} step={0.05} value={z} onChange={(e) => setIntZ(parseFloat(e.target.value))} disabled={ctlZ !== undefined} className="w-full mt-0.5" aria-label="Starting bias" />
        </label>
        <label className="block">
          Noise σ: {sigma.toFixed(2)}
          <input type="range" min={0.3} max={2.0} step={0.05} value={sigma} onChange={(e) => setIntSigma(parseFloat(e.target.value))} disabled={ctlSigma !== undefined} className="w-full mt-0.5" aria-label="Noise" />
        </label>
        <button onClick={() => setSeed((s) => s + 1)} className="col-span-2 px-2 py-1 rounded bg-muted hover:bg-accent text-xs">Resimulate trials</button>
      </div>
      <div className="mt-2 text-[10px] text-muted-foreground">
        DDM (Ratcliff 1978): dx/dt = v + σ·noise; decision when x crosses ±a. Higher v (stronger signal) → faster + more accurate. Higher a → slower + more accurate (speed-accuracy trade-off). Bias z shifts toward one choice. Models human perceptual decisions (random-dot motion, lexical decision, recognition memory); fits RT + accuracy distributions remarkably well across tasks + species.
      </div>
    </div>
  );
}
