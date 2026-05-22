import { useMemo, useState } from "react";

// Kinship diagram. Genealogy notation with squares (male), circles
// (female), horizontal marriage line, vertical descent line. Ego is the
// reference individual. Switch between selected systems (Eskimo,
// Iroquois, Sudanese, Hawaiian) — note labels reorganize to show how
// the same biological relationship maps to different cultural terms.

const W = 460;
const H = 320;

interface Props {
  ego?: string;
  system?: "Eskimo" | "Iroquois" | "Sudanese" | "Hawaiian";
}

interface Person {
  id: string;
  sex: "M" | "F";
  x: number;
  y: number;
  label: string;     // baseline relationship label
}

// Pre-positioned three-generation tree
const layout: Person[] = [
  // Grandparents (top row)
  { id: "PGF", sex: "M", x: 90,  y: 35, label: "PGF" },
  { id: "PGM", sex: "F", x: 130, y: 35, label: "PGM" },
  { id: "MGF", sex: "M", x: 290, y: 35, label: "MGF" },
  { id: "MGM", sex: "F", x: 330, y: 35, label: "MGM" },
  // Parents row
  { id: "FaB", sex: "M", x: 60,  y: 130, label: "FaBr" },  // father's brother
  { id: "Fa",  sex: "M", x: 130, y: 130, label: "Fa" },
  { id: "Mo",  sex: "F", x: 170, y: 130, label: "Mo" },
  { id: "MoZ", sex: "F", x: 230, y: 130, label: "MoZi" },  // mother's sister
  { id: "FaZ", sex: "F", x: 290, y: 130, label: "FaZi" },
  { id: "MoB", sex: "M", x: 360, y: 130, label: "MoBr" },
  // Ego + siblings + cousins
  { id: "FaB-S", sex: "M", x: 30,  y: 225, label: "FaBrS" },
  { id: "Br",   sex: "M", x: 100, y: 225, label: "Br" },
  { id: "Ego",  sex: "M", x: 140, y: 225, label: "EGO" },
  { id: "Si",   sex: "F", x: 180, y: 225, label: "Si" },
  { id: "MoZ-S", sex: "F", x: 230, y: 225, label: "MoZiD" },
  { id: "FaZ-S", sex: "M", x: 300, y: 225, label: "FaZiS" },
  { id: "MoB-S", sex: "F", x: 380, y: 225, label: "MoBrD" },
];

const SYSTEMS = {
  Eskimo: {
    description: "lineal terms; differentiates nuclear from extended",
    map: {
      Br: "brother", Si: "sister",
      Fa: "father", Mo: "mother",
      FaBr: "uncle", FaZi: "aunt", MoBr: "uncle", MoZi: "aunt",
      FaBrS: "cousin", MoZiD: "cousin", FaZiS: "cousin", MoBrD: "cousin",
      PGF: "grandfather", PGM: "grandmother", MGF: "grandfather", MGM: "grandmother",
    },
  },
  Iroquois: {
    description: "merges parallel; distinguishes cross",
    map: {
      Br: "brother", Si: "sister",
      Fa: "father", Mo: "mother",
      FaBr: "father", FaZi: "aunt", MoBr: "uncle", MoZi: "mother",
      FaBrS: "brother", MoZiD: "sister", FaZiS: "cousin", MoBrD: "cousin",
      PGF: "grandfather", PGM: "grandmother", MGF: "grandfather", MGM: "grandmother",
    },
  },
  Sudanese: {
    description: "fully descriptive; unique term for each kin position",
    map: {
      Br: "brother", Si: "sister",
      Fa: "father", Mo: "mother",
      FaBr: "FaBr", FaZi: "FaZi", MoBr: "MoBr", MoZi: "MoZi",
      FaBrS: "FaBrS", MoZiD: "MoZiD", FaZiS: "FaZiS", MoBrD: "MoBrD",
      PGF: "PGF", PGM: "PGM", MGF: "MGF", MGM: "MGM",
    },
  },
  Hawaiian: {
    description: "generation-based; merges all same-generation kin",
    map: {
      Br: "brother", Si: "sister",
      Fa: "father", Mo: "mother",
      FaBr: "father", FaZi: "mother", MoBr: "father", MoZi: "mother",
      FaBrS: "brother", MoZiD: "sister", FaZiS: "brother", MoBrD: "sister",
      PGF: "grandfather", PGM: "grandmother", MGF: "grandfather", MGM: "grandmother",
    },
  },
};

export function KinshipDiagram({ ego: _ctlEgo, system: ctlSys }: Props = {}) {
  const [intSys, setIntSys] = useState<keyof typeof SYSTEMS>("Eskimo");
  const sys = ctlSys ?? intSys;
  const info = SYSTEMS[sys];

  const peopleWithLabels = useMemo(() => {
    return layout.map((p) => ({
      ...p,
      term: (info.map as Record<string, string>)[p.label] ?? p.label,
      isEgo: p.id === "Ego",
    }));
  }, [info]);

  // Edges (marriage horizontal; descent vertical)
  const edges = [
    // Marriages
    { x1: 90, y1: 35, x2: 130, y2: 35, type: "marriage" as const },     // PGF-PGM
    { x1: 290, y1: 35, x2: 330, y2: 35, type: "marriage" as const },    // MGF-MGM
    { x1: 130, y1: 130, x2: 170, y2: 130, type: "marriage" as const },  // Fa-Mo
    // Sibling lines (parents siblings)
    { x1: 60, y1: 130, x2: 130, y2: 130, type: "sibling" as const },    // FaB-Fa
    { x1: 130, y1: 130, x2: 290, y2: 130, type: "sibling" as const },   // Fa-FaZ
    { x1: 170, y1: 130, x2: 360, y2: 130, type: "sibling" as const },   // Mo-MoB
    { x1: 170, y1: 130, x2: 230, y2: 130, type: "sibling" as const },   // Mo-MoZ
    // Sibling line ego row
    { x1: 30, y1: 225, x2: 380, y2: 225, type: "sibling" as const },
    // Descent: PGF/PGM → Fa, FaB, FaZ
    { x1: 110, y1: 50, x2: 110, y2: 105, type: "descent" as const },
    // Descent: MGF/MGM → Mo, MoB, MoZ
    { x1: 310, y1: 50, x2: 310, y2: 105, type: "descent" as const },
    // Descent: Fa+Mo → Br, Ego, Si
    { x1: 150, y1: 145, x2: 150, y2: 205, type: "descent" as const },
    // Descent: FaB → FaB-S
    { x1: 60, y1: 145, x2: 30, y2: 205, type: "descent" as const },
    // Descent: MoZ → MoZ-S
    { x1: 230, y1: 145, x2: 230, y2: 205, type: "descent" as const },
    // Descent: FaZ → FaZ-S
    { x1: 290, y1: 145, x2: 300, y2: 205, type: "descent" as const },
    // Descent: MoB → MoB-S
    { x1: 360, y1: 145, x2: 380, y2: 205, type: "descent" as const },
  ];

  return (
    <div className="my-4 p-3 rounded-lg border border-border bg-card text-card-foreground">
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-semibold">Kinship · {sys} system</div>
        <div className="flex gap-1">
          {(Object.keys(SYSTEMS) as Array<keyof typeof SYSTEMS>).map((s) => (
            <button key={s} onClick={() => setIntSys(s)} disabled={ctlSys !== undefined} className={`px-2 py-0.5 rounded text-[9px] ${sys === s ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-accent"}`}>{s}</button>
          ))}
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto bg-[#0b1228] rounded-md" role="img" aria-label="Kinship diagram">
        {/* Edges */}
        {edges.map((e, i) => (
          <line key={`e-${i}`} x1={e.x1} y1={e.y1} x2={e.x2} y2={e.y2}
            stroke={e.type === "marriage" ? "#fbbf24" : e.type === "sibling" ? "#475569" : "#4ecdc4"}
            strokeWidth={e.type === "marriage" ? 1.5 : 1}
            strokeDasharray={e.type === "marriage" ? "0" : "0"} />
        ))}
        {/* People shapes */}
        {peopleWithLabels.map((p) => (
          <g key={p.id}>
            {p.sex === "M" ? (
              <rect x={p.x - 11} y={p.y - 11} width={22} height={22} fill={p.isEgo ? "#ff6b6b" : "#1f2937"} stroke="#cbd1e6" strokeWidth={1.5} />
            ) : (
              <circle cx={p.x} cy={p.y} r={11} fill={p.isEgo ? "#ff6b6b" : "#1f2937"} stroke="#cbd1e6" strokeWidth={1.5} />
            )}
            <text x={p.x} y={p.y + 23} fill="#cbd1e6" fontSize="7" textAnchor="middle">{p.term}</text>
          </g>
        ))}
        {/* Legend */}
        <g transform={`translate(20, ${H - 28})`}>
          <rect x={0} y={0} width={10} height={10} fill="#1f2937" stroke="#cbd1e6" strokeWidth={1} />
          <text x={14} y={9} fill="#cbd1e6" fontSize="8">male</text>
          <circle cx={56} cy={5} r={5} fill="#1f2937" stroke="#cbd1e6" strokeWidth={1} />
          <text x={66} y={9} fill="#cbd1e6" fontSize="8">female</text>
          <rect x={100} y={0} width={10} height={10} fill="#ff6b6b" stroke="#cbd1e6" strokeWidth={1} />
          <text x={114} y={9} fill="#ff6b6b" fontSize="8">ego</text>
          <line x1={140} y1={5} x2={160} y2={5} stroke="#fbbf24" strokeWidth={1.5} />
          <text x={164} y={9} fill="#fbbf24" fontSize="8">marriage</text>
          <line x1={210} y1={5} x2={230} y2={5} stroke="#4ecdc4" strokeWidth={1} />
          <text x={234} y={9} fill="#4ecdc4" fontSize="8">descent</text>
          <line x1={280} y1={5} x2={300} y2={5} stroke="#475569" strokeWidth={1} />
          <text x={304} y={9} fill="#475569" fontSize="8">sibling</text>
        </g>
      </svg>

      <div className="mt-2 text-[10px] text-muted-foreground">
        {info.description}. The six classical kinship terminologies
        (Morgan 1871) — Eskimo (Inuit; Anglo-American), Hawaiian,
        Iroquois, Sudanese, Crow, Omaha — encode different ways of
        grouping the same biological relations into cultural categories.
        Eskimo distinguishes nuclear from extended (cousin = generic);
        Iroquois merges parallel cousins with siblings but separates
        cross; Sudanese fully descriptive (each position unique);
        Hawaiian collapses generation (all "cousins" called "siblings",
        all parental siblings called "father/mother"). Maps onto
        descent rules (patri/matri/cognatic) + marriage alliance
        (Lévi-Strauss exchange; cross-cousin marriage in many systems).
      </div>
    </div>
  );
}
