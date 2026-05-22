import { useState } from "react";

// Tooth cross-section + caries progression. A tooth is layered: hard
// acellular ENAMEL (hydroxyapatite, the body's hardest tissue) over
// living DENTIN (tubules + odontoblasts) over the PULP (nerves + vessels).
// A carious lesion advances inward from the surface; the clinical response
// depends on which layer it has reached — enamel-only lesions can
// remineralize (fluoride), dentin lesions need restoration, and a lesion
// into the pulp needs endodontic (root-canal) treatment. The depth slider
// or the stage buttons drive the lesion front.

const W = 460;
const H = 344;

type Stage = "Healthy" | "Enamel" | "Dentin" | "Pulp";
const STAGE_DEPTH: Record<Stage, number> = {
  Healthy: 0,
  Enamel: 0.2,
  Dentin: 0.5,
  Pulp: 0.92,
};
const ORDER: Stage[] = ["Healthy", "Enamel", "Dentin", "Pulp"];

function layerFor(d: number): { layer: string; note: string; color: string } {
  if (d <= 0.02) return { layer: "Sound tooth", note: "intact enamel — maintain with fluoride", color: "#4ade80" };
  if (d < 0.28) return { layer: "Enamel caries", note: "demineralized — can REMINERALIZE with fluoride", color: "#fbbf24" };
  if (d < 0.6) return { layer: "Dentin caries", note: "into dentin — needs a restoration (filling)", color: "#fb923c" };
  if (d < 0.85) return { layer: "Deep caries", note: "near pulp — risk of pulpitis", color: "#f87171" };
  return { layer: "Pulp exposure", note: "into pulp — needs root-canal therapy", color: "#ef4444" };
}

interface Props {
  stage?: Stage;
}

export function ToothAnatomy({ stage: ctl }: Props = {}) {
  const [intStage, setIntStage] = useState<Stage>("Healthy");
  const [rawDepth, setRawDepth] = useState(0);
  // Buttons set depth; dragging the slider overrides to a custom value.
  const stage = ctl ?? intStage;
  const depth = rawDepth || STAGE_DEPTH[stage];
  const info = layerFor(depth);

  // Lesion front: occlusal surface at y=44, pulp horn near y=150.
  const lesionTop = 44;
  const lesionBottom = lesionTop + depth * 116;

  return (
    <div className="my-4 p-3 rounded-lg border border-border bg-card text-card-foreground">
      <div className="flex items-center justify-between mb-2 flex-wrap gap-1">
        <div className="text-sm font-semibold" style={{ color: info.color }}>
          {info.layer} · {info.note}
        </div>
        <div className="flex gap-1">
          {ORDER.map((s) => (
            <button
              key={s}
              onClick={() => {
                setIntStage(s);
                setRawDepth(0);
              }}
              disabled={ctl !== undefined}
              className={`px-1.5 py-0.5 rounded text-[9px] ${
                stage === s ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-accent"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto bg-[#0b1228] rounded-md" role="img" aria-label="Tooth cross-section with caries progression">
        {/* alveolar bone + gingiva backdrop */}
        <rect x={70} y={150} width={320} height={150} fill="#1a1206" opacity={0.5} />
        <rect x={70} y={150} width={320} height={18} fill="#7f3b4b" opacity={0.6} />
        <text x={384} y={146} fill="#9aa3b8" fontSize="8" textAnchor="end">gum line</text>

        {/* ENAMEL — crown outer shell */}
        <path d="M150,150 L150,80 Q150,40 230,38 Q310,40 310,80 L310,150 Z" fill="#dbe6f0" stroke="#aebfd0" strokeWidth={1} />
        {/* DENTIN — crown + roots */}
        <path d="M166,150 L166,82 Q166,56 230,54 Q294,56 294,82 L294,150 Z" fill="#f0d79c" />
        {/* roots (dentin) */}
        <path d="M170,150 Q176,250 210,288 Q220,296 222,288 L226,160 Z" fill="#ecd093" stroke="#d9b86a" strokeWidth={0.6} />
        <path d="M290,150 Q284,250 250,288 Q240,296 238,288 L234,160 Z" fill="#ecd093" stroke="#d9b86a" strokeWidth={0.6} />
        {/* PULP chamber + canals */}
        <path d="M214,150 L214,96 Q214,82 230,80 Q246,82 246,96 L246,150 Z" fill="#e06666" />
        <path d="M218,150 Q214,238 220,280 L226,280 Q224,200 226,150 Z" fill="#d9534f" />
        <path d="M242,150 Q246,238 240,280 L234,280 Q236,200 234,150 Z" fill="#d9534f" />

        {/* caries lesion — advances from occlusal surface inward */}
        {depth > 0.02 && (
          <path
            d={`M${230 - 14 - depth * 6},${lesionTop} Q230,${lesionTop - 6} ${230 + 14 + depth * 6},${lesionTop} L${230 + 6},${lesionBottom} Q230,${lesionBottom + 8} ${230 - 6},${lesionBottom} Z`}
            fill="#3b2410"
            stroke="#1f1206"
            strokeWidth={0.8}
            opacity={0.92}
          />
        )}
        {/* lesion-front marker */}
        {depth > 0.02 && (
          <line x1={150} y1={lesionBottom} x2={324} y2={lesionBottom} stroke={info.color} strokeWidth={0.7} strokeDasharray="3,2" />
        )}

        {/* labels */}
        <line x1={310} y1={66} x2={356} y2={60} stroke="#aebfd0" strokeWidth={0.5} />
        <text x={360} y={63} fill="#dbe6f0" fontSize="8.5">enamel</text>
        <line x1={294} y1={104} x2={356} y2={104} stroke="#d9b86a" strokeWidth={0.5} />
        <text x={360} y={107} fill="#f0d79c" fontSize="8.5">dentin</text>
        <line x1={246} y1={120} x2={356} y2={140} stroke="#e06666" strokeWidth={0.5} />
        <text x={360} y={143} fill="#e06666" fontSize="8.5">pulp</text>
        <text x={130} y={250} fill="#9aa3b8" fontSize="8" textAnchor="end">root</text>
        <line x1={132} y1={247} x2={186} y2={235} stroke="#9aa3b8" strokeWidth={0.4} />
      </svg>

      <div className="mt-2 text-xs">
        <label className="block">
          lesion depth: {(depth * 100).toFixed(0)}% toward the pulp
          <input
            type="range"
            min={0}
            max={100}
            step={2}
            value={Math.round(depth * 100)}
            onChange={(e) => setRawDepth(Math.max(0.0001, parseInt(e.target.value) / 100))}
            className="w-full mt-0.5"
            aria-label="Caries lesion depth"
          />
        </label>
      </div>
      <div className="mt-1 text-[10px] text-muted-foreground">
        <b>Enamel</b> is ~96% mineral (hydroxyapatite) and avascular, so an
        enamel-only lesion is a demineralization that <b>fluoride can
        reverse</b> (forming acid-resistant fluorapatite). Once a lesion
        crosses the dentino-enamel junction into living <b>dentin</b>, its
        tubules transmit stimuli to the <b>pulp</b> and the cavity must be
        restored. Reaching the pulp causes irreversible pulpitis — the
        domain of <b>endodontics</b>. G.V. Black's cavity classification
        (c. 1900) still organizes how these lesions are treated.
      </div>
    </div>
  );
}
