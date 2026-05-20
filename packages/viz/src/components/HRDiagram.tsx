import { useMemo, useState } from "react";

// Interactive Hertzsprung-Russell diagram: temperature (x, reversed:
// hot left, cool right) vs luminosity (y, log scale). Drag a star's
// mass (0.1-50 M_sun); the dot moves along the main sequence with
// L ~ M^3.5, T_eff ~ M^0.5 (rough zero-age MS scalings). Predict
// lifetime via t ~ 10 Gyr × (M/M_sun)^-2.5 and endpoint by initial
// mass (white dwarf / neutron star / black hole). Background shows
// the four classic regions: main sequence, red giants, supergiants,
// white dwarfs. Universal in stellar astrophysics + observational
// astronomy.

const W = 420;
const H = 280;
const PAD_L = 50;
const PAD_R = 16;
const PAD_T = 14;
const PAD_B = 38;

const LOG_L_MIN = -4;
const LOG_L_MAX = 6;
const T_MIN = 2500;
const T_MAX = 42000;

function xForT(t: number) {
  const logT = Math.log10(t);
  const logTMin = Math.log10(T_MIN);
  const logTMax = Math.log10(T_MAX);
  const t01 = (logT - logTMin) / (logTMax - logTMin);
  return PAD_L + (1 - t01) * (W - PAD_L - PAD_R);
}

function yForLogL(logL: number) {
  const l01 = (logL - LOG_L_MIN) / (LOG_L_MAX - LOG_L_MIN);
  return PAD_T + (1 - l01) * (H - PAD_T - PAD_B);
}

function tempColor(t: number) {
  if (t > 30000) return "#9ec6ff";
  if (t > 10000) return "#bcdcff";
  if (t > 7500) return "#ffffff";
  if (t > 6000) return "#fff6c8";
  if (t > 5000) return "#ffe28a";
  if (t > 3700) return "#ffb360";
  return "#ff7a4a";
}

function specType(t: number) {
  if (t > 30000) return "O";
  if (t > 10000) return "B";
  if (t > 7500) return "A";
  if (t > 6000) return "F";
  if (t > 5200) return "G";
  if (t > 3700) return "K";
  return "M";
}

function endpoint(m: number) {
  if (m < 0.5) return "Red dwarf → He white dwarf";
  if (m < 8) return "White dwarf (C/O core)";
  if (m < 25) return "Neutron star (Type II SN)";
  return "Black hole (collapse / pair instability)";
}

interface Props {
  mass?: number; // M_sun
}

export function HRDiagram({ mass: ctlMass }: Props = {}) {
  const [intMass, setIntMass] = useState(1);
  const mass = ctlMass ?? intMass;

  const star = useMemo(() => {
    const logM = Math.log10(mass);
    // Zero-age MS L-M relation, broken power law (rough).
    let logL: number;
    if (mass < 0.43) logL = 2.3 * logM + Math.log10(0.23);
    else if (mass < 2) logL = 4 * logM;
    else if (mass < 55) logL = 3.5 * logM + Math.log10(1.4);
    else logL = logM + Math.log10(32000);

    // T_eff: Stefan-Boltzmann L = 4πR²σT⁴ with R ~ M^0.8 → T ~ M^0.5 (approx).
    const T = 5780 * Math.pow(mass, 0.505);

    // MS lifetime ~ M / L · t_sun, t_sun ~ 10 Gyr.
    const tMS = 10 * Math.pow(10, logM - logL); // Gyr

    return { logL, T, tMS, logM };
  }, [mass]);

  const ms = useMemo(() => {
    const pts: string[] = [];
    for (let logM = -1; logM <= 1.75; logM += 0.05) {
      const M = Math.pow(10, logM);
      let logL: number;
      if (M < 0.43) logL = 2.3 * logM + Math.log10(0.23);
      else if (M < 2) logL = 4 * logM;
      else if (M < 55) logL = 3.5 * logM + Math.log10(1.4);
      else logL = logM + Math.log10(32000);
      const T = 5780 * Math.pow(M, 0.505);
      pts.push(`${xForT(T).toFixed(1)},${yForLogL(logL).toFixed(1)}`);
    }
    return pts.join(" ");
  }, []);

  const fmtLife = (gyr: number) => {
    if (gyr >= 1) return `${gyr.toFixed(1)} Gyr`;
    const myr = gyr * 1000;
    if (myr >= 1) return `${myr.toFixed(1)} Myr`;
    return `${(myr * 1000).toFixed(1)} kyr`;
  };

  return (
    <div className="my-4 p-3 rounded-lg border border-border bg-card text-card-foreground">
      <div className="text-sm font-semibold mb-2">Hertzsprung-Russell diagram</div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-auto bg-[#0b1228] rounded-md"
        role="img"
        aria-label="HR diagram with main sequence overlay"
      >
        {/* Region labels */}
        <text x={xForT(15000)} y={yForLogL(5.5)} fill="#a8b6ff" fontSize="9" textAnchor="middle">Supergiants</text>
        <text x={xForT(4000)} y={yForLogL(2.5)} fill="#ff9b6a" fontSize="9" textAnchor="middle">Red giants</text>
        <text x={xForT(8500)} y={yForLogL(-3)} fill="#cfd8ff" fontSize="9" textAnchor="middle">White dwarfs</text>
        <text x={xForT(11000)} y={yForLogL(1.8)} fill="#9ec6ff" fontSize="9" textAnchor="middle" transform={`rotate(-32 ${xForT(11000)} ${yForLogL(1.8)})`}>Main sequence</text>

        {/* Diffuse region clouds */}
        <ellipse cx={xForT(4000)} cy={yForLogL(2.5)} rx={40} ry={28} fill="#ff7a4a" fillOpacity={0.08} />
        <ellipse cx={xForT(15000)} cy={yForLogL(5)} rx={80} ry={20} fill="#9ec6ff" fillOpacity={0.08} />
        <ellipse cx={xForT(8500)} cy={yForLogL(-3)} rx={50} ry={15} fill="#cfd8ff" fillOpacity={0.10} />

        {/* Main sequence band */}
        <polyline
          points={ms}
          fill="none"
          stroke="#9ec6ff"
          strokeWidth={2}
          strokeOpacity={0.55}
        />

        {/* Axes */}
        <line x1={PAD_L} y1={H - PAD_B} x2={W - PAD_R} y2={H - PAD_B} stroke="#444a66" strokeWidth={1} />
        <line x1={PAD_L} y1={PAD_T} x2={PAD_L} y2={H - PAD_B} stroke="#444a66" strokeWidth={1} />

        {/* Y ticks: log L */}
        {[-4, -2, 0, 2, 4, 6].map((logL) => (
          <g key={logL}>
            <line x1={PAD_L - 4} y1={yForLogL(logL)} x2={PAD_L} y2={yForLogL(logL)} stroke="#666" />
            <text x={PAD_L - 6} y={yForLogL(logL) + 3} fill="#9aa3b8" fontSize="9" textAnchor="end">10^{logL}</text>
          </g>
        ))}

        {/* X ticks: spec type bands */}
        {[40000, 20000, 10000, 6000, 4000, 3000].map((t) => (
          <g key={t}>
            <line x1={xForT(t)} y1={H - PAD_B} x2={xForT(t)} y2={H - PAD_B + 4} stroke="#666" />
            <text x={xForT(t)} y={H - PAD_B + 14} fill="#9aa3b8" fontSize="9" textAnchor="middle">{t.toLocaleString()}</text>
            <text x={xForT(t)} y={H - PAD_B + 24} fill={tempColor(t)} fontSize="10" fontWeight={700} textAnchor="middle">{specType(t)}</text>
          </g>
        ))}

        {/* Axis labels */}
        <text x={W / 2} y={H - 4} fill="#cbd1e6" fontSize="10" textAnchor="middle">Temperature (K) ← hotter</text>
        <text x={10} y={H / 2} fill="#cbd1e6" fontSize="10" transform={`rotate(-90 10 ${H / 2})`} textAnchor="middle">Luminosity (L☉)</text>

        {/* Selected star */}
        <circle
          cx={xForT(star.T)}
          cy={yForLogL(star.logL)}
          r={6}
          fill={tempColor(star.T)}
          stroke="#fff"
          strokeWidth={1.5}
        />
        <line
          x1={xForT(star.T)}
          y1={H - PAD_B}
          x2={xForT(star.T)}
          y2={yForLogL(star.logL) + 6}
          stroke={tempColor(star.T)}
          strokeOpacity={0.4}
          strokeDasharray="2,2"
        />
        <line
          x1={PAD_L}
          y1={yForLogL(star.logL)}
          x2={xForT(star.T) - 6}
          y2={yForLogL(star.logL)}
          stroke={tempColor(star.T)}
          strokeOpacity={0.4}
          strokeDasharray="2,2"
        />
      </svg>

      <div className="mt-3 space-y-2">
        <label className="block text-xs font-medium">
          Mass: {mass.toFixed(2)} M☉
          <input
            type="range"
            min={-1}
            max={1.7}
            step={0.01}
            value={Math.log10(mass)}
            onChange={(e) => setIntMass(Math.pow(10, parseFloat(e.target.value)))}
            disabled={ctlMass !== undefined}
            className="w-full mt-1"
            aria-label="Stellar mass (log)"
          />
        </label>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
          <div className="rounded bg-muted/40 p-2">
            <div className="text-muted-foreground">Spectral</div>
            <div className="font-semibold" style={{ color: tempColor(star.T) }}>{specType(star.T)}-type</div>
          </div>
          <div className="rounded bg-muted/40 p-2">
            <div className="text-muted-foreground">T_eff</div>
            <div className="font-semibold">{Math.round(star.T).toLocaleString()} K</div>
          </div>
          <div className="rounded bg-muted/40 p-2">
            <div className="text-muted-foreground">Luminosity</div>
            <div className="font-semibold">{Math.pow(10, star.logL).toFixed(star.logL < 1 ? 3 : 1)} L☉</div>
          </div>
          <div className="rounded bg-muted/40 p-2">
            <div className="text-muted-foreground">MS lifetime</div>
            <div className="font-semibold">{fmtLife(star.tMS)}</div>
          </div>
        </div>
        <div className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground">Endpoint:</span> {endpoint(mass)}
        </div>
      </div>
    </div>
  );
}
