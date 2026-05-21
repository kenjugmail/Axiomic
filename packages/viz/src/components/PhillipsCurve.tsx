import { useMemo, useState } from "react";

// Interactive expectations-augmented Phillips curve. Plots
//   π = π_e − β (u − u*) + ε
// with adjustable inflation expectations π_e, NAIRU u*, slope β, +
// supply-shock magnitude ε. Overlays historical reference points
// (1970s stagflation, Volcker disinflation 1979-83, Great Moderation,
// 2008 + 2022 inflation episodes). Drag inputs; see short-run curve
// shift + vertical long-run curve at NAIRU.

const W = 460;
const H = 280;
const PAD_L = 50;
const PAD_R = 14;
const PAD_T = 16;
const PAD_B = 34;

const U_MIN = 2; // unemployment %
const U_MAX = 12;
const PI_MIN = -2; // inflation %
const PI_MAX = 15;

type HistoricalPoint = { label: string; u: number; pi: number; color: string };
const HISTORICAL: HistoricalPoint[] = [
  { label: "1960s low-π", u: 4.5, pi: 2.0, color: "#aaffbf" },
  { label: "1975 stagflation", u: 8.5, pi: 9.1, color: "#ff7a7a" },
  { label: "1980 Volcker peak π", u: 7.0, pi: 13.5, color: "#ff7a7a" },
  { label: "1983 Volcker disinflation", u: 10.4, pi: 3.2, color: "#ffd166" },
  { label: "1990s Great Moderation", u: 4.2, pi: 2.7, color: "#aaffbf" },
  { label: "2009 recession", u: 9.6, pi: -0.4, color: "#ff9b6a" },
  { label: "2015 ZLB era", u: 5.3, pi: 0.1, color: "#7bcbff" },
  { label: "2022 inflation surge", u: 3.6, pi: 8.0, color: "#ff7a7a" },
  { label: "2024 disinflation", u: 4.1, pi: 2.6, color: "#aaffbf" },
];

interface Props {
  piE?: number;
  nairu?: number;
  beta?: number;
  shock?: number;
}

export function PhillipsCurve({
  piE: ctlPiE,
  nairu: ctlNairu,
  beta: ctlBeta,
  shock: ctlShock,
}: Props = {}) {
  const [intPiE, setIntPiE] = useState(2.0);
  const [intNairu, setIntNairu] = useState(4.5);
  const [intBeta, setIntBeta] = useState(0.8);
  const [intShock, setIntShock] = useState(0);

  const piE = ctlPiE ?? intPiE;
  const nairu = ctlNairu ?? intNairu;
  const beta = ctlBeta ?? intBeta;
  const shock = ctlShock ?? intShock;

  // Short-run curve points
  const curve = useMemo(() => {
    const arr: { u: number; pi: number }[] = [];
    for (let u = U_MIN; u <= U_MAX; u += 0.1) {
      const pi = piE - beta * (u - nairu) + shock;
      arr.push({ u, pi });
    }
    return arr;
  }, [piE, nairu, beta, shock]);

  const xFor = (u: number) => PAD_L + ((u - U_MIN) / (U_MAX - U_MIN)) * (W - PAD_L - PAD_R);
  const yFor = (pi: number) =>
    PAD_T + (1 - (pi - PI_MIN) / (PI_MAX - PI_MIN)) * (H - PAD_T - PAD_B);

  const path = useMemo(() => {
    let d = "";
    curve.forEach((p, i) => {
      const x = xFor(p.u);
      const y = yFor(p.pi);
      d += i === 0 ? `M ${x.toFixed(1)} ${y.toFixed(1)}` : ` L ${x.toFixed(1)} ${y.toFixed(1)}`;
    });
    return d;
  }, [curve]);

  return (
    <div className="my-4 p-3 rounded-lg border border-border bg-card text-card-foreground">
      <div className="text-sm font-semibold mb-2">Expectations-augmented Phillips curve</div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto bg-[#0b1228] rounded-md" role="img" aria-label="Phillips curve diagram">
        {/* Long-run vertical line at NAIRU */}
        <line x1={xFor(nairu)} y1={PAD_T} x2={xFor(nairu)} y2={H - PAD_B} stroke="#ffd166" strokeDasharray="3,3" />
        <text x={xFor(nairu) + 3} y={PAD_T + 10} fill="#ffd166" fontSize="9">LRPC (NAIRU = {nairu}%)</text>

        {/* π = 0 reference */}
        <line x1={PAD_L} y1={yFor(0)} x2={W - PAD_R} y2={yFor(0)} stroke="#444a66" strokeDasharray="2,3" />

        {/* Short-run curve */}
        <path d={path} fill="none" stroke="#7bcbff" strokeWidth={2.5} />
        <text x={xFor(U_MAX - 0.5)} y={yFor(curve[curve.length - 1].pi) - 5} fill="#7bcbff" fontSize="9">SRPC</text>

        {/* Historical points */}
        {HISTORICAL.map((h, i) => (
          <g key={i}>
            <circle cx={xFor(h.u)} cy={yFor(h.pi)} r={4} fill={h.color} stroke="#fff" strokeWidth={1} />
            <text x={xFor(h.u) + 6} y={yFor(h.pi) + 3} fill={h.color} fontSize="8">{h.label}</text>
          </g>
        ))}

        {/* Axes */}
        <line x1={PAD_L} y1={H - PAD_B} x2={W - PAD_R} y2={H - PAD_B} stroke="#444a66" />
        <line x1={PAD_L} y1={PAD_T} x2={PAD_L} y2={H - PAD_B} stroke="#444a66" />

        {[2, 4, 6, 8, 10, 12].map((u) => (
          <g key={`x-${u}`}>
            <line x1={xFor(u)} y1={H - PAD_B} x2={xFor(u)} y2={H - PAD_B + 3} stroke="#666" />
            <text x={xFor(u)} y={H - PAD_B + 14} fill="#9aa3b8" fontSize="9" textAnchor="middle">{u}</text>
          </g>
        ))}
        {[-2, 0, 4, 8, 12].map((pi) => (
          <g key={`y-${pi}`}>
            <line x1={PAD_L - 4} y1={yFor(pi)} x2={PAD_L} y2={yFor(pi)} stroke="#666" />
            <text x={PAD_L - 6} y={yFor(pi) + 3} fill="#9aa3b8" fontSize="9" textAnchor="end">{pi}%</text>
          </g>
        ))}

        <text x={(PAD_L + W - PAD_R) / 2} y={H - 4} fill="#cbd1e6" fontSize="10" textAnchor="middle">unemployment rate u (%)</text>
        <text x={12} y={H / 2} fill="#cbd1e6" fontSize="10" transform={`rotate(-90 12 ${H / 2})`} textAnchor="middle">inflation π (%)</text>
      </svg>

      <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
        <label className="block">
          Expectations π_e: {piE.toFixed(1)}%
          <input type="range" min={-1} max={10} step={0.1} value={piE} onChange={(e) => setIntPiE(parseFloat(e.target.value))} disabled={ctlPiE !== undefined} className="w-full mt-0.5" aria-label="Inflation expectations" />
        </label>
        <label className="block">
          NAIRU u*: {nairu.toFixed(1)}%
          <input type="range" min={2} max={8} step={0.1} value={nairu} onChange={(e) => setIntNairu(parseFloat(e.target.value))} disabled={ctlNairu !== undefined} className="w-full mt-0.5" aria-label="Natural rate of unemployment" />
        </label>
        <label className="block">
          Slope β: {beta.toFixed(2)}
          <input type="range" min={0.1} max={2.0} step={0.05} value={beta} onChange={(e) => setIntBeta(parseFloat(e.target.value))} disabled={ctlBeta !== undefined} className="w-full mt-0.5" aria-label="Phillips curve slope" />
        </label>
        <label className="block">
          Supply shock ε: {shock.toFixed(1)}%
          <input type="range" min={-3} max={6} step={0.1} value={shock} onChange={(e) => setIntShock(parseFloat(e.target.value))} disabled={ctlShock !== undefined} className="w-full mt-0.5" aria-label="Supply shock" />
        </label>
      </div>

      <div className="mt-2 text-[10px] text-muted-foreground">
        π = π_e − β(u − u*) + ε. SRPC (short-run): downward-sloping; raising π_e shifts up. LRPC (long-run): vertical at NAIRU (Friedman + Phelps 1968) — no permanent unemployment-inflation tradeoff. Stagflation (1975, 1980): positive supply shock + high expectations push curve up. Volcker disinflation (1979-83): credible commitment + induced recession lowered π_e. 2022 surge: pandemic supply chains + commodity shocks + post-ZLB demand → curve shift.
      </div>
    </div>
  );
}
