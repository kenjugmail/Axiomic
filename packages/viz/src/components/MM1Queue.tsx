import { useMemo, useState } from "react";

// M/M/1 queue interactive viz. Poisson arrivals at rate λ, exponential
// service at rate μ, single server, FIFO. Foundational queueing-theory
// result (Erlang 1909 → Kleinrock):
//   ρ = λ/μ                 utilization (must be < 1 or queue explodes)
//   L = ρ/(1-ρ)             mean number in system
//   W = 1/(μ-λ)              mean time in system (Little's law: L = λW)
//   Lq = ρ²/(1-ρ)            mean number in queue
//   Wq = ρ/(μ-λ)             mean waiting time
// Used in: call centers, hospital ER triage, network routers, factory
// throughput, web-server capacity planning. Hockey-stick blowup near
// ρ → 1 is the universal operations-research lesson.

const W = 460;
const H = 280;
const PAD_L = 50;
const PAD_R = 14;
const PAD_T = 16;
const PAD_B = 34;

const RHO_MIN = 0.01;
const RHO_MAX = 0.99;

interface Props {
  lambda?: number;
  mu?: number;
}

export function MM1Queue({ lambda: ctlLambda, mu: ctlMu }: Props = {}) {
  const [intLambda, setIntLambda] = useState(0.6);
  const [intMu, setIntMu] = useState(1.0);

  const lambda = ctlLambda ?? intLambda;
  const mu = ctlMu ?? intMu;

  const rho = lambda / mu;
  const stable = rho < 1;
  const L = stable ? rho / (1 - rho) : Infinity;
  const Lq = stable ? (rho * rho) / (1 - rho) : Infinity;
  const Wsys = stable ? 1 / (mu - lambda) : Infinity;
  const Wq = stable ? rho / (mu - lambda) : Infinity;

  const curveL = useMemo(() => {
    const arr: { r: number; L: number }[] = [];
    const N = 200;
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const r = RHO_MIN + t * (RHO_MAX - RHO_MIN);
      arr.push({ r, L: r / (1 - r) });
    }
    return arr;
  }, []);

  const L_AXIS_MAX = 12;

  const xFor = (r: number) => PAD_L + ((r - 0) / 1) * (W - PAD_L - PAD_R);
  const yFor = (Lv: number) => {
    const clamped = Math.min(L_AXIS_MAX, Math.max(0, Lv));
    return PAD_T + (1 - clamped / L_AXIS_MAX) * (H - PAD_T - PAD_B);
  };

  const path = useMemo(() => {
    let d = "";
    curveL.forEach((p, i) => {
      const x = xFor(p.r);
      const y = yFor(p.L);
      d += i === 0 ? `M ${x.toFixed(1)} ${y.toFixed(1)}` : ` L ${x.toFixed(1)} ${y.toFixed(1)}`;
    });
    return d;
  }, [curveL]);

  return (
    <div className="my-4 p-3 rounded-lg border border-border bg-card text-card-foreground">
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-semibold">M/M/1 queue · ρ = λ/μ = {rho.toFixed(3)}</div>
        <div className={`text-xs font-mono ${stable ? "text-emerald-400" : "text-red-400"}`}>{stable ? "stable" : "UNSTABLE (ρ ≥ 1)"}</div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto bg-[#0b1228] rounded-md" role="img" aria-label="M/M/1 mean queue length vs utilization">
        {/* ρ=1 vertical asymptote */}
        <line x1={xFor(1)} y1={PAD_T} x2={xFor(1)} y2={H - PAD_B} stroke="#ff5a5a" strokeDasharray="3,3" opacity={0.5} />
        <text x={xFor(1) - 4} y={PAD_T + 10} fill="#ff5a5a" fontSize="9" textAnchor="end">ρ=1</text>

        {/* Curve L = ρ/(1-ρ) */}
        <path d={path} fill="none" stroke="#7cc4ff" strokeWidth={2.5} />

        {/* Current point */}
        {stable && (
          <g>
            <circle cx={xFor(rho)} cy={yFor(L)} r={5} fill="#ffd166" stroke="#0b1228" strokeWidth={1.5} />
            <line x1={xFor(rho)} y1={H - PAD_B} x2={xFor(rho)} y2={yFor(L)} stroke="#ffd166" strokeDasharray="2,2" opacity={0.5} />
            <line x1={PAD_L} y1={yFor(L)} x2={xFor(rho)} y2={yFor(L)} stroke="#ffd166" strokeDasharray="2,2" opacity={0.5} />
          </g>
        )}

        {/* Axes */}
        <line x1={PAD_L} y1={H - PAD_B} x2={W - PAD_R} y2={H - PAD_B} stroke="#444a66" />
        <line x1={PAD_L} y1={PAD_T} x2={PAD_L} y2={H - PAD_B} stroke="#444a66" />

        {[0, 0.25, 0.5, 0.75, 1].map((r) => (
          <g key={`x-${r}`}>
            <line x1={xFor(r)} y1={H - PAD_B} x2={xFor(r)} y2={H - PAD_B + 3} stroke="#666" />
            <text x={xFor(r)} y={H - PAD_B + 14} fill="#9aa3b8" fontSize="9" textAnchor="middle">{r.toFixed(2)}</text>
          </g>
        ))}
        {[0, 3, 6, 9, 12].map((Lv) => (
          <g key={`y-${Lv}`}>
            <line x1={PAD_L - 4} y1={yFor(Lv)} x2={PAD_L} y2={yFor(Lv)} stroke="#666" />
            <text x={PAD_L - 6} y={yFor(Lv) + 3} fill="#9aa3b8" fontSize="9" textAnchor="end">{Lv}</text>
          </g>
        ))}

        <text x={(PAD_L + W - PAD_R) / 2} y={H - 4} fill="#cbd1e6" fontSize="10" textAnchor="middle">utilization ρ = λ/μ</text>
        <text x={14} y={H / 2} fill="#cbd1e6" fontSize="10" transform={`rotate(-90 14 ${H / 2})`} textAnchor="middle">mean # in system L</text>
      </svg>

      <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
        <label className="block">
          λ arrival rate: {lambda.toFixed(2)}
          <input type="range" min={0.05} max={1.5} step={0.01} value={lambda} onChange={(e) => setIntLambda(parseFloat(e.target.value))} disabled={ctlLambda !== undefined} className="w-full mt-0.5" aria-label="Arrival rate lambda" />
        </label>
        <label className="block">
          μ service rate: {mu.toFixed(2)}
          <input type="range" min={0.1} max={2.0} step={0.01} value={mu} onChange={(e) => setIntMu(parseFloat(e.target.value))} disabled={ctlMu !== undefined} className="w-full mt-0.5" aria-label="Service rate mu" />
        </label>
        <div className="col-span-2 grid grid-cols-2 gap-x-3 gap-y-1 mt-1 text-[11px] font-mono">
          <div>L (in system): <span className="text-amber-300">{stable ? L.toFixed(2) : "∞"}</span></div>
          <div>L<sub>q</sub> (in queue): <span className="text-amber-300">{stable ? Lq.toFixed(2) : "∞"}</span></div>
          <div>W (time in system): <span className="text-amber-300">{stable ? Wsys.toFixed(2) : "∞"}</span></div>
          <div>W<sub>q</sub> (wait): <span className="text-amber-300">{stable ? Wq.toFixed(2) : "∞"}</span></div>
        </div>
      </div>
      <div className="mt-2 text-[10px] text-muted-foreground">
        Little's law: L = λW (works for any stable queue, not just M/M/1).
        As ρ → 1, queue length blows up super-linearly: pushing utilization
        from 0.8 to 0.95 quadruples wait time. The universal lesson of
        operations research is to never run a queue at 100% capacity —
        always leave headroom for variability. Multi-server (M/M/c), finite
        buffer, priority, general service-time, and network-of-queues
        generalizations all build on this baseline.
      </div>
    </div>
  );
}
