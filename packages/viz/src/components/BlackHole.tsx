import { useState } from "react";

// Schwarzschild black-hole geometry. A non-rotating mass M has an event
// horizon at the Schwarzschild radius r_s = 2GM/c² — the point of no return,
// where escape velocity reaches the speed of light. Outside it sit two other
// key radii: the PHOTON SPHERE at 1.5 r_s (where light can orbit) and the
// innermost stable circular orbit (ISCO) at 3 r_s. A clock at radius r ticks
// slow by the gravitational time-dilation factor √(1 − r_s/r), which falls
// to zero at the horizon — time appears to freeze there to a distant observer.

const W = 460;
const H = 320;
const G = 6.674e-11, C = 2.998e8, MSUN = 1.989e30;

const PRESETS = [
  { label: "Stellar 10 M☉", m: 10 * MSUN },
  { label: "Sgr A* 4.3M M☉", m: 4.3e6 * MSUN },
];

function fmtRs(meters: number): string {
  const km = meters / 1000;
  if (km < 1e4) return `${km.toFixed(0)} km`;
  if (km < 1e8) return `${(km / 1e6).toFixed(2)} million km`;
  return `${(km / 1.496e8).toFixed(2)} AU`;
}

interface Props { mass?: string; }

export function BlackHole({ mass: ctl }: Props = {}) {
  const [intMass, setIntMass] = useState("Stellar 10 M☉");
  const [rOverRs, setROverRs] = useState(3);
  const massLabel = ctl ?? intMass;
  const m = (PRESETS.find((p) => p.label === massLabel) ?? PRESETS[0]).m;
  const rs = (2 * G * m) / (C * C);
  const dilation = Math.sqrt(Math.max(0, 1 - 1 / rOverRs));

  const cx = 150, cy = 165;
  const rEH = 40; // event horizon in SVG px (= 1 r_s)
  const obsSvg = Math.min(160, rEH * rOverRs);

  return (
    <div className="my-4 p-3 rounded-lg border border-border bg-card text-card-foreground">
      <div className="flex items-center justify-between mb-2 flex-wrap gap-1">
        <div className="text-sm font-semibold">r_s = {fmtRs(rs)} · clock runs at {(dilation * 100).toFixed(0)}% at r = {rOverRs.toFixed(1)} r_s</div>
        <div className="flex gap-1">
          {PRESETS.map((p) => (
            <button key={p.label} onClick={() => setIntMass(p.label)} disabled={ctl !== undefined}
              className={`px-1.5 py-0.5 rounded text-[9px] ${massLabel === p.label ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-accent"}`}>{p.label}</button>
          ))}
        </div>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto bg-[#0b1228] rounded-md" role="img" aria-label="Schwarzschild black hole radii and time dilation">
        {/* ISCO (3 r_s) */}
        <circle cx={cx} cy={cy} r={rEH * 3} fill="none" stroke="#475569" strokeWidth={1} strokeDasharray="4,3" />
        <text x={cx} y={cy - rEH * 3 - 4} fill="#94a3b8" fontSize="7.5" textAnchor="middle">ISCO (3 r_s)</text>
        {/* photon sphere (1.5 r_s) */}
        <circle cx={cx} cy={cy} r={rEH * 1.5} fill="none" stroke="#fbbf24" strokeWidth={1} strokeDasharray="3,2" />
        <text x={cx + rEH * 1.5 + 4} y={cy - rEH * 1.1} fill="#fbbf24" fontSize="7">photon sphere</text>
        {/* event horizon (r_s) — the black disk */}
        <circle cx={cx} cy={cy} r={rEH} fill="#000" stroke="#f87171" strokeWidth={1.6} />
        <text x={cx} y={cy + 3} fill="#f87171" fontSize="8" textAnchor="middle">r_s</text>

        {/* observer marker on +x radial */}
        <line x1={cx} y1={cy} x2={cx + obsSvg} y2={cy} stroke="#38bdf8" strokeWidth={0.6} strokeDasharray="2,2" />
        <circle cx={cx + obsSvg} cy={cy} r={5} fill="#38bdf8" />
        <text x={cx + obsSvg} y={cy - 9} fill="#38bdf8" fontSize="8" textAnchor="middle">clock</text>

        {/* readout */}
        <g transform="translate(330,60)">
          <text x={0} y={0} fill="#cbd1e6" fontSize="9" fontWeight="bold">at r = {rOverRs.toFixed(1)} r_s</text>
          <text x={0} y={20} fill="#9aa3b8" fontSize="8">√(1 − r_s/r)</text>
          <text x={0} y={40} fill="#4ade80" fontSize="14" fontWeight="bold">{dilation.toFixed(3)}</text>
          <text x={0} y={58} fill="#9aa3b8" fontSize="7.5">of a distant clock's rate</text>
          <text x={0} y={86} fill="#f87171" fontSize="7.5">→ 0 at the horizon</text>
          <text x={0} y={100} fill="#f87171" fontSize="7.5">(time appears frozen)</text>
        </g>
      </svg>

      <div className="mt-2 text-xs">
        <label className="block">observer radius: {rOverRs.toFixed(1)} × r_s
          <input type="range" min={1.05} max={6} step={0.05} value={rOverRs} onChange={(e) => setROverRs(parseFloat(e.target.value))} className="w-full mt-0.5" aria-label="Observer radius in Schwarzschild radii" />
        </label>
      </div>
      <div className="mt-1 text-[10px] text-muted-foreground">
        The <b>Schwarzschild radius</b> r_s = 2GM/c² scales with mass — ~30 km
        for a 10-solar-mass star, but millions of km for the supermassive
        <b> Sgr A*</b>. Light can orbit at the <b>photon sphere</b> (1.5 r_s),
        and stable matter orbits no closer than the <b>ISCO</b> (3 r_s). A
        clock deep in the well ticks slow by <b>√(1 − r_s/r)</b>, reaching
        zero at the horizon — Einstein's gravitational time dilation,
        confirmed by GPS and the Pound–Rebka experiment.
      </div>
    </div>
  );
}
