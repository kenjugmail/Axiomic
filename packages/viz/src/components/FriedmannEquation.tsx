import { useMemo, useState } from "react";

// Friedmann equation for a flat-ish FLRW universe:
//   (H/H0)² = Ω_r/a⁴ + Ω_m/a³ + Ω_k/a² + Ω_Λ
// Numerically integrate da/dt = a·H to find a(t). Plot scale factor
// a vs cosmic time t in Gyr (current age ≈ 13.8 Gyr for ΛCDM). Drag
// Ω_m, Ω_Λ, H0; see how the future evolves (Big Rip, heat death,
// or recollapse for closed universes).

const W = 460;
const H = 280;

interface Props {
  omegaM?: number;
  omegaL?: number;
  H0?: number;     // km/s/Mpc
}

export function FriedmannEquation({ omegaM: ctlM, omegaL: ctlL, H0: ctlH }: Props = {}) {
  const [intM, setIntM] = useState(0.3);
  const [intL, setIntL] = useState(0.7);
  const [intH, setIntH] = useState(70);
  const Om = ctlM ?? intM;
  const Ol = ctlL ?? intL;
  const H0kmsMpc = ctlH ?? intH;
  const Or = 9e-5;
  const Ok = 1 - Om - Ol - Or;

  // H0 in 1/Gyr: 1 km/s/Mpc ≈ 1.022e-3 / Gyr
  const H0_Gyr = H0kmsMpc * 1.022e-3;

  const data = useMemo(() => {
    // Numerically integrate a(t) backward + forward from a = 1 (today)
    const back: Array<{ t: number; a: number }> = [{ t: 0, a: 1 }];
    const forward: Array<{ t: number; a: number }> = [{ t: 0, a: 1 }];
    const dt = 0.05;  // Gyr
    // Backward: until a small
    let a = 1;
    let t = 0;
    while (a > 0.001 && t > -30) {
      const Esq = Or / (a * a * a * a) + Om / (a * a * a) + Ok / (a * a) + Ol;
      if (Esq <= 0) break;
      const aDot = a * H0_Gyr * Math.sqrt(Esq);
      a -= aDot * dt;
      t -= dt;
      if (a > 0.001) back.push({ t, a });
    }
    // Forward
    a = 1;
    t = 0;
    let nstep = 0;
    while (t < 60 && nstep < 2000) {
      nstep++;
      const Esq = Or / (a * a * a * a) + Om / (a * a * a) + Ok / (a * a) + Ol;
      if (Esq <= 0) {
        // Recollapse — switch sign
        if (forward[forward.length - 1].a > forward[forward.length - 2].a) {
          // continue but flip
          break;
        }
        break;
      }
      const aDot = a * H0_Gyr * Math.sqrt(Esq);
      a += aDot * dt;
      t += dt;
      forward.push({ t, a });
      if (a > 50) break;
    }
    return [...back.reverse(), ...forward.slice(1)];
  }, [Om, Ol, H0kmsMpc]);

  // Find age of universe (t at a=1 minus min t)
  const tNow = 0;
  const tStart = data[0]?.t ?? -14;
  const ageGyr = tNow - tStart;

  // Plot scale: t range from tStart to ~40 Gyr
  const baseX = 50;
  const baseY = 20;
  const plotW = W - 70;
  const plotH = H - 80;
  const tMin = Math.max(tStart, -16);
  const tMax = 40;
  const aMax = 8;
  const xOf = (t: number) => baseX + ((t - tMin) / (tMax - tMin)) * plotW;
  const yOf = (a: number) => baseY + ((aMax - Math.min(a, aMax)) / aMax) * plotH;

  const path = data.filter((d) => d.t >= tMin && d.t <= tMax).map((p, i) => `${i === 0 ? "M" : "L"}${xOf(p.t).toFixed(2)},${yOf(p.a).toFixed(2)}`).join(" ");

  let fate = "heat death (de Sitter expansion)";
  if (Math.abs(Ol) < 0.01 && Om < 1.0 && Ok > 0) fate = "open coasting";
  else if (Om > 1.2 && Ol < 0.5) fate = "closed → Big Crunch";
  else if (Ol > 1.5) fate = "potential Big Rip";

  return (
    <div className="my-4 p-3 rounded-lg border border-border bg-card text-card-foreground">
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-semibold">Friedmann · age = {ageGyr.toFixed(1)} Gyr · Ω_k = {Ok.toFixed(2)} · {fate}</div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto bg-[#0b1228] rounded-md" role="img" aria-label="Friedmann a(t)">
        <rect x={baseX} y={baseY} width={plotW} height={plotH} fill="none" stroke="#475569" strokeWidth={0.5} />
        {/* Grid */}
        {[1, 2, 4, 6, 8].map((a) => (
          <g key={`y-${a}`}>
            <line x1={baseX} y1={yOf(a)} x2={baseX + plotW} y2={yOf(a)} stroke="#1f2937" strokeWidth={0.3} />
            <text x={baseX - 4} y={yOf(a) + 3} fill="#9aa3b8" fontSize="8" textAnchor="end">{a}</text>
          </g>
        ))}
        {[-10, 0, 10, 20, 30].map((t) => (
          <g key={`x-${t}`}>
            <line x1={xOf(t)} y1={baseY} x2={xOf(t)} y2={baseY + plotH} stroke="#1f2937" strokeWidth={0.3} />
            <text x={xOf(t)} y={baseY + plotH + 10} fill="#9aa3b8" fontSize="8" textAnchor="middle">{t}</text>
          </g>
        ))}
        {/* a(t) curve */}
        <path d={path} fill="none" stroke="#4ecdc4" strokeWidth={2} />
        {/* Today marker */}
        <line x1={xOf(0)} y1={baseY} x2={xOf(0)} y2={baseY + plotH} stroke="#fbbf24" strokeWidth={1} strokeDasharray="3,3" />
        <text x={xOf(0)} y={baseY - 4} fill="#fbbf24" fontSize="8" textAnchor="middle">today (a=1)</text>
        {/* Big Bang marker */}
        {tStart > tMin && (
          <g>
            <circle cx={xOf(tStart)} cy={yOf(0)} r={4} fill="#ff6b6b" />
            <text x={xOf(tStart) + 6} y={yOf(0) + 3} fill="#ff6b6b" fontSize="8">Big Bang</text>
          </g>
        )}
        <text x={baseX + plotW / 2} y={baseY + plotH + 22} fill="#cbd1e6" fontSize="10" textAnchor="middle">cosmic time (Gyr from today)</text>
        <text x={14} y={baseY + plotH / 2} fill="#cbd1e6" fontSize="10" textAnchor="middle" transform={`rotate(-90, 14, ${baseY + plotH / 2})`}>scale factor a(t)</text>
      </svg>

      <div className="mt-2 grid grid-cols-3 gap-x-3 gap-y-2 text-xs">
        <label className="block">Ω_m: {Om.toFixed(2)}
          <input type="range" min={0} max={1.5} step={0.05} value={Om} onChange={(e) => setIntM(parseFloat(e.target.value))} disabled={ctlM !== undefined} className="w-full mt-0.5" aria-label="Omega matter" />
        </label>
        <label className="block">Ω_Λ: {Ol.toFixed(2)}
          <input type="range" min={0} max={1.5} step={0.05} value={Ol} onChange={(e) => setIntL(parseFloat(e.target.value))} disabled={ctlL !== undefined} className="w-full mt-0.5" aria-label="Omega Lambda" />
        </label>
        <label className="block">H₀: {H0kmsMpc.toFixed(1)} km/s/Mpc
          <input type="range" min={50} max={90} step={0.5} value={H0kmsMpc} onChange={(e) => setIntH(parseFloat(e.target.value))} disabled={ctlH !== undefined} className="w-full mt-0.5" aria-label="Hubble constant" />
        </label>
      </div>
      <div className="mt-2 grid grid-cols-3 gap-1 text-[10px]">
        <button className="px-2 py-1 rounded bg-muted hover:bg-accent" onClick={() => { setIntM(0.315); setIntL(0.685); setIntH(67.4); }}>Planck 2018</button>
        <button className="px-2 py-1 rounded bg-muted hover:bg-accent" onClick={() => { setIntM(0.3); setIntL(0.7); setIntH(73.04); }}>SH0ES Riess</button>
        <button className="px-2 py-1 rounded bg-muted hover:bg-accent" onClick={() => { setIntM(1.0); setIntL(0); setIntH(70); }}>Einstein-de Sitter</button>
      </div>
      <div className="mt-2 text-[10px] text-muted-foreground">
        FLRW + Friedmann equation H² = H₀² · [Ω_r/a⁴ + Ω_m/a³ + Ω_k/a² + Ω_Λ].
        ΛCDM concordance: Ω_m ≈ 0.31, Ω_Λ ≈ 0.69, Ω_k ≈ 0, age ≈ 13.8 Gyr,
        Big Bang at t ≈ -13.8 Gyr, accelerating expansion since z ≈ 0.6
        (Perlmutter-Schmidt-Riess SNe Ia 1998 Nobel 2011). H₀ tension —
        Planck CMB gives 67.4 vs SH0ES local distance ladder gives 73.04
        km/s/Mpc (currently ~5σ discrepancy, JWST recalibrations ongoing).
        Future: if dark energy is true cosmological constant, eternal de
        Sitter expansion + heat death; if phantom (w &lt; -1) → Big Rip.
      </div>
    </div>
  );
}
