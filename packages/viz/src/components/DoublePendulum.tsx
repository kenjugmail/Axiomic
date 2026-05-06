import { useEffect, useRef, useState } from "react";

// Real-time double pendulum, RK4-integrated. The trace of the second
// bob is faded along the trail so the chaotic curve is visible. Sliders
// for the initial angles; reset re-launches with the chosen values.

interface State {
  // Angles measured from vertical-down, radians.
  th1: number;
  th2: number;
  // Angular velocities.
  w1: number;
  w2: number;
}

const G = 9.81;
const M1 = 1;
const M2 = 1;
const L1 = 1.4;
const L2 = 1.0;

function deriv(s: State): State {
  const { th1, th2, w1, w2 } = s;
  const d = th1 - th2;
  const sin = Math.sin;
  const cos = Math.cos;
  const denom1 = (2 * M1 + M2 - M2 * cos(2 * d));
  const denom2 = denom1 * (L2 / L1);
  const a1 =
    (-G * (2 * M1 + M2) * sin(th1) -
      M2 * G * sin(th1 - 2 * th2) -
      2 * sin(d) * M2 * (w2 * w2 * L2 + w1 * w1 * L1 * cos(d))) /
    (L1 * denom1);
  const a2 =
    (2 *
      sin(d) *
      (w1 * w1 * L1 * (M1 + M2) +
        G * (M1 + M2) * cos(th1) +
        w2 * w2 * L2 * M2 * cos(d))) /
    (L2 * denom2 * (L1 / L2));
  return { th1: w1, th2: w2, w1: a1, w2: a2 };
}

function add(a: State, b: State, k: number): State {
  return {
    th1: a.th1 + k * b.th1,
    th2: a.th2 + k * b.th2,
    w1: a.w1 + k * b.w1,
    w2: a.w2 + k * b.w2,
  };
}

function rk4(s: State, dt: number): State {
  const k1 = deriv(s);
  const k2 = deriv(add(s, k1, dt / 2));
  const k3 = deriv(add(s, k2, dt / 2));
  const k4 = deriv(add(s, k3, dt));
  return {
    th1: s.th1 + (dt / 6) * (k1.th1 + 2 * k2.th1 + 2 * k3.th1 + k4.th1),
    th2: s.th2 + (dt / 6) * (k1.th2 + 2 * k2.th2 + 2 * k3.th2 + k4.th2),
    w1: s.w1 + (dt / 6) * (k1.w1 + 2 * k2.w1 + 2 * k3.w1 + k4.w1),
    w2: s.w2 + (dt / 6) * (k1.w2 + 2 * k2.w2 + 2 * k3.w2 + k4.w2),
  };
}

const VIEW_W = 320;
const VIEW_H = 280;
const PIVOT_X = VIEW_W / 2;
const PIVOT_Y = 80;
const PX_PER_M = 70;
const TRAIL_LIMIT = 200;

interface Props {
  initialTh1?: number;
  initialTh2?: number;
}

export function DoublePendulum({ initialTh1, initialTh2 }: Props = {}) {
  const [theta1Init, setTheta1Init] = useState(initialTh1 ?? 2.2);
  const [theta2Init, setTheta2Init] = useState(initialTh2 ?? 2.5);
  const [tick, setTick] = useState(0);
  const [seed, setSeed] = useState(0);
  const stateRef = useRef<State>({
    th1: theta1Init,
    th2: theta2Init,
    w1: 0,
    w2: 0,
  });
  const trailRef = useRef<Array<{ x: number; y: number }>>([]);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    stateRef.current = { th1: theta1Init, th2: theta2Init, w1: 0, w2: 0 };
    trailRef.current = [];
    setTick((t) => t + 1);
  }, [theta1Init, theta2Init, seed]);

  useEffect(() => {
    let cancelled = false;
    const dt = 0.01;
    const step = () => {
      if (cancelled) return;
      for (let i = 0; i < 5; i++) {
        stateRef.current = rk4(stateRef.current, dt);
      }
      const { th1, th2 } = stateRef.current;
      const x1 = PIVOT_X + L1 * PX_PER_M * Math.sin(th1);
      const y1 = PIVOT_Y + L1 * PX_PER_M * Math.cos(th1);
      const x2 = x1 + L2 * PX_PER_M * Math.sin(th2);
      const y2 = y1 + L2 * PX_PER_M * Math.cos(th2);
      trailRef.current.push({ x: x2, y: y2 });
      if (trailRef.current.length > TRAIL_LIMIT) trailRef.current.shift();
      setTick((t) => t + 1);
      rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => {
      cancelled = true;
      cancelAnimationFrame(rafRef.current);
    };
  }, []);

  // Read current positions for render. tick triggers re-render.
  void tick;
  const { th1, th2 } = stateRef.current;
  const x1 = PIVOT_X + L1 * PX_PER_M * Math.sin(th1);
  const y1 = PIVOT_Y + L1 * PX_PER_M * Math.cos(th1);
  const x2 = x1 + L2 * PX_PER_M * Math.sin(th2);
  const y2 = y1 + L2 * PX_PER_M * Math.cos(th2);

  return (
    <div className="my-6 rounded-lg border border-border bg-card overflow-hidden">
      <div className="px-4 py-2 border-b border-border bg-muted/50 flex items-center justify-between">
        <div>
          <h4 className="text-sm font-medium">Double pendulum</h4>
          <p className="text-xs text-muted-foreground mt-0.5">
            A small change in the starting angles changes the trajectory completely. Hit reset to try again.
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
          {/* Trail of the second bob, faded along the trajectory. */}
          {trailRef.current.map((p, i) => {
            const opacity = (i / Math.max(1, trailRef.current.length)) * 0.55;
            return (
              <circle
                key={i}
                cx={p.x}
                cy={p.y}
                r="1.4"
                fill="currentColor"
                className="text-primary"
                opacity={opacity}
              />
            );
          })}
          {/* Rods */}
          <line
            x1={PIVOT_X}
            y1={PIVOT_Y}
            x2={x1}
            y2={y1}
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            className="text-foreground"
          />
          <line
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            className="text-foreground"
          />
          {/* Pivot + bobs */}
          <circle cx={PIVOT_X} cy={PIVOT_Y} r="3" className="fill-muted-foreground" />
          <circle cx={x1} cy={y1} r="6" fill="currentColor" className="text-primary" />
          <circle cx={x2} cy={y2} r="7" fill="currentColor" className="text-primary" />
        </svg>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Initial θ₁</span>
              <span className="tabular-nums font-medium">{theta1Init.toFixed(2)} rad</span>
            </div>
            <input
              type="range"
              min={-Math.PI}
              max={Math.PI}
              step={0.01}
              value={theta1Init}
              onChange={(e) => setTheta1Init(parseFloat(e.target.value))}
              className="w-full accent-primary"
            />
          </div>
          <div>
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Initial θ₂</span>
              <span className="tabular-nums font-medium">{theta2Init.toFixed(2)} rad</span>
            </div>
            <input
              type="range"
              min={-Math.PI}
              max={Math.PI}
              step={0.01}
              value={theta2Init}
              onChange={(e) => setTheta2Init(parseFloat(e.target.value))}
              className="w-full accent-primary"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
