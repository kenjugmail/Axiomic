import { useEffect, useRef, useState } from "react";

// Animated 2D projection (xz-plane) of the Lorenz system, integrated
// with classical RK4 from random initial conditions. Sliders for σ, ρ,
// and β; hitting Reset re-randomizes the initial point. Pure SVG; no
// canvas / D3.

interface Vec3 {
  x: number;
  y: number;
  z: number;
}

function lorenz(p: Vec3, sigma: number, rho: number, beta: number): Vec3 {
  return {
    x: sigma * (p.y - p.x),
    y: p.x * (rho - p.z) - p.y,
    z: p.x * p.y - beta * p.z,
  };
}

function rk4(p: Vec3, dt: number, sigma: number, rho: number, beta: number): Vec3 {
  const k1 = lorenz(p, sigma, rho, beta);
  const m1 = { x: p.x + (dt / 2) * k1.x, y: p.y + (dt / 2) * k1.y, z: p.z + (dt / 2) * k1.z };
  const k2 = lorenz(m1, sigma, rho, beta);
  const m2 = { x: p.x + (dt / 2) * k2.x, y: p.y + (dt / 2) * k2.y, z: p.z + (dt / 2) * k2.z };
  const k3 = lorenz(m2, sigma, rho, beta);
  const m3 = { x: p.x + dt * k3.x, y: p.y + dt * k3.y, z: p.z + dt * k3.z };
  const k4 = lorenz(m3, sigma, rho, beta);
  return {
    x: p.x + (dt / 6) * (k1.x + 2 * k2.x + 2 * k3.x + k4.x),
    y: p.y + (dt / 6) * (k1.y + 2 * k2.y + 2 * k3.y + k4.y),
    z: p.z + (dt / 6) * (k1.z + 2 * k2.z + 2 * k3.z + k4.z),
  };
}

const VIEW_W = 320;
const VIEW_H = 240;
const SCALE_X = 7; // x range ~ ±25 → ±175 px
const SCALE_Z = 4.5; // z range ~ 0..50 → 0..225 px
const TRAIL_LIMIT = 600;

interface Props {
  sigma?: number;
  rho?: number;
  beta?: number;
}

export function LorenzAttractor({
  sigma: sigmaProp,
  rho: rhoProp,
  beta: betaProp,
}: Props = {}) {
  const [sigma, setSigma] = useState(sigmaProp ?? 10);
  const [rho, setRho] = useState(rhoProp ?? 28);
  const [beta, setBeta] = useState(betaProp ?? 8 / 3);
  const [seed, setSeed] = useState(0);
  const [trail, setTrail] = useState<Vec3[]>([]);
  const stateRef = useRef<Vec3>({ x: 1, y: 1, z: 1 });
  const rafRef = useRef<number>(0);

  // Reset the trajectory whenever the parameters or seed change.
  useEffect(() => {
    stateRef.current = {
      x: (Math.random() - 0.5) * 2,
      y: (Math.random() - 0.5) * 2,
      z: (Math.random() - 0.5) * 2 + 1,
    };
    setTrail([]);
  }, [seed, sigma, rho, beta]);

  // Animation loop. Step the integrator on each frame and append to
  // the visible trail; throw away the head once we hit TRAIL_LIMIT.
  useEffect(() => {
    let cancelled = false;
    const dt = 0.01;
    const step = () => {
      if (cancelled) return;
      let p = stateRef.current;
      // Multiple sub-steps per frame so the curve advances visibly.
      for (let i = 0; i < 4; i++) p = rk4(p, dt, sigma, rho, beta);
      stateRef.current = p;
      setTrail((prev) => {
        const next = prev.length >= TRAIL_LIMIT ? prev.slice(1) : prev.slice();
        next.push(p);
        return next;
      });
      rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => {
      cancelled = true;
      cancelAnimationFrame(rafRef.current);
    };
  }, [sigma, rho, beta]);

  // Project 3D state to 2D screen-space (centered).
  const project = (p: Vec3): { sx: number; sy: number } => ({
    sx: VIEW_W / 2 + p.x * SCALE_X,
    sy: VIEW_H - 30 - (p.z - 25) * SCALE_Z,
  });

  const path =
    trail.length > 0
      ? trail
          .map((p, i) => {
            const { sx, sy } = project(p);
            return `${i === 0 ? "M" : "L"}${sx.toFixed(1)},${sy.toFixed(1)}`;
          })
          .join(" ")
      : "";

  const head = trail.length ? project(trail[trail.length - 1]) : null;

  return (
    <div className="my-6 rounded-lg border border-border bg-card overflow-hidden">
      <div className="px-4 py-2 border-b border-border bg-muted/50 flex items-center justify-between">
        <div>
          <h4 className="text-sm font-medium">Lorenz attractor</h4>
          <p className="text-xs text-muted-foreground mt-0.5">
            A continuous-time chaotic system. Tweak σ, ρ, β to find the
            butterfly — or break it.
          </p>
        </div>
        <button
          onClick={() => setSeed((s) => s + 1)}
          className="text-xs px-2 py-1 rounded bg-secondary hover:bg-secondary/80 text-secondary-foreground"
        >
          Reset
        </button>
      </div>
      <div className="p-4 space-y-3">
        <svg
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          className="w-full h-auto"
          preserveAspectRatio="xMidYMid meet"
        >
          {/* Decorative axes */}
          <line
            x1={VIEW_W / 2}
            y1={20}
            x2={VIEW_W / 2}
            y2={VIEW_H - 20}
            stroke="currentColor"
            strokeWidth="0.4"
            className="text-muted-foreground/20"
          />
          <line
            x1={20}
            y1={VIEW_H - 30}
            x2={VIEW_W - 20}
            y2={VIEW_H - 30}
            stroke="currentColor"
            strokeWidth="0.4"
            className="text-muted-foreground/20"
          />
          <path
            d={path}
            fill="none"
            stroke="currentColor"
            strokeWidth="1.1"
            strokeLinejoin="round"
            strokeLinecap="round"
            className="text-primary"
            opacity={0.9}
          />
          {head && (
            <circle
              cx={head.sx}
              cy={head.sy}
              r="2.6"
              fill="currentColor"
              className="text-primary"
            />
          )}
        </svg>
        <div className="grid grid-cols-3 gap-3">
          <Slider
            label="σ"
            value={sigma}
            min={1}
            max={20}
            step={0.1}
            onChange={setSigma}
          />
          <Slider
            label="ρ"
            value={rho}
            min={0.5}
            max={40}
            step={0.5}
            onChange={setRho}
          />
          <Slider
            label="β"
            value={beta}
            min={0.5}
            max={6}
            step={0.05}
            onChange={setBeta}
          />
        </div>
      </div>
    </div>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (n: number) => void;
}) {
  return (
    <div>
      <div className="flex justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="tabular-nums font-medium">{value.toFixed(2)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full accent-primary"
      />
    </div>
  );
}
