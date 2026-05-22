import { useMemo, useState } from "react";

// Phanerozoic timeline (541 Mya → today) with the Big Five mass-
// extinction markers and a diversity-recovery curve. Drag the cursor
// to scrub through eras; toggle which clades to show. Inspired by
// Sepkoski (1981, 1984) marine diversity curves + Raup-Sepkoski 1982
// big-five identification.

const W = 480;
const H = 320;

interface Props {
  era?: "phanerozoic" | "mesozoic" | "cenozoic";
}

// Geologic periods of the Phanerozoic (Mya start - Mya end)
interface Period { name: string; start: number; end: number; era: "Paleozoic" | "Mesozoic" | "Cenozoic"; color: string; }

const PERIODS: Period[] = [
  { name: "Cambrian", start: 538, end: 485, era: "Paleozoic", color: "#7AB" },
  { name: "Ordovician", start: 485, end: 443, era: "Paleozoic", color: "#5A9" },
  { name: "Silurian", start: 443, end: 419, era: "Paleozoic", color: "#7C8" },
  { name: "Devonian", start: 419, end: 358, era: "Paleozoic", color: "#9B7" },
  { name: "Carboniferous", start: 358, end: 298, era: "Paleozoic", color: "#587" },
  { name: "Permian", start: 298, end: 252, era: "Paleozoic", color: "#A86" },
  { name: "Triassic", start: 252, end: 201, era: "Mesozoic", color: "#A76" },
  { name: "Jurassic", start: 201, end: 145, era: "Mesozoic", color: "#5B9" },
  { name: "Cretaceous", start: 145, end: 66, era: "Mesozoic", color: "#9A7" },
  { name: "Paleogene", start: 66, end: 23, era: "Cenozoic", color: "#E9A" },
  { name: "Neogene", start: 23, end: 2.6, era: "Cenozoic", color: "#EC9" },
  { name: "Quaternary", start: 2.6, end: 0, era: "Cenozoic", color: "#FD8" },
];

interface Extinction { name: string; mya: number; lossPct: number; cause: string; }

const BIG_FIVE: Extinction[] = [
  { name: "End-Ordovician", mya: 445, lossPct: 60, cause: "glaciation + sea-level fall" },
  { name: "Late Devonian", mya: 372, lossPct: 50, cause: "anoxia, Hangenberg" },
  { name: "End-Permian (Great Dying)", mya: 252, lossPct: 81, cause: "Siberian Traps volcanism" },
  { name: "End-Triassic", mya: 201, lossPct: 47, cause: "CAMP volcanism, climate" },
  { name: "End-Cretaceous (K-Pg)", mya: 66, lossPct: 76, cause: "Chicxulub impact" },
];

// Stylized marine-genera diversity curve (approximation of Sepkoski 1981)
function diversityAt(mya: number): number {
  // Three evolutionary faunas summed + dips at extinctions
  // Returns a value 0-1
  if (mya > 540) return 0;
  // Background growth: from Cambrian to today, monotonic with dips
  let d = 0.15 + 0.85 * (1 - mya / 540);
  // Dips at the Big Five
  for (const e of BIG_FIVE) {
    const dt = mya - e.mya;
    if (Math.abs(dt) < 8) {
      d *= 1 - (e.lossPct / 100) * Math.exp(-Math.abs(dt) / 3);
    }
  }
  return Math.max(0, Math.min(1, d));
}

export function ExtinctionTimeline({ era: ctlEra }: Props = {}) {
  const [scrub, setScrub] = useState(252);
  const era = ctlEra ?? "phanerozoic";

  const range = useMemo(() => {
    if (era === "mesozoic") return { mn: 252, mx: 66 };
    if (era === "cenozoic") return { mn: 66, mx: 0 };
    return { mn: 540, mx: 0 };
  }, [era]);

  const baseX = 40;
  const baseY = 20;
  const plotW = W - baseX - 16;
  const plotH = 60;
  const xOf = (mya: number) => baseX + ((range.mn - mya) / (range.mn - range.mx)) * plotW;

  const curve = useMemo(() => {
    const N = 200;
    const pts: Array<{ mya: number; d: number }> = [];
    for (let i = 0; i <= N; i++) {
      const mya = range.mn - (i / N) * (range.mn - range.mx);
      pts.push({ mya, d: diversityAt(mya) });
    }
    return pts;
  }, [range]);

  const cursorPeriod = PERIODS.find((p) => scrub <= p.start && scrub > p.end);
  const cursorEra = cursorPeriod?.era ?? "";

  return (
    <div className="my-4 p-3 rounded-lg border border-border bg-card text-card-foreground">
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-semibold">Geologic time · {scrub.toFixed(0)} Mya · {cursorPeriod?.name ?? "—"} ({cursorEra})</div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto bg-[#0b1228] rounded-md" role="img" aria-label="Extinction timeline">
        {/* Period bar */}
        {PERIODS.filter((p) => p.start >= range.mx && p.end <= range.mn).map((p) => {
          const x1 = xOf(Math.min(p.start, range.mn));
          const x2 = xOf(Math.max(p.end, range.mx));
          return (
            <g key={p.name}>
              <rect x={Math.min(x1, x2)} y={baseY} width={Math.abs(x2 - x1)} height={20} fill={p.color} fillOpacity={0.55} />
              {Math.abs(x2 - x1) > 32 && (
                <text x={(x1 + x2) / 2} y={baseY + 14} fill="#0b1228" fontSize="9" textAnchor="middle">{p.name.slice(0, 9)}</text>
              )}
            </g>
          );
        })}
        {/* Era labels above bar */}
        {(["Paleozoic", "Mesozoic", "Cenozoic"] as const).map((eraName) => {
          const ps = PERIODS.filter((p) => p.era === eraName && p.start >= range.mx && p.end <= range.mn);
          if (ps.length === 0) return null;
          const startMy = Math.min(...ps.map((p) => p.start));
          const endMy = Math.max(...ps.map((p) => p.end));
          const cx = (xOf(startMy) + xOf(endMy)) / 2;
          return <text key={eraName} x={cx} y={baseY - 4} fill="#9aa3b8" fontSize="9" textAnchor="middle">{eraName}</text>;
        })}
        {/* Diversity curve below */}
        {(() => {
          const cy0 = baseY + 30;
          const cyH = plotH;
          const yOfD = (d: number) => cy0 + cyH - d * cyH;
          const path = curve.map((p, i) => `${i === 0 ? "M" : "L"}${xOf(p.mya).toFixed(1)},${yOfD(p.d).toFixed(1)}`).join(" ");
          return (
            <g>
              <rect x={baseX} y={cy0} width={plotW} height={cyH} fill="none" stroke="#1f2937" strokeWidth={0.4} />
              <path d={path} fill="none" stroke="#4ecdc4" strokeWidth={1.5} />
              <text x={baseX - 4} y={cy0 + 8} fill="#9aa3b8" fontSize="8" textAnchor="end">high</text>
              <text x={baseX - 4} y={cy0 + cyH - 2} fill="#9aa3b8" fontSize="8" textAnchor="end">low</text>
              <text x={14} y={cy0 + cyH / 2} fill="#cbd1e6" fontSize="9" textAnchor="middle" transform={`rotate(-90, 14, ${cy0 + cyH / 2})`}>diversity</text>
            </g>
          );
        })()}
        {/* Big Five extinction markers */}
        {BIG_FIVE.filter((e) => e.mya >= range.mx && e.mya <= range.mn).map((e) => (
          <g key={e.name}>
            <line x1={xOf(e.mya)} y1={baseY - 10} x2={xOf(e.mya)} y2={baseY + 30 + plotH} stroke="#ff6b6b" strokeWidth={1.2} strokeDasharray="3,2" opacity={0.7} />
            <text x={xOf(e.mya)} y={baseY + 30 + plotH + 18} fill="#ff6b6b" fontSize="8" textAnchor="middle">{e.lossPct}%</text>
            <text x={xOf(e.mya)} y={baseY + 30 + plotH + 30} fill="#ff6b6b" fontSize="7" textAnchor="middle">{e.name.split(" ")[0]}</text>
          </g>
        ))}
        {/* Cursor */}
        <line x1={xOf(scrub)} y1={baseY - 14} x2={xOf(scrub)} y2={H - 60} stroke="#fbbf24" strokeWidth={1.5} />
        <polygon points={`${xOf(scrub) - 5},${baseY - 14} ${xOf(scrub) + 5},${baseY - 14} ${xOf(scrub)},${baseY - 8}`} fill="#fbbf24" />
        {/* Mya tick labels */}
        {[500, 400, 300, 200, 100, 0].filter((m) => m >= range.mx && m <= range.mn).map((m) => (
          <text key={m} x={xOf(m)} y={H - 4} fill="#9aa3b8" fontSize="8" textAnchor="middle">{m}</text>
        ))}
        <text x={baseX + plotW / 2} y={H - 14} fill="#cbd1e6" fontSize="9" textAnchor="middle">millions of years ago</text>
      </svg>

      <div className="mt-2 text-xs">
        <label className="block">scrub: {scrub.toFixed(0)} Mya
          <input type="range" min={range.mx} max={range.mn} step={1} value={scrub} onChange={(e) => setScrub(parseInt(e.target.value))} className="w-full mt-0.5" aria-label="Geologic time" />
        </label>
      </div>
      <div className="mt-2 text-[10px] text-muted-foreground">
        Raup-Sepkoski 1982 identified the "Big Five" mass extinctions
        as statistical outliers in the Phanerozoic record. End-Permian
        (252 Mya) was the most severe — ~81% marine genera lost,
        triggered by Siberian Traps volcanism (Erwin 2006). End-Cretaceous
        (66 Mya) — Alvarez 1980 iridium anomaly → Chicxulub impact
        identified Hildebrand 1991 (Schulte et al. 2010 consensus
        review). Diversity recovery typically takes 5-10 Myr after a
        major extinction; some clades ("dead clades walking") never
        recover. Anthropocene defaunation (Dirzo 2014) puts us on a
        sixth-extinction trajectory, with vertebrate population
        declines &gt;60% since 1970 (WWF Living Planet 2022).
      </div>
    </div>
  );
}
