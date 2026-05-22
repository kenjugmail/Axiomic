import { useMemo, useState } from "react";

// 2D Brillouin zone construction. The first Brillouin zone is the
// Wigner-Seitz cell of the reciprocal lattice — the locus of points
// closer to the origin than to any other reciprocal-lattice point.
// For 2D square and hexagonal lattices we show the reciprocal-lattice
// grid + perpendicular bisectors + first-zone boundary.

const W = 460;
const H = 320;

type LatticeType = "square" | "hexagonal" | "rectangular";

interface Props {
  lattice?: LatticeType;
}

function reciprocalPoints(type: LatticeType, range: number) {
  const pts: Array<{ x: number; y: number }> = [];
  if (type === "square") {
    for (let i = -range; i <= range; i++) {
      for (let j = -range; j <= range; j++) {
        pts.push({ x: i, y: j });
      }
    }
  } else if (type === "rectangular") {
    for (let i = -range; i <= range; i++) {
      for (let j = -range; j <= range; j++) {
        pts.push({ x: i * 1.4, y: j });
      }
    }
  } else if (type === "hexagonal") {
    // Triangular reciprocal lattice (hexagonal direct → triangular reciprocal and vice versa)
    const a1 = { x: 1, y: 0 };
    const a2 = { x: 0.5, y: Math.sqrt(3) / 2 };
    for (let i = -range; i <= range; i++) {
      for (let j = -range; j <= range; j++) {
        pts.push({ x: i * a1.x + j * a2.x, y: i * a1.y + j * a2.y });
      }
    }
  }
  return pts;
}

// Compute Wigner-Seitz cell by sorting neighbor-bisector half-planes
function wignerSeitz(neighbors: Array<{ x: number; y: number }>): Array<{ x: number; y: number }> {
  // Each non-origin lattice point gives a half-plane: dot(p, n) ≤ |n|²/2
  const halfPlanes = neighbors
    .filter((n) => n.x !== 0 || n.y !== 0)
    .map((n) => ({ n, c: (n.x * n.x + n.y * n.y) / 2 }));
  // Intersect half-planes by walking around the origin in angle; for
  // each direction θ, the minimum allowed radius is min(c / dot(n_hat, θ_hat))
  // for positive dot. Sample 360 angles + form polygon.
  const angles = 360;
  const verts: Array<{ x: number; y: number }> = [];
  for (let i = 0; i < angles; i++) {
    const theta = (i / angles) * Math.PI * 2;
    const dirX = Math.cos(theta);
    const dirY = Math.sin(theta);
    let minR = Infinity;
    for (const hp of halfPlanes) {
      const dot = hp.n.x * dirX + hp.n.y * dirY;
      if (dot > 1e-6) {
        const r = hp.c / dot;
        if (r < minR) minR = r;
      }
    }
    if (Number.isFinite(minR)) verts.push({ x: dirX * minR, y: dirY * minR });
  }
  return verts;
}

const INFO: Record<LatticeType, { name: string; aspect: string }> = {
  square: { name: "Square (Cu(100), cubic surfaces)", aspect: "Brillouin zone is also square" },
  rectangular: { name: "Rectangular (anisotropic)", aspect: "Stretched rectangular zone" },
  hexagonal: { name: "Hexagonal (graphene, h-BN)", aspect: "Hexagonal Brillouin zone with K + M + Γ points" },
};

export function BrillouinZone({ lattice: ctlLat }: Props = {}) {
  const [intLat, setIntLat] = useState<LatticeType>("hexagonal");
  const type = ctlLat ?? intLat;

  const reciprocal = useMemo(() => reciprocalPoints(type, 2), [type]);
  const verts = useMemo(() => wignerSeitz(reciprocal), [reciprocal]);

  const cx = W / 2;
  const cy = H / 2 - 10;
  const scale = 80;

  return (
    <div className="my-4 p-3 rounded-lg border border-border bg-card text-card-foreground">
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-semibold">Brillouin zone · {INFO[type].name}</div>
        <div className="flex gap-1">
          {(["square", "rectangular", "hexagonal"] as LatticeType[]).map((t) => (
            <button key={t} onClick={() => setIntLat(t)} disabled={ctlLat !== undefined} className={`px-2 py-0.5 rounded text-[10px] ${type === t ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-accent"}`}>{t}</button>
          ))}
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto bg-[#0b1228] rounded-md" role="img" aria-label="Brillouin zone">
        {/* Reciprocal lattice points */}
        {reciprocal.map((p, i) => {
          const px = cx + p.x * scale;
          const py = cy - p.y * scale;
          if (px < 0 || px > W || py < 0 || py > H) return null;
          return <circle key={i} cx={px} cy={py} r={p.x === 0 && p.y === 0 ? 4 : 2.5} fill={p.x === 0 && p.y === 0 ? "#fbbf24" : "#4ecdc4"} />;
        })}
        {/* Perpendicular bisectors to nearest neighbors */}
        {reciprocal.filter((p) => p.x !== 0 || p.y !== 0).slice(0, 12).map((p, i) => {
          // Bisector passes through p/2 perpendicular to p
          const mx = cx + (p.x / 2) * scale;
          const my = cy - (p.y / 2) * scale;
          const len = Math.sqrt(p.x * p.x + p.y * p.y);
          const px = -p.y / len;
          const py = -p.x / len;
          const L = 60;
          return <line key={i} x1={mx - px * L} y1={my - py * L} x2={mx + px * L} y2={my + py * L} stroke="#475569" strokeWidth={0.4} strokeDasharray="2,2" />;
        })}
        {/* First Brillouin zone polygon */}
        <polygon
          points={verts.map((v) => `${(cx + v.x * scale).toFixed(2)},${(cy - v.y * scale).toFixed(2)}`).join(" ")}
          fill="#fbbf24"
          fillOpacity={0.12}
          stroke="#fbbf24"
          strokeWidth={1.8}
        />
        {/* High-symmetry point Γ */}
        <text x={cx + 8} y={cy + 14} fill="#fbbf24" fontSize="10">Γ</text>
        <text x={20} y={H - 50} fill="#cbd1e6" fontSize="10">{INFO[type].aspect}</text>
      </svg>

      <div className="mt-2 text-[10px] text-muted-foreground">
        The first Brillouin zone is the Wigner-Seitz cell of the
        reciprocal lattice — the locus of k-vectors closer to the
        origin (Γ point) than to any other reciprocal-lattice vector
        G. Translation by G is a symmetry of crystal Hamiltonians
        (Bloch's theorem), so every electronic + phonon state can be
        labeled by k ∈ first BZ. For a square direct lattice the BZ
        is also square; for hexagonal it's hexagonal with high-symmetry
        points Γ (center), K (corner), M (edge midpoint) — the K
        points are where graphene's Dirac cones live (Wallace 1947,
        Novoselov-Geim 2004 Nobel 2010). The reciprocal lattice was
        introduced by Ewald (1921) for X-ray diffraction.
      </div>
    </div>
  );
}
