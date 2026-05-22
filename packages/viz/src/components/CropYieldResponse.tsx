import { useMemo, useState } from "react";

// Crop yield response to a nutrient. The Mitscherlich equation
// Y = Ymax(1 − e^(−c·x)) captures diminishing returns: each extra kg of
// fertilizer adds less yield than the last, and yield asymptotes toward
// the ceiling set by the *limiting* nutrient (Liebig's Law of the
// Minimum). The economic optimum sits below the agronomic maximum.

const W = 460;
const H = 320;

interface Nutrient {
  label: string;
  Ymax: number; // t/ha ceiling for this nutrient
  c: number; // response rate
}

const NUTRIENTS: Record<string, Nutrient> = {
  nitrogen: { label: "Nitrogen", Ymax: 12, c: 0.018 },
  phosphorus: { label: "Phosphorus", Ymax: 10, c: 0.03 },
  potassium: { label: "Potassium", Ymax: 9, c: 0.025 },
};

const ORDER = ["nitrogen", "phosphorus", "potassium"];
const X_MAX = 200; // kg/ha

interface Props {
  nutrient?: keyof typeof NUTRIENTS;
}

export function CropYieldResponse({ nutrient: ctlNut }: Props = {}) {
  const [intNut, setIntNut] = useState<keyof typeof NUTRIENTS>("nitrogen");
  const [rate, setRate] = useState(80);
  const nut = ctlNut ?? intNut;
  const p = NUTRIENTS[nut];

  const yieldAt = (x: number) => p.Ymax * (1 - Math.exp(-p.c * x));
  const marginal = (x: number) => p.Ymax * p.c * Math.exp(-p.c * x);
  const y = yieldAt(rate);
  const mY = marginal(rate);

  const curve = useMemo(() => {
    const pts: Array<{ x: number; y: number }> = [];
    for (let x = 0; x <= X_MAX; x += 2) pts.push({ x, y: yieldAt(x) });
    return pts;
  }, [p.Ymax, p.c]);

  const baseX = 38;
  const baseY = 16;
  const plotW = W - baseX - 16;
  const plotH = H - baseY - 96;
  const yMax = 13;
  const xOf = (x: number) => baseX + (x / X_MAX) * plotW;
  const yOf = (v: number) => baseY + plotH - (v / yMax) * plotH;

  return (
    <div className="my-4 p-3 rounded-lg border border-border bg-card text-card-foreground">
      <div className="flex items-center justify-between mb-2 flex-wrap gap-1">
        <div className="text-sm font-semibold">
          {p.label} · {rate} kg/ha → {y.toFixed(1)} t/ha · marginal {mY.toFixed(3)} t per kg
        </div>
        <div className="flex gap-1">
          {ORDER.map((n) => (
            <button
              key={n}
              onClick={() => setIntNut(n as keyof typeof NUTRIENTS)}
              disabled={ctlNut !== undefined}
              className={`px-1.5 py-0.5 rounded text-[9px] ${
                nut === n
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted hover:bg-accent"
              }`}
            >
              {NUTRIENTS[n].label}
            </button>
          ))}
        </div>
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-auto bg-[#0b1228] rounded-md"
        role="img"
        aria-label="Crop yield response curve"
      >
        <rect x={baseX} y={baseY} width={plotW} height={plotH} fill="none" stroke="#1f2937" strokeWidth={0.5} />
        {[3, 6, 9, 12].map((v) => (
          <g key={v}>
            <line x1={baseX} y1={yOf(v)} x2={baseX + plotW} y2={yOf(v)} stroke="#1f2937" strokeWidth={0.3} />
            <text x={baseX - 4} y={yOf(v) + 3} fill="#9aa3b8" fontSize="8" textAnchor="end">{v}</text>
          </g>
        ))}
        {[0, 50, 100, 150, 200].map((x) => (
          <g key={x}>
            <line x1={xOf(x)} y1={baseY} x2={xOf(x)} y2={baseY + plotH} stroke="#1f2937" strokeWidth={0.3} />
            <text x={xOf(x)} y={baseY + plotH + 11} fill="#9aa3b8" fontSize="8" textAnchor="middle">{x}</text>
          </g>
        ))}
        {/* Liebig ceiling */}
        <line x1={baseX} y1={yOf(p.Ymax)} x2={baseX + plotW} y2={yOf(p.Ymax)} stroke="#4ade80" strokeWidth={0.6} strokeDasharray="4,3" />
        <text x={baseX + plotW - 4} y={yOf(p.Ymax) - 3} fill="#4ade80" fontSize="8" textAnchor="end">Ymax (limiting)</text>
        {/* response curve */}
        <path d={curve.map((q, i) => `${i === 0 ? "M" : "L"}${xOf(q.x).toFixed(1)},${yOf(q.y).toFixed(1)}`).join(" ")} fill="none" stroke="#fbbf24" strokeWidth={2} />
        {/* marker */}
        <line x1={xOf(rate)} y1={baseY} x2={xOf(rate)} y2={baseY + plotH} stroke="#38bdf8" strokeWidth={0.6} strokeDasharray="2,2" />
        <circle cx={xOf(rate)} cy={yOf(y)} r={4} fill="#38bdf8" />
        <text x={baseX + plotW / 2} y={H - 72} fill="#cbd1e6" fontSize="9" textAnchor="middle">nutrient applied (kg/ha)</text>
        <text x={12} y={baseY + plotH / 2} fill="#cbd1e6" fontSize="9" textAnchor="middle" transform={`rotate(-90 12 ${baseY + plotH / 2})`}>yield (t/ha)</text>
      </svg>

      <div className="mt-2 text-xs">
        <label className="block">
          application rate: {rate} kg/ha
          <input
            type="range"
            min={0}
            max={X_MAX}
            step={5}
            value={rate}
            onChange={(e) => setRate(parseInt(e.target.value))}
            className="w-full mt-0.5"
            aria-label="Application rate"
          />
        </label>
      </div>
      <div className="mt-1 text-[10px] text-muted-foreground">
        The curve is Mitscherlich's diminishing-returns law: marginal yield
        falls as you add more, approaching the ceiling <b>Ymax</b> set by
        whichever nutrient is scarcest — Justus von Liebig's 1840 Law of
        the Minimum (the "Liebig barrel"). Past the economic optimum (where
        the marginal yield's value equals the fertilizer's cost), more
        input loses money and risks runoff + eutrophication. Norman
        Borlaug's Green Revolution paired responsive semi-dwarf varieties
        with fertilizer to shift the whole curve upward.
      </div>
    </div>
  );
}
