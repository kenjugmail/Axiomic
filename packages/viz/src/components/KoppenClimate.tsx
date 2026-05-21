import { useMemo, useState } from "react";

// Köppen-Geiger climate classifier. Drag mean annual temperature
// (°C) + total annual precipitation (mm) + the seasonal pattern;
// see which climate zone the climograph falls into.
// Stylized 12-month bar of temperature + precipitation underneath.

const W = 460;
const H = 320;

interface Props {
  location?: keyof typeof PRESETS;
}

interface Climate {
  label: string;
  monthlyTempC: number[];   // 12 months Jan-Dec, °C
  monthlyPrecipMm: number[]; // 12 months, mm
}

const PRESETS: Record<string, Climate> = {
  singapore: { label: "Singapore", monthlyTempC: [26, 27, 28, 28, 28, 28, 28, 28, 28, 27, 27, 26], monthlyPrecipMm: [240, 165, 175, 155, 175, 165, 165, 195, 175, 195, 250, 290] },
  cairo: { label: "Cairo", monthlyTempC: [14, 15, 18, 23, 27, 29, 30, 30, 28, 25, 20, 15], monthlyPrecipMm: [5, 4, 4, 1, 1, 0, 0, 0, 0, 1, 4, 6] },
  denver: { label: "Denver", monthlyTempC: [-1, 1, 5, 9, 14, 20, 23, 22, 17, 11, 4, 0], monthlyPrecipMm: [13, 15, 32, 47, 62, 50, 49, 41, 31, 27, 19, 14] },
  london: { label: "London", monthlyTempC: [5, 5, 7, 9, 13, 16, 18, 18, 15, 11, 8, 5], monthlyPrecipMm: [55, 40, 41, 44, 49, 45, 45, 50, 50, 69, 59, 55] },
  fairbanks: { label: "Fairbanks", monthlyTempC: [-23, -19, -12, -2, 9, 15, 16, 13, 7, -5, -16, -22], monthlyPrecipMm: [13, 11, 8, 6, 14, 36, 56, 56, 32, 21, 16, 16] },
  rome: { label: "Rome", monthlyTempC: [8, 9, 11, 13, 18, 22, 25, 25, 21, 17, 12, 9], monthlyPrecipMm: [88, 85, 75, 75, 60, 35, 22, 30, 65, 100, 105, 95] },
  mumbai: { label: "Mumbai", monthlyTempC: [24, 25, 27, 29, 30, 29, 28, 27, 28, 28, 27, 26], monthlyPrecipMm: [1, 1, 0, 1, 11, 540, 800, 530, 305, 60, 17, 4] },
};

// Köppen-Geiger classifier — simplified version covering the main groups
function classify(temps: number[], precips: number[]): { code: string; label: string } {
  const meanT = temps.reduce((s, v) => s + v, 0) / temps.length;
  const annualP = precips.reduce((s, v) => s + v, 0);
  const minT = Math.min(...temps);
  const maxT = Math.max(...temps);
  const summerStart = meanT > 0 ? 5 : 5;
  const summerMonths = temps.slice(summerStart, summerStart + 4);  // approximate
  const summerP = precips.slice(summerStart, summerStart + 4).reduce((s, v) => s + v, 0);
  const winterMonths = [...precips.slice(0, 3), ...precips.slice(9)];
  const winterP = winterMonths.reduce((s, v) => s + v, 0);
  void summerMonths;

  // Aridity threshold (Köppen formula)
  const arid = 20 * meanT + (summerP > winterP * 2.3 ? 280 : winterP > summerP * 2.3 ? 0 : 140);
  if (annualP < arid / 2) return { code: "BW", label: `Arid desert (mean ${meanT.toFixed(0)}°C, ${annualP.toFixed(0)}mm)` };
  if (annualP < arid) return { code: "BS", label: `Semi-arid steppe (mean ${meanT.toFixed(0)}°C, ${annualP.toFixed(0)}mm)` };

  if (minT >= 18) {
    if (Math.min(...precips) >= 60) return { code: "Af", label: "Tropical rainforest" };
    if (Math.min(...precips) >= 100 - annualP / 25) return { code: "Am", label: "Tropical monsoon" };
    return { code: "Aw", label: "Tropical savanna" };
  }

  if (minT >= -3 && minT < 18) {
    if (maxT >= 22) return { code: "Cfa", label: "Humid subtropical" };
    if (maxT < 22 && temps.filter((t) => t >= 10).length >= 4) return { code: "Cfb", label: "Marine west coast" };
    return { code: "Csa", label: "Mediterranean" };
  }
  if (minT < -3) {
    if (maxT >= 22) return { code: "Dfa", label: "Humid continental hot summer" };
    if (maxT >= 10) return { code: "Dfb", label: "Humid continental warm summer" };
    if (maxT >= 0) return { code: "Dfc", label: "Subarctic" };
    return { code: "ET", label: "Tundra" };
  }
  return { code: "EF", label: "Ice cap" };
}

export function KoppenClimate({ location: ctlLoc }: Props = {}) {
  const [intLoc, setIntLoc] = useState<keyof typeof PRESETS>("denver");
  const loc = ctlLoc ?? intLoc;
  const climate = PRESETS[loc];

  const cls = useMemo(() => classify(climate.monthlyTempC, climate.monthlyPrecipMm), [climate]);
  const meanT = climate.monthlyTempC.reduce((s, v) => s + v, 0) / 12;
  const annualP = climate.monthlyPrecipMm.reduce((s, v) => s + v, 0);
  const maxP = Math.max(...climate.monthlyPrecipMm);

  const baseX = 30;
  const baseY = 24;
  const plotW = W - baseX - 30;
  const plotH = H - baseY - 100;
  const monthW = plotW / 12;
  const monthLabels = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];

  // Temp on y-axis 0 = bottom +35°C top, with negatives wrapping
  const tMin = -30;
  const tMax = 35;
  const yOfT = (t: number) => baseY + plotH - ((t - tMin) / (tMax - tMin)) * plotH;
  const yOfP = (p: number) => baseY + plotH - (p / maxP) * plotH;

  return (
    <div className="my-4 p-3 rounded-lg border border-border bg-card text-card-foreground">
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-semibold">{climate.label} · {cls.code} <span className="text-muted-foreground">{cls.label}</span> · mean {meanT.toFixed(1)}°C · {annualP.toFixed(0)} mm/yr</div>
        <div className="flex gap-1">
          {(Object.keys(PRESETS) as Array<keyof typeof PRESETS>).map((p) => (
            <button key={p} onClick={() => setIntLoc(p)} disabled={ctlLoc !== undefined} className={`px-1 py-0.5 rounded text-[8px] ${loc === p ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-accent"}`}>{PRESETS[p].label.split(" ")[0].slice(0, 6)}</button>
          ))}
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto bg-[#0b1228] rounded-md" role="img" aria-label="Climograph">
        <rect x={baseX} y={baseY} width={plotW} height={plotH} fill="none" stroke="#1f2937" strokeWidth={0.5} />
        {/* Temperature gridlines */}
        {[-20, 0, 20].map((t) => (
          <g key={t}>
            <line x1={baseX} y1={yOfT(t)} x2={baseX + plotW} y2={yOfT(t)} stroke="#1f2937" strokeWidth={0.3} />
            <text x={baseX - 4} y={yOfT(t) + 3} fill="#9aa3b8" fontSize="8" textAnchor="end">{t}°C</text>
          </g>
        ))}
        {/* Precipitation bars */}
        {climate.monthlyPrecipMm.map((p, i) => {
          const x = baseX + i * monthW + 1;
          const y = yOfP(p);
          return (
            <g key={`p-${i}`}>
              <rect x={x} y={y} width={monthW - 2} height={baseY + plotH - y} fill="#60a5fa" fillOpacity={0.5} />
              <text x={x + monthW / 2} y={baseY + plotH + 12} fill="#9aa3b8" fontSize="8" textAnchor="middle">{monthLabels[i]}</text>
            </g>
          );
        })}
        {/* Temperature line */}
        <path d={climate.monthlyTempC.map((t, i) => `${i === 0 ? "M" : "L"}${(baseX + (i + 0.5) * monthW).toFixed(1)},${yOfT(t).toFixed(1)}`).join(" ")} fill="none" stroke="#ff6b6b" strokeWidth={2} />
        {climate.monthlyTempC.map((t, i) => (
          <circle key={`t-${i}`} cx={baseX + (i + 0.5) * monthW} cy={yOfT(t)} r={2} fill="#ff6b6b" />
        ))}
        <text x={baseX + plotW / 2} y={H - 76} fill="#cbd1e6" fontSize="9" textAnchor="middle">monthly climograph · bars = precip · line = temp</text>
        <g transform={`translate(${baseX + 30}, ${H - 60})`}>
          <line x1={0} y1={4} x2={14} y2={4} stroke="#ff6b6b" strokeWidth={2} /><text x={18} y={7} fill="#cbd1e6" fontSize="9">temperature (°C)</text>
          <rect x={130} y={0} width={10} height={8} fill="#60a5fa" fillOpacity={0.5} /><text x={144} y={7} fill="#cbd1e6" fontSize="9">precipitation (mm)</text>
        </g>
      </svg>

      <div className="mt-2 text-[10px] text-muted-foreground">
        Köppen 1900 + Geiger refinements classify climates by
        temperature + precipitation seasonality. <b>A</b> tropical
        (coldest month ≥18°C), <b>B</b> arid (precip below
        evapotranspiration), <b>C</b> temperate (-3 to 18°C in
        coldest month), <b>D</b> continental (&lt;-3°C in coldest),
        <b> E</b> polar (warmest month &lt;10°C). Second letter is
        precipitation pattern (f wet year-round, w dry winter, s dry
        summer, m monsoon). Third is temperature severity (a hot
        summer, b warm, c cool, d very cold winter). Trewartha 1968
        modified the classification; Holdridge life zones (1947) use
        biotemperature + potential evapotranspiration + precipitation
        ratio. Climate-change geography shifts these zones poleward
        + upward (Beck 2018, Cui 2021).
      </div>
    </div>
  );
}
