import { useMemo, useState } from "react";

// Hodgkin-Huxley action potential. Solves the canonical 1952 ODE system
// for V(t), m(t), h(t), n(t) in a squid-giant-axon membrane patch driven
// by an external current pulse. Voltage-gated Na+ activation (m) +
// inactivation (h) + K+ delayed rectifier (n) reproduce depolarization,
// peak, repolarization, after-hyperpolarization. Hodgkin + Huxley 1952
// J Physiol; Nobel 1963 (with Eccles). Forward Euler on a coarse
// timestep is enough for qualitative behavior; production codes use
// adaptive solvers.

const W = 460;
const H = 280;

interface Props {
  iStim?: number;       // µA/cm^2 stimulus amplitude during pulse window
  gNaMax?: number;      // mS/cm^2 max Na conductance
  gKMax?: number;       // mS/cm^2 max K conductance
  gL?: number;          // mS/cm^2 leak conductance
}

// Standard HH parameters (squid giant axon, T=6.3°C, V in mV).
const ENa = 50;
const EK = -77;
const EL = -54.4;
const Cm = 1;

function alphaN(V: number) { return Math.abs(V + 55) < 1e-6 ? 0.1 : 0.01 * (V + 55) / (1 - Math.exp(-(V + 55) / 10)); }
function betaN(V: number)  { return 0.125 * Math.exp(-(V + 65) / 80); }
function alphaM(V: number) { return Math.abs(V + 40) < 1e-6 ? 1.0 : 0.1 * (V + 40) / (1 - Math.exp(-(V + 40) / 10)); }
function betaM(V: number)  { return 4.0 * Math.exp(-(V + 65) / 18); }
function alphaH(V: number) { return 0.07 * Math.exp(-(V + 65) / 20); }
function betaH(V: number)  { return 1.0 / (1 + Math.exp(-(V + 35) / 10)); }

function simulate(iStim: number, gNaMax: number, gKMax: number, gL: number) {
  const dt = 0.025;       // ms
  const tEnd = 50;        // ms
  const steps = Math.floor(tEnd / dt);
  const V: number[] = new Array(steps);
  const M: number[] = new Array(steps);
  const Hh: number[] = new Array(steps);
  const N: number[] = new Array(steps);
  // Initial state: rest
  let v = -65;
  let m = alphaM(v) / (alphaM(v) + betaM(v));
  let h = alphaH(v) / (alphaH(v) + betaH(v));
  let n = alphaN(v) / (alphaN(v) + betaN(v));
  for (let i = 0; i < steps; i++) {
    const t = i * dt;
    const I = (t > 5 && t < 6) ? iStim : 0; // 1-ms current pulse
    const iNa = gNaMax * m * m * m * h * (v - ENa);
    const iK = gKMax * n * n * n * n * (v - EK);
    const iLeak = gL * (v - EL);
    const dv = (I - iNa - iK - iLeak) / Cm;
    v += dv * dt;
    m += (alphaM(v) * (1 - m) - betaM(v) * m) * dt;
    h += (alphaH(v) * (1 - h) - betaH(v) * h) * dt;
    n += (alphaN(v) * (1 - n) - betaN(v) * n) * dt;
    V[i] = v;
    M[i] = m;
    Hh[i] = h;
    N[i] = n;
  }
  return { V, M, H: Hh, N, dt, steps };
}

export function HodgkinHuxleyAP({ iStim: ctlI, gNaMax: ctlGNa, gKMax: ctlGK, gL: ctlGL }: Props = {}) {
  const [intI, setIntI] = useState(20);
  const [intGNa, setIntGNa] = useState(120);
  const [intGK, setIntGK] = useState(36);
  const [intGL, setIntGL] = useState(0.3);
  const iStim = ctlI ?? intI;
  const gNaMax = ctlGNa ?? intGNa;
  const gKMax = ctlGK ?? intGK;
  const gL = ctlGL ?? intGL;

  const sim = useMemo(() => simulate(iStim, gNaMax, gKMax, gL), [iStim, gNaMax, gKMax, gL]);

  const baseX = 40;
  const baseY = 20;
  const plotW = W - 60;
  const plotH = H - 80;
  const vMin = -90;
  const vMax = 60;
  const xOf = (i: number) => baseX + (i / sim.steps) * plotW;
  const yOf = (v: number) => baseY + ((vMax - v) / (vMax - vMin)) * plotH;

  // Build SVG paths
  const pathV = sim.V.map((v, i) => `${i === 0 ? "M" : "L"}${xOf(i).toFixed(2)},${yOf(v).toFixed(2)}`).join(" ");
  // Gating variables scaled to right axis 0..1
  const gateY = (x: number) => baseY + (1 - x) * plotH;
  const pathM = sim.M.map((x, i) => `${i === 0 ? "M" : "L"}${xOf(i).toFixed(2)},${gateY(x).toFixed(2)}`).join(" ");
  const pathH = sim.H.map((x, i) => `${i === 0 ? "M" : "L"}${xOf(i).toFixed(2)},${gateY(x).toFixed(2)}`).join(" ");
  const pathN = sim.N.map((x, i) => `${i === 0 ? "M" : "L"}${xOf(i).toFixed(2)},${gateY(x).toFixed(2)}`).join(" ");

  const peakV = Math.max(...sim.V);
  const fired = peakV > 0;

  return (
    <div className="my-4 p-3 rounded-lg border border-border bg-card text-card-foreground">
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-semibold">Hodgkin-Huxley · peak V = {peakV.toFixed(1)} mV · {fired ? "spike ✓" : "subthreshold ✗"}</div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto bg-[#0b1228] rounded-md" role="img" aria-label="Hodgkin-Huxley action potential">
        <rect x={baseX} y={baseY} width={plotW} height={plotH} fill="none" stroke="#475569" strokeWidth={0.5} />
        {/* V axis ticks */}
        {[-80, -40, 0, 40].map((v) => (
          <g key={`vt-${v}`}>
            <line x1={baseX} y1={yOf(v)} x2={baseX + plotW} y2={yOf(v)} stroke="#1f2937" strokeWidth={0.5} />
            <text x={baseX - 4} y={yOf(v) + 3} fill="#9aa3b8" fontSize="8" textAnchor="end">{v}</text>
          </g>
        ))}
        {/* Stimulus marker */}
        <rect x={xOf(5 / sim.dt)} y={baseY} width={xOf(6 / sim.dt) - xOf(5 / sim.dt)} height={plotH} fill="#fbbf24" opacity={0.1} />
        <text x={xOf(5.5 / sim.dt)} y={baseY + 9} fill="#fbbf24" fontSize="8" textAnchor="middle">I</text>
        {/* V(t) */}
        <path d={pathV} fill="none" stroke="#ff6b6b" strokeWidth={1.8} />
        {/* Gating m, h, n */}
        <path d={pathM} fill="none" stroke="#4ecdc4" strokeWidth={1} opacity={0.85} />
        <path d={pathH} fill="none" stroke="#a78bfa" strokeWidth={1} opacity={0.85} />
        <path d={pathN} fill="none" stroke="#fbbf24" strokeWidth={1} opacity={0.85} />
        {/* Legend */}
        <text x={baseX + plotW - 80} y={baseY + 10} fill="#ff6b6b" fontSize="9">V (mV)</text>
        <text x={baseX + plotW - 80} y={baseY + 22} fill="#4ecdc4" fontSize="9">m (Na act)</text>
        <text x={baseX + plotW - 80} y={baseY + 34} fill="#a78bfa" fontSize="9">h (Na inact)</text>
        <text x={baseX + plotW - 80} y={baseY + 46} fill="#fbbf24" fontSize="9">n (K)</text>
        <text x={baseX + plotW / 2} y={baseY + plotH + 16} fill="#cbd1e6" fontSize="9" textAnchor="middle">time (ms, 0-50)</text>
      </svg>

      <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
        <label className="block">Stimulus I: {iStim} µA/cm²
          <input type="range" min={0} max={40} step={1} value={iStim} onChange={(e) => setIntI(parseFloat(e.target.value))} disabled={ctlI !== undefined} className="w-full mt-0.5" aria-label="Stimulus current" />
        </label>
        <label className="block">ḡNa: {gNaMax} mS/cm²
          <input type="range" min={0} max={200} step={5} value={gNaMax} onChange={(e) => setIntGNa(parseFloat(e.target.value))} disabled={ctlGNa !== undefined} className="w-full mt-0.5" aria-label="Na max conductance" />
        </label>
        <label className="block">ḡK: {gKMax} mS/cm²
          <input type="range" min={0} max={80} step={1} value={gKMax} onChange={(e) => setIntGK(parseFloat(e.target.value))} disabled={ctlGK !== undefined} className="w-full mt-0.5" aria-label="K max conductance" />
        </label>
        <label className="block">ḡL: {gL.toFixed(2)} mS/cm²
          <input type="range" min={0} max={2} step={0.05} value={gL} onChange={(e) => setIntGL(parseFloat(e.target.value))} disabled={ctlGL !== undefined} className="w-full mt-0.5" aria-label="Leak conductance" />
        </label>
      </div>
      <div className="mt-2 text-[10px] text-muted-foreground">
        Hodgkin-Huxley (1952 J Physiol; Nobel 1963 with Eccles) — voltage-clamp on the squid giant
        axon resolved Na⁺ (fast activation m³, slow inactivation h) and K⁺ (delayed rectifier n⁴)
        conductances. The 4-variable ODE system reproduces threshold, all-or-none spike, refractory
        period, repetitive firing. Modern channel diversity (Kv1-12, Cav1-3, HCN, KCa, leak K2P) +
        morphology is layered on this skeleton. Forward Euler dt = 0.025 ms here; the 1-ms current
        pulse at t=5 ms triggers a spike when I exceeds threshold ~6.5 µA/cm². Block Na (ḡNa → 0)
        = no spike (TTX). Block K (ḡK → 0) = prolonged depolarization (TEA).
      </div>
    </div>
  );
}
