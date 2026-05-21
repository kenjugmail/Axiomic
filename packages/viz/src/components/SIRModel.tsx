import { useMemo, useState } from "react";

// Interactive SIR (Susceptible-Infected-Recovered) compartmental
// epidemic model. Drag R_0 (basic reproductive number), 1/γ (mean
// infectious period in days), vaccination coverage (removes S
// pre-epidemic), and initial infected fraction. The viz integrates
// the deterministic SIR ODEs and plots S(t), I(t), R(t); marks the
// epidemic peak + final size + herd-immunity threshold. Canonical
// for infectious disease modeling: COVID-19, influenza, measles,
// Ebola — and the gateway to SEIR / age-structured / network models.
//
// Math:
//   dS/dt = -β S I / N
//   dI/dt =  β S I / N - γ I
//   dR/dt =  γ I
//   β = R_0 γ
//   Herd immunity threshold: 1 - 1/R_0

const W = 420;
const H = 240;
const PAD_L = 38;
const PAD_R = 14;
const PAD_T = 14;
const PAD_B = 32;

interface Props {
  r0?: number;
  infectiousDays?: number;
  vaccinated?: number; // 0..1
  initialInfected?: number; // 0..1
}

function integrateSIR(r0: number, gamma: number, s0: number, i0: number, days: number, dt = 0.5) {
  const steps = Math.ceil(days / dt);
  const beta = r0 * gamma;
  const s: number[] = new Array(steps + 1);
  const i: number[] = new Array(steps + 1);
  const r: number[] = new Array(steps + 1);
  s[0] = s0;
  i[0] = i0;
  r[0] = 1 - s0 - i0;
  for (let k = 0; k < steps; k++) {
    const dS = -beta * s[k] * i[k];
    const dI = beta * s[k] * i[k] - gamma * i[k];
    const dR = gamma * i[k];
    s[k + 1] = Math.max(0, s[k] + dS * dt);
    i[k + 1] = Math.max(0, i[k] + dI * dt);
    r[k + 1] = Math.max(0, r[k] + dR * dt);
  }
  return { s, i, r, dt };
}

export function SIRModel({
  r0: ctlR0,
  infectiousDays: ctlDays,
  vaccinated: ctlVacc,
  initialInfected: ctlI0,
}: Props = {}) {
  const [intR0, setIntR0] = useState(2.5);
  const [intDays, setIntDays] = useState(7);
  const [intVacc, setIntVacc] = useState(0);
  const [intI0, setIntI0] = useState(0.001);

  const r0 = ctlR0 ?? intR0;
  const infectiousDays = ctlDays ?? intDays;
  const vaccinated = ctlVacc ?? intVacc;
  const initialInfected = ctlI0 ?? intI0;

  const sim = useMemo(() => {
    const gamma = 1 / infectiousDays;
    const s0 = Math.max(0, 1 - vaccinated - initialInfected);
    const days = 180;
    const { s, i, r, dt } = integrateSIR(r0, gamma, s0, initialInfected, days);
    let peakI = 0;
    let peakDay = 0;
    for (let k = 0; k < i.length; k++) {
      if (i[k] > peakI) {
        peakI = i[k];
        peakDay = k * dt;
      }
    }
    const finalS = s[s.length - 1];
    const finalR = r[r.length - 1];
    const attackRate = 1 - finalS - vaccinated;
    const herd = 1 - 1 / r0;
    return { s, i, r, dt, days, peakI, peakDay, finalS, finalR, attackRate, herd };
  }, [r0, infectiousDays, vaccinated, initialInfected]);

  const xFor = (day: number) => PAD_L + (day / sim.days) * (W - PAD_L - PAD_R);
  const yFor = (frac: number) => PAD_T + (1 - frac) * (H - PAD_T - PAD_B);

  const pathFor = (arr: number[]) => {
    let d = "";
    for (let k = 0; k < arr.length; k++) {
      const x = xFor(k * sim.dt);
      const y = yFor(arr[k]);
      d += k === 0 ? `M ${x.toFixed(1)} ${y.toFixed(1)}` : ` L ${x.toFixed(1)} ${y.toFixed(1)}`;
    }
    return d;
  };

  return (
    <div className="my-4 p-3 rounded-lg border border-border bg-card text-card-foreground">
      <div className="text-sm font-semibold mb-2">SIR epidemic model</div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-auto bg-[#0b1228] rounded-md"
        role="img"
        aria-label="SIR S/I/R curves over time"
      >
        {/* Herd immunity threshold line on S */}
        <line
          x1={PAD_L}
          y1={yFor(1 - sim.herd)}
          x2={W - PAD_R}
          y2={yFor(1 - sim.herd)}
          stroke="#ffd166"
          strokeDasharray="3,3"
          strokeWidth={1}
          opacity={0.5}
        />
        <text x={W - PAD_R - 4} y={yFor(1 - sim.herd) - 3} fill="#ffd166" fontSize="9" textAnchor="end" opacity={0.85}>
          S = 1/R₀ (HIT)
        </text>

        {/* Curves */}
        <path d={pathFor(sim.s)} fill="none" stroke="#7bcbff" strokeWidth={2} />
        <path d={pathFor(sim.r)} fill="none" stroke="#aaffbf" strokeWidth={2} />
        <path d={pathFor(sim.i)} fill="none" stroke="#ff7a7a" strokeWidth={2.5} />

        {/* Peak marker */}
        <circle cx={xFor(sim.peakDay)} cy={yFor(sim.peakI)} r={3} fill="#ff7a7a" stroke="#fff" strokeWidth={1} />
        <text x={xFor(sim.peakDay) + 5} y={yFor(sim.peakI) - 5} fill="#ff7a7a" fontSize="9">
          peak {(sim.peakI * 100).toFixed(1)}% @ day {Math.round(sim.peakDay)}
        </text>

        {/* Axes */}
        <line x1={PAD_L} y1={H - PAD_B} x2={W - PAD_R} y2={H - PAD_B} stroke="#444a66" strokeWidth={1} />
        <line x1={PAD_L} y1={PAD_T} x2={PAD_L} y2={H - PAD_B} stroke="#444a66" strokeWidth={1} />

        {/* Y ticks: 0, 0.25, 0.5, 0.75, 1 */}
        {[0, 0.25, 0.5, 0.75, 1].map((f) => (
          <g key={f}>
            <line x1={PAD_L - 4} y1={yFor(f)} x2={PAD_L} y2={yFor(f)} stroke="#666" />
            <text x={PAD_L - 6} y={yFor(f) + 3} fill="#9aa3b8" fontSize="9" textAnchor="end">
              {(f * 100).toFixed(0)}%
            </text>
          </g>
        ))}

        {/* X ticks */}
        {[0, 30, 60, 90, 120, 150, 180].map((d) => (
          <g key={d}>
            <line x1={xFor(d)} y1={H - PAD_B} x2={xFor(d)} y2={H - PAD_B + 3} stroke="#666" />
            <text x={xFor(d)} y={H - PAD_B + 14} fill="#9aa3b8" fontSize="9" textAnchor="middle">{d}</text>
          </g>
        ))}

        <text x={W / 2} y={H - 4} fill="#cbd1e6" fontSize="10" textAnchor="middle">days</text>
        <text x={10} y={H / 2} fill="#cbd1e6" fontSize="10" transform={`rotate(-90 10 ${H / 2})`} textAnchor="middle">population fraction</text>

        {/* Legend */}
        <g transform={`translate(${PAD_L + 10}, ${PAD_T + 2})`}>
          <rect x={0} y={0} width={130} height={36} fill="#0b1228" fillOpacity={0.6} rx={3} />
          <line x1={6} y1={10} x2={20} y2={10} stroke="#7bcbff" strokeWidth={2} />
          <text x={24} y={13} fill="#cbd1e6" fontSize="9">Susceptible</text>
          <line x1={6} y1={22} x2={20} y2={22} stroke="#ff7a7a" strokeWidth={2.5} />
          <text x={24} y={25} fill="#cbd1e6" fontSize="9">Infected</text>
          <line x1={66} y1={22} x2={80} y2={22} stroke="#aaffbf" strokeWidth={2} />
          <text x={84} y={25} fill="#cbd1e6" fontSize="9">Recov.</text>
        </g>
      </svg>

      <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
        <label className="block">
          R₀: {r0.toFixed(2)}
          <input
            type="range"
            min={0.5}
            max={8}
            step={0.05}
            value={r0}
            onChange={(e) => setIntR0(parseFloat(e.target.value))}
            disabled={ctlR0 !== undefined}
            className="w-full mt-0.5"
            aria-label="Basic reproductive number"
          />
        </label>
        <label className="block">
          Infectious period: {infectiousDays.toFixed(0)} d
          <input
            type="range"
            min={1}
            max={21}
            step={0.5}
            value={infectiousDays}
            onChange={(e) => setIntDays(parseFloat(e.target.value))}
            disabled={ctlDays !== undefined}
            className="w-full mt-0.5"
            aria-label="Mean infectious period"
          />
        </label>
        <label className="block">
          Vaccinated: {(vaccinated * 100).toFixed(0)}%
          <input
            type="range"
            min={0}
            max={0.95}
            step={0.01}
            value={vaccinated}
            onChange={(e) => setIntVacc(parseFloat(e.target.value))}
            disabled={ctlVacc !== undefined}
            className="w-full mt-0.5"
            aria-label="Vaccination coverage"
          />
        </label>
        <label className="block">
          Initial infected: {(initialInfected * 100).toFixed(2)}%
          <input
            type="range"
            min={0.0001}
            max={0.05}
            step={0.0001}
            value={initialInfected}
            onChange={(e) => setIntI0(parseFloat(e.target.value))}
            disabled={ctlI0 !== undefined}
            className="w-full mt-0.5"
            aria-label="Initial infected fraction"
          />
        </label>
      </div>

      <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
        <div className="rounded bg-muted/40 p-2">
          <div className="text-muted-foreground">R_eff(0)</div>
          <div className="font-semibold">{(r0 * Math.max(0, 1 - vaccinated - initialInfected)).toFixed(2)}</div>
        </div>
        <div className="rounded bg-muted/40 p-2">
          <div className="text-muted-foreground">HIT</div>
          <div className="font-semibold">{(sim.herd * 100).toFixed(0)}%</div>
        </div>
        <div className="rounded bg-muted/40 p-2">
          <div className="text-muted-foreground">Peak infected</div>
          <div className="font-semibold">{(sim.peakI * 100).toFixed(1)}%</div>
        </div>
        <div className="rounded bg-muted/40 p-2">
          <div className="text-muted-foreground">Attack rate</div>
          <div className="font-semibold">{(sim.attackRate * 100).toFixed(0)}%</div>
        </div>
      </div>
    </div>
  );
}
