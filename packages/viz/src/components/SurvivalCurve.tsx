import { useMemo, useState } from "react";

// Life-table survivorship. The l_x curve is the fraction of a birth
// cohort still alive at age x; q_x is the one-year mortality rate. Both
// follow a Gompertz-Makeham hazard μ(x) = A + B·c^x (a constant
// "accident" floor A plus exponentially rising senescence). Over the
// last century the curve has "rectangularized" — more people survive to
// old age, then die within a narrow band — lifting life expectancy e0.

const W = 460;
const H = 320;

interface Era {
  label: string;
  A: number;
  B: number;
  c: number;
}

const ERAS: Record<string, Era> = {
  "1900": { label: "1900", A: 0.010, B: 0.00005, c: 1.095 },
  "1950": { label: "1950", A: 0.003, B: 0.00004, c: 1.095 },
  "2000": { label: "2000", A: 0.0006, B: 0.00003, c: 1.095 },
};

const ORDER = ["1900", "1950", "2000"];
const AGE_MAX = 110;

interface Props {
  era?: keyof typeof ERAS;
}

export function SurvivalCurve({ era: ctlEra }: Props = {}) {
  const [intEra, setIntEra] = useState<keyof typeof ERAS>("1900");
  const era = ctlEra ?? intEra;
  const p = ERAS[era];

  // S(x) = exp(-A·x - (B/ln c)(c^x - 1)); q_x = 1 - S(x+1)/S(x); e0 = ∫S.
  const { surv, qx, e0, median } = useMemo(() => {
    const lnc = Math.log(p.c);
    const S = (x: number) => Math.exp(-p.A * x - (p.B / lnc) * (Math.pow(p.c, x) - 1));
    const surv: number[] = [];
    const qx: number[] = [];
    let e0 = 0;
    let median = AGE_MAX;
    let medianFound = false;
    for (let x = 0; x <= AGE_MAX; x++) {
      const s = S(x);
      surv.push(s);
      qx.push(1 - S(x + 1) / S(x));
      if (x > 0) e0 += (surv[x - 1] + s) / 2; // trapezoidal ∫S dx
      if (!medianFound && s <= 0.5) {
        median = x;
        medianFound = true;
      }
    }
    return { surv, qx, e0, median };
  }, [p.A, p.B, p.c]);

  const baseX = 34;
  const baseY = 16;
  const plotW = W - baseX - 16;
  const plotH = H - baseY - 92;
  const xOf = (age: number) => baseX + (age / AGE_MAX) * plotW;
  const yOf = (frac: number) => baseY + plotH - frac * plotH;

  return (
    <div className="my-4 p-3 rounded-lg border border-border bg-card text-card-foreground">
      <div className="flex items-center justify-between mb-2 flex-wrap gap-1">
        <div className="text-sm font-semibold">
          {p.label} cohort · e₀ ≈ {e0.toFixed(1)} yrs · median age at death ≈ {median}
        </div>
        <div className="flex gap-1">
          {ORDER.map((e) => (
            <button
              key={e}
              onClick={() => setIntEra(e as keyof typeof ERAS)}
              disabled={ctlEra !== undefined}
              className={`px-1.5 py-0.5 rounded text-[9px] ${
                era === e
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted hover:bg-accent"
              }`}
            >
              {ERAS[e].label}
            </button>
          ))}
        </div>
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-auto bg-[#0b1228] rounded-md"
        role="img"
        aria-label="Life-table survivorship curve"
      >
        <rect x={baseX} y={baseY} width={plotW} height={plotH} fill="none" stroke="#1f2937" strokeWidth={0.5} />
        {[0.25, 0.5, 0.75, 1].map((f) => (
          <g key={f}>
            <line x1={baseX} y1={yOf(f)} x2={baseX + plotW} y2={yOf(f)} stroke="#1f2937" strokeWidth={0.3} />
            <text x={baseX - 4} y={yOf(f) + 3} fill="#9aa3b8" fontSize="8" textAnchor="end">{(f * 100).toFixed(0)}</text>
          </g>
        ))}
        {[0, 25, 50, 75, 100].map((age) => (
          <g key={age}>
            <line x1={xOf(age)} y1={baseY} x2={xOf(age)} y2={baseY + plotH} stroke="#1f2937" strokeWidth={0.3} />
            <text x={xOf(age)} y={baseY + plotH + 11} fill="#9aa3b8" fontSize="8" textAnchor="middle">{age}</text>
          </g>
        ))}
        {/* median age at death marker */}
        <line x1={xOf(median)} y1={yOf(0.5)} x2={xOf(median)} y2={baseY + plotH} stroke="#a78bfa" strokeWidth={0.6} strokeDasharray="2,2" />
        {/* survivorship l_x */}
        <path d={surv.map((s, x) => `${x === 0 ? "M" : "L"}${xOf(x).toFixed(1)},${yOf(s).toFixed(1)}`).join(" ")} fill="none" stroke="#4ade80" strokeWidth={2} />
        {/* mortality q_x (scaled to plot height) */}
        <path d={qx.map((q, x) => `${x === 0 ? "M" : "L"}${xOf(x).toFixed(1)},${yOf(Math.min(q, 1)).toFixed(1)}`).join(" ")} fill="none" stroke="#ff6b6b" strokeWidth={1.4} strokeDasharray="3,2" />
        <text x={12} y={baseY + plotH / 2} fill="#cbd1e6" fontSize="9" textAnchor="middle" transform={`rotate(-90 12 ${baseY + plotH / 2})`}>survivors per 100</text>
        <g transform={`translate(${baseX + 12}, ${H - 64})`}>
          <line x1={0} y1={4} x2={14} y2={4} stroke="#4ade80" strokeWidth={2} /><text x={18} y={7} fill="#cbd1e6" fontSize="9">l_x survivorship</text>
          <line x1={120} y1={4} x2={134} y2={4} stroke="#ff6b6b" strokeWidth={1.4} strokeDasharray="3,2" /><text x={138} y={7} fill="#cbd1e6" fontSize="9">q_x mortality rate</text>
        </g>
        <text x={baseX + plotW / 2} y={H - 44} fill="#cbd1e6" fontSize="9" textAnchor="middle">age x</text>
      </svg>

      <div className="mt-1 text-[10px] text-muted-foreground">
        Survivorship l_x (green) is the share of a cohort alive at age x;
        the dashed q_x (red) is the annual mortality rate, rising
        exponentially with age. Life expectancy e₀ is the area under l_x.
        John Graunt built the first life table from London's Bills of
        Mortality (1662); Edmond Halley's Breslau table (1693) let annuity
        prices be computed; Benjamin Gompertz (1825) and William Makeham
        (1860) gave the hazard its A + B·c^x law. Watch the curve
        rectangularize from 1900 → 2000 as e₀ climbs.
      </div>
    </div>
  );
}
