import { useMemo, useState } from "react";

// Citation network for landmark SCOTUS cases by doctrinal area.
// Each case is a node; an edge means "case B cites case A as
// precedent". Click an area to filter. Originalists / textualists
// emphasize narrow citation; living-constitutionalists weave wider
// chains. This is a stylized teaching graph — not a replacement for
// Westlaw / Lexis / CourtListener data.

const W = 480;
const H = 360;

type Area = "civil-rights" | "speech" | "privacy" | "federalism";

interface CaseNode {
  id: string;
  short: string;
  year: number;
  area: Area;
  cites: string[];
}

const CASES: CaseNode[] = [
  // Civil rights / equal protection
  { id: "marbury", short: "Marbury v. Madison", year: 1803, area: "federalism", cites: [] },
  { id: "plessy", short: "Plessy v. Ferguson", year: 1896, area: "civil-rights", cites: [] },
  { id: "brown", short: "Brown v. Board", year: 1954, area: "civil-rights", cites: ["plessy"] },
  { id: "loving", short: "Loving v. Virginia", year: 1967, area: "civil-rights", cites: ["brown"] },
  { id: "obergefell", short: "Obergefell v. Hodges", year: 2015, area: "civil-rights", cites: ["loving", "lawrence"] },
  // Speech
  { id: "schenck", short: "Schenck v. US", year: 1919, area: "speech", cites: [] },
  { id: "brandenburg", short: "Brandenburg v. Ohio", year: 1969, area: "speech", cites: ["schenck"] },
  { id: "nyt-sullivan", short: "NYT v. Sullivan", year: 1964, area: "speech", cites: [] },
  { id: "citizens-united", short: "Citizens United", year: 2010, area: "speech", cites: ["nyt-sullivan"] },
  // Privacy
  { id: "griswold", short: "Griswold v. CT", year: 1965, area: "privacy", cites: [] },
  { id: "roe", short: "Roe v. Wade", year: 1973, area: "privacy", cites: ["griswold"] },
  { id: "lawrence", short: "Lawrence v. Texas", year: 2003, area: "privacy", cites: ["griswold"] },
  { id: "casey", short: "Planned Parenthood v. Casey", year: 1992, area: "privacy", cites: ["roe"] },
  { id: "dobbs", short: "Dobbs v. Jackson", year: 2022, area: "privacy", cites: ["roe", "casey"] },
  // Federalism
  { id: "mcculloch", short: "McCulloch v. Maryland", year: 1819, area: "federalism", cites: ["marbury"] },
  { id: "wickard", short: "Wickard v. Filburn", year: 1942, area: "federalism", cites: [] },
  { id: "lopez", short: "US v. Lopez", year: 1995, area: "federalism", cites: ["wickard"] },
  { id: "nfib", short: "NFIB v. Sebelius", year: 2012, area: "federalism", cites: ["wickard", "lopez"] },
];

const AREA_COLORS: Record<Area, string> = {
  "civil-rights": "#4ecdc4",
  speech: "#fbbf24",
  privacy: "#a78bfa",
  federalism: "#ff6b6b",
};

interface Props {
  area?: Area;
}

export function PrecedentNetwork({ area: ctlArea }: Props = {}) {
  const [intArea, setIntArea] = useState<Area | "all">("civil-rights");
  const area: Area | "all" = ctlArea ?? intArea;

  const shown = useMemo(
    () => (area === "all" ? CASES : CASES.filter((c) => c.area === area)),
    [area],
  );

  // Layout: x = year (normalized), y = stacked per area
  const yMin = 1800;
  const yMax = 2030;
  const xOf = (yr: number) => 60 + ((yr - yMin) / (yMax - yMin)) * (W - 100);
  const rowOf = (a: Area) => {
    const rows: Area[] = ["civil-rights", "speech", "privacy", "federalism"];
    return 60 + rows.indexOf(a) * 70;
  };

  const positions = useMemo(() => {
    const m = new Map<string, { x: number; y: number }>();
    for (const c of CASES) {
      // Stagger same-row, same-decade nodes
      const sameRowCases = shown.filter((d) => d.area === c.area);
      const sameDecade = sameRowCases.filter((d) => Math.floor(d.year / 30) === Math.floor(c.year / 30));
      const idxInDecade = sameDecade.findIndex((d) => d.id === c.id);
      m.set(c.id, { x: xOf(c.year), y: rowOf(c.area) + (idxInDecade > 0 ? 12 * (idxInDecade % 2 === 0 ? 1 : -1) : 0) });
    }
    return m;
  }, [shown]);

  return (
    <div className="my-4 p-3 rounded-lg border border-border bg-card text-card-foreground">
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-semibold">Precedent network · {shown.length} cases · {shown.reduce((s, c) => s + c.cites.filter((cid) => shown.some((d) => d.id === cid)).length, 0)} citation edges</div>
        <div className="flex gap-1">
          {(["all", "civil-rights", "speech", "privacy", "federalism"] as const).map((a) => (
            <button key={a} onClick={() => setIntArea(a)} disabled={ctlArea !== undefined} className={`px-1.5 py-0.5 rounded text-[9px] ${area === a ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-accent"}`}>{a}</button>
          ))}
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto bg-[#0b1228] rounded-md" role="img" aria-label="Precedent network">
        {/* Year axis */}
        {[1800, 1850, 1900, 1950, 2000].map((yr) => (
          <g key={yr}>
            <line x1={xOf(yr)} y1={50} x2={xOf(yr)} y2={H - 30} stroke="#1f2937" strokeWidth={0.3} />
            <text x={xOf(yr)} y={H - 14} fill="#9aa3b8" fontSize="9" textAnchor="middle">{yr}</text>
          </g>
        ))}
        {/* Row labels */}
        {(["civil-rights", "speech", "privacy", "federalism"] as Area[]).map((a) => (
          <text key={a} x={6} y={rowOf(a) + 4} fill={AREA_COLORS[a]} fontSize="9">{a}</text>
        ))}
        {/* Citation edges */}
        {shown.flatMap((c) => c.cites.map((cid) => {
          const target = positions.get(cid);
          const source = positions.get(c.id);
          if (!target || !source) return null;
          return <line key={`${c.id}-${cid}`} x1={target.x} y1={target.y} x2={source.x} y2={source.y} stroke={AREA_COLORS[c.area]} strokeWidth={1} strokeOpacity={0.5} markerEnd={`url(#arrow-${c.area})`} />;
        }))}
        {/* Markers */}
        <defs>
          {(Object.entries(AREA_COLORS) as Array<[Area, string]>).map(([a, color]) => (
            <marker key={a} id={`arrow-${a}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto">
              <path d="M 0 0 L 10 5 L 0 10 z" fill={color} />
            </marker>
          ))}
        </defs>
        {/* Nodes */}
        {shown.map((c) => {
          const pos = positions.get(c.id)!;
          return (
            <g key={c.id}>
              <circle cx={pos.x} cy={pos.y} r={5} fill={AREA_COLORS[c.area]} stroke="#0b1228" strokeWidth={1.5} />
              <text x={pos.x} y={pos.y - 8} fill="#cbd1e6" fontSize="8" textAnchor="middle">{c.short.split(" v.")[0]}</text>
              <text x={pos.x} y={pos.y + 14} fill="#9aa3b8" fontSize="7" textAnchor="middle">{c.year}</text>
            </g>
          );
        })}
      </svg>

      <div className="mt-2 text-[10px] text-muted-foreground">
        Stare decisis — Latin "to stand by things decided" — is the
        common-law doctrine that courts should follow precedent. An
        edge here means "the later case cites the earlier as
        authority." Some chains are direct (Brown 1954 overruling
        Plessy 1896; Dobbs 2022 overruling Roe 1973 + Casey 1992);
        others are extensions (Griswold 1965 → Roe → Lawrence →
        Obergefell as the substantive due-process privacy line).
        Hart-Dworkin debate (1958-86): does precedent encode rules,
        principles, or just judicial interest balancing? In the US
        the doctrine is weaker than in the UK — SCOTUS has overruled
        ~300 of its own decisions; the Federalist Society + originalists
        (Scalia, Thomas) generally favor narrower stare decisis than
        the liberal wing (Brennan, Marshall, Ginsburg).
      </div>
    </div>
  );
}
