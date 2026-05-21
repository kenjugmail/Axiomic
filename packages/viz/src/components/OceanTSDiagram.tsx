import { useMemo, useState } from "react";

// Interactive T-S (temperature-salinity) diagram with σ_θ density
// isopycnals — the canonical oceanography tool for identifying water
// masses + tracing their mixing. Drag any of the labeled water-mass
// markers; see its updated density. Isopycnal contours show that
// equal-density surfaces are NOT horizontal in T-S space because of
// the nonlinear seawater equation of state.
//
// Density approximation (good to ~0.3 kg/m³ for surface seawater):
//   σ_θ(S, T) ≈ 28.10 + 0.78 (S − 35) − 0.06 T − 0.004 T²
//
// Water-mass labels reflect classical ocean references:
//   AABW (Antarctic Bottom Water): very cold + saline
//   NADW (N. Atlantic Deep Water): cold + saline
//   AAIW (Antarctic Intermediate Water): cool + fresher
//   MW   (Mediterranean Water):    warm + very saline
//   STSW (Subtropical Surface):    warm + saline
//   EqSW (Equatorial Surface):     warm + fresh

const W = 460;
const H = 280;
const PAD_L = 50;
const PAD_R = 14;
const PAD_T = 16;
const PAD_B = 38;

const S_MIN = 32;
const S_MAX = 38;
const T_MIN = -2;
const T_MAX = 30;

function sigma(S: number, T: number): number {
  return 28.1 + 0.78 * (S - 35) - 0.06 * T - 0.004 * T * T;
}

const MASS_DEFAULTS = [
  { id: "aabw", label: "AABW", S: 34.65, T: -0.5, color: "#bcdcff" },
  { id: "nadw", label: "NADW", S: 34.92, T: 2.5, color: "#7bcbff" },
  { id: "aaiw", label: "AAIW", S: 34.3, T: 5, color: "#aaffbf" },
  { id: "mw", label: "MW", S: 37.5, T: 13, color: "#ffd166" },
  { id: "stsw", label: "STSW", S: 36.5, T: 22, color: "#ff9b6a" },
  { id: "eqsw", label: "EqSW", S: 34.5, T: 27, color: "#ff7a7a" },
];

interface Props {
  // Optionally lock specific water-mass positions (for slide-bound
  // examples). Each entry overrides defaults by id.
  fixed?: Array<{ id: string; S: number; T: number }>;
}

export function OceanTSDiagram({ fixed }: Props = {}) {
  const overrides = useMemo(() => {
    const m = new Map<string, { S: number; T: number }>();
    for (const f of fixed ?? []) m.set(f.id, { S: f.S, T: f.T });
    return m;
  }, [fixed]);

  const [masses, setMasses] = useState(MASS_DEFAULTS);
  const [activeId, setActiveId] = useState<string | null>(null);

  const xFor = (S: number) => PAD_L + ((S - S_MIN) / (S_MAX - S_MIN)) * (W - PAD_L - PAD_R);
  const yFor = (T: number) => PAD_T + (1 - (T - T_MIN) / (T_MAX - T_MIN)) * (H - PAD_T - PAD_B);

  const sFromX = (x: number) =>
    Math.max(S_MIN, Math.min(S_MAX, S_MIN + ((x - PAD_L) / (W - PAD_L - PAD_R)) * (S_MAX - S_MIN)));
  const tFromY = (y: number) =>
    Math.max(T_MIN, Math.min(T_MAX, T_MIN + (1 - (y - PAD_T) / (H - PAD_T - PAD_B)) * (T_MAX - T_MIN)));

  const isopycnals = useMemo(() => {
    // For sigma values 22..30 step 1, trace S(T) such that sigma(S,T)=σ.
    // From the polynomial: S = 35 + (σ − 28.1 + 0.06T + 0.004T²) / 0.78.
    const lines: { sigma: number; d: string }[] = [];
    for (let sig = 22; sig <= 30; sig += 1) {
      let d = "";
      let first = true;
      for (let T = T_MIN; T <= T_MAX; T += 0.5) {
        const S = 35 + (sig - 28.1 + 0.06 * T + 0.004 * T * T) / 0.78;
        if (S < S_MIN - 0.5 || S > S_MAX + 0.5) {
          first = true;
          continue;
        }
        const x = xFor(S);
        const y = yFor(T);
        d += first ? `M ${x.toFixed(1)} ${y.toFixed(1)}` : ` L ${x.toFixed(1)} ${y.toFixed(1)}`;
        first = false;
      }
      lines.push({ sigma: sig, d });
    }
    return lines;
  }, []);

  function onMove(ev: React.PointerEvent<SVGSVGElement>) {
    if (!activeId) return;
    if (overrides.has(activeId)) return;
    const svg = ev.currentTarget;
    const rect = svg.getBoundingClientRect();
    const scaleX = W / rect.width;
    const scaleY = H / rect.height;
    const xSvg = (ev.clientX - rect.left) * scaleX;
    const ySvg = (ev.clientY - rect.top) * scaleY;
    const newS = sFromX(xSvg);
    const newT = tFromY(ySvg);
    setMasses((prev) => prev.map((m) => (m.id === activeId ? { ...m, S: newS, T: newT } : m)));
  }

  function effectiveMasses() {
    return masses.map((m) => {
      const o = overrides.get(m.id);
      return o ? { ...m, S: o.S, T: o.T } : m;
    });
  }

  const active = effectiveMasses().find((m) => m.id === activeId) ?? null;

  return (
    <div className="my-4 p-3 rounded-lg border border-border bg-card text-card-foreground">
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-semibold">Ocean T-S diagram</div>
        {active && (
          <div className="text-xs font-mono text-muted-foreground">
            <span style={{ color: active.color }}>{active.label}</span>: S = {active.S.toFixed(2)} PSU, T = {active.T.toFixed(2)} °C, σ_θ = {sigma(active.S, active.T).toFixed(2)} kg/m³
          </div>
        )}
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-auto bg-[#0b1228] rounded-md cursor-crosshair"
        role="img"
        aria-label="Temperature vs salinity with density isopycnals + water-mass markers"
        onPointerMove={onMove}
        onPointerUp={() => setActiveId(null)}
        onPointerLeave={() => setActiveId(null)}
      >
        {/* Isopycnal contours */}
        {isopycnals.map((iso) => (
          <g key={iso.sigma}>
            <path d={iso.d} fill="none" stroke="#5566a8" strokeWidth={0.7} strokeOpacity={0.6} />
          </g>
        ))}
        {/* Label a few isopycnals along the top edge */}
        {isopycnals.map((iso) => {
          const T = T_MAX;
          const S = 35 + (iso.sigma - 28.1 + 0.06 * T + 0.004 * T * T) / 0.78;
          if (S < S_MIN - 0.3 || S > S_MAX + 0.3) return null;
          return (
            <text key={`l-${iso.sigma}`} x={xFor(S)} y={yFor(T) - 3} fill="#8e9ace" fontSize="9" textAnchor="middle">
              {iso.sigma}
            </text>
          );
        })}

        {/* Axes */}
        <line x1={PAD_L} y1={H - PAD_B} x2={W - PAD_R} y2={H - PAD_B} stroke="#444a66" />
        <line x1={PAD_L} y1={PAD_T} x2={PAD_L} y2={H - PAD_B} stroke="#444a66" />

        {/* X (salinity) ticks */}
        {[32, 33, 34, 35, 36, 37, 38].map((s) => (
          <g key={s}>
            <line x1={xFor(s)} y1={H - PAD_B} x2={xFor(s)} y2={H - PAD_B + 3} stroke="#666" />
            <text x={xFor(s)} y={H - PAD_B + 14} fill="#9aa3b8" fontSize="9" textAnchor="middle">{s}</text>
          </g>
        ))}
        {/* Y (temperature) ticks */}
        {[-2, 0, 5, 10, 15, 20, 25, 30].map((t) => (
          <g key={t}>
            <line x1={PAD_L - 4} y1={yFor(t)} x2={PAD_L} y2={yFor(t)} stroke="#666" />
            <text x={PAD_L - 6} y={yFor(t) + 3} fill="#9aa3b8" fontSize="9" textAnchor="end">{t}</text>
          </g>
        ))}

        <text x={W / 2} y={H - 4} fill="#cbd1e6" fontSize="10" textAnchor="middle">salinity (PSU)</text>
        <text x={12} y={H / 2} fill="#cbd1e6" fontSize="10" transform={`rotate(-90 12 ${H / 2})`} textAnchor="middle">temperature (°C)</text>

        {/* Water masses */}
        {effectiveMasses().map((m) => (
          <g
            key={m.id}
            onPointerDown={(e) => {
              e.preventDefault();
              setActiveId(m.id);
            }}
            style={{ cursor: overrides.has(m.id) ? "default" : "grab" }}
          >
            <circle cx={xFor(m.S)} cy={yFor(m.T)} r={6} fill={m.color} stroke="#fff" strokeWidth={1.5} />
            <text x={xFor(m.S) + 9} y={yFor(m.T) + 3} fill={m.color} fontSize="10" fontWeight={700}>
              {m.label}
            </text>
          </g>
        ))}
      </svg>
      <div className="mt-2 text-[10px] text-muted-foreground">
        Diagonal lines are isopycnals (constant σ_θ in kg/m³). Drag any water-mass marker to see how its density changes. Note: isopycnals curve because the seawater equation of state is nonlinear — thermal expansion grows with temperature. AABW + NADW are densest; equatorial surface water is lightest. Mixing between two masses lies on the straight line connecting them, NOT on the curved isopycnal — so two same-density masses can mix into a denser product (**cabbeling**), driving deep-water formation.
      </div>
    </div>
  );
}
