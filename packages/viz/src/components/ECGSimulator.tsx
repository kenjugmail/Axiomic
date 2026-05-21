import { useMemo, useState } from "react";

// Interactive ECG simulator. Synthetic PQRST waveform built from
// Gaussian components per beat; sliders modify heart rate, P-R
// interval (relevant for AV block grading), ST-segment offset
// (relevant for STEMI/ischemia), T-wave inversion (ischemia), +
// AV-block degree (none / 1st / 2nd / 3rd). Auto-labels the
// clinical signature based on parameter values.
//
// Modeling approach (simplified McSharry 2003): each PQRST is sum
// of Gaussians:
//   V(t) = ∑_i A_i exp(-(t - t_offset_i)² / (2 σ_i²))
// with time offsets + amplitudes + widths chosen to give a
// readable normal sinus rhythm at baseline. T-wave inversion
// flips its sign; ST elevation lifts the segment between S + T.
// 2nd-degree AV block drops every 3rd QRS; 3rd-degree generates
// independent P + QRS rates.

const W = 460;
const H = 220;
const PAD_L = 14;
const PAD_R = 14;
const PAD_T = 14;
const PAD_B = 14;
const SECONDS = 4;
const POINTS_PER_SEC = 250;

interface BeatParams {
  hr: number; // bpm
  prMs: number; // ms
  stMm: number; // mV equivalent (0 = isoelectric)
  tInverted: boolean;
  blockDegree: 0 | 1 | 2 | 3;
}

function pqrstWaveform(tSinceR: number, params: BeatParams): number {
  // Time relative to the R-wave peak (centerpoint of QRS).
  // Components:
  //   P:   center -180 ms (default; modulated by P-R interval), amp 0.15, σ 25 ms
  //   Q:   center  -30 ms, amp -0.15, σ 8 ms
  //   R:   center    0 ms, amp 1.20,  σ 12 ms
  //   S:   center  +30 ms, amp -0.30, σ 10 ms
  //   T:   center +200 ms, amp 0.30,  σ 50 ms (inverted if tInverted)
  // ST-segment offset: add params.stMm * smooth-step from S to T.
  const t = tSinceR; // seconds
  const ms = t * 1000;

  const pCenter = -params.prMs; // P-wave center, ms
  const components: { center: number; amp: number; sigma: number }[] = [
    { center: pCenter, amp: 0.15, sigma: 25 },
    { center: -30, amp: -0.15, sigma: 8 },
    { center: 0, amp: 1.2, sigma: 12 },
    { center: 30, amp: -0.30, sigma: 10 },
    { center: 200, amp: params.tInverted ? -0.30 : 0.30, sigma: 50 },
  ];

  let v = 0;
  for (const c of components) {
    const dx = ms - c.center;
    v += c.amp * Math.exp(-(dx * dx) / (2 * c.sigma * c.sigma));
  }

  // ST elevation: lift the segment from ~40 to 160 ms (between S + T).
  if (ms >= 40 && ms <= 180) {
    const x = (ms - 40) / 140; // 0..1
    const window = 4 * x * (1 - x); // smooth bump 0..1..0
    v += (params.stMm / 5) * window; // 5 mm ST elevation → +1.0 mV bump
  }

  return v;
}

function clinicalLabel(params: BeatParams): { label: string; color: string } {
  if (params.blockDegree === 3) return { label: "3°-AV BLOCK (complete)", color: "#ff4040" };
  if (params.blockDegree === 2) return { label: "2°-AV BLOCK (Mobitz)", color: "#ff7a4a" };
  if (params.blockDegree === 1) return { label: "1°-AV block (PR > 200 ms)", color: "#ffd166" };
  if (params.stMm >= 2) return { label: "STEMI (ST elevation)", color: "#ff4040" };
  if (params.stMm <= -1) return { label: "Ischemia (ST depression)", color: "#ff9b6a" };
  if (params.tInverted) return { label: "T-wave inversion (ischemia)", color: "#ffd166" };
  if (params.hr > 100) return { label: `Sinus tachycardia (${params.hr} bpm)`, color: "#ff9b6a" };
  if (params.hr < 60) return { label: `Sinus bradycardia (${params.hr} bpm)`, color: "#7bcbff" };
  return { label: "Normal sinus rhythm", color: "#aaffbf" };
}

export function ECGSimulator(props: Partial<BeatParams> = {}) {
  const [intHr, setIntHr] = useState(72);
  const [intPr, setIntPr] = useState(160);
  const [intSt, setIntSt] = useState(0);
  const [intInv, setIntInv] = useState(false);
  const [intBlock, setIntBlock] = useState<0 | 1 | 2 | 3>(0);

  const params: BeatParams = {
    hr: props.hr ?? intHr,
    prMs: props.prMs ?? intPr,
    stMm: props.stMm ?? intSt,
    tInverted: props.tInverted ?? intInv,
    blockDegree: props.blockDegree ?? intBlock,
  };

  const trace = useMemo(() => {
    const npts = SECONDS * POINTS_PER_SEC;
    const out = new Float32Array(npts);
    const beatPeriod = 60 / params.hr;
    const atrialPeriod = beatPeriod;
    const ventricularPeriod = params.blockDegree === 3 ? beatPeriod * 2.1 : beatPeriod;
    const beatStart = beatPeriod * 0.4; // first R-peak offset

    // Build R-peak (ventricular) times
    const rTimes: number[] = [];
    {
      let t = beatStart;
      let beatIndex = 0;
      while (t < SECONDS + beatPeriod) {
        if (params.blockDegree === 2 && beatIndex % 3 === 2) {
          // skip every 3rd ventricular beat (Mobitz)
        } else {
          rTimes.push(t);
        }
        t += ventricularPeriod;
        beatIndex++;
      }
    }

    // For 3°-AV block, P-waves independent of QRS
    const pTimes: number[] | null = params.blockDegree === 3 ? [] : null;
    if (pTimes) {
      let t = beatStart - params.prMs / 1000;
      while (t < SECONDS + atrialPeriod) {
        pTimes.push(t);
        t += atrialPeriod;
      }
    }

    for (let i = 0; i < npts; i++) {
      const t = i / POINTS_PER_SEC;
      let v = 0;
      // Sum contributions from nearest R-peaks (±0.5 s window)
      for (const tR of rTimes) {
        const dt = t - tR;
        if (Math.abs(dt) > 0.5) continue;
        v += pqrstWaveform(dt, params);
      }
      // For 3°-AV block, additionally add independent P-waves
      if (pTimes) {
        for (const tP of pTimes) {
          const dt = (t - tP) * 1000; // ms relative to P-wave center
          if (Math.abs(dt) > 100) continue;
          v += 0.15 * Math.exp(-(dt * dt) / (2 * 25 * 25));
        }
      }
      out[i] = v;
    }
    return out;
  }, [params]);

  const xFor = (i: number) => PAD_L + (i / (SECONDS * POINTS_PER_SEC)) * (W - PAD_L - PAD_R);
  const yFor = (v: number) => PAD_T + (1 - (v + 0.6) / 2.2) * (H - PAD_T - PAD_B);

  const path = useMemo(() => {
    let d = "";
    for (let i = 0; i < trace.length; i++) {
      const x = xFor(i);
      const y = yFor(trace[i]);
      d += i === 0 ? `M ${x.toFixed(1)} ${y.toFixed(1)}` : ` L ${x.toFixed(1)} ${y.toFixed(1)}`;
    }
    return d;
  }, [trace]);

  const status = clinicalLabel(params);

  return (
    <div className="my-4 p-3 rounded-lg border border-border bg-card text-card-foreground">
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-semibold">ECG simulator (Lead II)</div>
        <div className="text-xs font-mono px-2 py-0.5 rounded" style={{ color: status.color, border: `1px solid ${status.color}` }}>
          {status.label}
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto bg-[#0b1228] rounded-md" role="img" aria-label="Simulated ECG trace">
        {/* ECG grid: 5 mm × 5 mm boxes (background) */}
        {Array.from({ length: 40 }).map((_, i) => (
          <line key={`gv-${i}`} x1={PAD_L + i * 12} y1={PAD_T} x2={PAD_L + i * 12} y2={H - PAD_B} stroke="#1a2a4a" strokeWidth={0.5} />
        ))}
        {Array.from({ length: 10 }).map((_, i) => (
          <line key={`gh-${i}`} x1={PAD_L} y1={PAD_T + i * 20} x2={W - PAD_R} y2={PAD_T + i * 20} stroke="#1a2a4a" strokeWidth={0.5} />
        ))}
        {/* Baseline */}
        <line x1={PAD_L} y1={yFor(0)} x2={W - PAD_R} y2={yFor(0)} stroke="#3a4a6a" strokeDasharray="2,3" />

        <path d={path} fill="none" stroke={status.color} strokeWidth={1.5} />
      </svg>

      <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
        <label className="block">
          Heart rate: {params.hr} bpm
          <input type="range" min={30} max={180} step={1} value={params.hr} onChange={(e) => setIntHr(parseInt(e.target.value, 10))} disabled={props.hr !== undefined} className="w-full mt-0.5" aria-label="Heart rate" />
        </label>
        <label className="block">
          P-R interval: {params.prMs} ms
          <input type="range" min={100} max={350} step={5} value={params.prMs} onChange={(e) => setIntPr(parseInt(e.target.value, 10))} disabled={props.prMs !== undefined} className="w-full mt-0.5" aria-label="P-R interval" />
        </label>
        <label className="block">
          ST offset: {params.stMm.toFixed(1)} mm
          <input type="range" min={-3} max={5} step={0.1} value={params.stMm} onChange={(e) => setIntSt(parseFloat(e.target.value))} disabled={props.stMm !== undefined} className="w-full mt-0.5" aria-label="ST segment offset" />
        </label>
        <label className="flex items-center gap-2 mt-4">
          <input type="checkbox" checked={params.tInverted} onChange={(e) => setIntInv(e.target.checked)} disabled={props.tInverted !== undefined} />
          T-wave inverted
        </label>
        <label className="block col-span-2">
          AV block degree: {params.blockDegree === 0 ? "none" : `${params.blockDegree}°`}
          <div className="flex gap-1 mt-0.5">
            {([0, 1, 2, 3] as const).map((d) => (
              <button
                key={d}
                onClick={() => setIntBlock(d)}
                disabled={props.blockDegree !== undefined}
                className={`flex-1 px-2 py-1 rounded text-xs ${params.blockDegree === d ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-accent"} disabled:opacity-50`}
              >
                {d === 0 ? "none" : `${d}°`}
              </button>
            ))}
          </div>
        </label>
      </div>

      <div className="mt-2 text-[10px] text-muted-foreground">
        Lead II (frontal-plane, LA-RA axis): canonical for rhythm. Normal P-R 120-200 ms; QRS &lt;120 ms; ST isoelectric. 1°-AV block: P-R &gt;200 ms. 2°-Mobitz: dropped QRS. 3°-complete: P + QRS independent. ST elevation &gt;1-2 mm in contiguous leads = STEMI. T-wave inversion = ischemia.
      </div>
    </div>
  );
}
