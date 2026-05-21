import { useMemo, useState } from "react";

// Big Five (OCEAN) personality radar. Five orthogonal trait axes;
// drag each to see the polygon morph. Compare a personal profile
// against archetype overlays (population mean, "outgoing salesperson",
// "introverted academic", etc.). Trait scores are 0-100 percentiles.
// Big Five emerged from lexical-hypothesis factor analyses by Goldberg,
// McCrae-Costa; HEXACO (Ashton-Lee) adds Honesty-Humility.

const W = 460;
const H = 320;

const TRAITS = [
  { key: "O", label: "Openness", desc: "imagination, curiosity, aesthetic sensitivity" },
  { key: "C", label: "Conscientiousness", desc: "organized, dependable, self-disciplined" },
  { key: "E", label: "Extraversion", desc: "sociable, assertive, positive affect" },
  { key: "A", label: "Agreeableness", desc: "trusting, cooperative, empathic" },
  { key: "N", label: "Neuroticism", desc: "anxious, moody, emotional volatility" },
] as const;

type Trait = (typeof TRAITS)[number]["key"];
type Profile = Record<Trait, number>;

const ARCHETYPES: Record<string, Profile> = {
  default: { O: 50, C: 50, E: 50, A: 50, N: 50 },
  salesperson: { O: 60, C: 65, E: 85, A: 70, N: 35 },
  academic: { O: 90, C: 75, E: 30, A: 55, N: 55 },
  artist: { O: 95, C: 35, E: 50, A: 60, N: 65 },
  leader: { O: 65, C: 85, E: 75, A: 50, N: 25 },
};

interface Props {
  profile?: keyof typeof ARCHETYPES;
}

export function BigFiveRadar({ profile: ctlProfile }: Props = {}) {
  const [scores, setScores] = useState<Profile>({ ...ARCHETYPES.default });
  const [overlay, setOverlay] = useState<keyof typeof ARCHETYPES | null>(null);

  const effective = ctlProfile ? { ...ARCHETYPES[ctlProfile] } : scores;
  const cx = W / 2;
  const cy = H / 2;
  const r = 100;

  const angleAt = (i: number) => (i / TRAITS.length) * Math.PI * 2 - Math.PI / 2;

  const pointFor = (i: number, value: number) => {
    const a = angleAt(i);
    const dist = (value / 100) * r;
    return { x: cx + dist * Math.cos(a), y: cy + dist * Math.sin(a) };
  };

  const path = useMemo(() => {
    const pts = TRAITS.map((t, i) => pointFor(i, effective[t.key]));
    return pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ") + " Z";
  }, [effective]);

  const overlayPath = useMemo(() => {
    if (!overlay) return null;
    const pts = TRAITS.map((t, i) => pointFor(i, ARCHETYPES[overlay][t.key]));
    return pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ") + " Z";
  }, [overlay]);

  // Compute a similarity score (cosine-like, on normalized vectors)
  const overlaySim = useMemo(() => {
    if (!overlay) return null;
    let dot = 0;
    let na = 0;
    let nb = 0;
    for (const t of TRAITS) {
      const a = effective[t.key];
      const b = ARCHETYPES[overlay][t.key];
      dot += a * b;
      na += a * a;
      nb += b * b;
    }
    return dot / (Math.sqrt(na) * Math.sqrt(nb));
  }, [effective, overlay]);

  return (
    <div className="my-4 p-3 rounded-lg border border-border bg-card text-card-foreground">
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-semibold">Big Five (OCEAN) radar {overlay && overlaySim !== null && <span className="text-muted-foreground">· vs {overlay} sim {overlaySim.toFixed(2)}</span>}</div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto bg-[#0b1228] rounded-md" role="img" aria-label="Big Five radar">
        {/* Concentric reference circles */}
        {[25, 50, 75, 100].map((pct) => (
          <circle key={pct} cx={cx} cy={cy} r={(pct / 100) * r} fill="none" stroke="#1f2937" strokeWidth={0.5} />
        ))}
        {/* Trait axes + labels */}
        {TRAITS.map((t, i) => {
          const end = pointFor(i, 100);
          const label = pointFor(i, 118);
          return (
            <g key={t.key}>
              <line x1={cx} y1={cy} x2={end.x} y2={end.y} stroke="#475569" strokeWidth={0.5} />
              <text x={label.x} y={label.y} fill="#cbd1e6" fontSize="11" textAnchor="middle" dominantBaseline="middle">{t.label}</text>
              <text x={label.x} y={label.y + 12} fill="#fbbf24" fontSize="9" textAnchor="middle">{effective[t.key].toFixed(0)}</text>
            </g>
          );
        })}
        {/* Overlay polygon (archetype comparison) */}
        {overlayPath && (
          <path d={overlayPath} fill="#fbbf24" fillOpacity={0.12} stroke="#fbbf24" strokeWidth={1.2} strokeDasharray="3,2" />
        )}
        {/* Main polygon */}
        <path d={path} fill="#4ecdc4" fillOpacity={0.25} stroke="#4ecdc4" strokeWidth={2} />
        {/* Vertices */}
        {TRAITS.map((t, i) => {
          const p = pointFor(i, effective[t.key]);
          return <circle key={`v-${t.key}`} cx={p.x} cy={p.y} r={3} fill="#4ecdc4" />;
        })}
      </svg>

      <div className="mt-2 grid grid-cols-5 gap-x-2 gap-y-1 text-[10px]">
        {TRAITS.map((t) => (
          <label key={t.key} className="block">{t.label.slice(0, 4)}: {effective[t.key].toFixed(0)}
            <input type="range" min={0} max={100} value={effective[t.key]} onChange={(e) => {
              setScores((s) => ({ ...s, [t.key]: parseFloat(e.target.value) }));
            }} disabled={ctlProfile !== undefined} className="w-full mt-0.5" aria-label={t.label} />
          </label>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-1 text-[10px]">
        <span className="text-muted-foreground mr-1">Compare:</span>
        {(Object.keys(ARCHETYPES) as Array<keyof typeof ARCHETYPES>).map((k) => (
          <button key={k} onClick={() => setOverlay(overlay === k ? null : k)} className={`px-1.5 py-0.5 rounded ${overlay === k ? "bg-[#fbbf24] text-black" : "bg-muted hover:bg-accent"}`}>{k}</button>
        ))}
      </div>
      <div className="mt-2 text-[10px] text-muted-foreground">
        Five-factor model OCEAN (Goldberg lexical hypothesis;
        McCrae-Costa NEO-PI-R 1992): the dominant trait taxonomy in
        psychology. Cross-cultural replication is strong for OCE,
        weaker for A and N in non-WEIRD samples (Henrich critique).
        HEXACO (Ashton-Lee 2007) adds Honesty-Humility, capturing
        Machiavellian/dark-triad variance. Heritability ~40-60% for
        each trait (twin studies). The Big Five predicts job
        performance (Conscientiousness most), longevity, life
        satisfaction, and political orientation — but with modest
        effect sizes. Mischel's person-situation debate (1968) showed
        traits explain ~r=0.30 across situations.
      </div>
    </div>
  );
}
