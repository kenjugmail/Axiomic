import { useMemo, useState } from "react";

// Click-to-paint zoning grid. Cells become Residential (R), Commercial
// (C), Mixed (M), Park (P), or Transit (T). The readout computes
// crude scores: density (dwellings/acre proxy), jobs, walkability
// (distance from R-cells to C or M within 3 cells = ~quarter mile),
// and transit accessibility. Inspired by 15-minute-city + form-based
// zoning (Parolek, Calthorpe TOD).

const W = 460;
const H = 320;
const GRID = 10;

type Zone = "R" | "C" | "M" | "P" | "T" | "_";

const ZONE_COLORS: Record<Zone, string> = {
  R: "#fbbf24", // residential
  C: "#60a5fa", // commercial
  M: "#a78bfa", // mixed
  P: "#4ecdc4", // park
  T: "#ff6b6b", // transit
  _: "#1f2937", // empty
};

const ZONE_LABEL: Record<Zone, string> = {
  R: "Residential",
  C: "Commercial",
  M: "Mixed",
  P: "Park",
  T: "Transit",
  _: "Empty",
};

const PRESETS: Record<string, Zone[][]> = {
  "euclidean": [
    "RRRRRRRRRR".split(""),
    "RRRRRRRRRR".split(""),
    "RRRRRRRRRR".split(""),
    "RRRRRRRRRR".split(""),
    "__________".split(""),
    "__________".split(""),
    "CCCCCCCCCC".split(""),
    "CCCCCCCCCC".split(""),
    "CCCCCCCCCC".split(""),
    "CCCCCCCCCC".split(""),
  ] as Zone[][],
  "mixed-use": [
    "RRMCMRRPRR".split(""),
    "RMMCMMRPRM".split(""),
    "MMCCCMMMMM".split(""),
    "CCCTCCCMCC".split(""),
    "MMCCCCCMCC".split(""),
    "RMMCMMMMRR".split(""),
    "RRMMCMMRRR".split(""),
    "PRRMCMMRPM".split(""),
    "RRRMCMMRRP".split(""),
    "RRRRRRMRRT".split(""),
  ] as Zone[][],
  "tod": [
    "RRRRMTMRRR".split(""),
    "RRMMMTMMRR".split(""),
    "RMMCMTMCMR".split(""),
    "MMMCMTMCMM".split(""),
    "MCCMCTCMCM".split(""),
    "MCCMCTCMCM".split(""),
    "MMMCMTMCMM".split(""),
    "RMMCMTMCMR".split(""),
    "RRMMMTMMRR".split(""),
    "RRRRMTMRRR".split(""),
  ] as Zone[][],
};

interface Props {
  preset?: keyof typeof PRESETS;
}

function score(grid: Zone[][]) {
  let R = 0, C = 0, M = 0, P = 0, T = 0;
  for (const row of grid) for (const c of row) {
    if (c === "R") R++;
    if (c === "C") C++;
    if (c === "M") M++;
    if (c === "P") P++;
    if (c === "T") T++;
  }
  const density = R + M * 1.5;
  const jobs = C + M * 0.8;
  // Walkability: % of R-cells within 3 cells of any C or M
  let walkR = 0;
  let walkable = 0;
  for (let i = 0; i < GRID; i++) {
    for (let j = 0; j < GRID; j++) {
      if (grid[i][j] !== "R") continue;
      walkR++;
      let near = false;
      for (let di = -3; di <= 3 && !near; di++) {
        for (let dj = -3; dj <= 3 && !near; dj++) {
          const ni = i + di;
          const nj = j + dj;
          if (ni < 0 || nj < 0 || ni >= GRID || nj >= GRID) continue;
          if (grid[ni][nj] === "C" || grid[ni][nj] === "M") near = true;
        }
      }
      if (near) walkable++;
    }
  }
  const walk = walkR > 0 ? walkable / walkR : 0;
  // Transit access: % of cells within 3 of T
  let nearT = 0;
  for (let i = 0; i < GRID; i++) {
    for (let j = 0; j < GRID; j++) {
      if (grid[i][j] === "_") continue;
      for (let di = -3; di <= 3; di++) {
        for (let dj = -3; dj <= 3; dj++) {
          const ni = i + di;
          const nj = j + dj;
          if (ni < 0 || nj < 0 || ni >= GRID || nj >= GRID) continue;
          if (grid[ni][nj] === "T") { nearT++; di = 99; break; }
        }
      }
    }
  }
  const totalDeveloped = R + C + M + P + T;
  const transitAccess = totalDeveloped > 0 ? nearT / totalDeveloped : 0;
  return { density, jobs, walk, transitAccess, parks: P };
}

export function ZoningGrid({ preset: ctlPreset }: Props = {}) {
  const [intPreset, setIntPreset] = useState<keyof typeof PRESETS>("mixed-use");
  const preset = ctlPreset ?? intPreset;
  const [grid, setGrid] = useState<Zone[][]>(() => PRESETS[preset].map((r) => [...r]));
  const [paint, setPaint] = useState<Zone>("M");

  const stats = useMemo(() => score(grid), [grid]);

  const applyPreset = (k: keyof typeof PRESETS) => {
    setIntPreset(k);
    setGrid(PRESETS[k].map((r) => [...r]));
  };

  const cellSize = Math.min(24, (W - 100) / GRID);
  const baseX = 30;
  const baseY = 16;

  return (
    <div className="my-4 p-3 rounded-lg border border-border bg-card text-card-foreground">
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-semibold">Zoning · density {stats.density.toFixed(0)} · jobs {stats.jobs.toFixed(0)} · walk {(stats.walk * 100).toFixed(0)}% · transit {(stats.transitAccess * 100).toFixed(0)}%</div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto bg-[#0b1228] rounded-md" role="img" aria-label="Zoning grid">
        {grid.map((row, i) =>
          row.map((cell, j) => (
            <rect
              key={`${i}-${j}`}
              x={baseX + j * cellSize}
              y={baseY + i * cellSize}
              width={cellSize - 1}
              height={cellSize - 1}
              fill={ZONE_COLORS[cell]}
              fillOpacity={cell === "_" ? 0.6 : 0.85}
              onClick={() => {
                const next = grid.map((r) => [...r]);
                next[i][j] = paint;
                setGrid(next);
              }}
              style={{ cursor: "pointer" }}
            />
          )),
        )}
        {/* Side panel with summary chips */}
        <g transform={`translate(${baseX + GRID * cellSize + 14}, ${baseY})`}>
          {(["R", "C", "M", "P", "T"] as Zone[]).map((z, i) => (
            <g key={z} transform={`translate(0, ${i * 22})`}>
              <rect width={14} height={14} fill={ZONE_COLORS[z]} />
              <text x={20} y={11} fill="#cbd1e6" fontSize="9">{ZONE_LABEL[z]}</text>
            </g>
          ))}
        </g>
      </svg>

      <div className="mt-2 grid grid-cols-2 gap-1 text-[10px]">
        <div>
          <span className="text-muted-foreground mr-1">Paint:</span>
          {(["R", "C", "M", "P", "T", "_"] as Zone[]).map((z) => (
            <button key={z} onClick={() => setPaint(z)} className={`mr-1 px-1.5 py-0.5 rounded ${paint === z ? "ring-2 ring-primary" : ""}`} style={{ backgroundColor: ZONE_COLORS[z], color: z === "_" || z === "C" ? "white" : "black" }}>{z}</button>
          ))}
        </div>
        <div>
          <span className="text-muted-foreground mr-1">Preset:</span>
          {(Object.keys(PRESETS) as Array<keyof typeof PRESETS>).map((k) => (
            <button key={k} onClick={() => applyPreset(k)} className={`mr-1 px-1.5 py-0.5 rounded ${preset === k ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-accent"}`}>{k}</button>
          ))}
        </div>
      </div>
      <div className="mt-2 text-[10px] text-muted-foreground">
        Euclidean zoning (after Euclid v. Ambler 1926) strictly
        separates uses — residential here, commercial there — and
        underpins most US zoning codes. Form-based codes (Duany +
        Plater-Zyberk, Parolek "missing middle") regulate building
        form + frontage rather than use, enabling mixed-use walkable
        neighborhoods like the historic "main street" pattern. The
        15-minute city (Moreno 2016) targets neighborhoods where
        residents can reach daily needs in ≤15 min by foot/bike.
        Transit-oriented development (Calthorpe 1993) clusters
        density near transit nodes (T cells here). Try painting
        Euclidean (strict separation) vs Mixed-Use (interleaved)
        and watch walkability + transit access change while density
        + jobs stay similar.
      </div>
    </div>
  );
}
