import { useEffect, useMemo, useRef, useState } from "react";

// Lotka-Volterra predator-prey viz. Classical ODE system:
//   dx/dt = α x − β x y       prey (sardines, plankton, etc.)
//   dy/dt = δ x y − γ y       predator (anchovy-eaters, copepods)
// Conserved quantity: V(x,y) = δ x − γ ln x + β y − α ln y; closed
// orbits in phase space. Used in ecology (paramecium + didinium
// classic Gause experiments; lynx + hare Hudson Bay records), but
// also chemistry, epidemiology (SIR is a perturbation), economics
// (Goodwin business cycle), and even firearms in arms races
// (Richardson). The marine-biology hook is plankton-copepod-fish
// trophic cascades + sardine/anchovy regime shifts.

const W = 460;
const H = 280;
const PAD_L = 50;
const PAD_R = 14;
const PAD_T = 16;
const PAD_B = 34;

interface Props {
  alpha?: number;
  beta?: number;
  delta?: number;
  gamma?: number;
  x0?: number;
  y0?: number;
}

export function LotkaVolterra({ alpha: ctlA, beta: ctlB, delta: ctlD, gamma: ctlG, x0: ctlX0, y0: ctlY0 }: Props = {}) {
  const [a, setA] = useState(1.0);
  const [b, setB] = useState(0.4);
  const [d, setD] = useState(0.1);
  const [g, setG] = useState(0.4);
  const [x0, setX0] = useState(10);
  const [y0, setY0] = useState(2);
  const [view, setView] = useState<"timeseries" | "phase">("timeseries");

  const alpha = ctlA ?? a;
  const beta = ctlB ?? b;
  const delta = ctlD ?? d;
  const gamma = ctlG ?? g;
  const X0 = ctlX0 ?? x0;
  const Y0 = ctlY0 ?? y0;

  const sim = useMemo(() => {
    const dt = 0.02;
    const N = 3000;
    const xs: number[] = [X0];
    const ys: number[] = [Y0];
    const ts: number[] = [0];
    let xt = X0;
    let yt = Y0;
    for (let i = 1; i <= N; i++) {
      // RK4 step
      const f = (X: number, Y: number) => [alpha * X - beta * X * Y, delta * X * Y - gamma * Y];
      const [k1x, k1y] = f(xt, yt);
      const [k2x, k2y] = f(xt + 0.5 * dt * k1x, yt + 0.5 * dt * k1y);
      const [k3x, k3y] = f(xt + 0.5 * dt * k2x, yt + 0.5 * dt * k2y);
      const [k4x, k4y] = f(xt + dt * k3x, yt + dt * k3y);
      xt = xt + (dt / 6) * (k1x + 2 * k2x + 2 * k3x + k4x);
      yt = yt + (dt / 6) * (k1y + 2 * k2y + 2 * k3y + k4y);
      xt = Math.max(0, xt);
      yt = Math.max(0, yt);
      xs.push(xt);
      ys.push(yt);
      ts.push(i * dt);
    }
    const maxV = Math.max(...xs, ...ys);
    return { xs, ys, ts, maxV };
  }, [alpha, beta, delta, gamma, X0, Y0]);

  const xEq = gamma / delta;
  const yEq = alpha / beta;

  const xTime = (t: number) => PAD_L + (t / sim.ts[sim.ts.length - 1]) * (W - PAD_L - PAD_R);
  const yVal = (v: number) => PAD_T + (1 - v / Math.max(sim.maxV, 1e-6)) * (H - PAD_T - PAD_B);

  const xPhase = (X: number) => PAD_L + (X / Math.max(sim.maxV, 1e-6)) * (W - PAD_L - PAD_R);
  const yPhase = (Y: number) => PAD_T + (1 - Y / Math.max(sim.maxV, 1e-6)) * (H - PAD_T - PAD_B);

  const preyPath = useMemo(() => {
    let d = "";
    for (let i = 0; i < sim.ts.length; i += 3) {
      const x = xTime(sim.ts[i]);
      const y = yVal(sim.xs[i]);
      d += i === 0 ? `M ${x.toFixed(1)} ${y.toFixed(1)}` : ` L ${x.toFixed(1)} ${y.toFixed(1)}`;
    }
    return d;
  }, [sim]);
  const predPath = useMemo(() => {
    let d = "";
    for (let i = 0; i < sim.ts.length; i += 3) {
      const x = xTime(sim.ts[i]);
      const y = yVal(sim.ys[i]);
      d += i === 0 ? `M ${x.toFixed(1)} ${y.toFixed(1)}` : ` L ${x.toFixed(1)} ${y.toFixed(1)}`;
    }
    return d;
  }, [sim]);
  const phasePath = useMemo(() => {
    let d = "";
    for (let i = 0; i < sim.ts.length; i += 3) {
      const x = xPhase(sim.xs[i]);
      const y = yPhase(sim.ys[i]);
      d += i === 0 ? `M ${x.toFixed(1)} ${y.toFixed(1)}` : ` L ${x.toFixed(1)} ${y.toFixed(1)}`;
    }
    return d;
  }, [sim]);

  return (
    <div className="my-4 p-3 rounded-lg border border-border bg-card text-card-foreground">
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-semibold">Lotka-Volterra · equilibrium ({xEq.toFixed(2)}, {yEq.toFixed(2)})</div>
        <div className="flex gap-1">
          {(["timeseries", "phase"] as const).map((v) => (
            <button key={v} onClick={() => setView(v)} className={`px-2 py-0.5 rounded text-[10px] ${view === v ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-accent"}`}>{v}</button>
          ))}
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto bg-[#0b1228] rounded-md" role="img" aria-label="Lotka-Volterra predator-prey dynamics">
        {view === "timeseries" ? (
          <>
            <path d={preyPath} fill="none" stroke="#7cc4ff" strokeWidth={2} />
            <path d={predPath} fill="none" stroke="#ffaaa5" strokeWidth={2} />
            <text x={W - PAD_R - 4} y={PAD_T + 12} fill="#7cc4ff" fontSize="9" textAnchor="end">prey (x)</text>
            <text x={W - PAD_R - 4} y={PAD_T + 24} fill="#ffaaa5" fontSize="9" textAnchor="end">predator (y)</text>
            <line x1={PAD_L} y1={H - PAD_B} x2={W - PAD_R} y2={H - PAD_B} stroke="#444a66" />
            <line x1={PAD_L} y1={PAD_T} x2={PAD_L} y2={H - PAD_B} stroke="#444a66" />
            <text x={(PAD_L + W - PAD_R) / 2} y={H - 4} fill="#cbd1e6" fontSize="10" textAnchor="middle">time</text>
            <text x={14} y={H / 2} fill="#cbd1e6" fontSize="10" transform={`rotate(-90 14 ${H / 2})`} textAnchor="middle">population</text>
          </>
        ) : (
          <>
            <line x1={xPhase(xEq)} y1={PAD_T} x2={xPhase(xEq)} y2={H - PAD_B} stroke="#ffd166" strokeDasharray="3,3" opacity={0.4} />
            <line x1={PAD_L} y1={yPhase(yEq)} x2={W - PAD_R} y2={yPhase(yEq)} stroke="#ffd166" strokeDasharray="3,3" opacity={0.4} />
            <circle cx={xPhase(xEq)} cy={yPhase(yEq)} r={3.5} fill="#ffd166" />
            <path d={phasePath} fill="none" stroke="#aaffbf" strokeWidth={1.8} />
            <line x1={PAD_L} y1={H - PAD_B} x2={W - PAD_R} y2={H - PAD_B} stroke="#444a66" />
            <line x1={PAD_L} y1={PAD_T} x2={PAD_L} y2={H - PAD_B} stroke="#444a66" />
            <text x={(PAD_L + W - PAD_R) / 2} y={H - 4} fill="#cbd1e6" fontSize="10" textAnchor="middle">prey x</text>
            <text x={14} y={H / 2} fill="#cbd1e6" fontSize="10" transform={`rotate(-90 14 ${H / 2})`} textAnchor="middle">predator y</text>
          </>
        )}
      </svg>

      <div className="mt-3 grid grid-cols-3 gap-x-3 gap-y-2 text-xs">
        <label className="block">α (prey growth): {alpha.toFixed(2)}
          <input type="range" min={0.1} max={2} step={0.05} value={alpha} onChange={(e) => setA(parseFloat(e.target.value))} disabled={ctlA !== undefined} className="w-full mt-0.5" aria-label="alpha" /></label>
        <label className="block">β (predation): {beta.toFixed(2)}
          <input type="range" min={0.05} max={1} step={0.01} value={beta} onChange={(e) => setB(parseFloat(e.target.value))} disabled={ctlB !== undefined} className="w-full mt-0.5" aria-label="beta" /></label>
        <label className="block">δ (conversion): {delta.toFixed(2)}
          <input type="range" min={0.01} max={0.5} step={0.01} value={delta} onChange={(e) => setD(parseFloat(e.target.value))} disabled={ctlD !== undefined} className="w-full mt-0.5" aria-label="delta" /></label>
        <label className="block">γ (predator death): {gamma.toFixed(2)}
          <input type="range" min={0.05} max={1} step={0.01} value={gamma} onChange={(e) => setG(parseFloat(e.target.value))} disabled={ctlG !== undefined} className="w-full mt-0.5" aria-label="gamma" /></label>
        <label className="block">x₀ prey: {X0.toFixed(1)}
          <input type="range" min={1} max={30} step={0.5} value={X0} onChange={(e) => setX0(parseFloat(e.target.value))} disabled={ctlX0 !== undefined} className="w-full mt-0.5" aria-label="x0" /></label>
        <label className="block">y₀ pred: {Y0.toFixed(1)}
          <input type="range" min={1} max={20} step={0.5} value={Y0} onChange={(e) => setY0(parseFloat(e.target.value))} disabled={ctlY0 !== undefined} className="w-full mt-0.5" aria-label="y0" /></label>
      </div>
      <div className="mt-2 text-[10px] text-muted-foreground">
        Closed orbits in phase space: predator + prey cycle with a quarter-period
        lag (predators peak after prey peak). Equilibrium (γ/δ, α/β) is a center,
        not stable — small perturbations give different orbits, not the same one.
        Real ecosystems modify this (logistic prey self-limitation, Holling
        functional response, multiple species) but Lotka-Volterra is the
        canonical baseline for cycles in ecology, chemistry, epidemiology, and
        economics.
      </div>
    </div>
  );
}
