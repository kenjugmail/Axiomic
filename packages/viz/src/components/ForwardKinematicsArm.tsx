import { useMemo, useState } from "react";

// Forward kinematics for a planar arm with N revolute joints. Each joint
// angle θᵢ is summed cumulatively along the chain, and link lengths Lᵢ
// project the end-effector position via successive 2D transforms:
//   x_n = Σ Lᵢ · cos(Σⱼ≤ᵢ θⱼ)
//   y_n = Σ Lᵢ · sin(Σⱼ≤ᵢ θⱼ)
// Drag joint sliders to see the arm + end-effector position update. The
// Jacobian determinant indicates singularities (zero ⇒ lost DOF).

const W = 460;
const H = 320;

interface Props {
  joints?: number;
  linkLengths?: number[];
}

export function ForwardKinematicsArm({ joints: ctlJ, linkLengths: ctlL }: Props = {}) {
  const N = ctlJ ?? 3;
  const Ls = ctlL ?? [1, 1, 0.7];
  const [angles, setAngles] = useState<number[]>(() => Array(N).fill(0).map((_, i) => (i === 0 ? 0.6 : 0.4)));

  const positions = useMemo(() => {
    const pts: Array<{ x: number; y: number }> = [{ x: 0, y: 0 }];
    let cumAngle = 0;
    for (let i = 0; i < N; i++) {
      cumAngle += angles[i] ?? 0;
      const len = Ls[i] ?? 1;
      const prev = pts[pts.length - 1];
      pts.push({
        x: prev.x + len * Math.cos(cumAngle),
        y: prev.y + len * Math.sin(cumAngle),
      });
    }
    return pts;
  }, [angles, N, Ls]);

  const end = positions[positions.length - 1];

  // Jacobian (planar): for each joint i, ∂x/∂θᵢ = -y_n + y_i, ∂y/∂θᵢ = x_n - x_i
  // The 2-norm of the columns gives manipulability per joint.
  const jacDetIsh = useMemo(() => {
    if (N < 2) return 1;
    // Approximate Yoshikawa manipulability w = sqrt(det(J J^T))
    let prod = 1;
    let sumCol = 0;
    for (let i = 0; i < N; i++) {
      const dx = end.x - positions[i].x;
      const dy = end.y - positions[i].y;
      sumCol += dx * dx + dy * dy;
    }
    prod = Math.sqrt(sumCol / N);
    return prod;
  }, [positions, end, N]);

  const isSing = jacDetIsh < 0.15;

  // Scale + center for rendering
  const totalReach = Ls.reduce((s, l) => s + l, 0);
  const scale = (Math.min(W, H) * 0.35) / totalReach;
  const cx = W / 2;
  const cy = H / 2 + 30;

  return (
    <div className="my-4 p-3 rounded-lg border border-border bg-card text-card-foreground">
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-semibold">FK · end-effector ({end.x.toFixed(2)}, {end.y.toFixed(2)}) · manipulability {jacDetIsh.toFixed(2)} <span style={{ color: isSing ? "#ff6b6b" : "#4ecdc4" }}>{isSing ? "(near singular)" : "(well-conditioned)"}</span></div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto bg-[#0b1228] rounded-md" role="img" aria-label="Forward kinematics arm">
        {/* Workspace circle */}
        <circle cx={cx} cy={cy} r={totalReach * scale} fill="none" stroke="#1f2937" strokeWidth={0.5} strokeDasharray="3,3" />
        <text x={cx + totalReach * scale + 4} y={cy + 3} fill="#475569" fontSize="8">reach</text>
        {/* Base */}
        <rect x={cx - 12} y={cy + 2} width={24} height={10} fill="#475569" />
        <text x={cx} y={cy + 26} fill="#9aa3b8" fontSize="8" textAnchor="middle">base</text>
        {/* Arm links */}
        {positions.slice(0, -1).map((p, i) => {
          const next = positions[i + 1];
          const sx = cx + p.x * scale;
          const sy = cy - p.y * scale;
          const ex = cx + next.x * scale;
          const ey = cy - next.y * scale;
          return (
            <g key={`link-${i}`}>
              <line x1={sx} y1={sy} x2={ex} y2={ey} stroke={isSing ? "#ff6b6b" : "#4ecdc4"} strokeWidth={4} strokeLinecap="round" />
              <text x={(sx + ex) / 2 + 4} y={(sy + ey) / 2 - 4} fill="#cbd1e6" fontSize="8">L_{i + 1}={Ls[i]?.toFixed(1)}</text>
            </g>
          );
        })}
        {/* Joints (revolute) */}
        {positions.map((p, i) => {
          const px = cx + p.x * scale;
          const py = cy - p.y * scale;
          if (i === positions.length - 1) {
            return <g key={`joint-${i}`}>
              <circle cx={px} cy={py} r={8} fill="#fbbf24" stroke="#0b1228" strokeWidth={1.5} />
              <text x={px + 10} y={py - 6} fill="#fbbf24" fontSize="9">end</text>
            </g>;
          }
          return <g key={`joint-${i}`}>
            <circle cx={px} cy={py} r={6} fill="#1f2937" stroke="#cbd1e6" strokeWidth={1.5} />
            <text x={px - 8} y={py - 8} fill="#cbd1e6" fontSize="8">θ_{i + 1}</text>
          </g>;
        })}
      </svg>

      <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
        {angles.map((a, i) => (
          <label key={i} className="block">θ_{i + 1}: {(a * 180 / Math.PI).toFixed(0)}°
            <input type="range" min={-180} max={180} step={1} value={a * 180 / Math.PI} onChange={(e) => {
              const next = [...angles];
              next[i] = parseFloat(e.target.value) * Math.PI / 180;
              setAngles(next);
            }} className="w-full mt-0.5" aria-label={`Joint angle ${i + 1}`} />
          </label>
        ))}
      </div>
      <div className="mt-2 text-[10px] text-muted-foreground">
        Planar forward kinematics for an N-link revolute arm. Position
        of the end-effector is the cumulative sum of link vectors
        rotated by joint angles. The Jacobian J = ∂x/∂θ maps joint
        velocity θ̇ to end-effector velocity ẋ; near singularities J
        loses rank (e.g., arm fully extended) and infinite joint
        velocity is needed for some Cartesian motions. Inverse
        kinematics — solve θ for desired x — is multi-valued and
        often handled with damped least squares (Wampler 1986) or
        analytical methods (Pieper). Modern manipulators (Boston
        Dynamics Atlas, Tesla Optimus) use 6-7 DOF + redundancy
        resolution for whole-body MPC.
      </div>
    </div>
  );
}
