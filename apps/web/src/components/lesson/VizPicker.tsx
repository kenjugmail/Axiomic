import { useState } from "react";
import { Search, Sparkles, X } from "lucide-react";

export interface VizCatalogEntry {
  // Slide-shaped name used by the lesson player + wiki MarkdownRenderer.
  name: string;
  // Display label.
  label: string;
  // Short description shown beneath the label in the gallery.
  description: string;
  // A small emoji thumbnail. Real preview-rendering would need lazy
  // loading; the emoji is enough visual cue + fast.
  thumb: string;
  // Topic hint for the search filter.
  tags: string[];
}

// Catalog kept in lockstep with PreviewViz's switch and VizEmbed's
// VIZ_NAMES list. The names match the lesson player; the wiki uses
// shorter aliases (mapped at consumer level).
export const VIZ_CATALOG: VizCatalogEntry[] = [
  {
    name: "softmax-temperature-preview",
    label: "Softmax temperature",
    description: "Slider showing how temperature flattens or sharpens a distribution.",
    thumb: "🌡️",
    tags: ["softmax", "temperature", "probability"],
  },
  {
    name: "attention-heatmap-explorer",
    label: "Attention heatmap",
    description: "Token-by-token attention with preset transformer patterns.",
    thumb: "🔥",
    tags: ["attention", "transformer", "heatmap"],
  },
  {
    name: "gradient-descent-2d",
    label: "Gradient descent (2D)",
    description: "Walk down a 2D loss surface; tweak the learning rate.",
    thumb: "📉",
    tags: ["optimization", "gradient", "loss"],
  },
  {
    name: "tokenizer-playground",
    label: "Tokenizer playground",
    description: "Type text; see how a BPE-style tokenizer splits it.",
    thumb: "🔤",
    tags: ["tokenizer", "bpe", "nlp"],
  },
  {
    name: "embedding-explorer",
    label: "Embedding explorer",
    description: "2D projection of word embeddings with semantic clusters.",
    thumb: "🧭",
    tags: ["embedding", "vector", "nlp"],
  },
  {
    name: "layer-activations",
    label: "Layer activations",
    description: "Inspect activations at each layer of a tiny network.",
    thumb: "🧠",
    tags: ["neural network", "activation"],
  },
  {
    name: "positional-encoding",
    label: "Positional encoding",
    description: "Sinusoidal positional encodings as a heatmap.",
    thumb: "📐",
    tags: ["transformer", "positional", "encoding"],
  },
  {
    name: "activation-function-gallery",
    label: "Activation gallery",
    description: "ReLU, sigmoid, tanh, GELU side by side.",
    thumb: "⚡",
    tags: ["activation", "relu", "sigmoid"],
  },
  {
    name: "lorenz-attractor",
    label: "Lorenz attractor",
    description: "The classic chaotic attractor; drag to rotate.",
    thumb: "🦋",
    tags: ["chaos", "dynamics", "physics"],
  },
  {
    name: "double-pendulum",
    label: "Double pendulum",
    description: "Sensitive dependence on initial conditions in real time.",
    thumb: "🎯",
    tags: ["chaos", "physics", "pendulum"],
  },
  {
    name: "phase-portrait-1d",
    label: "Phase portrait (1D)",
    description: "Stable / unstable fixed points of dx/dt = f(x).",
    thumb: "📊",
    tags: ["dynamics", "ode", "physics"],
  },
  {
    name: "solar-pv-curve",
    label: "Solar PV curve",
    description: "Drag irradiance + temperature; see I-V + P-V curves + MPP track.",
    thumb: "☀️",
    tags: ["solar", "energy", "physics", "renewable"],
  },
  {
    name: "carnot-cycle",
    label: "Carnot cycle (P-V)",
    description: "P-V diagram with isotherms + adiabats. Drag temperatures; see efficiency.",
    thumb: "🔥",
    tags: ["thermodynamics", "carnot", "physics", "engineering"],
  },
  {
    name: "beam-deflection",
    label: "Beam deflection",
    description: "Simply supported beam with movable load; shear + moment diagrams.",
    thumb: "🏗️",
    tags: ["structural", "civil", "mechanics", "engineering"],
  },
  {
    name: "pk-curve",
    label: "Pharmacokinetics curve",
    description: "Plasma concentration over time for repeated oral dosing; steady-state ribbon.",
    thumb: "💊",
    tags: ["pharmacology", "pk", "biology", "medicine"],
  },
  {
    name: "roc-curve",
    label: "ROC curve + confusion matrix",
    description: "Interactive class separation, prevalence, threshold; sensitivity/specificity tracking.",
    thumb: "📈",
    tags: ["statistics", "ml", "medicine", "evaluation", "classification"],
  },
  {
    name: "order-book",
    label: "Limit order book + market impact",
    description: "Walk a market order through bid/ask ladders; live VWAP + slippage + depth.",
    thumb: "📊",
    tags: ["trading", "finance", "microstructure", "quant"],
  },
  {
    name: "mohrs-circle",
    label: "Mohr's circle of stress",
    description: "Drag σ_x, σ_y, τ_xy + rotation; see principal stresses + max shear graphically.",
    thumb: "🪨",
    tags: ["geology", "mechanics", "structural", "engineering", "stress"],
  },
  {
    name: "hr-diagram",
    label: "Hertzsprung-Russell diagram",
    description: "Drag stellar mass; see T_eff, luminosity, spectral type, MS lifetime, endpoint.",
    thumb: "⭐",
    tags: ["astronomy", "astrophysics", "stars", "hr-diagram", "physics"],
  },
  {
    name: "sir-model",
    label: "SIR epidemic model",
    description: "Drag R₀ + infectious period + vaccination; live S/I/R curves + peak + attack rate.",
    thumb: "🦠",
    tags: ["epidemiology", "infectious-disease", "modeling", "biology", "public-health"],
  },
  {
    name: "reactor-comparator",
    label: "CSTR vs PFR reactor",
    description: "Drag rate constant + space-time + order; compare CSTR vs PFR conversion side-by-side.",
    thumb: "⚗️",
    tags: ["chemical-engineering", "reactor", "kinetics", "process", "engineering"],
  },
  {
    name: "point-kinetics",
    label: "Reactor point kinetics",
    description: "Drag reactivity (in $); watch neutron population evolve. Cross 1$ for prompt critical.",
    thumb: "☢️",
    tags: ["nuclear", "reactor", "kinetics", "physics", "engineering"],
  },
  {
    name: "ocean-ts-diagram",
    label: "Ocean T-S diagram",
    description: "Drag water-mass markers on temperature-salinity plot; see density isopycnals + cabbeling.",
    thumb: "🌊",
    tags: ["oceanography", "physics", "water-masses", "climate", "earth-science"],
  },
  {
    name: "atmospheric-sounding",
    label: "Atmospheric sounding",
    description: "Drag surface T + dew point; lift a parcel; see LCL/LFC/EL + CAPE for storm energetics.",
    thumb: "☁️",
    tags: ["atmosphere", "meteorology", "weather", "climate", "physics"],
  },
  {
    name: "ecg-simulator",
    label: "ECG simulator",
    description: "Drag heart rate + PR + ST + T-inversion + AV block; see clinical ECG signatures live.",
    thumb: "🫀",
    tags: ["biomedical", "cardiology", "medicine", "ecg", "physiology"],
  },
  {
    name: "shannon-channel",
    label: "Shannon channel capacity",
    description: "Drag bit-error probability; see binary entropy H(p) + channel capacity C = 1−H(p) + BSC diagram.",
    thumb: "📡",
    tags: ["information-theory", "shannon", "communication", "entropy", "channel"],
  },
  {
    name: "gaussian-beam",
    label: "Gaussian beam propagation",
    description: "Drag waist + wavelength; see beam envelope + Rayleigh range + divergence + optional lens.",
    thumb: "🔦",
    tags: ["photonics", "optics", "lasers", "physics", "engineering"],
  },
  {
    name: "vowel-formant-chart",
    label: "IPA vowel formant chart",
    description: "F1 vs F2 vowel chart across languages (English, Spanish, French, Mandarin, Arabic). Hover for IPA + examples.",
    thumb: "🗣️",
    tags: ["linguistics", "phonetics", "phonology", "language", "ipa"],
  },
  {
    name: "phillips-curve",
    label: "Phillips curve (inflation vs unemployment)",
    description: "Drag expectations + NAIRU + slope + supply shock; see SRPC + LRPC + historical episodes (1975, 1980, 2022).",
    thumb: "📉",
    tags: ["economics", "macroeconomics", "monetary-policy", "inflation"],
  },
  {
    name: "hill-function",
    label: "Hill function / gene regulation",
    description: "Drag K + n; see cooperative TF binding curve (n=1 hyperbolic; n>1 ultrasensitive). Activator + repressor.",
    thumb: "🧬",
    tags: ["biology", "cell-biology", "molecular-biology", "biochemistry", "gene-regulation"],
  },
  {
    name: "drift-diffusion",
    label: "Drift-diffusion decision model",
    description: "Drag drift + threshold + bias + noise; see evidence accumulation trajectories + RT/accuracy.",
    thumb: "🧠",
    tags: ["cognitive-science", "psychology", "decision-making", "neuroscience"],
  },
  {
    name: "mm1-queue",
    label: "M/M/1 queue dynamics",
    description: "Drag λ + μ; see L = ρ/(1-ρ) hockey-stick blowup near full utilization. The OR baseline.",
    thumb: "🧮",
    tags: ["operations-research", "queueing-theory", "industrial-engineering", "capacity-planning"],
  },
  {
    name: "lotka-volterra",
    label: "Lotka-Volterra predator-prey",
    description: "Drag α/β/δ/γ + initial conditions; see closed orbits, time series, and phase portrait of the classic ecology cycle.",
    thumb: "🦈",
    tags: ["biology", "ecology", "marine-biology", "dynamical-systems"],
  },
  {
    name: "radiocarbon-decay",
    label: "Radiocarbon ¹⁴C decay",
    description: "Drag fraction remaining; see calendar age, half-life markers, dating-range limit, and famous-era anchors.",
    thumb: "🏺",
    tags: ["archaeology", "geology", "physics", "dating-methods"],
  },
  {
    name: "alignment-matrix",
    label: "Sequence alignment DP matrix",
    description: "Type two sequences; see Needleman-Wunsch global or Smith-Waterman local DP matrix with optimal traceback.",
    thumb: "🧬",
    tags: ["bioinformatics", "computational-biology", "dynamic-programming", "sequence-analysis"],
  },
  {
    name: "ramachandran-plot",
    label: "Ramachandran plot (φ/ψ)",
    description: "Drag φ/ψ backbone torsions; see allowed regions for α-helix, β-sheet, polyproline-II, and steric-clash zones.",
    thumb: "🧪",
    tags: ["structural-biology", "biophysics", "protein-folding", "biochemistry"],
  },
];

interface Props {
  open: boolean;
  onClose: () => void;
  onPick: (entry: VizCatalogEntry) => void;
  // Optional title override (e.g., "Insert a visualization").
  title?: string;
}

// Visual gallery for picking a viz. Replaces the dropdown selector in
// the lesson editor and the button-based picker in the wiki editor.
// Filters by name + tags via a simple substring match.
export function VizPicker({ open, onClose, onPick, title }: Props) {
  const [query, setQuery] = useState("");

  if (!open) return null;

  const q = query.trim().toLowerCase();
  const filtered = q
    ? VIZ_CATALOG.filter((v) => {
        if (v.name.toLowerCase().includes(q)) return true;
        if (v.label.toLowerCase().includes(q)) return true;
        if (v.tags.some((t) => t.includes(q))) return true;
        return false;
      })
    : VIZ_CATALOG;

  return (
    <div
      className="fixed inset-0 z-50 bg-background/70 backdrop-blur-sm animate-fade-in flex items-start justify-center px-4 py-12"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Visualization picker"
    >
      <div
        className="w-full max-w-2xl bg-card border border-border rounded-xl shadow-floating overflow-hidden flex flex-col max-h-[80vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 h-12 border-b border-border shrink-0">
          <span className="inline-flex items-center gap-1.5 text-sm font-semibold">
            <Sparkles className="w-4 h-4" strokeWidth={2} />
            {title ?? "Insert a visualization"}
          </span>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/40"
            aria-label="Close"
          >
            <X className="w-4 h-4" strokeWidth={2} />
          </button>
        </div>
        <div className="px-4 py-3 border-b border-border shrink-0">
          <div className="relative">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground"
              strokeWidth={2}
            />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name or topic…"
              className="w-full pl-9 pr-3 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-3">
          {filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground p-6 text-center">
              No visualizations match "{query}".
            </p>
          ) : (
            <div className="grid sm:grid-cols-2 gap-2">
              {filtered.map((v) => (
                <button
                  key={v.name}
                  onClick={() => {
                    onPick(v);
                    onClose();
                  }}
                  className="text-left flex items-start gap-3 px-3 py-2.5 rounded-lg border border-border hover:border-primary/40 hover:bg-accent/30 transition-colors duration-fast"
                >
                  <span className="text-2xl shrink-0 mt-0.5">{v.thumb}</span>
                  <span className="min-w-0">
                    <span className="block text-sm font-medium truncate">
                      {v.label}
                    </span>
                    <span className="block text-xs text-muted-foreground line-clamp-2">
                      {v.description}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
