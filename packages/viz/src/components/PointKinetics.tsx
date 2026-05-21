import { useMemo, useState } from "react";

// Interactive nuclear-reactor point kinetics. Solves the two-group
// point-kinetics equations (1 delayed-neutron precursor group, fine
// for teaching) for a step change in reactivity ρ:
//
//   dn/dt = (ρ - β)/Λ · n + λ C
//   dC/dt =  β/Λ · n - λ C
//
// where n = neutron density, C = precursor concentration,
// β = delayed-neutron fraction (~0.0065 for U-235),
// Λ = neutron generation time (~10⁻⁴ s for thermal reactor),
// λ = precursor decay (~0.08 1/s, weighted average).
//
// User drags ρ (in $ = ρ/β). At ρ = 0$: steady state. 0 < ρ < 1$:
// delayed neutrons dominate — slow rise on a reactor period of
// seconds-minutes. ρ ≥ 1$: PROMPT CRITICAL — chain reaction races
// ahead on prompt timescale (~Λ ~ ms). This is the Chernobyl
// scenario + why control margins are kept ≪ 1$.

const W = 420;
const H = 220;
const PAD_L = 44;
const PAD_R = 14;
const PAD_T = 14;
const PAD_B = 34;

const BETA = 0.0065;
const LAMBDA_DECAY = 0.08;
const GEN_TIME = 1e-4;

interface Props {
  rhoDollars?: number; // reactivity in units of $ = ρ/β
  duration?: number; // seconds
}

function integrate(rho: number, duration: number) {
  // Solve point-kinetics with simple stiff-aware RK4. For prompt
  // critical (ρ ≥ β) we cap n to prevent overflow.
  const steps = 1500;
  const dt = duration / steps;
  const ts: number[] = [];
  const ns: number[] = [];
  let n = 1.0;
  let C = (BETA / (LAMBDA_DECAY * GEN_TIME)) * 1.0; // equilibrium precursor with n=1
  for (let i = 0; i <= steps; i++) {
    ts.push(i * dt);
    ns.push(Math.min(n, 1e6));
    // RK4 substep loop for stiffness
    const substeps = 50;
    const h = dt / substeps;
    for (let s = 0; s < substeps; s++) {
      const k1n = ((rho - BETA) / GEN_TIME) * n + LAMBDA_DECAY * C;
      const k1c = (BETA / GEN_TIME) * n - LAMBDA_DECAY * C;
      const k2n = ((rho - BETA) / GEN_TIME) * (n + h * k1n / 2) + LAMBDA_DECAY * (C + h * k1c / 2);
      const k2c = (BETA / GEN_TIME) * (n + h * k1n / 2) - LAMBDA_DECAY * (C + h * k1c / 2);
      const k3n = ((rho - BETA) / GEN_TIME) * (n + h * k2n / 2) + LAMBDA_DECAY * (C + h * k2c / 2);
      const k3c = (BETA / GEN_TIME) * (n + h * k2n / 2) - LAMBDA_DECAY * (C + h * k2c / 2);
      const k4n = ((rho - BETA) / GEN_TIME) * (n + h * k3n) + LAMBDA_DECAY * (C + h * k3c);
      const k4c = (BETA / GEN_TIME) * (n + h * k3n) - LAMBDA_DECAY * (C + h * k3c);
      n = n + (h / 6) * (k1n + 2 * k2n + 2 * k3n + k4n);
      C = C + (h / 6) * (k1c + 2 * k2c + 2 * k3c + k4c);
      if (!isFinite(n) || n > 1e9) {
        n = 1e9;
        break;
      }
      if (n < 0) n = 0;
      if (C < 0) C = 0;
    }
  }
  return { ts, ns };
}

export function PointKinetics({ rhoDollars: ctlRho, duration: ctlDur }: Props = {}) {
  const [intRho, setIntRho] = useState(0.3);
  const [intDur, setIntDur] = useState(60);

  const rhoDollars = ctlRho ?? intRho;
  const duration = ctlDur ?? intDur;
  const rho = rhoDollars * BETA;

  const sim = useMemo(() => integrate(rho, duration), [rho, duration]);

  const nMax = Math.max(...sim.ns, 1.01);
  const nMin = Math.min(...sim.ns, 0.99);
  const useLog = nMax / Math.max(nMin, 1e-12) > 30;

  const xFor = (t: number) => PAD_L + (t / duration) * (W - PAD_L - PAD_R);
  const yFor = (n: number) => {
    if (useLog) {
      const lo = Math.log10(Math.max(nMin, 1e-3));
      const hi = Math.log10(Math.max(nMax, lo + 1));
      const v = Math.log10(Math.max(n, 1e-3));
      return PAD_T + (1 - (v - lo) / (hi - lo)) * (H - PAD_T - PAD_B);
    }
    return PAD_T + (1 - (n - 0) / (nMax - 0)) * (H - PAD_T - PAD_B);
  };

  const path = useMemo(() => {
    let d = "";
    for (let i = 0; i < sim.ts.length; i++) {
      const x = xFor(sim.ts[i]);
      const y = yFor(sim.ns[i]);
      d += i === 0 ? `M ${x.toFixed(1)} ${y.toFixed(1)}` : ` L ${x.toFixed(1)} ${y.toFixed(1)}`;
    }
    return d;
  }, [sim, useLog, duration, nMax, nMin]);

  const finalN = sim.ns[sim.ns.length - 1];

  const status =
    rhoDollars > 1
      ? { label: "PROMPT CRITICAL", color: "#ff4040" }
      : rhoDollars > 0
      ? { label: "Supercritical (delayed)", color: "#ffd166" }
      : rhoDollars < 0
      ? { label: "Subcritical", color: "#7bcbff" }
      : { label: "Critical (steady)", color: "#aaffbf" };

  // Stable reactor period (asymptotic) for sub-prompt-critical
  const period = rho > 0 && rhoDollars < 1 ? (BETA - rho) / (LAMBDA_DECAY * rho) : null;

  return (
    <div className="my-4 p-3 rounded-lg border border-border bg-card text-card-foreground">
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-semibold">Point kinetics: n(t)</div>
        <div className="text-xs px-2 py-0.5 rounded font-mono" style={{ color: status.color, borderColor: status.color, border: "1px solid" }}>
          {status.label}
        </div>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-auto bg-[#0b1228] rounded-md"
        role="img"
        aria-label="Neutron density vs time for given reactivity"
      >
        {/* Reference n=1 line */}
        <line x1={PAD_L} y1={yFor(1)} x2={W - PAD_R} y2={yFor(1)} stroke="#444a66" strokeDasharray="3,3" />
        <text x={W - PAD_R - 4} y={yFor(1) - 3} fill="#9aa3b8" fontSize="9" textAnchor="end">n₀</text>

        <path d={path} fill="none" stroke={status.color} strokeWidth={2.5} />

        {/* Axes */}
        <line x1={PAD_L} y1={H - PAD_B} x2={W - PAD_R} y2={H - PAD_B} stroke="#444a66" />
        <line x1={PAD_L} y1={PAD_T} x2={PAD_L} y2={H - PAD_B} stroke="#444a66" />

        {/* Y ticks */}
        {useLog
          ? [-2, -1, 0, 1, 2, 3, 4].map((e) => (
              <g key={e}>
                <line x1={PAD_L - 4} y1={yFor(Math.pow(10, e))} x2={PAD_L} y2={yFor(Math.pow(10, e))} stroke="#666" />
                <text x={PAD_L - 6} y={yFor(Math.pow(10, e)) + 3} fill="#9aa3b8" fontSize="9" textAnchor="end">
                  10^{e}
                </text>
              </g>
            ))
          : [0, 0.25, 0.5, 0.75, 1].map((f) => (
              <g key={f}>
                <line x1={PAD_L - 4} y1={yFor(f * nMax)} x2={PAD_L} y2={yFor(f * nMax)} stroke="#666" />
                <text x={PAD_L - 6} y={yFor(f * nMax) + 3} fill="#9aa3b8" fontSize="9" textAnchor="end">
                  {(f * nMax).toFixed(2)}
                </text>
              </g>
            ))}

        {/* X ticks */}
        {[0, 0.25, 0.5, 0.75, 1].map((f) => (
          <g key={f}>
            <line x1={xFor(f * duration)} y1={H - PAD_B} x2={xFor(f * duration)} y2={H - PAD_B + 3} stroke="#666" />
            <text x={xFor(f * duration)} y={H - PAD_B + 14} fill="#9aa3b8" fontSize="9" textAnchor="middle">
              {(f * duration).toFixed(0)}
            </text>
          </g>
        ))}

        <text x={W / 2} y={H - 4} fill="#cbd1e6" fontSize="10" textAnchor="middle">time (s)</text>
        <text x={10} y={H / 2} fill="#cbd1e6" fontSize="10" transform={`rotate(-90 10 ${H / 2})`} textAnchor="middle">
          neutron density n {useLog ? "(log)" : ""}
        </text>
      </svg>

      <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
        <label className="block col-span-2">
          Reactivity ρ: {rhoDollars.toFixed(3)}$ (={(rho * 1e5).toFixed(0)} pcm)
          <input
            type="range"
            min={-1}
            max={1.5}
            step={0.001}
            value={rhoDollars}
            onChange={(e) => setIntRho(parseFloat(e.target.value))}
            disabled={ctlRho !== undefined}
            className="w-full mt-0.5"
            aria-label="Reactivity in dollars"
          />
        </label>
        <label className="block col-span-2">
          Duration: {duration.toFixed(0)} s
          <input
            type="range"
            min={1}
            max={300}
            step={1}
            value={duration}
            onChange={(e) => setIntDur(parseFloat(e.target.value))}
            disabled={ctlDur !== undefined}
            className="w-full mt-0.5"
            aria-label="Simulation duration"
          />
        </label>
      </div>

      <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
        <div className="rounded bg-muted/40 p-2">
          <div className="text-muted-foreground">Final n / n₀</div>
          <div className="font-semibold">{finalN < 1e3 ? finalN.toFixed(3) : finalN.toExponential(2)}</div>
        </div>
        <div className="rounded bg-muted/40 p-2">
          <div className="text-muted-foreground">Period T</div>
          <div className="font-semibold">{period !== null ? `${period.toFixed(1)} s` : "—"}</div>
        </div>
        <div className="rounded bg-muted/40 p-2">
          <div className="text-muted-foreground">β = {BETA.toFixed(4)}</div>
          <div className="font-semibold">Λ = {GEN_TIME.toExponential(0)} s</div>
        </div>
      </div>
      <div className="mt-2 text-[10px] text-muted-foreground">
        ρ &lt; 1$ : reactor follows the slow delayed-neutron timescale (seconds-minutes). ρ ≥ 1$ : prompt critical — chain reaction races on Λ ~ ms. Chernobyl's runaway happened crossing the 1$ threshold; modern designs keep control reactivity worth ≪ 1$ specifically to prevent this.
      </div>
    </div>
  );
}
