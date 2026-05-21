import { useMemo, useState } from "react";

// Dose-response curves for therapeutic + toxic effects.
// Hill function: E(d) = E_max · d^n / (K^n + d^n) where K = ED50.
// Toxic curve uses LD50 as the K. Therapeutic index TI = LD50 / ED50;
// larger TI = safer drug.

const W = 460;
const H = 320;

interface Props {
  compound?: keyof typeof COMPOUNDS;
}

interface Compound {
  label: string;
  ED50: number;   // mg/kg
  LD50: number;   // mg/kg
  hillN: number;
  note: string;
}

const COMPOUNDS: Record<string, Compound> = {
  acetaminophen: { label: "Acetaminophen", ED50: 15, LD50: 1900, hillN: 2.5, note: "TI ≈ 125; safe but NAPQI metabolite hepatotoxic" },
  benzodiazepine: { label: "Benzodiazepine", ED50: 0.5, LD50: 750, hillN: 2.0, note: "TI ≈ 1500; very safe alone, dangerous with opioids" },
  digoxin: { label: "Digoxin", ED50: 0.001, LD50: 0.003, hillN: 3.5, note: "TI ≈ 3; narrow window, requires monitoring" },
  warfarin: { label: "Warfarin", ED50: 0.05, LD50: 0.2, hillN: 2.8, note: "TI ≈ 4; bleeding risk; INR monitoring" },
  ricin: { label: "Ricin", ED50: 0.000001, LD50: 0.005, hillN: 4.0, note: "no therapeutic use; 1 mg lethal" },
};

function hill(dose: number, K: number, n: number, Emax = 1): number {
  return (Emax * Math.pow(dose, n)) / (Math.pow(K, n) + Math.pow(dose, n));
}

export function DoseResponseCurve({ compound: ctlComp }: Props = {}) {
  const [intComp, setIntComp] = useState<keyof typeof COMPOUNDS>("acetaminophen");
  const [hillOverride, setHillOverride] = useState<number | null>(null);
  const comp = ctlComp ?? intComp;
  const preset = COMPOUNDS[comp];
  const hillN = hillOverride ?? preset.hillN;
  const ED50 = preset.ED50;
  const LD50 = preset.LD50;
  const TI = LD50 / ED50;

  // Log-scale dose axis: from ED50/1000 to LD50*10
  const doseMin = Math.min(ED50, LD50) / 1000;
  const doseMax = Math.max(ED50, LD50) * 10;

  const curves = useMemo(() => {
    const N = 200;
    const therapeutic: Array<{ d: number; r: number }> = [];
    const toxic: Array<{ d: number; r: number }> = [];
    for (let i = 0; i <= N; i++) {
      const logD = Math.log10(doseMin) + (i / N) * (Math.log10(doseMax) - Math.log10(doseMin));
      const d = Math.pow(10, logD);
      therapeutic.push({ d, r: hill(d, ED50, hillN) });
      toxic.push({ d, r: hill(d, LD50, hillN) });
    }
    return { therapeutic, toxic };
  }, [ED50, LD50, hillN, doseMin, doseMax]);

  const baseX = 40;
  const baseY = 20;
  const plotW = W - baseX - 16;
  const plotH = H - baseY - 100;
  const logDmin = Math.log10(doseMin);
  const logDmax = Math.log10(doseMax);
  const xOf = (d: number) => baseX + ((Math.log10(d) - logDmin) / (logDmax - logDmin)) * plotW;
  const yOf = (r: number) => baseY + plotH - r * plotH;

  return (
    <div className="my-4 p-3 rounded-lg border border-border bg-card text-card-foreground">
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-semibold">{preset.label} · ED50 {ED50} · LD50 {LD50} · TI {TI.toFixed(1)}</div>
        <div className="flex gap-1">
          {(Object.keys(COMPOUNDS) as Array<keyof typeof COMPOUNDS>).map((c) => (
            <button key={c} onClick={() => { setIntComp(c); setHillOverride(null); }} disabled={ctlComp !== undefined} className={`px-1.5 py-0.5 rounded text-[9px] ${comp === c ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-accent"}`}>{COMPOUNDS[c].label.slice(0, 7)}</button>
          ))}
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto bg-[#0b1228] rounded-md" role="img" aria-label="Dose-response curve">
        <rect x={baseX} y={baseY} width={plotW} height={plotH} fill="none" stroke="#1f2937" strokeWidth={0.5} />
        {/* Y gridlines */}
        {[0.25, 0.5, 0.75, 1].map((r) => (
          <g key={r}>
            <line x1={baseX} y1={yOf(r)} x2={baseX + plotW} y2={yOf(r)} stroke="#1f2937" strokeWidth={0.3} />
            <text x={baseX - 4} y={yOf(r) + 3} fill="#9aa3b8" fontSize="8" textAnchor="end">{(r * 100).toFixed(0)}%</text>
          </g>
        ))}
        {/* Decade gridlines */}
        {Array.from({ length: Math.ceil(logDmax - logDmin) + 1 }, (_, i) => Math.pow(10, Math.floor(logDmin) + i)).filter((d) => d >= doseMin && d <= doseMax).map((d) => (
          <g key={d}>
            <line x1={xOf(d)} y1={baseY} x2={xOf(d)} y2={baseY + plotH} stroke="#1f2937" strokeWidth={0.3} />
            <text x={xOf(d)} y={baseY + plotH + 10} fill="#9aa3b8" fontSize="7" textAnchor="middle">{d < 0.001 ? d.toExponential(0) : d < 1 ? d.toFixed(3).replace(/\.?0+$/, "") : d.toString()}</text>
          </g>
        ))}
        {/* Therapeutic curve */}
        <path d={curves.therapeutic.map((p, i) => `${i === 0 ? "M" : "L"}${xOf(p.d).toFixed(1)},${yOf(p.r).toFixed(1)}`).join(" ")} fill="none" stroke="#4ecdc4" strokeWidth={2} />
        {/* Toxic curve */}
        <path d={curves.toxic.map((p, i) => `${i === 0 ? "M" : "L"}${xOf(p.d).toFixed(1)},${yOf(p.r).toFixed(1)}`).join(" ")} fill="none" stroke="#ff6b6b" strokeWidth={2} />
        {/* ED50 + LD50 markers */}
        <line x1={xOf(ED50)} y1={baseY} x2={xOf(ED50)} y2={baseY + plotH} stroke="#4ecdc4" strokeWidth={0.6} strokeDasharray="3,2" />
        <text x={xOf(ED50)} y={baseY - 4} fill="#4ecdc4" fontSize="8" textAnchor="middle">ED50</text>
        <line x1={xOf(LD50)} y1={baseY} x2={xOf(LD50)} y2={baseY + plotH} stroke="#ff6b6b" strokeWidth={0.6} strokeDasharray="3,2" />
        <text x={xOf(LD50)} y={baseY - 4} fill="#ff6b6b" fontSize="8" textAnchor="middle">LD50</text>
        {/* Therapeutic window highlight */}
        <rect x={xOf(ED50)} y={baseY} width={Math.max(0, xOf(LD50) - xOf(ED50))} height={plotH} fill="#fbbf24" fillOpacity={0.07} />
        <text x={baseX + plotW / 2} y={H - 76} fill="#cbd1e6" fontSize="9" textAnchor="middle">dose (mg/kg, log scale)</text>
        <g transform={`translate(${baseX + 16}, ${H - 60})`}>
          <line x1={0} y1={4} x2={14} y2={4} stroke="#4ecdc4" strokeWidth={2} /><text x={18} y={7} fill="#cbd1e6" fontSize="9">therapeutic (E/Emax)</text>
          <line x1={130} y1={4} x2={144} y2={4} stroke="#ff6b6b" strokeWidth={2} /><text x={148} y={7} fill="#cbd1e6" fontSize="9">toxic (L/Lmax)</text>
        </g>
      </svg>

      <div className="mt-2 text-xs">
        <label className="block">Hill coefficient n: {hillN.toFixed(2)}
          <input type="range" min={0.5} max={6} step={0.1} value={hillN} onChange={(e) => setHillOverride(parseFloat(e.target.value))} className="w-full mt-0.5" aria-label="Hill" />
        </label>
      </div>
      <div className="mt-1 text-[10px] text-muted-foreground">
        {preset.note}. Therapeutic index TI = LD50/ED50 captures the
        safety margin; warfarin and digoxin have notoriously narrow
        windows (TI ≈ 3-4). Hill coefficient n controls steepness —
        n = 1 is hyperbolic (Michaelis-Menten), n &gt; 1 is sigmoidal
        with cooperative binding. The shaded region between ED50
        and LD50 is the therapeutic window: dose enough for effect
        but below toxic onset. Paracelsus 1538 — "sola dosis facit
        venenum" (the dose alone makes the poison) — remains the
        founding principle of toxicology. Hormesis (Calabrese 2008)
        challenges the monotonic assumption: some compounds (low-dose
        radiation, ethanol, exercise) show beneficial effects at
        sub-toxic doses. Endocrine disruptors (Vandenberg 2012) often
        violate monotonicity entirely.
      </div>
    </div>
  );
}
