import { useMemo, useState } from "react";

// Interactive atmospheric sounding (simplified Skew-T-like): vertical
// temperature profile with a draggable air parcel that follows dry
// adiabat (10 K/km) below the LCL and moist adiabat (~6 K/km) above.
// LCL (lifting condensation level), CAPE (convective available
// potential energy) regions shaded. Foundational meteorology tool
// for storm energetics + stability analysis.
//
// Approximations:
//   Environmental lapse rate: piecewise 6.5 K/km up to tropopause
//     (~11 km), isothermal above to ~20 km, +1 K/km in stratosphere.
//   Dry adiabatic lapse rate: 9.8 K/km.
//   Moist adiabatic lapse rate: ~6 K/km (constant approximation;
//     real value 4-9 K/km depending on T + p).
//   LCL height (km): H_LCL ≈ (T_surf − Td_surf) / 8.

const W = 420;
const H = 320;
const PAD_L = 50;
const PAD_R = 30;
const PAD_T = 16;
const PAD_B = 40;

const Z_MIN = 0; // km
const Z_MAX = 20;
const T_MIN = -80; // °C
const T_MAX = 40;

const DRY_LAPSE = 9.8; // K/km
const MOIST_LAPSE = 6.0; // K/km

interface Props {
  surfaceT?: number; // °C
  surfaceTd?: number; // °C (dew point)
}

function envT(z: number, surfaceT: number): number {
  // Piecewise standard atmosphere (modified by surfaceT shift).
  // Troposphere: -6.5 K/km up to 11 km.
  // Tropopause: isothermal 11-20 km.
  const shift = surfaceT - 15; // reference surface T 15°C
  if (z <= 11) return 15 + shift - 6.5 * z;
  // tropopause at 11 km, -56.5 °C
  return -56.5 + shift;
}

export function AtmosphericSounding({ surfaceT: ctlT, surfaceTd: ctlTd }: Props = {}) {
  const [intT, setIntT] = useState(25);
  const [intTd, setIntTd] = useState(20);
  const [parcelZ, setParcelZ] = useState(0);

  const surfaceT = ctlT ?? intT;
  const surfaceTd = ctlTd ?? intTd;

  const lcl = useMemo(() => {
    // Approximation: H_LCL (km) = (T - Td) / 8
    return Math.max(0, (surfaceT - surfaceTd) / 8);
  }, [surfaceT, surfaceTd]);

  const parcelT = useMemo(() => {
    if (parcelZ <= lcl) {
      return surfaceT - DRY_LAPSE * parcelZ;
    }
    const tAtLCL = surfaceT - DRY_LAPSE * lcl;
    return tAtLCL - MOIST_LAPSE * (parcelZ - lcl);
  }, [parcelZ, lcl, surfaceT]);

  const envProfile = useMemo(() => {
    const arr: { z: number; T: number }[] = [];
    for (let z = Z_MIN; z <= Z_MAX; z += 0.2) {
      arr.push({ z, T: envT(z, surfaceT) });
    }
    return arr;
  }, [surfaceT]);

  const parcelProfile = useMemo(() => {
    const arr: { z: number; T: number }[] = [];
    for (let z = 0; z <= Z_MAX; z += 0.2) {
      let T: number;
      if (z <= lcl) T = surfaceT - DRY_LAPSE * z;
      else {
        const tAtLCL = surfaceT - DRY_LAPSE * lcl;
        T = tAtLCL - MOIST_LAPSE * (z - lcl);
      }
      arr.push({ z, T });
    }
    return arr;
  }, [lcl, surfaceT]);

  // Find LFC (level of free convection): first z above LCL where parcel T > env T
  // EL (equilibrium level): first z above LFC where parcel T < env T again
  const { lfc, el, cape } = useMemo(() => {
    let lfcVal: number | null = null;
    let elVal: number | null = null;
    let capeVal = 0;
    let inCAPE = false;
    for (let i = 1; i < parcelProfile.length; i++) {
      const z = parcelProfile[i].z;
      const Tp = parcelProfile[i].T;
      const Te = envProfile[i].T;
      if (z < lcl) continue;
      if (lfcVal === null && Tp > Te) {
        lfcVal = z;
        inCAPE = true;
      }
      if (inCAPE && Tp < Te && z > (lfcVal ?? 0)) {
        elVal = z;
        inCAPE = false;
      }
      if (inCAPE) {
        // CAPE accumulation (integrate g × (Tp - Te) / Te dz)
        const Tref = (Te + 273.15);
        const dz = (parcelProfile[i].z - parcelProfile[i - 1].z) * 1000; // meters
        capeVal += 9.81 * ((Tp - Te) / Tref) * dz;
      }
    }
    return { lfc: lfcVal, el: elVal, cape: capeVal };
  }, [parcelProfile, envProfile, lcl]);

  const xFor = (T: number) => PAD_L + ((T - T_MIN) / (T_MAX - T_MIN)) * (W - PAD_L - PAD_R);
  const yFor = (z: number) => PAD_T + (1 - (z - Z_MIN) / (Z_MAX - Z_MIN)) * (H - PAD_T - PAD_B);

  const envPath = useMemo(() => {
    let d = "";
    envProfile.forEach((p, i) => {
      const x = xFor(p.T);
      const y = yFor(p.z);
      d += i === 0 ? `M ${x.toFixed(1)} ${y.toFixed(1)}` : ` L ${x.toFixed(1)} ${y.toFixed(1)}`;
    });
    return d;
  }, [envProfile]);

  const parcelPath = useMemo(() => {
    let d = "";
    parcelProfile.forEach((p, i) => {
      const x = xFor(p.T);
      const y = yFor(p.z);
      d += i === 0 ? `M ${x.toFixed(1)} ${y.toFixed(1)}` : ` L ${x.toFixed(1)} ${y.toFixed(1)}`;
    });
    return d;
  }, [parcelProfile]);

  // Build CAPE shaded region (between LFC and EL where parcel warmer than env)
  const capeRegion = useMemo(() => {
    if (lfc === null || el === null) return "";
    let d = "";
    let started = false;
    for (let i = 0; i < parcelProfile.length; i++) {
      const z = parcelProfile[i].z;
      if (z < lfc || z > el) continue;
      const x = xFor(parcelProfile[i].T);
      const y = yFor(z);
      d += started ? ` L ${x.toFixed(1)} ${y.toFixed(1)}` : `M ${x.toFixed(1)} ${y.toFixed(1)}`;
      started = true;
    }
    // close along env profile back down
    for (let i = parcelProfile.length - 1; i >= 0; i--) {
      const z = parcelProfile[i].z;
      if (z < lfc || z > el) continue;
      const x = xFor(envProfile[i].T);
      const y = yFor(z);
      d += ` L ${x.toFixed(1)} ${y.toFixed(1)}`;
    }
    d += " Z";
    return d;
  }, [parcelProfile, envProfile, lfc, el]);

  return (
    <div className="my-4 p-3 rounded-lg border border-border bg-card text-card-foreground">
      <div className="text-sm font-semibold mb-2">Atmospheric sounding + parcel ascent</div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto bg-[#0b1228] rounded-md" role="img" aria-label="Vertical temperature profile + parcel lift trajectory">
        {/* CAPE shaded region */}
        {capeRegion && <path d={capeRegion} fill="#ff7a7a" fillOpacity={0.18} stroke="none" />}

        {/* Environmental T profile */}
        <path d={envPath} fill="none" stroke="#7bcbff" strokeWidth={2} />
        <text x={W - PAD_R - 4} y={yFor(envProfile[envProfile.length - 1].T) - 3} fill="#7bcbff" fontSize="9" textAnchor="end">env</text>

        {/* Parcel ascent */}
        <path d={parcelPath} fill="none" stroke="#ff9b6a" strokeWidth={2} strokeDasharray="4,3" />
        <text x={xFor(parcelProfile[Math.min(parcelProfile.length - 1, 70)].T) - 2} y={yFor(parcelProfile[Math.min(parcelProfile.length - 1, 70)].z)} fill="#ff9b6a" fontSize="9">parcel</text>

        {/* LCL marker */}
        {lcl > 0 && (
          <g>
            <line x1={PAD_L} y1={yFor(lcl)} x2={W - PAD_R} y2={yFor(lcl)} stroke="#ffd166" strokeDasharray="2,3" />
            <text x={W - PAD_R - 4} y={yFor(lcl) + 12} fill="#ffd166" fontSize="9" textAnchor="end">LCL {lcl.toFixed(1)} km</text>
          </g>
        )}
        {/* LFC marker */}
        {lfc !== null && (
          <g>
            <line x1={PAD_L} y1={yFor(lfc)} x2={W - PAD_R} y2={yFor(lfc)} stroke="#ff7a7a" strokeDasharray="2,3" />
            <text x={W - PAD_R - 4} y={yFor(lfc) - 3} fill="#ff7a7a" fontSize="9" textAnchor="end">LFC {lfc.toFixed(1)} km</text>
          </g>
        )}
        {/* EL marker */}
        {el !== null && (
          <g>
            <line x1={PAD_L} y1={yFor(el)} x2={W - PAD_R} y2={yFor(el)} stroke="#aaffbf" strokeDasharray="2,3" />
            <text x={W - PAD_R - 4} y={yFor(el) - 3} fill="#aaffbf" fontSize="9" textAnchor="end">EL {el.toFixed(1)} km</text>
          </g>
        )}

        {/* Parcel marker at current Z */}
        <circle cx={xFor(parcelT)} cy={yFor(parcelZ)} r={5} fill="#ff9b6a" stroke="#fff" strokeWidth={1.5} />

        {/* Axes */}
        <line x1={PAD_L} y1={H - PAD_B} x2={W - PAD_R} y2={H - PAD_B} stroke="#444a66" />
        <line x1={PAD_L} y1={PAD_T} x2={PAD_L} y2={H - PAD_B} stroke="#444a66" />

        {/* Y ticks: altitude */}
        {[0, 4, 8, 11, 16, 20].map((z) => (
          <g key={z}>
            <line x1={PAD_L - 4} y1={yFor(z)} x2={PAD_L} y2={yFor(z)} stroke="#666" />
            <text x={PAD_L - 6} y={yFor(z) + 3} fill="#9aa3b8" fontSize="9" textAnchor="end">{z}</text>
          </g>
        ))}

        {/* X ticks: temperature */}
        {[-80, -60, -40, -20, 0, 20, 40].map((t) => (
          <g key={t}>
            <line x1={xFor(t)} y1={H - PAD_B} x2={xFor(t)} y2={H - PAD_B + 3} stroke="#666" />
            <text x={xFor(t)} y={H - PAD_B + 14} fill="#9aa3b8" fontSize="9" textAnchor="middle">{t}</text>
          </g>
        ))}

        <text x={W / 2} y={H - 4} fill="#cbd1e6" fontSize="10" textAnchor="middle">temperature (°C)</text>
        <text x={12} y={H / 2} fill="#cbd1e6" fontSize="10" transform={`rotate(-90 12 ${H / 2})`} textAnchor="middle">altitude (km)</text>
      </svg>

      <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
        <label className="block">
          Surface T: {surfaceT.toFixed(1)} °C
          <input type="range" min={-10} max={40} step={0.5} value={surfaceT} onChange={(e) => setIntT(parseFloat(e.target.value))} disabled={ctlT !== undefined} className="w-full mt-0.5" aria-label="Surface temperature" />
        </label>
        <label className="block">
          Dew point Td: {surfaceTd.toFixed(1)} °C
          <input type="range" min={-20} max={Math.min(surfaceT, 30)} step={0.5} value={Math.min(surfaceTd, surfaceT)} onChange={(e) => setIntTd(parseFloat(e.target.value))} disabled={ctlTd !== undefined} className="w-full mt-0.5" aria-label="Dew point" />
        </label>
        <label className="block col-span-2">
          Parcel altitude: {parcelZ.toFixed(1)} km
          <input type="range" min={0} max={Z_MAX} step={0.1} value={parcelZ} onChange={(e) => setParcelZ(parseFloat(e.target.value))} className="w-full mt-0.5" aria-label="Parcel altitude" />
        </label>
      </div>

      <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
        <div className="rounded bg-muted/40 p-2">
          <div className="text-muted-foreground">LCL</div>
          <div className="font-semibold">{lcl.toFixed(2)} km</div>
        </div>
        <div className="rounded bg-muted/40 p-2">
          <div className="text-muted-foreground">LFC</div>
          <div className="font-semibold">{lfc !== null ? `${lfc.toFixed(2)} km` : "—"}</div>
        </div>
        <div className="rounded bg-muted/40 p-2">
          <div className="text-muted-foreground">EL</div>
          <div className="font-semibold">{el !== null ? `${el.toFixed(2)} km` : "—"}</div>
        </div>
        <div className="rounded bg-muted/40 p-2">
          <div className="text-muted-foreground">CAPE</div>
          <div className="font-semibold">{cape.toFixed(0)} J/kg</div>
        </div>
      </div>
      <div className="mt-2 text-[10px] text-muted-foreground">
        Dry adiabat 9.8 K/km below LCL; moist adiabat 6 K/km above. Red shaded region between LFC + EL is CAPE (convective available potential energy). CAPE &gt; 1000 J/kg favors deep convection; &gt; 2500 J/kg favors severe storms. Real soundings (Skew-T-Log-P) show pressure-coordinate axes + actual moist adiabats from thermodynamics tables.
      </div>
    </div>
  );
}
