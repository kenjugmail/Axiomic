import { useMemo, useState } from "react";

// Simple visualization of cubic crystal lattices in 2D projection.
// Toggle: simple cubic (SC), body-centered (BCC), face-centered (FCC).
// Rotate around the y-axis; lattice parameter slider. Coordination
// numbers + atomic packing factors shown live: SC 6/0.52, BCC 8/0.68,
// FCC 12/0.74 (Kepler conjecture proved by Hales 1998).

const W = 460;
const H = 320;

type LatticeType = "sc" | "bcc" | "fcc";

interface Props {
  type?: LatticeType;
  rotation?: number;
}

interface Atom {
  x: number;
  y: number;
  z: number;
  kind: "corner" | "center" | "face";
}

function generateAtoms(type: LatticeType, nx: number = 2): Atom[] {
  const atoms: Atom[] = [];
  for (let i = 0; i <= nx; i++) {
    for (let j = 0; j <= nx; j++) {
      for (let k = 0; k <= nx; k++) {
        atoms.push({ x: i, y: j, z: k, kind: "corner" });
      }
    }
  }
  if (type === "bcc") {
    for (let i = 0; i < nx; i++) {
      for (let j = 0; j < nx; j++) {
        for (let k = 0; k < nx; k++) {
          atoms.push({ x: i + 0.5, y: j + 0.5, z: k + 0.5, kind: "center" });
        }
      }
    }
  }
  if (type === "fcc") {
    // Face centers on each cell face
    for (let i = 0; i < nx; i++) {
      for (let j = 0; j < nx; j++) {
        for (let k = 0; k < nx; k++) {
          atoms.push({ x: i + 0.5, y: j + 0.5, z: k, kind: "face" });
          atoms.push({ x: i + 0.5, y: j + 0.5, z: k + 1, kind: "face" });
          atoms.push({ x: i + 0.5, y: j, z: k + 0.5, kind: "face" });
          atoms.push({ x: i + 0.5, y: j + 1, z: k + 0.5, kind: "face" });
          atoms.push({ x: i, y: j + 0.5, z: k + 0.5, kind: "face" });
          atoms.push({ x: i + 1, y: j + 0.5, z: k + 0.5, kind: "face" });
        }
      }
    }
  }
  return atoms;
}

const STATS: Record<LatticeType, { name: string; coord: number; apf: number; basis: number; example: string }> = {
  sc: { name: "Simple Cubic", coord: 6, apf: 0.524, basis: 1, example: "α-Po (polonium)" },
  bcc: { name: "Body-Centered Cubic", coord: 8, apf: 0.680, basis: 2, example: "α-Fe, W, Cr, Mo, Na, K" },
  fcc: { name: "Face-Centered Cubic", coord: 12, apf: 0.740, basis: 4, example: "Cu, Al, Ag, Au, γ-Fe, Ni" },
};

export function CrystalLattice({ type: ctlType, rotation: ctlRot }: Props = {}) {
  const [intType, setIntType] = useState<LatticeType>("fcc");
  const [intRot, setIntRot] = useState(25);
  const type = ctlType ?? intType;
  const rot = (ctlRot ?? intRot) * Math.PI / 180;
  const tilt = -15 * Math.PI / 180;

  const atoms = useMemo(() => generateAtoms(type, 1), [type]);

  // Simple isometric-ish projection: rotate around y, then tilt around x
  const project = (a: Atom) => {
    const x = a.x - 0.5;
    const y = a.y - 0.5;
    const z = a.z - 0.5;
    const x1 = x * Math.cos(rot) - z * Math.sin(rot);
    const z1 = x * Math.sin(rot) + z * Math.cos(rot);
    const y1 = y * Math.cos(tilt) + z1 * Math.sin(tilt);
    return { px: x1, py: -y1, depth: z1 };
  };

  const cx = W / 2;
  const cy = H / 2 - 10;
  const scale = 110;

  const projected = atoms.map((a) => {
    const p = project(a);
    return { ...a, sx: cx + p.px * scale, sy: cy + p.py * scale, depth: p.depth };
  });
  // Render back-to-front for primitive z-buffering
  projected.sort((a, b) => a.depth - b.depth);

  // Draw cube edges
  const cubeCorners = [
    [0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0],
    [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1],
  ];
  const edges: Array<[number, number]> = [
    [0, 1], [1, 2], [2, 3], [3, 0],
    [4, 5], [5, 6], [6, 7], [7, 4],
    [0, 4], [1, 5], [2, 6], [3, 7],
  ];
  const corners2D = cubeCorners.map(([x, y, z]) => {
    const p = project({ x, y, z, kind: "corner" });
    return { sx: cx + p.px * scale, sy: cy + p.py * scale };
  });

  const info = STATS[type];

  return (
    <div className="my-4 p-3 rounded-lg border border-border bg-card text-card-foreground">
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-semibold">{info.name} ({type.toUpperCase()}) · coord {info.coord} · APF {info.apf.toFixed(3)} · basis {info.basis} atom{info.basis === 1 ? "" : "s"}</div>
        <div className="flex gap-1">
          {(["sc", "bcc", "fcc"] as LatticeType[]).map((t) => (
            <button key={t} onClick={() => setIntType(t)} disabled={ctlType !== undefined} className={`px-2 py-0.5 rounded text-[10px] ${type === t ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-accent"}`}>{t.toUpperCase()}</button>
          ))}
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto bg-[#0b1228] rounded-md" role="img" aria-label="Crystal lattice">
        {/* Cube edges */}
        {edges.map(([i, j], idx) => (
          <line key={idx} x1={corners2D[i].sx} y1={corners2D[i].sy} x2={corners2D[j].sx} y2={corners2D[j].sy} stroke="#475569" strokeWidth={0.6} />
        ))}
        {/* Atoms */}
        {projected.map((a, i) => {
          const r = a.kind === "corner" ? 7 : a.kind === "center" ? 8 : 6;
          const fill = a.kind === "corner" ? "#4ecdc4" : a.kind === "center" ? "#fbbf24" : "#a78bfa";
          return <circle key={i} cx={a.sx} cy={a.sy} r={r} fill={fill} stroke="#0b1228" strokeWidth={1.2} fillOpacity={0.6 + 0.4 * (a.depth + 0.5)} />;
        })}
        <text x={20} y={H - 50} fill="#cbd1e6" fontSize="10">{info.example}</text>
      </svg>

      <div className="mt-2 text-xs">
        <label className="block">Rotation: {(rot * 180 / Math.PI).toFixed(0)}°
          <input type="range" min={0} max={360} step={2} value={(ctlRot ?? intRot)} onChange={(e) => setIntRot(parseInt(e.target.value))} disabled={ctlRot !== undefined} className="w-full mt-0.5" aria-label="Rotation" />
        </label>
      </div>
      <div className="mt-2 grid grid-cols-3 gap-1 text-[10px]">
        <div><span className="text-muted-foreground">Coord. number:</span> {info.coord}</div>
        <div><span className="text-muted-foreground">Packing factor:</span> {info.apf.toFixed(3)}</div>
        <div><span className="text-muted-foreground">Basis atoms:</span> {info.basis}</div>
      </div>
      <div className="mt-2 text-[10px] text-muted-foreground">
        The 14 Bravais lattices (Bravais 1850) classify all 3D
        periodic translational symmetries. Cubic lattices: simple
        cubic (SC, basis = 1, APF = π/6 ≈ 0.524, rare in nature —
        only α-Po), body-centered cubic (BCC, basis = 2, APF = π√3/8
        ≈ 0.680 — α-Fe, W, alkali metals), face-centered cubic (FCC
        basis = 4, APF = π/(3√2) ≈ 0.740 — Cu, Al, Au, Ag, Ni).
        Hexagonal close-packed (HCP, not shown) shares the same
        0.740 packing fraction as FCC. The Kepler conjecture
        (Hales 1998 proof, computer-verified) established that
        no arrangement of equal spheres exceeds 0.74049 packing.
      </div>
    </div>
  );
}
