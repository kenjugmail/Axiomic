import { useMemo, useState } from "react";

// Compare common map projections by rendering a stylized graticule
// (lat/lon grid + a few coastline-ish curves) under each one + an
// optional Tissot indicatrix that visualizes angular + area distortion.
//
// Projections shown — Mercator (conformal, area distortion poles),
// Robinson (compromise), Mollweide (equal-area), Winkel-Tripel
// (compromise — National Geographic default), Equal Earth (equal-area
// Šavrič 2018). A real cartographic stack would use d3-geo; we
// inline the projection formulas to keep this self-contained.

const W = 460;
const H = 320;

type ProjName = "mercator" | "robinson" | "mollweide" | "winkel-tripel" | "equal-earth";

interface Props {
  projection?: ProjName;
}

interface XY { x: number; y: number; }

// All projections receive (lat, lon) in degrees, return (x, y) in
// the unit-ish range [-π, π] × [-π/2, π/2]-ish. We then scale to the SVG.
function project(name: ProjName, lat: number, lon: number): XY | null {
  const φ = (lat * Math.PI) / 180;
  const λ = (lon * Math.PI) / 180;
  switch (name) {
    case "mercator": {
      if (Math.abs(lat) > 85) return null;
      return { x: λ, y: Math.log(Math.tan(Math.PI / 4 + φ / 2)) };
    }
    case "robinson": {
      // Robinson tables, interpolated by 5° latitude — approximate
      const lats = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90];
      const A = [1, 0.9986, 0.9954, 0.99, 0.9822, 0.973, 0.96, 0.9427, 0.9216, 0.8962, 0.8679, 0.8350, 0.7986, 0.7597, 0.7186, 0.6732, 0.6213, 0.5722, 0.5322];
      const B = [0, 0.062, 0.124, 0.186, 0.248, 0.31, 0.372, 0.434, 0.4958, 0.5571, 0.6176, 0.6769, 0.7346, 0.7903, 0.8435, 0.8936, 0.9394, 0.9761, 1.0];
      const absLat = Math.abs(lat);
      let i = 0;
      while (i < lats.length - 1 && lats[i + 1] < absLat) i++;
      const t = (absLat - lats[i]) / Math.max(0.001, lats[i + 1] - lats[i]);
      const a = A[i] * (1 - t) + A[i + 1] * t;
      const b = B[i] * (1 - t) + B[i + 1] * t;
      return { x: 0.8487 * a * λ, y: 1.3523 * b * Math.sign(lat) };
    }
    case "mollweide": {
      // Iterate to solve 2θ + sin(2θ) = π sin(φ)
      let θ = φ;
      for (let k = 0; k < 8; k++) {
        const denom = 2 + 2 * Math.cos(2 * θ);
        if (Math.abs(denom) < 1e-9) break;
        θ -= (2 * θ + Math.sin(2 * θ) - Math.PI * Math.sin(φ)) / denom;
      }
      return { x: (2 * Math.SQRT2 / Math.PI) * λ * Math.cos(θ), y: Math.SQRT2 * Math.sin(θ) };
    }
    case "winkel-tripel": {
      // Winkel III (Tripel) — average of equirectangular + Aitoff
      const φ1 = Math.acos(2 / Math.PI);
      const α = Math.acos(Math.cos(φ) * Math.cos(λ / 2));
      const sinc = α === 0 ? 1 : Math.sin(α) / α;
      const x1 = λ * Math.cos(φ1);
      const x2 = 2 * Math.cos(φ) * Math.sin(λ / 2) / sinc;
      const y1 = φ;
      const y2 = Math.sin(φ) / sinc;
      return { x: 0.5 * (x1 + x2), y: 0.5 * (y1 + y2) };
    }
    case "equal-earth": {
      // Šavrič et al. 2018 (closed form)
      const A1 = 1.340264, A2 = -0.081106, A3 = 0.000893, A4 = 0.003796;
      const M = Math.sqrt(3) / 2;
      const θ = Math.asin(M * Math.sin(φ));
      const θ2 = θ * θ;
      const θ6 = θ2 * θ2 * θ2;
      const denom = 3 * M * (A1 + 3 * A2 * θ2 + θ6 * (7 * A3 + 9 * A4 * θ2));
      const x = (λ * Math.cos(θ)) / denom;
      const y = θ * (A1 + A2 * θ2 + θ6 * (A3 + A4 * θ2));
      return { x, y };
    }
  }
}

const PROJS: ProjName[] = ["mercator", "robinson", "mollweide", "winkel-tripel", "equal-earth"];

// Build the projected polyline for a great-circle meridian or parallel
function makeGraticule(name: ProjName): string[] {
  const paths: string[] = [];
  // Meridians every 30°
  for (let lon = -180; lon <= 180; lon += 30) {
    const segs: XY[] = [];
    for (let lat = -85; lat <= 85; lat += 2) {
      const p = project(name, lat, lon);
      if (p) segs.push(p);
    }
    if (segs.length > 1) {
      paths.push(segs.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(3)},${p.y.toFixed(3)}`).join(" "));
    }
  }
  // Parallels every 30°
  for (let lat = -60; lat <= 60; lat += 30) {
    const segs: XY[] = [];
    for (let lon = -180; lon <= 180; lon += 2) {
      const p = project(name, lat, lon);
      if (p) segs.push(p);
    }
    if (segs.length > 1) {
      paths.push(segs.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(3)},${p.y.toFixed(3)}`).join(" "));
    }
  }
  return paths;
}

export function MapProjections({ projection: ctlP }: Props = {}) {
  const [intP, setIntP] = useState<ProjName>("mercator");
  const proj = ctlP ?? intP;
  const [showTissot, setShowTissot] = useState(true);

  const graticule = useMemo(() => makeGraticule(proj), [proj]);

  // Compute viewBox bounds from all graticule points
  const bounds = useMemo(() => {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const path of graticule) {
      const matches = path.matchAll(/-?\d+\.\d+/g);
      let i = 0;
      let x = 0;
      for (const m of matches) {
        const v = parseFloat(m[0]);
        if (i % 2 === 0) {
          x = v;
          if (v < minX) minX = v;
          if (v > maxX) maxX = v;
        } else {
          if (v < minY) minY = v;
          if (v > maxY) maxY = v;
        }
        i++;
      }
      void x;
    }
    return { minX, minY, maxX, maxY };
  }, [graticule]);

  const padX = (bounds.maxX - bounds.minX) * 0.04;
  const padY = (bounds.maxY - bounds.minY) * 0.04;
  const baseX = 20;
  const baseY = 24;
  const plotW = W - baseX - 20;
  const plotH = H - baseY - 80;
  const sx = plotW / (bounds.maxX - bounds.minX + 2 * padX);
  const sy = plotH / (bounds.maxY - bounds.minY + 2 * padY);
  const s = Math.min(sx, sy);
  const offsetX = baseX + plotW / 2;
  const offsetY = baseY + plotH / 2;
  const xOf = (x: number) => offsetX + x * s;
  const yOf = (y: number) => offsetY - y * s;

  // Tissot indicatrix circles at (lat, lon) grid points
  const tissotPoints = useMemo(() => {
    const grid: Array<{ x: number; y: number; lat: number; lon: number }> = [];
    for (let lat = -60; lat <= 60; lat += 30) {
      for (let lon = -150; lon <= 150; lon += 60) {
        const p = project(proj, lat, lon);
        if (p) grid.push({ x: p.x, y: p.y, lat, lon });
      }
    }
    return grid;
  }, [proj]);

  // Distortion proxy: at each tissot point compute the local scale by
  // sampling neighbors ±1° and measuring the projected length.
  function tissotRadius(lat: number, lon: number) {
    const p0 = project(proj, lat, lon);
    const pE = project(proj, lat, lon + 1);
    const pN = project(proj, lat + 1, lon);
    if (!p0 || !pE || !pN) return 0;
    const dE = Math.hypot(pE.x - p0.x, pE.y - p0.y);
    const dN = Math.hypot(pN.x - p0.x, pN.y - p0.y);
    // Area-proportional radius (geometric mean of meridional + zonal scales)
    return Math.sqrt(dE * dN) * 18; // visual fudge factor
  }

  return (
    <div className="my-4 p-3 rounded-lg border border-border bg-card text-card-foreground">
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-semibold">Projection · {proj}</div>
        <div className="flex gap-1">
          {PROJS.map((p) => (
            <button key={p} onClick={() => setIntP(p)} disabled={ctlP !== undefined} className={`px-1.5 py-0.5 rounded text-[9px] ${proj === p ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-accent"}`}>{p}</button>
          ))}
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto bg-[#0b1228] rounded-md" role="img" aria-label="Map projections">
        {/* Outline rect of the bounding map */}
        <rect x={baseX} y={baseY} width={plotW} height={plotH} fill="none" stroke="#1f2937" strokeWidth={0.5} />
        {/* Graticule lines */}
        <g transform={`translate(${offsetX}, ${offsetY}) scale(${s}, ${-s})`}>
          {graticule.map((d, i) => (
            <path key={i} d={d} fill="none" stroke="#475569" strokeWidth={0.018} />
          ))}
        </g>
        {/* Tissot indicatrices */}
        {showTissot && tissotPoints.map((tp, i) => {
          const r = tissotRadius(tp.lat, tp.lon);
          if (!isFinite(r) || r === 0) return null;
          return <circle key={i} cx={xOf(tp.x)} cy={yOf(tp.y)} r={r} fill="#fbbf24" fillOpacity={0.18} stroke="#fbbf24" strokeWidth={0.6} />;
        })}
        <text x={baseX + plotW / 2} y={H - 56} fill="#cbd1e6" fontSize="9" textAnchor="middle">graticule + Tissot indicatrices (yellow circles)</text>
      </svg>

      <div className="mt-2 text-xs">
        <label className="inline-flex items-center gap-2">
          <input type="checkbox" checked={showTissot} onChange={(e) => setShowTissot(e.target.checked)} />
          show Tissot indicatrix
        </label>
      </div>
      <div className="mt-2 text-[10px] text-muted-foreground">
        Every flat map of a curved Earth distorts something — angles,
        areas, distances, or directions. <b>Mercator</b> (1569) preserves
        angles (conformal) — straight rhumb lines for sailors — but
        inflates polar areas dramatically (Greenland looks larger than
        Africa). <b>Mollweide</b> (1805) is equal-area but distorts
        shapes near edges. <b>Robinson</b> (1963, Arthur H. Robinson)
        and <b>Winkel-Tripel</b> (1921) are compromise projections used
        by National Geographic. <b>Equal Earth</b> (Šavrič-Patterson-
        Jenny 2018) is a modern equal-area pseudocylindrical preserving
        shapes better than Mollweide. Tissot indicatrices (circles at
        regular grid points) visualize distortion: equal-area
        projections keep them circular but vary direction; conformal
        ones keep circles circular but vary size.
      </div>
    </div>
  );
}
