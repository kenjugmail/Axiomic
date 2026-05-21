import { useMemo, useState } from "react";

// Group orbits + Cayley graph for small finite groups acting on the
// plane. We visualize a few presentations:
//   D4: dihedral group of the square (rotations + reflections), |G| = 8
//   Z6: cyclic group of order 6, |G| = 6
//   S3: symmetric group on 3 letters, |G| = 6 (isomorphic to D3)
//   Z2xZ2: Klein four-group, |G| = 4
// Choose a base point + group element; see the orbit of points under
// repeated application. Cayley graph shows the group structure.

const W = 460;
const H = 320;

interface Props {
  group?: "D4" | "Z6" | "S3" | "Z2Z2";
  element?: string;
}

type Pt = { x: number; y: number };

function rot(p: Pt, theta: number): Pt {
  return {
    x: p.x * Math.cos(theta) - p.y * Math.sin(theta),
    y: p.x * Math.sin(theta) + p.y * Math.cos(theta),
  };
}
function reflect(p: Pt, axisAngle: number): Pt {
  const a = 2 * axisAngle;
  return {
    x: p.x * Math.cos(a) + p.y * Math.sin(a),
    y: p.x * Math.sin(a) - p.y * Math.cos(a),
  };
}

function applyD4(p: Pt, name: string): Pt {
  switch (name) {
    case "e": return p;
    case "r": return rot(p, Math.PI / 2);
    case "r2": return rot(p, Math.PI);
    case "r3": return rot(p, 3 * Math.PI / 2);
    case "s": return reflect(p, 0);
    case "sr": return reflect(p, Math.PI / 4);
    case "sr2": return reflect(p, Math.PI / 2);
    case "sr3": return reflect(p, 3 * Math.PI / 4);
  }
  return p;
}
function applyZ6(p: Pt, name: string): Pt {
  const k = parseInt(name.replace("g", "")) || 0;
  return rot(p, (k * 2 * Math.PI) / 6);
}
function applyS3(p: Pt, name: string): Pt {
  switch (name) {
    case "e": return p;
    case "r": return rot(p, 2 * Math.PI / 3);
    case "r2": return rot(p, 4 * Math.PI / 3);
    case "s": return reflect(p, 0);
    case "sr": return reflect(p, Math.PI / 3);
    case "sr2": return reflect(p, 2 * Math.PI / 3);
  }
  return p;
}
function applyZ2Z2(p: Pt, name: string): Pt {
  switch (name) {
    case "e": return p;
    case "a": return { x: -p.x, y: p.y };
    case "b": return { x: p.x, y: -p.y };
    case "ab": return { x: -p.x, y: -p.y };
  }
  return p;
}

const GROUPS = {
  D4: { elems: ["e", "r", "r2", "r3", "s", "sr", "sr2", "sr3"], apply: applyD4, order: 8 },
  Z6: { elems: ["g0", "g1", "g2", "g3", "g4", "g5"], apply: applyZ6, order: 6 },
  S3: { elems: ["e", "r", "r2", "s", "sr", "sr2"], apply: applyS3, order: 6 },
  Z2Z2: { elems: ["e", "a", "b", "ab"], apply: applyZ2Z2, order: 4 },
};

export function GroupOrbits({ group: ctlG, element: ctlE }: Props = {}) {
  const [intG, setIntG] = useState<keyof typeof GROUPS>("D4");
  const [intE, setIntE] = useState<string>("r");
  const [base, setBase] = useState<Pt>({ x: 1.5, y: 0.5 });
  const G = (ctlG as keyof typeof GROUPS) ?? intG;
  const E = ctlE ?? intE;
  const info = GROUPS[G];

  // Orbit of base point under the entire group (left coset of stab)
  const orbit = useMemo(() => {
    const seen: Pt[] = [];
    for (const elem of info.elems) {
      const transformed = info.apply(base, elem);
      if (!seen.some((p) => Math.abs(p.x - transformed.x) < 0.01 && Math.abs(p.y - transformed.y) < 0.01)) {
        seen.push(transformed);
      }
    }
    return seen;
  }, [G, base]);

  const cx = W / 2;
  const cy = H / 2 + 20;
  const scale = 60;
  const xOf = (p: Pt) => cx + p.x * scale;
  const yOf = (p: Pt) => cy - p.y * scale;

  return (
    <div className="my-4 p-3 rounded-lg border border-border bg-card text-card-foreground">
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-semibold">Group orbits · {G} · |G| = {info.order} · orbit size = {orbit.length} · stabilizer = {info.order / orbit.length}</div>
        <div className="flex gap-1">
          {(Object.keys(GROUPS) as Array<keyof typeof GROUPS>).map((g) => (
            <button key={g} onClick={() => setIntG(g)} disabled={ctlG !== undefined} className={`px-2 py-0.5 rounded text-[9px] ${G === g ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-accent"}`}>{g}</button>
          ))}
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto bg-[#0b1228] rounded-md" role="img" aria-label="Group orbits">
        {/* Axes */}
        <line x1={20} y1={cy} x2={W - 20} y2={cy} stroke="#1f2937" strokeWidth={0.5} />
        <line x1={cx} y1={20} x2={cx} y2={H - 50} stroke="#1f2937" strokeWidth={0.5} />
        {[-2, -1, 1, 2].map((g) => (
          <g key={`g-${g}`}>
            <line x1={cx + g * scale} y1={cy - 3} x2={cx + g * scale} y2={cy + 3} stroke="#475569" strokeWidth={0.5} />
            <line x1={cx - 3} y1={cy - g * scale} x2={cx + 3} y2={cy - g * scale} stroke="#475569" strokeWidth={0.5} />
          </g>
        ))}
        {/* Orbit lines (showing transitions) */}
        {orbit.map((p, i) => {
          const nextIdx = (i + 1) % orbit.length;
          const next = orbit[nextIdx];
          return <line key={`orb-${i}`} x1={xOf(p)} y1={yOf(p)} x2={xOf(next)} y2={yOf(next)} stroke="#fbbf24" strokeWidth={0.6} strokeDasharray="2,2" opacity={0.4} />;
        })}
        {/* Orbit points */}
        {orbit.map((p, i) => {
          const isBase = Math.abs(p.x - base.x) < 0.01 && Math.abs(p.y - base.y) < 0.01;
          return (
            <g key={`p-${i}`}>
              <circle cx={xOf(p)} cy={yOf(p)} r={isBase ? 7 : 5} fill={isBase ? "#ff6b6b" : "#4ecdc4"} stroke="#0b1228" strokeWidth={1} />
              <text x={xOf(p) + 6} y={yOf(p) - 4} fill="#cbd1e6" fontSize="8">{isBase ? "base" : i}</text>
            </g>
          );
        })}
        {/* Selected element application from base */}
        {(() => {
          const targetPt = info.apply(base, E);
          return (
            <g>
              <line x1={xOf(base)} y1={yOf(base)} x2={xOf(targetPt)} y2={yOf(targetPt)} stroke="#a78bfa" strokeWidth={2} markerEnd="url(#groupArr)" />
              <text x={xOf(targetPt) - 12} y={yOf(targetPt) + 16} fill="#a78bfa" fontSize="9">{E}·base</text>
            </g>
          );
        })()}
        <defs>
          <marker id="groupArr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#a78bfa" />
          </marker>
        </defs>
      </svg>

      <div className="mt-2 grid grid-cols-1 gap-x-3 gap-y-1 text-[10px]">
        <div>
          <span className="text-muted-foreground">Apply: </span>
          {info.elems.map((e) => (
            <button key={e} onClick={() => setIntE(e)} disabled={ctlE !== undefined}
              className={`mr-1 px-1.5 py-0.5 rounded ${E === e ? "bg-[#a78bfa] text-white" : "bg-muted hover:bg-accent"}`}>{e}</button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-x-3 text-xs mt-1">
          <label>base x = {base.x.toFixed(2)}
            <input type="range" min={-2} max={2} step={0.1} value={base.x} onChange={(e) => setBase({ ...base, x: parseFloat(e.target.value) })} className="w-full mt-0.5" aria-label="base x" />
          </label>
          <label>base y = {base.y.toFixed(2)}
            <input type="range" min={-2} max={2} step={0.1} value={base.y} onChange={(e) => setBase({ ...base, y: parseFloat(e.target.value) })} className="w-full mt-0.5" aria-label="base y" />
          </label>
        </div>
      </div>
      <div className="mt-2 text-[10px] text-muted-foreground">
        For a group G acting on a set X, the orbit of x ∈ X is
        G·x = {"{ g·x : g ∈ G }"}; the stabilizer Stab(x) is the
        subgroup fixing x. Orbit-stabilizer: |G| = |Orbit| · |Stab|.
        D4 (8 elements) acting on the plane permutes a generic point
        into an orbit of size 8; a point on an axis-of-symmetry has
        orbit ≤ 4 (nontrivial stabilizer). Cyclic Z_n has orbits of
        size dividing n; Klein four-group's orbits of size ≤ 4.
        Group actions undergird crystallography (point groups,
        Bravais), Galois theory (G acts on roots), gauge theory
        (Lie groups act on fields), and AI (equivariant GNNs, e.g.
        SE(3)-equivariant Cohen-Welling for molecules).
      </div>
    </div>
  );
}
