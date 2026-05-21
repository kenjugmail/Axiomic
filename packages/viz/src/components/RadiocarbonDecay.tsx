import { useMemo, useState } from "react";

// Radiocarbon (¹⁴C) decay curve. Living organisms maintain an
// atmospheric ¹⁴C/¹²C ratio via the carbon cycle. At death, uptake
// stops + ¹⁴C decays exponentially to ¹⁴N via β⁻ with Libby half-life
// 5568 yr (the original convention still used for reporting; Cambridge
// half-life 5730 yr is the physically correct value). Fraction
// remaining: f(t) = exp(-λ t) with λ = ln(2) / T½.
//
//   Calendar age = -T½ / ln(2) × ln(f)
//
// In practice, calibration via IntCal20 (dendrochronology + corals +
// speleothems + varves) converts radiocarbon years (BP) to calendar
// years (cal BP) because atmospheric ¹⁴C wasn't constant. We show the
// simple exponential here + flag the calibration step. Dating range
// ~50000 yr (beyond, <0.2% ¹⁴C remains — below detection).

const W = 460;
const H = 280;
const PAD_L = 50;
const PAD_R = 14;
const PAD_T = 16;
const PAD_B = 34;

const T_HALF = 5730; // Cambridge half-life (yr); physically correct.
const T_MAX = 60000;

interface Props {
  fractionRemaining?: number;
  halfLife?: number;
}

export function RadiocarbonDecay({ fractionRemaining: ctlF, halfLife: ctlH }: Props = {}) {
  const [intF, setIntF] = useState(0.5);
  const [intH, setIntH] = useState(T_HALF);

  const f = ctlF ?? intF;
  const halfLife = ctlH ?? intH;

  const lambda = Math.log(2) / halfLife;
  const age = -Math.log(Math.max(f, 1e-6)) / lambda;

  const curve = useMemo(() => {
    const arr: { t: number; f: number }[] = [];
    const N = 400;
    for (let i = 0; i <= N; i++) {
      const t = (i / N) * T_MAX;
      arr.push({ t, f: Math.exp(-lambda * t) });
    }
    return arr;
  }, [lambda]);

  const xFor = (t: number) => PAD_L + (t / T_MAX) * (W - PAD_L - PAD_R);
  const yFor = (frac: number) => PAD_T + (1 - frac) * (H - PAD_T - PAD_B);

  const path = useMemo(() => {
    let d = "";
    curve.forEach((p, i) => {
      const x = xFor(p.t);
      const y = yFor(p.f);
      d += i === 0 ? `M ${x.toFixed(1)} ${y.toFixed(1)}` : ` L ${x.toFixed(1)} ${y.toFixed(1)}`;
    });
    return d;
  }, [curve]);

  // Era anchors for context.
  const eras = [
    { label: "modern", t: 100 },
    { label: "Roman", t: 2000 },
    { label: "Pyramids", t: 4600 },
    { label: "Neolithic", t: 10000 },
    { label: "LGM", t: 20000 },
    { label: "Aurignacian", t: 40000 },
  ];

  return (
    <div className="my-4 p-3 rounded-lg border border-border bg-card text-card-foreground">
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-semibold">¹⁴C decay · age {age >= 50000 ? ">50000" : age.toFixed(0)} yr</div>
        <div className="text-xs font-mono text-muted-foreground">f = {f.toFixed(3)}</div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto bg-[#0b1228] rounded-md" role="img" aria-label="Radiocarbon decay curve">
        {/* Half-life markers */}
        {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
          <g key={`hl-${n}`}>
            <line x1={xFor(n * halfLife)} y1={PAD_T} x2={xFor(n * halfLife)} y2={H - PAD_B} stroke="#444a66" strokeDasharray="2,3" opacity={0.4} />
          </g>
        ))}
        {/* Detection floor (~50000 yr) */}
        <line x1={xFor(50000)} y1={PAD_T} x2={xFor(50000)} y2={H - PAD_B} stroke="#ff5a5a" strokeDasharray="3,3" opacity={0.5} />
        <text x={xFor(50000) + 3} y={PAD_T + 10} fill="#ff5a5a" fontSize="9">~50k yr limit</text>

        {/* Era anchors */}
        {eras.map((e) => (
          <g key={e.label}>
            <line x1={xFor(e.t)} y1={H - PAD_B} x2={xFor(e.t)} y2={H - PAD_B - 5} stroke="#9aa3b8" opacity={0.6} />
            <text x={xFor(e.t)} y={H - PAD_B - 7} fill="#9aa3b8" fontSize="8" textAnchor="middle">{e.label}</text>
          </g>
        ))}

        {/* Decay curve */}
        <path d={path} fill="none" stroke="#aaffbf" strokeWidth={2.5} />

        {/* Current point */}
        <circle cx={xFor(Math.min(age, T_MAX))} cy={yFor(f)} r={5} fill="#ffd166" stroke="#0b1228" strokeWidth={1.5} />
        <line x1={xFor(Math.min(age, T_MAX))} y1={H - PAD_B} x2={xFor(Math.min(age, T_MAX))} y2={yFor(f)} stroke="#ffd166" strokeDasharray="2,2" opacity={0.5} />
        <line x1={PAD_L} y1={yFor(f)} x2={xFor(Math.min(age, T_MAX))} y2={yFor(f)} stroke="#ffd166" strokeDasharray="2,2" opacity={0.5} />

        {/* Axes */}
        <line x1={PAD_L} y1={H - PAD_B} x2={W - PAD_R} y2={H - PAD_B} stroke="#444a66" />
        <line x1={PAD_L} y1={PAD_T} x2={PAD_L} y2={H - PAD_B} stroke="#444a66" />

        {[0, 15000, 30000, 45000, 60000].map((t) => (
          <g key={`x-${t}`}>
            <line x1={xFor(t)} y1={H - PAD_B} x2={xFor(t)} y2={H - PAD_B + 3} stroke="#666" />
            <text x={xFor(t)} y={H - PAD_B + 14} fill="#9aa3b8" fontSize="9" textAnchor="middle">{t === 0 ? "0" : `${t / 1000}k`}</text>
          </g>
        ))}
        {[0, 0.25, 0.5, 0.75, 1].map((frac) => (
          <g key={`y-${frac}`}>
            <line x1={PAD_L - 4} y1={yFor(frac)} x2={PAD_L} y2={yFor(frac)} stroke="#666" />
            <text x={PAD_L - 6} y={yFor(frac) + 3} fill="#9aa3b8" fontSize="9" textAnchor="end">{frac.toFixed(2)}</text>
          </g>
        ))}

        <text x={(PAD_L + W - PAD_R) / 2} y={H - 4} fill="#cbd1e6" fontSize="10" textAnchor="middle">years before present (yr BP)</text>
        <text x={14} y={H / 2} fill="#cbd1e6" fontSize="10" transform={`rotate(-90 14 ${H / 2})`} textAnchor="middle">fraction ¹⁴C remaining</text>
      </svg>

      <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
        <label className="block">
          Measured fraction f: {f.toFixed(3)}
          <input type="range" min={0.001} max={1} step={0.001} value={f} onChange={(e) => setIntF(parseFloat(e.target.value))} disabled={ctlF !== undefined} className="w-full mt-0.5" aria-label="Fraction remaining" />
        </label>
        <label className="block">
          Half-life T½: {halfLife.toFixed(0)} yr
          <input type="range" min={5568} max={5730} step={1} value={halfLife} onChange={(e) => setIntH(parseFloat(e.target.value))} disabled={ctlH !== undefined} className="w-full mt-0.5" aria-label="Half-life" />
        </label>
      </div>
      <div className="mt-2 text-[10px] text-muted-foreground">
        Libby half-life 5568 yr (original; still used for reporting); Cambridge
        half-life 5730 yr (physically correct). ¹⁴C dating useful ~300-50000 yr
        BP. Beyond ~50000 yr, &lt;0.2% remains → below detection. Calendar age
        requires IntCal20 calibration because atmospheric ¹⁴C wasn't constant
        (de Vries effect, Suess effect, bomb spike, dendrochronology, varves,
        speleothems, corals). Reported as cal BP relative to AD 1950.
      </div>
    </div>
  );
}
