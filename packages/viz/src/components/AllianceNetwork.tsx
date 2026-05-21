import { useMemo, useState } from "react";

// Diplomatic alliance network. States as nodes; treaty/alliance ties
// as colored edges. Click a node to highlight its connections. Bloc
// color-coding makes regional patterns visible. Stylized — not a
// substitute for ACLED or the Correlates of War database.

const W = 480;
const H = 360;

interface Props {
  focus?: string;
}

type Bloc = "nato" | "eu" | "asean" | "brics" | "oas" | "au" | "gcc" | "five-eyes";

interface State {
  id: string;
  label: string;
  blocs: Bloc[];
  // Layout position (0-1 in normalized space)
  x: number;
  y: number;
}

const STATES: State[] = [
  { id: "us", label: "USA", blocs: ["nato", "oas", "five-eyes"], x: 0.18, y: 0.4 },
  { id: "uk", label: "UK", blocs: ["nato", "five-eyes"], x: 0.42, y: 0.28 },
  { id: "fr", label: "France", blocs: ["nato", "eu"], x: 0.46, y: 0.36 },
  { id: "de", label: "Germany", blocs: ["nato", "eu"], x: 0.5, y: 0.32 },
  { id: "it", label: "Italy", blocs: ["nato", "eu"], x: 0.5, y: 0.45 },
  { id: "es", label: "Spain", blocs: ["nato", "eu"], x: 0.42, y: 0.45 },
  { id: "pl", label: "Poland", blocs: ["nato", "eu"], x: 0.54, y: 0.32 },
  { id: "tr", label: "Turkey", blocs: ["nato"], x: 0.58, y: 0.45 },
  { id: "ca", label: "Canada", blocs: ["nato", "oas", "five-eyes"], x: 0.18, y: 0.22 },
  { id: "br", label: "Brazil", blocs: ["brics", "oas"], x: 0.28, y: 0.7 },
  { id: "mx", label: "Mexico", blocs: ["oas"], x: 0.18, y: 0.55 },
  { id: "ar", label: "Argentina", blocs: ["oas"], x: 0.24, y: 0.82 },
  { id: "ru", label: "Russia", blocs: ["brics"], x: 0.62, y: 0.22 },
  { id: "cn", label: "China", blocs: ["brics"], x: 0.78, y: 0.36 },
  { id: "in", label: "India", blocs: ["brics"], x: 0.7, y: 0.5 },
  { id: "za", label: "S. Africa", blocs: ["brics", "au"], x: 0.52, y: 0.78 },
  { id: "id", label: "Indonesia", blocs: ["asean"], x: 0.82, y: 0.62 },
  { id: "vn", label: "Vietnam", blocs: ["asean"], x: 0.8, y: 0.5 },
  { id: "th", label: "Thailand", blocs: ["asean"], x: 0.78, y: 0.54 },
  { id: "ph", label: "Philippines", blocs: ["asean"], x: 0.86, y: 0.55 },
  { id: "jp", label: "Japan", blocs: [], x: 0.88, y: 0.4 },
  { id: "kr", label: "S. Korea", blocs: [], x: 0.86, y: 0.42 },
  { id: "au", label: "Australia", blocs: ["five-eyes"], x: 0.88, y: 0.78 },
  { id: "nz", label: "New Zealand", blocs: ["five-eyes"], x: 0.92, y: 0.82 },
  { id: "ng", label: "Nigeria", blocs: ["au"], x: 0.46, y: 0.62 },
  { id: "eg", label: "Egypt", blocs: ["au"], x: 0.54, y: 0.55 },
  { id: "et", label: "Ethiopia", blocs: ["au"], x: 0.56, y: 0.62 },
  { id: "sa", label: "Saudi", blocs: ["gcc"], x: 0.62, y: 0.55 },
  { id: "ae", label: "UAE", blocs: ["gcc"], x: 0.66, y: 0.58 },
];

const BLOC_COLOR: Record<Bloc, string> = {
  nato: "#60a5fa",
  eu: "#fbbf24",
  asean: "#4ecdc4",
  brics: "#ff6b6b",
  oas: "#a78bfa",
  au: "#f472b6",
  gcc: "#10b981",
  "five-eyes": "#ffffff",
};

const BLOC_LABEL: Record<Bloc, string> = {
  nato: "NATO",
  eu: "EU",
  asean: "ASEAN",
  brics: "BRICS",
  oas: "OAS",
  au: "AU",
  gcc: "GCC",
  "five-eyes": "Five Eyes",
};

// An edge exists if two states share a bloc; color = first shared bloc
function sharedBloc(a: State, b: State): Bloc | null {
  for (const bloc of a.blocs) {
    if (b.blocs.includes(bloc)) return bloc;
  }
  return null;
}

export function AllianceNetwork({ focus: ctlFocus }: Props = {}) {
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [filterBloc, setFilterBloc] = useState<Bloc | null>(null);
  const focused = ctlFocus
    ? STATES.find((s) => s.id === ctlFocus || s.blocs.includes(ctlFocus as Bloc))?.id ?? null
    : focusedId;

  const edges = useMemo(() => {
    const out: Array<{ a: State; b: State; bloc: Bloc }> = [];
    for (let i = 0; i < STATES.length; i++) {
      for (let j = i + 1; j < STATES.length; j++) {
        const bloc = sharedBloc(STATES[i], STATES[j]);
        if (bloc) out.push({ a: STATES[i], b: STATES[j], bloc });
      }
    }
    return out;
  }, []);

  const baseX = 20;
  const baseY = 20;
  const plotW = W - baseX - 20;
  const plotH = H - baseY - 100;
  const xOf = (x: number) => baseX + x * plotW;
  const yOf = (y: number) => baseY + y * plotH;

  const visibleEdges = filterBloc ? edges.filter((e) => e.bloc === filterBloc) : edges;
  const focusedNode = focused ? STATES.find((s) => s.id === focused) : null;

  return (
    <div className="my-4 p-3 rounded-lg border border-border bg-card text-card-foreground">
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-semibold">Alliance network · {STATES.length} states · {visibleEdges.length} ties{focusedNode && <span className="text-muted-foreground"> · focus: {focusedNode.label}</span>}</div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto bg-[#0b1228] rounded-md" role="img" aria-label="Alliance network">
        {/* Edges */}
        {visibleEdges.map((e, i) => {
          const hl = focused && (e.a.id === focused || e.b.id === focused);
          const op = focused ? (hl ? 0.8 : 0.08) : 0.35;
          return (
            <line
              key={i}
              x1={xOf(e.a.x)}
              y1={yOf(e.a.y)}
              x2={xOf(e.b.x)}
              y2={yOf(e.b.y)}
              stroke={BLOC_COLOR[e.bloc]}
              strokeWidth={hl ? 1.5 : 0.6}
              strokeOpacity={op}
            />
          );
        })}
        {/* Nodes */}
        {STATES.map((s) => {
          const isFocused = focused === s.id;
          const dim = focused && !isFocused && !edges.some((e) => (e.a.id === focused && e.b.id === s.id) || (e.b.id === focused && e.a.id === s.id));
          return (
            <g key={s.id} onClick={() => setFocusedId(focusedId === s.id ? null : s.id)} style={{ cursor: "pointer" }}>
              <circle
                cx={xOf(s.x)}
                cy={yOf(s.y)}
                r={isFocused ? 8 : 5}
                fill={s.blocs.length > 0 ? BLOC_COLOR[s.blocs[0]] : "#475569"}
                stroke={isFocused ? "#fbbf24" : "#0b1228"}
                strokeWidth={isFocused ? 2 : 1}
                fillOpacity={dim ? 0.2 : 0.85}
              />
              <text
                x={xOf(s.x)}
                y={yOf(s.y) + 14}
                fill={dim ? "#475569" : "#cbd1e6"}
                fontSize={isFocused ? 10 : 8}
                textAnchor="middle"
                fontWeight={isFocused ? 700 : 400}
              >
                {s.label}
              </text>
            </g>
          );
        })}
      </svg>

      <div className="mt-2 flex flex-wrap gap-1 text-[10px]">
        <span className="text-muted-foreground mr-1">Filter bloc:</span>
        <button onClick={() => setFilterBloc(null)} className={`px-1.5 py-0.5 rounded ${filterBloc === null ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-accent"}`}>all</button>
        {(Object.keys(BLOC_COLOR) as Bloc[]).map((b) => (
          <button key={b} onClick={() => setFilterBloc(filterBloc === b ? null : b)} className="px-1.5 py-0.5 rounded" style={{ backgroundColor: filterBloc === b ? BLOC_COLOR[b] : "#1f2937", color: filterBloc === b ? "#0b1228" : BLOC_COLOR[b] }}>{BLOC_LABEL[b]}</button>
        ))}
      </div>
      <div className="mt-2 text-[10px] text-muted-foreground">
        Multilateral institutions cluster states into overlapping blocs.
        NATO (1949, 32 members) is the largest defense alliance; EU
        (27 members) is the deepest economic + political union; ASEAN,
        BRICS, OAS, AU, GCC, Five Eyes intelligence-sharing each occupy
        different geometries of cooperation. The Vienna Convention on
        Diplomatic Relations (1961) formalized embassy + immunity
        norms across all of them. Network science applied to IR
        (Maoz, Hafner-Burton, Slaughter Networked World 2017) shows
        density + centrality predict crisis-resolution outcomes;
        states with many ties have more BATNAs and tend to mediate
        better. Click a state to see its tie pattern.
      </div>
    </div>
  );
}
