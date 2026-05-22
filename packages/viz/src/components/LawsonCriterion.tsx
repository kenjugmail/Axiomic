import { useMemo, useState } from "react";

// Lawson criterion + fusion triple product. The condition for a
// self-sustaining fusion plasma is nτE T ≳ 3×10²¹ keV·s/m³ for D-T.
// We plot the ignition curve in (T, nτE) space and let the user drag
// density × confinement time + temperature to see whether the plasma
// is sub-breakeven, breakeven (Q=1), or ignition (Q=∞). Anchor points
// for major machines (TFTR 1994 Q≈0.27, JET 1997 Q≈0.67, JET 2022
// 59 MJ, ITER target Q=10, SPARC target Q≈11, NIF Dec 2022 ignition).

const W = 460;
const H = 320;

interface Props {
  T?: number;        // keV
  ntau?: number;     // n*tauE in 10^20 m^-3 * s (log scale on x)
}

// D-T cross section ⟨σv⟩ approximation in m^3/s, valid for ~5-50 keV.
// Bosch-Hale style polynomial fit (truncated, qualitative).
function sigmaV_DT(T_keV: number) {
  const T = Math.max(0.5, T_keV);
  const theta = T / (1 - (T * (0.0166 + T * (0.0000168))) / (1 + T * (0.0476 + T * 0.00114)));
  const xi = 6.661 / Math.pow(theta, 1 / 3);
  return 1.17e-15 * theta * Math.sqrt(xi / (1.124656e6 * T * T * T)) * Math.exp(-3 * xi);
}

// Ignition condition (no Bremsstrahlung losses for simplicity):
//   nτE > 12 kT / (⟨σv⟩ Eα)  with Eα = 3.5 MeV for D-T alpha.
// Plot as nτE_min(T) vs T.
function nTauMin(T_keV: number) {
  const Ealpha_J = 3.5e6 * 1.602e-19;
  const k_J_per_keV = 1.602e-16;
  const sv = sigmaV_DT(T_keV);
  if (sv <= 0) return 1e30;
  return (12 * T_keV * k_J_per_keV) / (sv * Ealpha_J);
}

export function LawsonCriterion({ T: ctlT, ntau: ctlN }: Props = {}) {
  const [intT, setIntT] = useState(15);
  const [intN, setIntN] = useState(2.0);
  const T = ctlT ?? intT;
  const ntau = ctlN ?? intN;

  const baseX = 50;
  const baseY = 20;
  const plotW = W - 70;
  const plotH = H - 80;
  // x: T in keV from 1 to 100 (linear)
  // y: nτE in 10^20 m^-3 s from 0.01 to 1000 (log)
  const xMin = 1;
  const xMax = 100;
  const yMinL = -2;     // log10(0.01)
  const yMaxL = 3;      // log10(1000)
  const xOf = (t: number) => baseX + ((t - xMin) / (xMax - xMin)) * plotW;
  const yOf = (logN: number) => baseY + ((yMaxL - logN) / (yMaxL - yMinL)) * plotH;

  // Ignition curve
  const ignitionPath = useMemo(() => {
    const pts: string[] = [];
    for (let t = xMin; t <= xMax; t += 1) {
      const nt = nTauMin(t); // in m^-3 s
      const nt20 = nt / 1e20;
      const logNt = Math.log10(Math.max(1e-5, nt20));
      const cmd = pts.length === 0 ? "M" : "L";
      pts.push(`${cmd}${xOf(t).toFixed(2)},${yOf(logNt).toFixed(2)}`);
    }
    return pts.join(" ");
  }, []);

  // User point
  const userLogN = Math.log10(Math.max(1e-5, ntau));
  const requiredNT = nTauMin(T) / 1e20;
  const ratio = ntau / requiredNT;
  let status: { label: string; color: string };
  if (ratio >= 1) status = { label: `ignition (margin ${ratio.toFixed(2)}×)`, color: "#4ecdc4" };
  else if (ratio >= 0.5) status = { label: `near breakeven (${(ratio * 100).toFixed(0)}%)`, color: "#fbbf24" };
  else status = { label: `subcritical (${(ratio * 100).toFixed(0)}%)`, color: "#ff6b6b" };

  // Anchor machines (T_keV, nτE in 10^20 m^-3 s)
  const anchors = [
    { name: "TFTR 1994", T: 10, n: 0.1, color: "#94a3b8" },
    { name: "JET 1997", T: 13, n: 0.4, color: "#94a3b8" },
    { name: "JT-60U 1998", T: 30, n: 1.5, color: "#94a3b8" },
    { name: "JET 2022 (59 MJ)", T: 13, n: 1.0, color: "#a78bfa" },
    { name: "ITER target", T: 20, n: 3.0, color: "#4ecdc4" },
    { name: "SPARC target", T: 12, n: 4.0, color: "#4ecdc4" },
  ];

  return (
    <div className="my-4 p-3 rounded-lg border border-border bg-card text-card-foreground">
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-semibold">Lawson · T={T} keV · nτE={ntau.toFixed(2)}×10²⁰ m⁻³s · <span style={{ color: status.color }}>{status.label}</span></div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto bg-[#0b1228] rounded-md" role="img" aria-label="Lawson criterion plot">
        <rect x={baseX} y={baseY} width={plotW} height={plotH} fill="none" stroke="#475569" strokeWidth={0.5} />
        {/* Y log gridlines */}
        {[-2, -1, 0, 1, 2, 3].map((l) => (
          <g key={`yg-${l}`}>
            <line x1={baseX} y1={yOf(l)} x2={baseX + plotW} y2={yOf(l)} stroke="#1f2937" strokeWidth={0.4} />
            <text x={baseX - 4} y={yOf(l) + 3} fill="#9aa3b8" fontSize="8" textAnchor="end">10{l < 0 ? "⁻" + String.fromCharCode(0x2070 + Math.abs(l)) : String.fromCharCode(0x2070 + l)}</text>
          </g>
        ))}
        {/* X gridlines */}
        {[1, 10, 20, 50, 100].map((t) => (
          <g key={`xg-${t}`}>
            <line x1={xOf(t)} y1={baseY} x2={xOf(t)} y2={baseY + plotH} stroke="#1f2937" strokeWidth={0.4} />
            <text x={xOf(t)} y={baseY + plotH + 12} fill="#9aa3b8" fontSize="8" textAnchor="middle">{t}</text>
          </g>
        ))}
        {/* Ignition curve + shaded ignited region */}
        <path d={`${ignitionPath} L${xOf(xMax).toFixed(2)},${yOf(yMaxL).toFixed(2)} L${xOf(xMin).toFixed(2)},${yOf(yMaxL).toFixed(2)} Z`} fill="#4ecdc4" opacity={0.08} />
        <path d={ignitionPath} fill="none" stroke="#4ecdc4" strokeWidth={1.5} />
        <text x={xOf(50)} y={yOf(2.5)} fill="#4ecdc4" fontSize="9" textAnchor="middle" opacity={0.8}>ignited</text>
        <text x={xOf(15)} y={yOf(-1)} fill="#ff6b6b" fontSize="9" textAnchor="middle" opacity={0.7}>subcritical</text>
        {/* Anchor points */}
        {anchors.map((a) => (
          <g key={a.name}>
            <circle cx={xOf(a.T)} cy={yOf(Math.log10(a.n))} r={3.5} fill={a.color} stroke="#0b1228" strokeWidth={0.5} />
            <text x={xOf(a.T) + 5} y={yOf(Math.log10(a.n)) + 3} fill={a.color} fontSize="7.5">{a.name}</text>
          </g>
        ))}
        {/* User point */}
        <circle cx={xOf(T)} cy={yOf(userLogN)} r={6} fill={status.color} stroke="#fff" strokeWidth={1.5} />
        {/* Axes labels */}
        <text x={baseX + plotW / 2} y={baseY + plotH + 24} fill="#cbd1e6" fontSize="10" textAnchor="middle">ion temperature T (keV)</text>
        <text x={12} y={baseY + plotH / 2} fill="#cbd1e6" fontSize="10" textAnchor="middle" transform={`rotate(-90, 12, ${baseY + plotH / 2})`}>nτE (10²⁰ m⁻³·s)</text>
      </svg>

      <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
        <label className="block">Temperature T: {T} keV
          <input type="range" min={1} max={100} step={1} value={T} onChange={(e) => setIntT(parseFloat(e.target.value))} disabled={ctlT !== undefined} className="w-full mt-0.5" aria-label="Plasma temperature" />
        </label>
        <label className="block">nτE: {ntau.toFixed(2)}×10²⁰ m⁻³·s
          <input type="range" min={0.01} max={20} step={0.05} value={ntau} onChange={(e) => setIntN(parseFloat(e.target.value))} disabled={ctlN !== undefined} className="w-full mt-0.5" aria-label="n times tauE" />
        </label>
      </div>
      <div className="mt-2 text-[10px] text-muted-foreground">
        Lawson (1957) criterion + fusion triple product. For D-T fusion
        ignition (alphas alone sustain plasma) nτE T ≳ 3×10²¹ keV·s/m³,
        minimum near T ≈ 15-20 keV where ⟨σv⟩/T² peaks. Cross-section
        approximation is Bosch-Hale (1992). Anchor points: TFTR (1994
        Q≈0.27), JET (1997 Q≈0.67; 2022 59 MJ over 5 s), JT-60U (1998
        equivalent Q≈1.25), ITER (target Q=10 ~500 MW, first plasma
        deferred to ~2034), SPARC (private CFS, target Q≈11). NIF
        ICF achieved scientific ignition Dec 2022 (Q_target = 1.5).
      </div>
    </div>
  );
}
