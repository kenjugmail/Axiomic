import { useState } from "react";

// The audiogram — audiology's core diagnostic chart. Pure-tone hearing
// thresholds (the softest level a person detects, in dB HL) are plotted
// against frequency, with 0 dB at the TOP so "lower on the chart" means
// "worse hearing". The shaded "speech banana" marks where conversational
// speech sounds fall: a threshold curve dipping below it predicts which
// sounds are missed. Two classic patterns stand out — the 4 kHz "noise
// notch" of noise-induced loss, and the down-sloping high-frequency loss of
// presbycusis (age-related). Severity bands run normal → mild → profound.

const W = 460;
const H = 320;
const FREQS = [250, 500, 1000, 2000, 4000, 8000];

type Pattern = "Normal" | "Noise-induced" | "Presbycusis";
const CURVES: Record<Pattern, number[]> = {
  Normal: [10, 10, 5, 10, 10, 15],
  "Noise-induced": [10, 10, 15, 25, 55, 40],
  Presbycusis: [15, 20, 25, 40, 60, 75],
};
const ORDER: Pattern[] = ["Normal", "Noise-induced", "Presbycusis"];
const SEVERITY = [
  { from: 0, to: 25, label: "normal" },
  { from: 25, to: 40, label: "mild" },
  { from: 40, to: 70, label: "moderate" },
  { from: 70, to: 90, label: "severe" },
  { from: 90, to: 120, label: "profound" },
];

interface Props {
  pattern?: Pattern;
}

export function Audiogram({ pattern: ctl }: Props = {}) {
  const [intPat, setIntPat] = useState<Pattern>("Normal");
  const pat = ctl ?? intPat;
  const curve = CURVES[pat];
  const pta = Math.round((curve[1] + curve[2] + curve[3]) / 3); // 0.5/1/2 kHz avg

  const baseX = 44, top = 30, plotW = W - baseX - 70, plotH = 220;
  const xOf = (i: number) => baseX + (i / (FREQS.length - 1)) * plotW;
  const yOf = (db: number) => top + (db / 120) * plotH;

  // speech banana (soft upper edge, loud lower edge), dB per frequency
  const bananaTop = [30, 25, 20, 20, 25, 35];
  const bananaBot = [48, 55, 55, 52, 55, 58];
  const banana = [
    ...bananaTop.map((db, i) => `${i === 0 ? "M" : "L"}${xOf(i)},${yOf(db)}`),
    ...bananaBot.map((db, i) => `L${xOf(FREQS.length - 1 - i)},${yOf(bananaBot[FREQS.length - 1 - i])}`),
    "Z",
  ].join(" ");

  return (
    <div className="my-4 p-3 rounded-lg border border-border bg-card text-card-foreground">
      <div className="flex items-center justify-between mb-2 flex-wrap gap-1">
        <div className="text-sm font-semibold">{pat} · PTA {pta} dB HL</div>
        <div className="flex gap-1">
          {ORDER.map((p) => (
            <button key={p} onClick={() => setIntPat(p)} disabled={ctl !== undefined}
              className={`px-1.5 py-0.5 rounded text-[9px] ${pat === p ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-accent"}`}>{p}</button>
          ))}
        </div>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto bg-[#0b1228] rounded-md" role="img" aria-label="Audiogram: hearing threshold versus frequency">
        {/* severity bands */}
        {SEVERITY.map((s, i) => (
          <g key={s.label}>
            <rect x={baseX} y={yOf(s.from)} width={plotW} height={yOf(s.to) - yOf(s.from)} fill={i % 2 ? "#0e1a3a" : "#111a33"} opacity={0.6} />
            <text x={baseX + plotW + 4} y={(yOf(s.from) + yOf(s.to)) / 2 + 3} fill="#64748b" fontSize="7.5">{s.label}</text>
          </g>
        ))}
        {/* dB gridlines */}
        {[0, 20, 40, 60, 80, 100, 120].map((db) => (
          <g key={db}><line x1={baseX} y1={yOf(db)} x2={baseX + plotW} y2={yOf(db)} stroke="#1f2937" strokeWidth={0.3} /><text x={baseX - 5} y={yOf(db) + 3} fill="#9aa3b8" fontSize="7.5" textAnchor="end">{db}</text></g>
        ))}
        {/* frequency labels */}
        {FREQS.map((f, i) => (<text key={f} x={xOf(i)} y={top - 8} fill="#9aa3b8" fontSize="7.5" textAnchor="middle">{f >= 1000 ? `${f / 1000}k` : f}</text>))}
        <text x={baseX + plotW / 2} y={top - 20} fill="#cbd1e6" fontSize="9" textAnchor="middle">frequency (Hz)</text>
        <text x={14} y={top + plotH / 2} fill="#cbd1e6" fontSize="9" textAnchor="middle" transform={`rotate(-90 14 ${top + plotH / 2})`}>hearing level (dB HL)</text>

        {/* speech banana */}
        <path d={banana} fill="#fbbf24" opacity={0.14} stroke="#fbbf24" strokeWidth={0.5} strokeDasharray="3,2" />
        <text x={xOf(2)} y={yOf(40)} fill="#fbbf24" fontSize="8" textAnchor="middle" opacity={0.8}>speech</text>

        {/* threshold curve */}
        <path d={curve.map((db, i) => `${i === 0 ? "M" : "L"}${xOf(i)},${yOf(db)}`).join(" ")} fill="none" stroke="#38bdf8" strokeWidth={2} />
        {curve.map((db, i) => (
          <circle key={i} cx={xOf(i)} cy={yOf(db)} r={4} fill="none" stroke="#38bdf8" strokeWidth={1.6} />
        ))}
      </svg>

      <div className="mt-1 text-[10px] text-muted-foreground">
        Thresholds are charted with <b>0 dB HL at the top</b>, so a curve that
        sinks lower means worse hearing. The shaded <b>speech banana</b> is
        where everyday speech energy lives — a threshold below it means those
        sounds are inaudible. <b>Noise-induced</b> loss carves a
        characteristic <b>4 kHz notch</b>; <b>presbycusis</b> slopes down at
        high frequencies (consonants go first). The pure-tone average (PTA)
        over 0.5/1/2 kHz summarizes severity, as on Carhart's clinical charts.
      </div>
    </div>
  );
}
