import { useMemo, useState } from "react";

// Interactive Mohr's Circle of stress: a graphical method that maps
// stress states to a circle in (σ, τ) space. Drag σ_x, σ_y, τ_xy
// and a rotation angle θ. The circle rescales; a moving point shows
// the stress state on a plane rotated by θ; principal stresses
// (where τ = 0) + maximum shear stress (top + bottom of circle)
// are labeled. Universal in structural geology, mechanical
// engineering, soil mechanics, materials science.
//
// Math:
//   Center C = (σ_x + σ_y)/2
//   Radius R = √(((σ_x - σ_y)/2)² + τ_xy²)
//   σ_1 = C + R, σ_2 = C - R (principal stresses)
//   σ_θ = C + R cos(2(θ - θ_p))
//   τ_θ = R sin(2(θ - θ_p))
//   θ_p = ½ atan2(2τ_xy, σ_x - σ_y) (principal angle)

const W = 380;
const H = 240;
const PAD_L = 40;
const PAD_R = 12;
const PAD_T = 16;
const PAD_B = 32;

interface Props {
  sigmaX?: number;
  sigmaY?: number;
  tauXY?: number;
  theta?: number; // degrees
}

export function MohrsCircle({
  sigmaX: ctlSx,
  sigmaY: ctlSy,
  tauXY: ctlTxy,
  theta: ctlTheta,
}: Props = {}) {
  const [intSx, setIntSx] = useState(80);
  const [intSy, setIntSy] = useState(20);
  const [intTxy, setIntTxy] = useState(30);
  const [intTheta, setIntTheta] = useState(0);

  const sigmaX = ctlSx ?? intSx;
  const sigmaY = ctlSy ?? intSy;
  const tauXY = ctlTxy ?? intTxy;
  const theta = ctlTheta ?? intTheta;

  const { center, radius, sigma1, sigma2, tauMax, principalAngle, sigmaTheta, tauTheta } = useMemo(() => {
    const c = (sigmaX + sigmaY) / 2;
    const r = Math.sqrt(Math.pow((sigmaX - sigmaY) / 2, 2) + Math.pow(tauXY, 2));
    const principalRad = 0.5 * Math.atan2(2 * tauXY, sigmaX - sigmaY);
    const thetaRad = (theta * Math.PI) / 180;
    const sTheta = c + r * Math.cos(2 * (thetaRad - principalRad));
    const tTheta = r * Math.sin(2 * (thetaRad - principalRad));
    return {
      center: c,
      radius: r,
      sigma1: c + r,
      sigma2: c - r,
      tauMax: r,
      principalAngle: (principalRad * 180) / Math.PI,
      sigmaTheta: sTheta,
      tauTheta: tTheta,
    };
  }, [sigmaX, sigmaY, tauXY, theta]);

  // Compute axis range; show comfortable space around the circle
  const absMax = Math.max(Math.abs(sigma1), Math.abs(sigma2), Math.abs(tauMax), 10);
  const span = absMax * 1.4;
  const xMin = center - span;
  const xMax = center + span;
  const yMin = -span;
  const yMax = span;

  const sx = (s: number) => PAD_L + ((s - xMin) / (xMax - xMin)) * (W - PAD_L - PAD_R);
  const sy = (t: number) => H - PAD_B - ((t - yMin) / (yMax - yMin)) * (H - PAD_T - PAD_B);

  // Build circle path (SVG approximation via many segments)
  const segments = 60;
  const circlePath = Array.from({ length: segments + 1 }, (_, i) => {
    const ang = (2 * Math.PI * i) / segments;
    const cx = center + radius * Math.cos(ang);
    const cy = radius * Math.sin(ang);
    return `${i === 0 ? "M" : "L"}${sx(cx).toFixed(1)},${sy(cy).toFixed(1)}`;
  }).join(" ");

  return (
    <div className="my-6 rounded-lg border border-border bg-card overflow-hidden">
      <div className="px-4 py-2 border-b border-border bg-muted/50">
        <h4 className="text-sm font-medium font-sans">Mohr's circle of stress</h4>
        <p className="text-xs text-muted-foreground mt-0.5">
          Drag σ_x, σ_y, τ_xy + a rotation angle. Watch principal stresses + the rotated stress state move on the circle.
        </p>
      </div>
      <div className="p-4 space-y-3">
        <div className="rounded-md border border-border bg-background p-2">
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" preserveAspectRatio="xMidYMid meet">
            {/* axes */}
            <line x1={PAD_L} y1={sy(0)} x2={W - PAD_R} y2={sy(0)} stroke="currentColor" strokeWidth="0.6" className="text-muted-foreground/60" />
            <line x1={sx(0)} y1={PAD_T} x2={sx(0)} y2={H - PAD_B} stroke="currentColor" strokeWidth="0.3" strokeDasharray="2 2" className="text-muted-foreground/40" />
            <text x={W - PAD_R - 4} y={sy(0) - 4} fontSize="9" textAnchor="end" className="fill-muted-foreground">σ (normal)</text>
            <text x={PAD_L + 4} y={PAD_T + 8} fontSize="9" className="fill-muted-foreground">τ (shear)</text>

            {/* circle */}
            <path d={circlePath} fill="none" stroke="currentColor" strokeWidth="1.5" className="text-primary" />

            {/* center marker */}
            <circle cx={sx(center)} cy={sy(0)} r="2" fill="currentColor" className="text-muted-foreground" />
            <text x={sx(center)} y={sy(0) + 12} fontSize="8" textAnchor="middle" className="fill-muted-foreground">C={center.toFixed(0)}</text>

            {/* principal stresses (intersections with σ axis) */}
            <circle cx={sx(sigma1)} cy={sy(0)} r="3" fill="currentColor" className="text-emerald-500" />
            <text x={sx(sigma1)} y={sy(0) - 6} fontSize="9" textAnchor="middle" className="fill-emerald-500 font-medium">σ₁={sigma1.toFixed(1)}</text>
            <circle cx={sx(sigma2)} cy={sy(0)} r="3" fill="currentColor" className="text-emerald-500" />
            <text x={sx(sigma2)} y={sy(0) - 6} fontSize="9" textAnchor="middle" className="fill-emerald-500 font-medium">σ₂={sigma2.toFixed(1)}</text>

            {/* maximum shear (top + bottom) */}
            <circle cx={sx(center)} cy={sy(tauMax)} r="2.5" fill="currentColor" className="text-rose-500/70" />
            <text x={sx(center) + 4} y={sy(tauMax) + 3} fontSize="9" className="fill-rose-500">τ_max={tauMax.toFixed(1)}</text>

            {/* original stress state: (σ_x, τ_xy) and (σ_y, -τ_xy) — a diameter */}
            <line x1={sx(sigmaX)} y1={sy(tauXY)} x2={sx(sigmaY)} y2={sy(-tauXY)} stroke="currentColor" strokeWidth="0.4" strokeDasharray="3 2" className="text-sky-500/70" />
            <circle cx={sx(sigmaX)} cy={sy(tauXY)} r="3" fill="currentColor" className="text-sky-500" />
            <text x={sx(sigmaX) + 4} y={sy(tauXY) - 4} fontSize="8" className="fill-sky-500">x-face</text>
            <circle cx={sx(sigmaY)} cy={sy(-tauXY)} r="3" fill="currentColor" className="text-sky-500/70" />

            {/* rotated stress state */}
            <line
              x1={sx(center)}
              y1={sy(0)}
              x2={sx(sigmaTheta)}
              y2={sy(tauTheta)}
              stroke="currentColor"
              strokeWidth="1.4"
              className="text-amber-500"
            />
            <circle cx={sx(sigmaTheta)} cy={sy(tauTheta)} r="4" fill="currentColor" className="text-amber-500" />
            <text x={sx(sigmaTheta) + 5} y={sy(tauTheta) - 5} fontSize="9" className="fill-amber-500 font-medium">
              θ={theta.toFixed(0)}°
            </text>
          </svg>
        </div>

        <div className="grid grid-cols-2 gap-3 text-xs">
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">σ_x</span>
              <span className="tabular-nums font-medium">{sigmaX.toFixed(0)} MPa</span>
            </div>
            <input type="range" min={-50} max={150} step={2} value={sigmaX} onChange={(e) => (ctlSx === undefined) && setIntSx(parseFloat(e.target.value))} disabled={ctlSx !== undefined} className="w-full accent-sky-500" />
          </div>
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">σ_y</span>
              <span className="tabular-nums font-medium">{sigmaY.toFixed(0)} MPa</span>
            </div>
            <input type="range" min={-50} max={150} step={2} value={sigmaY} onChange={(e) => (ctlSy === undefined) && setIntSy(parseFloat(e.target.value))} disabled={ctlSy !== undefined} className="w-full accent-sky-500" />
          </div>
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">τ_xy</span>
              <span className="tabular-nums font-medium">{tauXY.toFixed(0)} MPa</span>
            </div>
            <input type="range" min={-50} max={50} step={2} value={tauXY} onChange={(e) => (ctlTxy === undefined) && setIntTxy(parseFloat(e.target.value))} disabled={ctlTxy !== undefined} className="w-full accent-rose-500" />
          </div>
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Rotation θ</span>
              <span className="tabular-nums font-medium">{theta.toFixed(0)}°</span>
            </div>
            <input type="range" min={0} max={180} step={1} value={theta} onChange={(e) => (ctlTheta === undefined) && setIntTheta(parseFloat(e.target.value))} disabled={ctlTheta !== undefined} className="w-full accent-amber-500" />
          </div>
        </div>

        <div className="grid grid-cols-4 gap-2 text-[11px] pt-1 border-t border-border">
          <div>
            <div className="text-muted-foreground">σ₁ (max)</div>
            <div className="tabular-nums font-medium">{sigma1.toFixed(1)}</div>
          </div>
          <div>
            <div className="text-muted-foreground">σ₂ (min)</div>
            <div className="tabular-nums font-medium">{sigma2.toFixed(1)}</div>
          </div>
          <div>
            <div className="text-muted-foreground">τ_max</div>
            <div className="tabular-nums font-medium">{tauMax.toFixed(1)}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Principal angle</div>
            <div className="tabular-nums font-medium">{principalAngle.toFixed(1)}°</div>
          </div>
        </div>
      </div>
    </div>
  );
}
