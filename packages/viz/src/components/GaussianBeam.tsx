import { useMemo, useState } from "react";

// Interactive Gaussian beam propagation. Drag waist size w₀ +
// wavelength λ; see beam envelope w(z) over distance, Rayleigh
// length z_R = π w₀² / λ, far-field divergence half-angle
// θ = λ / (π w₀). Optionally insert a thin lens at z_L with
// focal length f to refocus the beam.
//
// Math:
//   w(z) = w₀ √(1 + (z / z_R)²)
//   z_R  = π w₀² / λ
//   θ    = λ / (π w₀)    (radians, far-field half-angle)
//
// Lens transformation uses the complex beam parameter q-formalism:
//   q = z + i z_R   (centered at the waist)
//   1/q_after = 1/q_before − 1/f   (thin lens at lens position)

const W = 460;
const H = 240;
const PAD_L = 50;
const PAD_R = 14;
const PAD_T = 16;
const PAD_B = 34;

// All distances internally in mm for human-scale optics.
const Z_MAX_MM = 100;

interface Props {
  w0?: number; // µm
  lambda?: number; // nm
  hasLens?: boolean;
  lensZ?: number; // mm
  lensF?: number; // mm
}

function zR_mm(w0_um: number, lambda_nm: number): number {
  // z_R = π w₀² / λ. Units: w₀ µm × µm / nm = µm² / (1e-3 µm) = 1000 µm = mm.
  // Simpler: convert both to µm. w₀ in µm; λ in µm. z_R in µm.
  const lam_um = lambda_nm / 1000;
  return (Math.PI * w0_um * w0_um) / lam_um / 1000; // back to mm
}

function divergence_mrad(w0_um: number, lambda_nm: number): number {
  const lam_um = lambda_nm / 1000;
  return (lam_um / (Math.PI * w0_um)) * 1000; // in mrad
}

// Free-space beam radius (µm) at distance z (mm) from waist at z=0.
function w_at(z_mm: number, w0_um: number, zRayleigh_mm: number): number {
  return w0_um * Math.sqrt(1 + (z_mm / zRayleigh_mm) ** 2);
}

// After thin lens at z = z_L with focal length f (both mm), compute
// the new waist location + new waist size given the input beam
// parameters at the lens plane.
function afterLens(
  zL_mm: number,
  fL_mm: number,
  w0_um: number,
  zRayleigh_mm: number,
): { newWaistZ_mm: number; newW0_um: number; newZR_mm: number } {
  // Before lens: q_in = (z_L - 0) + i z_R (waist at z=0)
  const reIn = zL_mm;
  const imIn = zRayleigh_mm;
  // 1/q_in
  const denomIn = reIn * reIn + imIn * imIn;
  const invQReIn = reIn / denomIn;
  const invQImIn = -imIn / denomIn;
  // 1/q_out = 1/q_in - 1/f
  const invQReOut = invQReIn - 1 / fL_mm;
  const invQImOut = invQImIn;
  // q_out
  const denomOut = invQReOut * invQReOut + invQImOut * invQImOut;
  const qReOut = invQReOut / denomOut;
  const qImOut = -invQImOut / denomOut;
  // New waist position is at zL + qReOut (since q = z_relative_to_waist + i z_R)
  // qReOut is distance FROM new waist TO lens plane (negative if waist is downstream).
  const newWaistZ_mm = zL_mm - qReOut;
  // New Rayleigh length is qImOut
  const newZR_mm = Math.abs(qImOut);
  // New w₀ from z_R = π w₀² / λ → w₀ = √(z_R λ / π). We need λ. Use ratio:
  // newW0 / oldW0 = √(newZR / oldZR).
  const newW0_um = w0_um * Math.sqrt(newZR_mm / zRayleigh_mm);
  return { newWaistZ_mm, newW0_um, newZR_mm };
}

export function GaussianBeam({
  w0: ctlW0,
  lambda: ctlL,
  hasLens: ctlHasLens,
  lensZ: ctlLensZ,
  lensF: ctlLensF,
}: Props = {}) {
  const [intW0, setIntW0] = useState(50);
  const [intL, setIntL] = useState(1064);
  const [intHasLens, setIntHasLens] = useState(false);
  const [intLensZ, setIntLensZ] = useState(50);
  const [intLensF, setIntLensF] = useState(25);

  const w0 = ctlW0 ?? intW0; // µm
  const lambda = ctlL ?? intL; // nm
  const hasLens = ctlHasLens ?? intHasLens;
  const lensZ = ctlLensZ ?? intLensZ; // mm
  const lensF = ctlLensF ?? intLensF; // mm

  const zR = useMemo(() => zR_mm(w0, lambda), [w0, lambda]);
  const div = useMemo(() => divergence_mrad(w0, lambda), [w0, lambda]);

  const afterLensData = useMemo(() => {
    if (!hasLens) return null;
    return afterLens(lensZ, lensF, w0, zR);
  }, [hasLens, lensZ, lensF, w0, zR]);

  // Sample beam profile across the plot range
  const profile = useMemo(() => {
    const N = 200;
    const arr: { z: number; w: number }[] = [];
    for (let i = 0; i <= N; i++) {
      const z = (i / N) * Z_MAX_MM;
      let w: number;
      if (hasLens && afterLensData && z >= lensZ) {
        const zRel = z - afterLensData.newWaistZ_mm;
        w = w_at(zRel, afterLensData.newW0_um, afterLensData.newZR_mm);
      } else {
        w = w_at(z, w0, zR);
      }
      arr.push({ z, w });
    }
    return arr;
  }, [w0, zR, hasLens, lensZ, afterLensData]);

  // Compute Y-scale dynamically
  const wMax = useMemo(() => {
    let m = 0;
    for (const p of profile) m = Math.max(m, p.w);
    return Math.max(m * 1.05, 1);
  }, [profile]);

  const xFor = (z_mm: number) => PAD_L + (z_mm / Z_MAX_MM) * (W - PAD_L - PAD_R);
  const yFor = (w_um: number, sign: 1 | -1) =>
    PAD_T + (1 - (sign * w_um + wMax) / (2 * wMax)) * (H - PAD_T - PAD_B);

  const pathTop = useMemo(() => {
    let d = "";
    profile.forEach((p, i) => {
      const x = xFor(p.z);
      const y = yFor(p.w, 1);
      d += i === 0 ? `M ${x.toFixed(1)} ${y.toFixed(1)}` : ` L ${x.toFixed(1)} ${y.toFixed(1)}`;
    });
    return d;
  }, [profile, wMax]);
  const pathBot = useMemo(() => {
    let d = "";
    profile.forEach((p, i) => {
      const x = xFor(p.z);
      const y = yFor(p.w, -1);
      d += i === 0 ? `M ${x.toFixed(1)} ${y.toFixed(1)}` : ` L ${x.toFixed(1)} ${y.toFixed(1)}`;
    });
    return d;
  }, [profile, wMax]);
  const fillPath = `${pathTop} L ${xFor(Z_MAX_MM).toFixed(1)} ${yFor(0, 1).toFixed(1)} ${pathBot.replace(/M /, "L ")} Z`;

  return (
    <div className="my-4 p-3 rounded-lg border border-border bg-card text-card-foreground">
      <div className="text-sm font-semibold mb-2">Gaussian beam propagation</div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto bg-[#0b1228] rounded-md" role="img" aria-label="Gaussian beam envelope">
        {/* Filled beam envelope */}
        <path d={fillPath} fill="#7bcbff" fillOpacity={0.18} stroke="none" />
        {/* Top + bottom edges */}
        <path d={pathTop} fill="none" stroke="#7bcbff" strokeWidth={1.5} />
        <path d={pathBot} fill="none" stroke="#7bcbff" strokeWidth={1.5} />
        {/* Center axis */}
        <line x1={PAD_L} y1={yFor(0, 1)} x2={W - PAD_R} y2={yFor(0, 1)} stroke="#444a66" strokeDasharray="2,3" />

        {/* Initial waist marker */}
        <line x1={xFor(0)} y1={PAD_T} x2={xFor(0)} y2={H - PAD_B} stroke="#ffd166" strokeDasharray="3,3" opacity={0.6} />
        <text x={xFor(0) + 3} y={PAD_T + 10} fill="#ffd166" fontSize="9">w₀</text>

        {/* Rayleigh range marker */}
        <line x1={xFor(zR)} y1={PAD_T} x2={xFor(zR)} y2={H - PAD_B} stroke="#aaffbf" strokeDasharray="3,3" opacity={0.6} />
        <text x={xFor(zR) + 3} y={PAD_T + 10} fill="#aaffbf" fontSize="9">z_R</text>

        {/* Lens marker */}
        {hasLens && (
          <g>
            <line x1={xFor(lensZ)} y1={PAD_T + 4} x2={xFor(lensZ)} y2={H - PAD_B - 4} stroke="#ff9b6a" strokeWidth={2} />
            <text x={xFor(lensZ) + 3} y={PAD_T + 22} fill="#ff9b6a" fontSize="9">lens (f={lensF}mm)</text>
            {afterLensData && (
              <>
                <line x1={xFor(afterLensData.newWaistZ_mm)} y1={PAD_T} x2={xFor(afterLensData.newWaistZ_mm)} y2={H - PAD_B} stroke="#ff7a7a" strokeDasharray="3,3" opacity={0.5} />
                <text x={xFor(afterLensData.newWaistZ_mm) + 3} y={H - PAD_B - 4} fill="#ff7a7a" fontSize="9">new waist</text>
              </>
            )}
          </g>
        )}

        {/* Axes */}
        <line x1={PAD_L} y1={H - PAD_B} x2={W - PAD_R} y2={H - PAD_B} stroke="#444a66" />
        <line x1={PAD_L} y1={PAD_T} x2={PAD_L} y2={H - PAD_B} stroke="#444a66" />

        {[0, 25, 50, 75, 100].map((z) => (
          <g key={`x-${z}`}>
            <line x1={xFor(z)} y1={H - PAD_B} x2={xFor(z)} y2={H - PAD_B + 3} stroke="#666" />
            <text x={xFor(z)} y={H - PAD_B + 14} fill="#9aa3b8" fontSize="9" textAnchor="middle">{z}</text>
          </g>
        ))}
        <text x={W / 2} y={H - 4} fill="#cbd1e6" fontSize="10" textAnchor="middle">z (mm)</text>
        <text x={14} y={H / 2} fill="#cbd1e6" fontSize="10" transform={`rotate(-90 14 ${H / 2})`} textAnchor="middle">beam radius w (µm)</text>
      </svg>

      <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
        <label className="block">
          Waist w₀: {w0} µm
          <input type="range" min={10} max={500} step={5} value={w0} onChange={(e) => setIntW0(parseInt(e.target.value, 10))} disabled={ctlW0 !== undefined} className="w-full mt-0.5" aria-label="Beam waist" />
        </label>
        <label className="block">
          λ: {lambda} nm
          <input type="range" min={400} max={1550} step={5} value={lambda} onChange={(e) => setIntL(parseInt(e.target.value, 10))} disabled={ctlL !== undefined} className="w-full mt-0.5" aria-label="Wavelength" />
        </label>
        <label className="flex items-center gap-2 mt-2">
          <input type="checkbox" checked={hasLens} onChange={(e) => setIntHasLens(e.target.checked)} disabled={ctlHasLens !== undefined} />
          Add thin lens
        </label>
        {hasLens && (
          <>
            <label className="block">
              Lens z: {lensZ} mm
              <input type="range" min={5} max={Z_MAX_MM - 5} step={1} value={lensZ} onChange={(e) => setIntLensZ(parseInt(e.target.value, 10))} disabled={ctlLensZ !== undefined} className="w-full mt-0.5" aria-label="Lens position" />
            </label>
            <label className="block">
              Lens f: {lensF} mm
              <input type="range" min={5} max={200} step={1} value={lensF} onChange={(e) => setIntLensF(parseInt(e.target.value, 10))} disabled={ctlLensF !== undefined} className="w-full mt-0.5" aria-label="Lens focal length" />
            </label>
          </>
        )}
      </div>

      <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
        <div className="rounded bg-muted/40 p-2">
          <div className="text-muted-foreground">Rayleigh z_R</div>
          <div className="font-semibold">{zR.toFixed(2)} mm</div>
        </div>
        <div className="rounded bg-muted/40 p-2">
          <div className="text-muted-foreground">Divergence θ</div>
          <div className="font-semibold">{div.toFixed(2)} mrad</div>
        </div>
        <div className="rounded bg-muted/40 p-2">
          <div className="text-muted-foreground">w(100mm)</div>
          <div className="font-semibold">
            {profile[profile.length - 1].w.toFixed(0)} µm
          </div>
        </div>
      </div>
      <div className="mt-2 text-[10px] text-muted-foreground">
        Hyperbolic envelope: tight waist w₀ → small Rayleigh range z_R = π w₀²/λ → fast divergence θ = λ/(π w₀). Reverse trade-off: large w₀ → long Rayleigh + slow divergence (collimated). Adding a lens transforms the q-parameter (1/q' = 1/q − 1/f); the beam recollimates around a new waist downstream of the lens.
      </div>
    </div>
  );
}
