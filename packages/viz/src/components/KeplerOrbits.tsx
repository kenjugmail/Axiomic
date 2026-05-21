import { useMemo, useState } from "react";

// Kepler-orbit visualizer: a single body in elliptical orbit around
// a central mass. Drag eccentricity + semi-major axis; see orbit
// shape, perihelion/aphelion distance, and period (T² ∝ a³ in
// AU/year units for solar orbits). Presets for canonical bodies
// (Mercury, Earth, Mars, Jupiter, Halley's Comet).

const W = 460;
const H = 320;

interface Props {
  body?: keyof typeof BODIES;
}

interface Body {
  label: string;
  a: number;   // semi-major axis (AU)
  e: number;   // eccentricity
}

const BODIES: Record<string, Body> = {
  mercury: { label: "Mercury", a: 0.387, e: 0.206 },
  earth: { label: "Earth", a: 1.0, e: 0.017 },
  mars: { label: "Mars", a: 1.524, e: 0.093 },
  jupiter: { label: "Jupiter", a: 5.203, e: 0.048 },
  halley: { label: "Halley", a: 17.83, e: 0.967 },
};

export function KeplerOrbits({ body: ctlBody }: Props = {}) {
  const [intBody, setIntBody] = useState<keyof typeof BODIES>("earth");
  const [aOverride, setAOverride] = useState<number | null>(null);
  const [eOverride, setEOverride] = useState<number | null>(null);
  const bodyKey = ctlBody ?? intBody;
  const preset = BODIES[bodyKey];
  const a = aOverride ?? preset.a;
  const e = eOverride ?? preset.e;
  const b = a * Math.sqrt(1 - e * e);   // semi-minor
  const perihelion = a * (1 - e);
  const aphelion = a * (1 + e);
  const period = Math.pow(a, 1.5);       // T in years for solar orbits (T² = a³)

  // Sample 200 points on the ellipse; Sun at one focus (offset by c = ae)
  const c = a * e;
  const points = useMemo(() => {
    const pts: Array<{ x: number; y: number }> = [];
    const N = 300;
    for (let i = 0; i <= N; i++) {
      const θ = (i / N) * Math.PI * 2;
      pts.push({ x: a * Math.cos(θ) - c, y: b * Math.sin(θ) });
    }
    return pts;
  }, [a, b, c]);

  // Plot extent: fit aphelion
  const baseX = 20;
  const baseY = 20;
  const plotW = W - baseX - 20;
  const plotH = H - baseY - 100;
  const maxR = Math.max(aphelion, b) * 1.15;
  const sx = plotW / (2 * maxR);
  const sy = plotH / (2 * maxR);
  const s = Math.min(sx, sy);
  const cxPx = baseX + plotW / 2;
  const cyPx = baseY + plotH / 2;
  const xOf = (x: number) => cxPx + x * s;
  const yOf = (y: number) => cyPx - y * s;

  // Compute current orbit position based on mean anomaly (slider)
  const [meanAnomaly, setMeanAnomaly] = useState(0);
  const M = meanAnomaly;
  // Solve Kepler's equation M = E - e sin E for E
  let E = M;
  for (let k = 0; k < 8; k++) E = E - (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
  const x = a * (Math.cos(E) - e);
  const y = b * Math.sin(E);
  // Current radius from Sun (focus): r = a(1 − e cos E)
  const r = a * (1 - e * Math.cos(E));

  return (
    <div className="my-4 p-3 rounded-lg border border-border bg-card text-card-foreground">
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-semibold">{preset.label} · a = {a.toFixed(2)} AU · e = {e.toFixed(3)} · T = {period.toFixed(2)} yr · r = {r.toFixed(2)} AU</div>
        <div className="flex gap-1">
          {(Object.keys(BODIES) as Array<keyof typeof BODIES>).map((b) => (
            <button key={b} onClick={() => { setIntBody(b); setAOverride(null); setEOverride(null); }} disabled={ctlBody !== undefined} className={`px-1.5 py-0.5 rounded text-[9px] ${bodyKey === b ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-accent"}`}>{BODIES[b].label}</button>
          ))}
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto bg-[#0b1228] rounded-md" role="img" aria-label="Kepler orbit">
        {/* Orbit ellipse */}
        <path d={points.map((p, i) => `${i === 0 ? "M" : "L"}${xOf(p.x).toFixed(1)},${yOf(p.y).toFixed(1)}`).join(" ")} fill="none" stroke="#4ecdc4" strokeWidth={1.5} />
        {/* Sun at focus */}
        <circle cx={xOf(0)} cy={yOf(0)} r={6} fill="#fbbf24" />
        <text x={xOf(0) + 9} y={yOf(0) + 4} fill="#fbbf24" fontSize="9">Sun</text>
        {/* Body position */}
        <line x1={xOf(0)} y1={yOf(0)} x2={xOf(x)} y2={yOf(y)} stroke="#ff6b6b" strokeWidth={0.8} strokeDasharray="2,2" />
        <circle cx={xOf(x)} cy={yOf(y)} r={5} fill="#ff6b6b" stroke="#0b1228" strokeWidth={1.2} />
        <text x={xOf(x) + 8} y={yOf(y) + 3} fill="#ff6b6b" fontSize="9">{preset.label}</text>
        {/* Perihelion + aphelion markers */}
        <circle cx={xOf(perihelion - c)} cy={yOf(0)} r={2} fill="#a78bfa" />
        <text x={xOf(perihelion - c) - 4} y={yOf(0) - 4} fill="#a78bfa" fontSize="8" textAnchor="end">peri {perihelion.toFixed(2)}</text>
        <circle cx={xOf(-aphelion - c)} cy={yOf(0)} r={2} fill="#a78bfa" />
        <text x={xOf(-aphelion - c) + 4} y={yOf(0) - 4} fill="#a78bfa" fontSize="8">ap {aphelion.toFixed(2)}</text>
        <text x={baseX + plotW / 2} y={H - 60} fill="#cbd1e6" fontSize="9" textAnchor="middle">Kepler's 3rd: T² = a³ (in AU, yr) → T = {period.toFixed(2)} yr</text>
      </svg>

      <div className="mt-2 grid grid-cols-3 gap-x-3 gap-y-1 text-xs">
        <label className="block">a (AU): {a.toFixed(2)}
          <input type="range" min={0.3} max={20} step={0.05} value={a} onChange={(e) => setAOverride(parseFloat(e.target.value))} className="w-full mt-0.5" aria-label="Semi-major axis" />
        </label>
        <label className="block">e: {e.toFixed(3)}
          <input type="range" min={0} max={0.97} step={0.01} value={e} onChange={(ev) => setEOverride(parseFloat(ev.target.value))} className="w-full mt-0.5" aria-label="Eccentricity" />
        </label>
        <label className="block">M (mean): {(M * 180 / Math.PI).toFixed(0)}°
          <input type="range" min={0} max={2 * Math.PI} step={0.05} value={meanAnomaly} onChange={(ev) => setMeanAnomaly(parseFloat(ev.target.value))} className="w-full mt-0.5" aria-label="Mean anomaly" />
        </label>
      </div>
      <div className="mt-2 text-[10px] text-muted-foreground">
        Kepler's three laws (1609 + 1619): (1) orbits are ellipses
        with the Sun at one focus; (2) the radius vector sweeps equal
        areas in equal times — bodies move fastest at perihelion,
        slowest at aphelion; (3) T² ∝ a³ where T is orbital period
        in years and a is semi-major axis in AU (the constant of
        proportionality is 1 for solar orbits). Newton showed in
        Principia 1687 that these emerge from F = -GMm/r² inverse-
        square gravity. Solving Kepler's equation M = E - e sin E
        for eccentric anomaly E requires Newton iteration (Kepler's
        problem). Halley's comet: 76-year period, perihelion 0.59
        AU inside Mercury's orbit, aphelion 35 AU beyond Neptune.
      </div>
    </div>
  );
}
