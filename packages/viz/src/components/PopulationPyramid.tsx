import { useMemo, useState } from "react";

// Population pyramid: age × sex distribution as back-to-back
// horizontal bars. Toggle countries / years to see the demographic
// transition stages: expansive (Niger 2024) → constrictive
// (Italy 2023) → stationary aging (Japan 2023) → projected
// post-transition (Italy 2050).

const W = 460;
const H = 320;

interface Props {
  country?: keyof typeof DATA;
  year?: number;
}

interface AgeBucket {
  age: string;   // e.g. "0-4"
  male: number;  // percentage of total population
  female: number;
}

// Stylized data inspired by UN World Population Prospects 2022.
// Numbers are pedagogical approximations, not exact stats.
const DATA: Record<string, { label: string; years: Record<number, AgeBucket[]> }> = {
  italy: {
    label: "Italy",
    years: {
      2023: [
        { age: "0-4", male: 1.9, female: 1.8 },
        { age: "5-9", male: 2.2, female: 2.1 },
        { age: "10-14", male: 2.4, female: 2.3 },
        { age: "15-19", male: 2.5, female: 2.4 },
        { age: "20-24", male: 2.6, female: 2.4 },
        { age: "25-29", male: 2.7, female: 2.5 },
        { age: "30-34", male: 2.9, female: 2.7 },
        { age: "35-39", male: 3.1, female: 2.9 },
        { age: "40-44", male: 3.5, female: 3.4 },
        { age: "45-49", male: 4.0, female: 3.9 },
        { age: "50-54", male: 4.3, female: 4.2 },
        { age: "55-59", male: 4.1, female: 4.1 },
        { age: "60-64", male: 3.4, female: 3.5 },
        { age: "65-69", male: 3.0, female: 3.2 },
        { age: "70-74", male: 2.8, female: 3.1 },
        { age: "75-79", male: 2.2, female: 2.7 },
        { age: "80+", male: 2.0, female: 3.5 },
      ],
      2050: [
        { age: "0-4", male: 1.5, female: 1.4 },
        { age: "5-9", male: 1.6, female: 1.5 },
        { age: "10-14", male: 1.7, female: 1.6 },
        { age: "15-19", male: 1.8, female: 1.7 },
        { age: "20-24", male: 1.9, female: 1.8 },
        { age: "25-29", male: 2.0, female: 1.9 },
        { age: "30-34", male: 2.1, female: 2.0 },
        { age: "35-39", male: 2.3, female: 2.1 },
        { age: "40-44", male: 2.5, female: 2.3 },
        { age: "45-49", male: 2.8, female: 2.7 },
        { age: "50-54", male: 3.2, female: 3.1 },
        { age: "55-59", male: 3.5, female: 3.5 },
        { age: "60-64", male: 3.7, female: 3.8 },
        { age: "65-69", male: 3.5, female: 3.7 },
        { age: "70-74", male: 3.1, female: 3.4 },
        { age: "75-79", male: 2.8, female: 3.2 },
        { age: "80+", male: 3.8, female: 5.5 },
      ],
    },
  },
  niger: {
    label: "Niger",
    years: {
      2024: [
        { age: "0-4", male: 8.7, female: 8.5 },
        { age: "5-9", male: 7.5, female: 7.3 },
        { age: "10-14", male: 6.4, female: 6.3 },
        { age: "15-19", male: 5.4, female: 5.4 },
        { age: "20-24", male: 4.4, female: 4.5 },
        { age: "25-29", male: 3.5, female: 3.6 },
        { age: "30-34", male: 2.7, female: 2.8 },
        { age: "35-39", male: 2.1, female: 2.2 },
        { age: "40-44", male: 1.7, female: 1.7 },
        { age: "45-49", male: 1.3, female: 1.3 },
        { age: "50-54", male: 0.9, female: 0.9 },
        { age: "55-59", male: 0.6, female: 0.6 },
        { age: "60-64", male: 0.4, female: 0.4 },
        { age: "65-69", male: 0.3, female: 0.3 },
        { age: "70-74", male: 0.2, female: 0.2 },
        { age: "75-79", male: 0.1, female: 0.1 },
        { age: "80+", male: 0.1, female: 0.1 },
      ],
    },
  },
  japan: {
    label: "Japan",
    years: {
      2023: [
        { age: "0-4", male: 1.7, female: 1.6 },
        { age: "5-9", male: 1.9, female: 1.8 },
        { age: "10-14", male: 2.1, female: 2.0 },
        { age: "15-19", male: 2.3, female: 2.2 },
        { age: "20-24", male: 2.5, female: 2.4 },
        { age: "25-29", male: 2.6, female: 2.5 },
        { age: "30-34", male: 2.6, female: 2.5 },
        { age: "35-39", male: 2.9, female: 2.8 },
        { age: "40-44", male: 3.2, female: 3.1 },
        { age: "45-49", male: 3.7, female: 3.6 },
        { age: "50-54", male: 4.0, female: 3.9 },
        { age: "55-59", male: 3.5, female: 3.4 },
        { age: "60-64", male: 3.0, female: 3.0 },
        { age: "65-69", male: 3.0, female: 3.2 },
        { age: "70-74", male: 3.5, female: 3.9 },
        { age: "75-79", male: 2.7, female: 3.4 },
        { age: "80+", male: 3.5, female: 6.2 },
      ],
    },
  },
};

export function PopulationPyramid({ country: ctlC, year: ctlY }: Props = {}) {
  const [intC, setIntC] = useState<keyof typeof DATA>("italy");
  const country = ctlC ?? intC;
  const years = Object.keys(DATA[country].years).map(Number);
  const [intY, setIntY] = useState(years[0]);
  const year = ctlY && years.includes(ctlY) ? ctlY : intY;
  const buckets = DATA[country].years[year] ?? DATA[country].years[years[0]];

  const maxPct = useMemo(
    () => Math.max(...buckets.map((b) => Math.max(b.male, b.female)), 0.1) * 1.1,
    [buckets],
  );

  // Dependency ratios
  const stats = useMemo(() => {
    let young = 0;
    let working = 0;
    let old = 0;
    for (const b of buckets) {
      const total = b.male + b.female;
      if (b.age === "0-4" || b.age === "5-9" || b.age === "10-14") young += total;
      else if (b.age === "65-69" || b.age === "70-74" || b.age === "75-79" || b.age === "80+") old += total;
      else working += total;
    }
    return {
      young: young.toFixed(1),
      working: working.toFixed(1),
      old: old.toFixed(1),
      depRatio: (((young + old) / working) * 100).toFixed(0),
    };
  }, [buckets]);

  const baseX = 30;
  const baseY = 20;
  const plotW = W - baseX - 20;
  const plotH = H - baseY - 80;
  const centerX = baseX + plotW / 2;
  const halfW = plotW / 2;
  const rowH = plotH / buckets.length;
  const wOf = (pct: number) => (pct / maxPct) * halfW;

  return (
    <div className="my-4 p-3 rounded-lg border border-border bg-card text-card-foreground">
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-semibold">{DATA[country].label} {year} · young {stats.young}% · old {stats.old}% · dep ratio {stats.depRatio}</div>
        <div className="flex gap-1">
          {(Object.keys(DATA) as Array<keyof typeof DATA>).map((c) => (
            <button key={c} onClick={() => setIntC(c)} disabled={ctlC !== undefined} className={`px-1.5 py-0.5 rounded text-[9px] ${country === c ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-accent"}`}>{DATA[c].label}</button>
          ))}
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto bg-[#0b1228] rounded-md" role="img" aria-label="Population pyramid">
        <rect x={baseX} y={baseY} width={plotW} height={plotH} fill="none" stroke="#1f2937" strokeWidth={0.5} />
        <line x1={centerX} y1={baseY} x2={centerX} y2={baseY + plotH} stroke="#475569" strokeWidth={0.5} />
        {/* Bars */}
        {buckets.map((b, i) => {
          const y = baseY + (buckets.length - 1 - i) * rowH;
          const wMale = wOf(b.male);
          const wFem = wOf(b.female);
          return (
            <g key={b.age}>
              <rect x={centerX - wMale} y={y + 1} width={wMale} height={rowH - 2} fill="#4ecdc4" />
              <rect x={centerX} y={y + 1} width={wFem} height={rowH - 2} fill="#f472b6" />
              <text x={centerX} y={y + rowH * 0.7} fill="#cbd1e6" fontSize="7" textAnchor="middle">{b.age}</text>
            </g>
          );
        })}
        <text x={baseX + halfW / 2} y={baseY - 4} fill="#4ecdc4" fontSize="9" textAnchor="middle">male</text>
        <text x={baseX + plotW - halfW / 2} y={baseY - 4} fill="#f472b6" fontSize="9" textAnchor="middle">female</text>
        <text x={baseX + plotW / 2} y={H - 50} fill="#cbd1e6" fontSize="9" textAnchor="middle">% of total population</text>
      </svg>

      {years.length > 1 && (
        <div className="mt-2 flex gap-1 text-[10px]">
          <span className="text-muted-foreground mr-1">Year:</span>
          {years.map((y) => (
            <button key={y} onClick={() => setIntY(y)} disabled={ctlY !== undefined} className={`px-1.5 py-0.5 rounded ${year === y ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-accent"}`}>{y}</button>
          ))}
        </div>
      )}
      <div className="mt-2 text-[10px] text-muted-foreground">
        Population pyramids visualize the age × sex distribution of
        a population. Stage 1 (expansive) pyramids — broad base,
        narrow top — are typical of pre-transition + high-fertility
        societies (Niger 2024: 47% under 15). Stage 4 (constrictive)
        shows below-replacement fertility + an aging bulge (Italy 2023).
        Stage 5 (Van de Kaa 1987 "second demographic transition")
        adds further fertility decline + delayed childbearing (Japan,
        Korea, Spain). Old-age dependency ratio = (65+)/(15-64) ×
        100 — Italy ≈ 38, Japan ≈ 53, US ≈ 28. UN WPP 2022 medium
        variant projects global population to peak ~10.4 B around
        2086 (Raftery probabilistic).
      </div>
    </div>
  );
}
