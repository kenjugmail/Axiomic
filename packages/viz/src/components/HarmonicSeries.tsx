import { useMemo, useState } from "react";

// Harmonic series visualization for a sustained tone. Fundamental
// frequency f₀; partials at n·f₀ for n = 1...N. Show the spectrum
// (relative amplitudes) and which Western-tonal pitches the partials
// most closely match. Highlights why integer ratios sound consonant
// and why equal temperament involves slight detuning vs just intonation.

const W = 460;
const H = 320;

interface Props {
  fundamental?: number; // Hz
  harmonics?: number;
}

// Approximate amplitude weights for canonical timbres (relative)
const TIMBRES: Record<string, number[]> = {
  sine: [1],
  triangle: [1, 0, 1 / 9, 0, 1 / 25, 0, 1 / 49, 0, 1 / 81, 0, 1 / 121, 0, 1 / 169, 0, 1 / 225, 0],
  square: [1, 0, 1 / 3, 0, 1 / 5, 0, 1 / 7, 0, 1 / 9, 0, 1 / 11, 0, 1 / 13, 0, 1 / 15, 0],
  sawtooth: [1, 0.5, 0.333, 0.25, 0.2, 0.166, 0.142, 0.125, 0.111, 0.1, 0.09, 0.083, 0.077, 0.071, 0.066, 0.062],
  string: [1, 0.8, 0.5, 0.3, 0.25, 0.18, 0.12, 0.1, 0.08, 0.07, 0.06, 0.05, 0.04, 0.035, 0.03, 0.025],
  clarinet: [1, 0.1, 0.85, 0.05, 0.7, 0.05, 0.6, 0.05, 0.45, 0.05, 0.3, 0.05, 0.2, 0.05, 0.12, 0.05],
};

// Just-intonation ratios for first 16 partials, mapped to nearest
// equal-tempered pitch class (cents deviation).
const PARTIAL_NAMES = [
  { label: "1·f₀ root", deviation: 0 },
  { label: "2·f₀ octave", deviation: 0 },
  { label: "3·f₀ 5th", deviation: +2 },
  { label: "4·f₀ octave", deviation: 0 },
  { label: "5·f₀ maj 3rd", deviation: -14 },
  { label: "6·f₀ 5th", deviation: +2 },
  { label: "7·f₀ ~b7", deviation: -31 },
  { label: "8·f₀ octave", deviation: 0 },
  { label: "9·f₀ maj 2nd", deviation: +4 },
  { label: "10·f₀ maj 3rd", deviation: -14 },
  { label: "11·f₀ ~tritone", deviation: -49 },
  { label: "12·f₀ 5th", deviation: +2 },
  { label: "13·f₀ ~min 6th", deviation: +41 },
  { label: "14·f₀ ~b7", deviation: -31 },
  { label: "15·f₀ maj 7th", deviation: -12 },
  { label: "16·f₀ octave", deviation: 0 },
];

export function HarmonicSeries({ fundamental: ctlFund, harmonics: ctlH }: Props = {}) {
  const [intFund, setIntFund] = useState(110);
  const [intH, setIntH] = useState(8);
  const [timbre, setTimbre] = useState<keyof typeof TIMBRES>("string");
  const f0 = ctlFund ?? intFund;
  const N = ctlH ?? intH;

  const partials = useMemo(() => {
    const weights = TIMBRES[timbre];
    return Array.from({ length: N }, (_, i) => ({
      n: i + 1,
      freq: f0 * (i + 1),
      amp: weights[i] ?? 0,
      info: PARTIAL_NAMES[i] ?? { label: `${i + 1}·f₀`, deviation: 0 },
    }));
  }, [f0, N, timbre]);

  const maxAmp = Math.max(...partials.map((p) => p.amp), 0.01);
  const maxFreq = f0 * N;

  // Construct combined waveform y(t) = Σ wᵢ sin(2π·n·f₀·t) — sample one period of f₀
  const wave = useMemo(() => {
    const samples = 240;
    const period = 1 / f0;
    const points: Array<{ t: number; y: number }> = [];
    for (let i = 0; i <= samples; i++) {
      const t = (i / samples) * 2 * period; // show 2 periods
      let y = 0;
      for (const p of partials) {
        y += p.amp * Math.sin(2 * Math.PI * p.freq * t);
      }
      points.push({ t, y });
    }
    return points;
  }, [partials, f0]);

  const yMax = Math.max(...wave.map((p) => Math.abs(p.y)), 1);

  const baseX = 36;
  const baseY = 16;
  const plotW = W - baseX - 16;
  const plotH = (H - baseY - 100) / 2;
  const xOfFreq = (f: number) => baseX + (f / maxFreq) * plotW;
  const yOfAmp = (a: number) => baseY + plotH - (a / maxAmp) * plotH;
  const xOfT = (t: number) => baseX + (t / (2 / f0)) * plotW;
  const yOfWave = (y: number) => baseY + plotH + 30 + plotH - ((y / yMax + 1) / 2) * plotH * 0.95;

  return (
    <div className="my-4 p-3 rounded-lg border border-border bg-card text-card-foreground">
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-semibold">Harmonic series · f₀ = {f0} Hz · {N} partials · {timbre} timbre</div>
        <div className="flex gap-1">
          {(Object.keys(TIMBRES) as Array<keyof typeof TIMBRES>).map((t) => (
            <button key={t} onClick={() => setTimbre(t)} className={`px-1.5 py-0.5 rounded text-[9px] ${timbre === t ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-accent"}`}>{t}</button>
          ))}
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto bg-[#0b1228] rounded-md" role="img" aria-label="Harmonic series">
        {/* Spectrum */}
        <text x={baseX} y={baseY - 4} fill="#9aa3b8" fontSize="9">spectrum (relative amplitude)</text>
        {partials.map((p) => (
          <g key={p.n}>
            <line x1={xOfFreq(p.freq)} y1={baseY + plotH} x2={xOfFreq(p.freq)} y2={yOfAmp(p.amp)} stroke="#4ecdc4" strokeWidth={2} />
            <circle cx={xOfFreq(p.freq)} cy={yOfAmp(p.amp)} r={3} fill={Math.abs(p.info.deviation) > 20 ? "#ff6b6b" : "#4ecdc4"} />
            {p.n <= 8 && <text x={xOfFreq(p.freq)} y={baseY + plotH + 12} fill="#9aa3b8" fontSize="7" textAnchor="middle">{p.n}</text>}
          </g>
        ))}
        {/* Waveform */}
        <text x={baseX} y={baseY + plotH + 28} fill="#9aa3b8" fontSize="9">combined waveform (2 periods)</text>
        <line x1={baseX} y1={yOfWave(0)} x2={baseX + plotW} y2={yOfWave(0)} stroke="#1f2937" strokeWidth={0.3} />
        <path d={wave.map((p, i) => `${i === 0 ? "M" : "L"}${xOfT(p.t).toFixed(1)},${yOfWave(p.y).toFixed(1)}`).join(" ")} fill="none" stroke="#fbbf24" strokeWidth={1.5} />
      </svg>

      <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
        <label className="block">f₀: {f0} Hz
          <input type="range" min={55} max={440} step={5} value={f0} onChange={(e) => setIntFund(parseInt(e.target.value))} disabled={ctlFund !== undefined} className="w-full mt-0.5" aria-label="Fundamental" />
        </label>
        <label className="block">partials: {N}
          <input type="range" min={1} max={16} step={1} value={N} onChange={(e) => setIntH(parseInt(e.target.value))} disabled={ctlH !== undefined} className="w-full mt-0.5" aria-label="Harmonics" />
        </label>
      </div>
      <div className="mt-2 text-[10px] text-muted-foreground">
        A vibrating string or air column produces an integer series
        of partials nf₀ — the overtone series. Their relative
        amplitudes determine timbre (Helmholtz 1863); a string is
        rich in low partials, a clarinet (closed pipe) has mostly
        odd harmonics + a hollow quality. Western tonal harmony's
        consonant intervals — octave (2:1), perfect fifth (3:2),
        major third (5:4) — coincide with the lowest partials,
        which Pythagoras noted ~530 BCE. Twelve-tone equal temperament
        (J.S. Bach's WTC era) deliberately detunes pure intervals so
        all 12 keys are equally usable: the equal-tempered fifth is
        ~2¢ flat, major third 14¢ sharp. Red dots flag partials &gt;20¢
        from the nearest equal-tempered pitch (e.g. the 7th harmonic
        is the "blue note" b7 in jazz/blues).
      </div>
    </div>
  );
}
