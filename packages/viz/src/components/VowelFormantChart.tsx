import { useMemo, useState } from "react";

// Interactive IPA vowel chart in F1 (height) vs F2 (backness) space.
// F1 on Y-axis (inverted: low F1 = top = close vowel /i, u/).
// F2 on X-axis (inverted: high F2 = left = front vowel /i, e, ɛ/).
// Overlay multiple language inventories: English, Spanish, French,
// Mandarin, Arabic. Reveal language-specific vowel-space partitioning
// + the universality of cardinal-vowel positions.

const W = 460;
const H = 320;
const PAD_L = 60;
const PAD_R = 16;
const PAD_T = 30;
const PAD_B = 40;

// F1 range (Hz): low vowels have HIGH F1 (~700-800); close vowels LOW (~250-300).
const F1_MIN = 200;
const F1_MAX = 850;
// F2 range (Hz): front vowels have HIGH F2 (~2200-2400); back vowels LOW (~600-900).
const F2_MIN = 600;
const F2_MAX = 2500;

type Vowel = {
  ipa: string;
  F1: number;
  F2: number;
  example?: string;
};

// Reference adult-male formant centers (Peterson + Barney 1952 + later;
// approximate; rounding to nearest 10 Hz).
const ENGLISH: Vowel[] = [
  { ipa: "i", F1: 270, F2: 2290, example: "beet" },
  { ipa: "ɪ", F1: 390, F2: 1990, example: "bit" },
  { ipa: "ɛ", F1: 530, F2: 1840, example: "bet" },
  { ipa: "æ", F1: 660, F2: 1720, example: "bat" },
  { ipa: "ɑ", F1: 730, F2: 1090, example: "father" },
  { ipa: "ɔ", F1: 570, F2: 840, example: "bought" },
  { ipa: "ʊ", F1: 440, F2: 1020, example: "book" },
  { ipa: "u", F1: 300, F2: 870, example: "boot" },
  { ipa: "ʌ", F1: 640, F2: 1190, example: "but" },
  { ipa: "ə", F1: 500, F2: 1500, example: "about" },
];

const SPANISH: Vowel[] = [
  { ipa: "i", F1: 300, F2: 2200, example: "pi" },
  { ipa: "e", F1: 450, F2: 2000, example: "pe" },
  { ipa: "a", F1: 700, F2: 1300, example: "pa" },
  { ipa: "o", F1: 470, F2: 950, example: "po" },
  { ipa: "u", F1: 320, F2: 800, example: "pu" },
];

const FRENCH: Vowel[] = [
  { ipa: "i", F1: 280, F2: 2350, example: "si" },
  { ipa: "y", F1: 290, F2: 1900, example: "su" },
  { ipa: "e", F1: 380, F2: 2100, example: "thé" },
  { ipa: "ø", F1: 400, F2: 1500, example: "deux" },
  { ipa: "ɛ", F1: 530, F2: 1900, example: "père" },
  { ipa: "œ", F1: 550, F2: 1400, example: "sœur" },
  { ipa: "a", F1: 720, F2: 1300, example: "patte" },
  { ipa: "ɑ̃", F1: 600, F2: 1100, example: "an" },
  { ipa: "ɔ", F1: 540, F2: 900, example: "fort" },
  { ipa: "o", F1: 380, F2: 850, example: "beau" },
  { ipa: "u", F1: 280, F2: 800, example: "tout" },
];

const MANDARIN: Vowel[] = [
  { ipa: "i", F1: 290, F2: 2300, example: "yī (one)" },
  { ipa: "y", F1: 300, F2: 1850, example: "yú (fish)" },
  { ipa: "ɤ", F1: 500, F2: 1300, example: "è (hungry)" },
  { ipa: "a", F1: 750, F2: 1300, example: "ā" },
  { ipa: "u", F1: 320, F2: 800, example: "wǔ (five)" },
];

const ARABIC: Vowel[] = [
  { ipa: "i", F1: 320, F2: 2200, example: "ī" },
  { ipa: "a", F1: 700, F2: 1400, example: "ā" },
  { ipa: "u", F1: 340, F2: 900, example: "ū" },
];

type LangKey = "english" | "spanish" | "french" | "mandarin" | "arabic";
const LANGS: Record<LangKey, { name: string; color: string; vowels: Vowel[] }> = {
  english: { name: "English", color: "#7bcbff", vowels: ENGLISH },
  spanish: { name: "Spanish", color: "#ffd166", vowels: SPANISH },
  french: { name: "French", color: "#ff9b6a", vowels: FRENCH },
  mandarin: { name: "Mandarin", color: "#aaffbf", vowels: MANDARIN },
  arabic: { name: "Arabic", color: "#ff7a7a", vowels: ARABIC },
};

interface Props {
  showLanguages?: LangKey[];
}

export function VowelFormantChart({ showLanguages: ctlShow }: Props = {}) {
  const [intShow, setIntShow] = useState<Set<LangKey>>(new Set(["english"]));
  const [hovered, setHovered] = useState<{ v: Vowel; lang: LangKey } | null>(null);

  const show = useMemo(() => {
    if (ctlShow) return new Set<LangKey>(ctlShow);
    return intShow;
  }, [ctlShow, intShow]);

  // Inverted axes: high F2 → left, low F1 → top
  const xFor = (f2: number) => PAD_L + ((F2_MAX - f2) / (F2_MAX - F2_MIN)) * (W - PAD_L - PAD_R);
  const yFor = (f1: number) => PAD_T + ((f1 - F1_MIN) / (F1_MAX - F1_MIN)) * (H - PAD_T - PAD_B);

  function toggleLang(k: LangKey) {
    if (ctlShow) return;
    setIntShow((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  }

  return (
    <div className="my-4 p-3 rounded-lg border border-border bg-card text-card-foreground">
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-semibold">IPA vowel chart (F1 vs F2)</div>
        {hovered && (
          <div className="text-xs font-mono" style={{ color: LANGS[hovered.lang].color }}>
            /{hovered.v.ipa}/ ({LANGS[hovered.lang].name})
            {hovered.v.example ? ` — "${hovered.v.example}"` : ""} · F1={hovered.v.F1} Hz, F2={hovered.v.F2} Hz
          </div>
        )}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto bg-[#0b1228] rounded-md" role="img" aria-label="IPA vowel chart with multiple language inventories">
        {/* Trapezoid outline mimicking IPA standard chart */}
        <polygon
          points={`${xFor(2300).toFixed(1)},${yFor(250).toFixed(1)} ${xFor(800).toFixed(1)},${yFor(250).toFixed(1)} ${xFor(900).toFixed(1)},${yFor(800).toFixed(1)} ${xFor(1500).toFixed(1)},${yFor(800).toFixed(1)}`}
          fill="none"
          stroke="#444a66"
          strokeWidth={1}
          strokeDasharray="3,3"
        />

        {/* Axes */}
        <line x1={PAD_L} y1={H - PAD_B} x2={W - PAD_R} y2={H - PAD_B} stroke="#444a66" />
        <line x1={PAD_L} y1={PAD_T} x2={PAD_L} y2={H - PAD_B} stroke="#444a66" />

        {[500, 1000, 1500, 2000, 2500].map((f2) => (
          <g key={`x-${f2}`}>
            <line x1={xFor(f2)} y1={H - PAD_B} x2={xFor(f2)} y2={H - PAD_B + 3} stroke="#666" />
            <text x={xFor(f2)} y={H - PAD_B + 14} fill="#9aa3b8" fontSize="9" textAnchor="middle">{f2}</text>
          </g>
        ))}
        {[200, 400, 600, 800].map((f1) => (
          <g key={`y-${f1}`}>
            <line x1={PAD_L - 4} y1={yFor(f1)} x2={PAD_L} y2={yFor(f1)} stroke="#666" />
            <text x={PAD_L - 6} y={yFor(f1) + 3} fill="#9aa3b8" fontSize="9" textAnchor="end">{f1}</text>
          </g>
        ))}

        <text x={(PAD_L + W - PAD_R) / 2} y={H - 4} fill="#cbd1e6" fontSize="10" textAnchor="middle">F2 (Hz) ← back · front →</text>
        <text x={14} y={H / 2} fill="#cbd1e6" fontSize="10" transform={`rotate(-90 14 ${H / 2})`} textAnchor="middle">F1 (Hz) ← close · open →</text>

        {/* Header labels for canonical vowel quadrants */}
        <text x={xFor(2200)} y={PAD_T - 8} fill="#9aa3b8" fontSize="9" textAnchor="middle">close front</text>
        <text x={xFor(800)} y={PAD_T - 8} fill="#9aa3b8" fontSize="9" textAnchor="middle">close back</text>
        <text x={xFor(1700)} y={H - PAD_B + 28} fill="#9aa3b8" fontSize="9" textAnchor="middle">open front</text>
        <text x={xFor(1100)} y={H - PAD_B + 28} fill="#9aa3b8" fontSize="9" textAnchor="middle">open back</text>

        {/* Vowel markers */}
        {(Object.entries(LANGS) as [LangKey, typeof LANGS["english"]][])
          .filter(([k]) => show.has(k))
          .map(([k, lang]) =>
            lang.vowels.map((v, idx) => (
              <g
                key={`${k}-${idx}`}
                onPointerEnter={() => setHovered({ v, lang: k })}
                onPointerLeave={() => setHovered(null)}
                style={{ cursor: "pointer" }}
              >
                <circle cx={xFor(v.F2)} cy={yFor(v.F1)} r={6} fill={lang.color} fillOpacity={0.5} stroke={lang.color} strokeWidth={1.5} />
                <text x={xFor(v.F2)} y={yFor(v.F1) + 3} fill="#0b1228" fontSize="10" fontWeight={700} textAnchor="middle">
                  {v.ipa}
                </text>
              </g>
            )),
          )}
      </svg>

      <div className="mt-3 flex flex-wrap gap-1.5 text-xs">
        {(Object.entries(LANGS) as [LangKey, typeof LANGS["english"]][]).map(([k, lang]) => (
          <button
            key={k}
            onClick={() => toggleLang(k)}
            disabled={ctlShow !== undefined}
            className={`px-2 py-1 rounded text-xs ${show.has(k) ? "" : "opacity-40"} disabled:cursor-default`}
            style={{ border: `1px solid ${lang.color}`, color: lang.color }}
          >
            {lang.name} ({lang.vowels.length})
          </button>
        ))}
      </div>

      <div className="mt-2 text-[10px] text-muted-foreground">
        F1 ↔ tongue height (close /i/ low F1; open /a/ high F1). F2 ↔ tongue backness (front /i/ high F2; back /u/ low F2). Languages partition same acoustic space differently — Spanish + Arabic use 3-5 vowels; English uses ~13 (incl. lax-tense + central /ə/); French adds front-rounded + nasals. Cardinal vowels /i a u/ universal — corners of acoustic vowel space. Speaker-normalized via vocal-tract length (children + women: higher formants).
      </div>
    </div>
  );
}
