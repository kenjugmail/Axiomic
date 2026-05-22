import { useMemo, useState } from "react";

// Operating-room patient monitor. Three synchronized waveform lanes —
// ECG (lead II), photoplethysmograph (SpO2), capnograph (EtCO2) — plus
// the numeric vitals. Toggling a clinical scenario reshapes both the
// numbers and the traces, the way an anaesthetist reads deterioration.

const W = 460;
const H = 320;

type ScenarioId = "normal" | "tachycardia" | "hypotension" | "desaturation";

interface Scenario {
  label: string;
  hr: number;
  spo2: number;
  sys: number;
  dia: number;
  etco2: number;
  note: string;
}

const SCENARIOS: Record<ScenarioId, Scenario> = {
  normal: { label: "Normal", hr: 72, spo2: 98, sys: 118, dia: 76, etco2: 38, note: "Stable: sinus rhythm, well-oxygenated, normocapnic." },
  tachycardia: { label: "Tachycardia", hr: 148, spo2: 96, sys: 104, dia: 68, etco2: 33, note: "Fast narrow-complex rhythm — pain, hypovolaemia, or light anaesthesia." },
  hypotension: { label: "Hypotension", hr: 96, spo2: 95, sys: 78, dia: 44, etco2: 30, note: "Low MAP + falling EtCO2 — reduced cardiac output / perfusion." },
  desaturation: { label: "Desaturation", hr: 112, spo2: 84, sys: 110, dia: 70, etco2: 51, note: "SpO2 falling, EtCO2 rising — hypoventilation / airway problem." },
};

const ORDER: ScenarioId[] = ["normal", "tachycardia", "hypotension", "desaturation"];

interface Props {
  scenario?: ScenarioId;
}

// Build a repeating waveform polyline across the lane width. `beats`
// controls cycle count (driven by HR); `shape` maps phase 0..1 to a
// normalized amplitude -1..1.
function wave(
  beats: number,
  x0: number,
  laneW: number,
  yMid: number,
  amp: number,
  shape: (phase: number) => number,
): string {
  const N = 240;
  const pts: string[] = [];
  for (let i = 0; i <= N; i++) {
    const u = i / N;
    const phase = (u * beats) % 1;
    const x = x0 + u * laneW;
    const y = yMid - shape(phase) * amp;
    pts.push(`${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`);
  }
  return pts.join(" ");
}

// Stylized ECG PQRST complex over one cycle.
function ecgShape(p: number): number {
  if (p < 0.12) return 0.12 * Math.sin((p / 0.12) * Math.PI); // P
  if (p < 0.18) return 0;
  if (p < 0.21) return -0.18; // Q
  if (p < 0.25) return 1; // R
  if (p < 0.29) return -0.35; // S
  if (p < 0.45) return 0;
  if (p < 0.62) return 0.28 * Math.sin(((p - 0.45) / 0.17) * Math.PI); // T
  return 0;
}

// Plethysmograph: quick upstroke, dicrotic notch, decay.
function plethShape(p: number): number {
  if (p < 0.18) return Math.sin((p / 0.18) * (Math.PI / 2));
  const d = (p - 0.18) / 0.82;
  return Math.max(0, (1 - d) * (1 + 0.18 * Math.sin(d * Math.PI * 2)));
}

// Capnograph: near-zero inspiration, square expiratory plateau.
function capnoShape(p: number): number {
  if (p < 0.45) return 0;
  if (p < 0.55) return (p - 0.45) / 0.1;
  if (p < 0.9) return 1;
  return Math.max(0, 1 - (p - 0.9) / 0.1);
}

export function VitalSignsMonitor({ scenario: ctlScenario }: Props = {}) {
  const [intScenario, setIntScenario] = useState<ScenarioId>("normal");
  const s = ctlScenario ?? intScenario;
  const v = SCENARIOS[s];

  const laneX = 12;
  const laneW = W - 120;
  const lanes = useMemo(() => {
    const beatsEcg = Math.max(3, Math.round(v.hr / 16));
    return {
      ecg: wave(beatsEcg, laneX, laneW, 60, 34, ecgShape),
      pleth: wave(beatsEcg, laneX, laneW, 150, 26, plethShape),
      capno: wave(Math.max(2, Math.round(beatsEcg / 2.5)), laneX, laneW, 240, 30, capnoShape),
    };
  }, [v.hr, laneW]);

  const spo2Low = v.spo2 < 90;
  const mapVal = Math.round((v.sys + 2 * v.dia) / 3);
  const mapLow = mapVal < 65;

  return (
    <div className="my-4 p-3 rounded-lg border border-border bg-card text-card-foreground">
      <div className="flex items-center justify-between mb-2 flex-wrap gap-1">
        <div className="text-sm font-semibold">Patient monitor · {v.label}</div>
        <div className="flex gap-1">
          {ORDER.map((id) => (
            <button
              key={id}
              onClick={() => setIntScenario(id)}
              disabled={ctlScenario !== undefined}
              className={`px-1.5 py-0.5 rounded text-[9px] ${
                s === id
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted hover:bg-accent"
              }`}
            >
              {SCENARIOS[id].label}
            </button>
          ))}
        </div>
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-auto bg-[#05080f] rounded-md"
        role="img"
        aria-label="Patient vital signs monitor"
      >
        {/* lane separators */}
        {[100, 195].map((y) => (
          <line key={y} x1={0} y1={y} x2={W} y2={y} stroke="#1f2937" strokeWidth={0.5} />
        ))}
        <line x1={W - 104} y1={0} x2={W - 104} y2={H} stroke="#1f2937" strokeWidth={0.5} />

        {/* ECG lane */}
        <path d={lanes.ecg} fill="none" stroke="#4ade80" strokeWidth={1.4} />
        <text x={laneX} y={18} fill="#4ade80" fontSize="9">II</text>
        {/* Pleth lane */}
        <path d={lanes.pleth} fill="none" stroke="#38bdf8" strokeWidth={1.4} />
        <text x={laneX} y={114} fill="#38bdf8" fontSize="9">SpO₂ pleth</text>
        {/* Capno lane */}
        <path d={lanes.capno} fill="none" stroke="#facc15" strokeWidth={1.4} />
        <text x={laneX} y={210} fill="#facc15" fontSize="9">CO₂</text>

        {/* Numeric column */}
        <g transform={`translate(${W - 96} 0)`} fontFamily="monospace">
          <text x={0} y={26} fill="#4ade80" fontSize="11">HR</text>
          <text x={92} y={40} fill="#4ade80" fontSize="30" textAnchor="end" fontWeight="bold">{v.hr}</text>
          <text x={0} y={120} fill={spo2Low ? "#f87171" : "#38bdf8"} fontSize="11">SpO₂</text>
          <text x={92} y={134} fill={spo2Low ? "#f87171" : "#38bdf8"} fontSize="30" textAnchor="end" fontWeight="bold">{v.spo2}</text>
          <text x={0} y={214} fill="#facc15" fontSize="11">EtCO₂</text>
          <text x={92} y={228} fill="#facc15" fontSize="30" textAnchor="end" fontWeight="bold">{v.etco2}</text>
          <text x={0} y={292} fill={mapLow ? "#f87171" : "#e5e7eb"} fontSize="11">NIBP</text>
          <text x={92} y={282} fill={mapLow ? "#f87171" : "#e5e7eb"} fontSize="20" textAnchor="end" fontWeight="bold">{v.sys}/{v.dia}</text>
          <text x={92} y={298} fill={mapLow ? "#f87171" : "#9aa3b8"} fontSize="10" textAnchor="end">MAP {mapVal}</text>
        </g>
      </svg>

      <div className="mt-1 text-[10px] text-muted-foreground">
        {v.note} The monitor fuses the ECG (Willem Einthoven, lead II,
        Nobel 1924), the pulse oximeter (Takuo Aoyagi, 1974 — SpO2 from
        red/infrared absorbance), capnography (end-tidal CO2, the
        standard-of-care confirmation of ventilation + tube placement),
        and non-invasive blood pressure. Mean arterial pressure MAP ≈
        (SBP + 2·DBP)/3; below ~65 mmHg organ perfusion is threatened.
        Reading these together — not in isolation — is the core skill of
        intra-operative vigilance (the WHO Surgical Safety Checklist,
        Atul Gawande 2009, formalized the habit).
      </div>
    </div>
  );
}
