import { useMemo, useState } from "react";

// Parallel-track timeline of ancient civilizations + key events.
// Hover/click a track to highlight; drag the year slider to see a
// vertical "now" line scrub across history. Tracks visualize the
// "axial age" overlap and the differential timing of bronze/iron/
// classical-empire phases across civilizations.

const W = 480;
const H = 360;

type Era = { start: number; end: number; label: string };
type Civ = { id: string; name: string; color: string; eras: Era[]; events: Array<{ year: number; label: string }> };

const CIVS: Civ[] = [
  {
    id: "mesopotamia",
    name: "Mesopotamia",
    color: "#ff6b6b",
    eras: [
      { start: -3500, end: -2334, label: "Sumer" },
      { start: -2334, end: -2154, label: "Akkad" },
      { start: -1894, end: -539, label: "Babylon/Assyria" },
      { start: -539, end: -331, label: "Achaemenid" },
    ],
    events: [
      { year: -3200, label: "cuneiform" },
      { year: -1754, label: "Hammurabi code" },
      { year: -612, label: "fall of Nineveh" },
    ],
  },
  {
    id: "egypt",
    name: "Egypt",
    color: "#fbbf24",
    eras: [
      { start: -3100, end: -2181, label: "Old Kingdom" },
      { start: -2055, end: -1650, label: "Middle Kingdom" },
      { start: -1550, end: -1077, label: "New Kingdom" },
      { start: -332, end: -30, label: "Ptolemaic" },
    ],
    events: [
      { year: -2560, label: "Great Pyramid" },
      { year: -1279, label: "Ramesses II" },
      { year: -30, label: "Roman Egypt" },
    ],
  },
  {
    id: "indus",
    name: "Indus / South Asia",
    color: "#4ecdc4",
    eras: [
      { start: -2600, end: -1900, label: "Harappa-Mohenjo" },
      { start: -1500, end: -500, label: "Vedic" },
      { start: -322, end: -185, label: "Maurya" },
      { start: 320, end: 550, label: "Gupta" },
    ],
    events: [
      { year: -563, label: "Buddha" },
      { year: -268, label: "Ashoka" },
    ],
  },
  {
    id: "china",
    name: "China",
    color: "#a78bfa",
    eras: [
      { start: -1600, end: -1046, label: "Shang" },
      { start: -1046, end: -256, label: "Zhou" },
      { start: -221, end: -206, label: "Qin" },
      { start: -206, end: 220, label: "Han" },
    ],
    events: [
      { year: -551, label: "Confucius" },
      { year: -221, label: "Qin unification" },
      { year: 105, label: "paper invented" },
    ],
  },
  {
    id: "mediterranean",
    name: "Greco-Roman",
    color: "#60a5fa",
    eras: [
      { start: -800, end: -323, label: "Classical Greece" },
      { start: -509, end: -27, label: "Roman Republic" },
      { start: -27, end: 476, label: "Roman Empire (W)" },
      { start: 330, end: 1453, label: "Byzantine" },
    ],
    events: [
      { year: -490, label: "Marathon" },
      { year: -323, label: "Alexander dies" },
      { year: 476, label: "fall of Rome" },
    ],
  },
  {
    id: "mesoamerica",
    name: "Mesoamerica",
    color: "#f472b6",
    eras: [
      { start: -1500, end: -400, label: "Olmec" },
      { start: -250, end: 900, label: "Maya Classic" },
      { start: 1325, end: 1521, label: "Aztec" },
    ],
    events: [
      { year: 250, label: "Maya inscriptions" },
      { year: 1521, label: "Cortés conquest" },
    ],
  },
];

interface Props {
  civs?: string[];
}

export function CivilizationTimeline({ civs: ctlCivs }: Props = {}) {
  const [year, setYear] = useState(-500);
  const [highlight, setHighlight] = useState<string | null>(null);
  const yMin = -3500;
  const yMax = 1600;

  const shown = useMemo(() => {
    if (!ctlCivs) return CIVS;
    return CIVS.filter((c) => ctlCivs.includes(c.id));
  }, [ctlCivs]);

  const baseX = 110;
  const plotW = W - baseX - 16;
  const rowH = 36;
  const baseY = 30;
  const xOf = (y: number) => baseX + ((y - yMin) / (yMax - yMin)) * plotW;

  return (
    <div className="my-4 p-3 rounded-lg border border-border bg-card text-card-foreground">
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-semibold">Civilization timeline · {year < 0 ? `${Math.abs(year)} BCE` : `${year} CE`} {highlight && <span className="text-muted-foreground">· {highlight}</span>}</div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto bg-[#0b1228] rounded-md" role="img" aria-label="Civilization timeline">
        {/* Year-axis ticks every 500 years */}
        {Array.from({ length: 11 }, (_, k) => yMin + k * 500).map((y) => (
          <g key={y}>
            <line x1={xOf(y)} y1={baseY - 4} x2={xOf(y)} y2={H - 20} stroke="#1f2937" strokeWidth={0.3} />
            <text x={xOf(y)} y={H - 6} fill="#9aa3b8" fontSize="8" textAnchor="middle">{y < 0 ? `${Math.abs(y)}` : y > 0 ? `+${y}` : "0"}</text>
          </g>
        ))}
        {/* Axial age band 800-200 BCE */}
        <rect x={xOf(-800)} y={baseY - 8} width={xOf(-200) - xOf(-800)} height={shown.length * rowH + 4} fill="#fbbf24" fillOpacity={0.06} stroke="#fbbf24" strokeOpacity={0.3} strokeDasharray="2,2" />
        <text x={(xOf(-800) + xOf(-200)) / 2} y={baseY - 12} fill="#fbbf24" fontSize="8" textAnchor="middle">axial age</text>

        {/* Civ tracks */}
        {shown.map((civ, i) => {
          const rowY = baseY + i * rowH;
          const isHl = highlight === civ.id || highlight === null;
          return (
            <g key={civ.id} onMouseEnter={() => setHighlight(civ.id)} onMouseLeave={() => setHighlight(null)}>
              <text x={baseX - 6} y={rowY + 14} fill="#cbd1e6" fontSize="9" textAnchor="end">{civ.name}</text>
              {civ.eras.map((era, ei) => {
                if (era.end < yMin || era.start > yMax) return null;
                const sx = xOf(Math.max(era.start, yMin));
                const ex = xOf(Math.min(era.end, yMax));
                return (
                  <g key={`era-${ei}`}>
                    <rect x={sx} y={rowY + 4} width={ex - sx} height={20} fill={civ.color} fillOpacity={isHl ? 0.6 : 0.2} rx={2} />
                    {ex - sx > 40 && <text x={(sx + ex) / 2} y={rowY + 17} fill="#0b1228" fontSize="8" textAnchor="middle">{era.label}</text>}
                  </g>
                );
              })}
              {civ.events.map((ev, ei) => {
                if (ev.year < yMin || ev.year > yMax) return null;
                return (
                  <g key={`ev-${ei}`}>
                    <circle cx={xOf(ev.year)} cy={rowY + 14} r={2.5} fill="#ffffff" stroke={civ.color} strokeWidth={1} />
                    {isHl && <text x={xOf(ev.year)} y={rowY + 32} fill="#cbd1e6" fontSize="7" textAnchor="middle">{ev.label}</text>}
                  </g>
                );
              })}
            </g>
          );
        })}
        {/* "Now" cursor */}
        <line x1={xOf(year)} y1={baseY - 12} x2={xOf(year)} y2={H - 24} stroke="#ff6b6b" strokeWidth={1.5} />
        <text x={xOf(year)} y={baseY - 16} fill="#ff6b6b" fontSize="9" textAnchor="middle">▼</text>
      </svg>

      <div className="mt-2 text-xs">
        <label className="block">Year cursor: {year < 0 ? `${Math.abs(year)} BCE` : `${year} CE`}
          <input type="range" min={yMin} max={yMax} step={50} value={year} onChange={(e) => setYear(parseInt(e.target.value))} className="w-full mt-0.5" aria-label="Year" />
        </label>
      </div>
      <div className="mt-2 text-[10px] text-muted-foreground">
        Six major civilizational threads on a shared timeline. Jaspers'
        "axial age" (~800-200 BCE; highlighted) saw Confucius + Buddha
        + the Hebrew prophets + Pre-Socratic Greek philosophy + Persian
        Zoroaster emerge nearly simultaneously across non-communicating
        Eurasia — a striking macro-pattern often invoked as evidence
        for parallel cultural evolution under similar urbanization
        pressures. The Maya Classic period (250-900 CE) and Han China
        (-206 to 220 CE) co-occur with the Roman Empire; Mesoamerica's
        bronze + writing arrived independently. Pomeranz's "Great
        Divergence" thesis (2000) argues Europe + China were
        comparable until c.1750. Diamond (1997) Guns Germs and Steel
        emphasizes geographic factors; Bayly (2004) Birth of the
        Modern World emphasizes connection over isolation.
      </div>
    </div>
  );
}
