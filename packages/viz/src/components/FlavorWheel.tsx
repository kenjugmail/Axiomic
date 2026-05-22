import { useState } from "react";

// Wine sensory map. Left: an aroma wheel (after Ann C. Noble's UC Davis
// Wine Aroma Wheel, 1984) whose families light up for the selected
// wine. Right: a structural radar — acidity, tannin, body, sweetness,
// alcohol — the five axes a taster balances when assessing a wine.

const W = 460;
const H = 320;

const FAMILIES = [
  { id: "Fruity", color: "#ef4444" },
  { id: "Floral", color: "#ec4899" },
  { id: "Spicy", color: "#f97316" },
  { id: "Herbaceous", color: "#84cc16" },
  { id: "Earthy", color: "#a16207" },
  { id: "Oaky", color: "#d97706" },
  { id: "Mineral", color: "#38bdf8" },
  { id: "Microbial", color: "#a78bfa" },
] as const;

const AXES = ["acidity", "tannin", "body", "sweetness", "alcohol"] as const;
type Axis = (typeof AXES)[number];

interface Wine {
  label: string;
  structure: Record<Axis, number>; // 0..10
  aromas: string[];
  note: string;
}

const WINES: Record<string, Wine> = {
  cabernet: {
    label: "Cabernet Sauvignon",
    structure: { acidity: 6, tannin: 9, body: 8, sweetness: 1, alcohol: 7 },
    aromas: ["Fruity", "Herbaceous", "Oaky", "Spicy"],
    note: "Powerful + tannic; cassis with green-pepper pyrazine + cedar oak.",
  },
  "pinot-noir": {
    label: "Pinot Noir",
    structure: { acidity: 7, tannin: 4, body: 4, sweetness: 1, alcohol: 6 },
    aromas: ["Fruity", "Floral", "Earthy"],
    note: "Light + perfumed; red cherry, rose, forest-floor earthiness.",
  },
  chardonnay: {
    label: "Chardonnay",
    structure: { acidity: 5, tannin: 2, body: 7, sweetness: 2, alcohol: 6 },
    aromas: ["Fruity", "Oaky", "Mineral", "Microbial"],
    note: "Full white; orchard/tropical fruit, oak, buttery malolactic.",
  },
  riesling: {
    label: "Riesling",
    structure: { acidity: 9, tannin: 1, body: 3, sweetness: 6, alcohol: 4 },
    aromas: ["Floral", "Fruity", "Mineral"],
    note: "High-acid + aromatic; lime, blossom, wet-stone, petrol when aged.",
  },
};

const ORDER = ["cabernet", "pinot-noir", "chardonnay", "riesling"];

interface Props {
  wine?: keyof typeof WINES;
}

function annularSector(cx: number, cy: number, rin: number, rout: number, a0: number, a1: number): string {
  const p = (r: number, a: number) => `${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`;
  return [
    `M ${p(rin, a0)}`,
    `L ${p(rout, a0)}`,
    `A ${rout} ${rout} 0 0 1 ${p(rout, a1)}`,
    `L ${p(rin, a1)}`,
    `A ${rin} ${rin} 0 0 0 ${p(rin, a0)}`,
    "Z",
  ].join(" ");
}

export function FlavorWheel({ wine: ctlWine }: Props = {}) {
  const [intWine, setIntWine] = useState<keyof typeof WINES>("cabernet");
  const wineId = ctlWine ?? intWine;
  const wine = WINES[wineId];
  const active = new Set(wine.aromas);

  const wcx = 112;
  const wcy = 158;
  const rin = 38;
  const rout = 88;
  const seg = (Math.PI * 2) / FAMILIES.length;

  const rcx = 332;
  const rcy = 158;
  const R = 82;
  const axisAngle = (i: number) => -Math.PI / 2 + (i / AXES.length) * Math.PI * 2;
  const radarPt = (i: number, val: number) => {
    const a = axisAngle(i);
    const r = (val / 10) * R;
    return { x: rcx + r * Math.cos(a), y: rcy + r * Math.sin(a) };
  };
  const poly = AXES.map((ax, i) => {
    const pt = radarPt(i, wine.structure[ax]);
    return `${pt.x.toFixed(1)},${pt.y.toFixed(1)}`;
  }).join(" ");

  return (
    <div className="my-4 p-3 rounded-lg border border-border bg-card text-card-foreground">
      <div className="flex items-center justify-between mb-2 flex-wrap gap-1">
        <div className="text-sm font-semibold">{wine.label}</div>
        <div className="flex gap-1">
          {ORDER.map((id) => (
            <button
              key={id}
              onClick={() => setIntWine(id as keyof typeof WINES)}
              disabled={ctlWine !== undefined}
              className={`px-1.5 py-0.5 rounded text-[9px] ${
                wineId === id
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted hover:bg-accent"
              }`}
            >
              {WINES[id].label.split(" ")[0]}
            </button>
          ))}
        </div>
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-auto bg-[#0b1228] rounded-md"
        role="img"
        aria-label="Wine aroma wheel and structural radar"
      >
        <text x={wcx} y={20} fill="#cbd1e6" fontSize="9" textAnchor="middle">aroma families</text>
        {FAMILIES.map((f, i) => {
          const a0 = -Math.PI / 2 + i * seg;
          const a1 = a0 + seg;
          const on = active.has(f.id);
          const mid = a0 + seg / 2;
          const lr = rout + 12;
          const lx = wcx + lr * Math.cos(mid);
          const ly = wcy + lr * Math.sin(mid);
          return (
            <g key={f.id}>
              <path
                d={annularSector(wcx, wcy, rin, rout, a0, a1)}
                fill={f.color}
                fillOpacity={on ? 0.85 : 0.12}
                stroke="#0b1228"
                strokeWidth={1}
              />
              <text
                x={lx}
                y={ly}
                fill={on ? f.color : "#5b647c"}
                fontSize="7.5"
                textAnchor={Math.cos(mid) < -0.3 ? "end" : Math.cos(mid) > 0.3 ? "start" : "middle"}
                dominantBaseline="middle"
              >
                {f.id}
              </text>
            </g>
          );
        })}

        {/* structural radar */}
        <text x={rcx} y={20} fill="#cbd1e6" fontSize="9" textAnchor="middle">structure</text>
        {[0.25, 0.5, 0.75, 1].map((g) => (
          <polygon
            key={g}
            points={AXES.map((_, i) => {
              const a = axisAngle(i);
              return `${(rcx + g * R * Math.cos(a)).toFixed(1)},${(rcy + g * R * Math.sin(a)).toFixed(1)}`;
            }).join(" ")}
            fill="none"
            stroke="#1f2937"
            strokeWidth={0.5}
          />
        ))}
        {AXES.map((ax, i) => {
          const a = axisAngle(i);
          const lx = rcx + (R + 12) * Math.cos(a);
          const ly = rcy + (R + 12) * Math.sin(a);
          return (
            <g key={ax}>
              <line x1={rcx} y1={rcy} x2={rcx + R * Math.cos(a)} y2={rcy + R * Math.sin(a)} stroke="#1f2937" strokeWidth={0.4} />
              <text x={lx} y={ly} fill="#9aa3b8" fontSize="7.5" textAnchor="middle" dominantBaseline="middle">{ax}</text>
            </g>
          );
        })}
        <polygon points={poly} fill="#f472b6" fillOpacity={0.3} stroke="#f472b6" strokeWidth={1.6} />
        {AXES.map((ax, i) => {
          const pt = radarPt(i, wine.structure[ax]);
          return <circle key={ax} cx={pt.x} cy={pt.y} r={2.4} fill="#f472b6" />;
        })}
      </svg>

      <div className="mt-1 text-[10px] text-muted-foreground">
        {wine.note} Tasting separates <b>aroma</b> (volatile compounds —
        esters for fruit, methoxypyrazines for green pepper, terpenes for
        florals, rotundone for pepper) from <b>structure</b> (acidity,
        tannin, body, sweetness, alcohol). Ann C. Noble's Wine Aroma
        Wheel (UC Davis, 1984) gave tasters a shared vocabulary; the WSET
        Systematic Approach and the Court of Master Sommeliers' deductive
        grid turn that vocabulary into a repeatable blind-tasting method.
      </div>
    </div>
  );
}
