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
  {
    name: "hodgkin-huxley-ap",
    label: "Hodgkin-Huxley action potential",
    description: "Drag stimulus + Na/K/leak conductances; watch V(t) + gating variables m, h, n produce or fail to produce a spike.",
    thumb: "⚡",
    tags: ["neuroscience", "biophysics", "electrophysiology", "computational-neuroscience"],
  },
  {
    name: "lawson-criterion",
    label: "Lawson criterion (fusion)",
    description: "Drag temperature + nτE; see ignition curve, breakeven, and where TFTR/JET/JT-60U/ITER/SPARC sit in plasma performance space.",
    thumb: "🔥",
    tags: ["plasma-physics", "fusion", "energy", "nuclear"],
  },
  {
    name: "band-structure",
    label: "Band structure E(k)",
    description: "Drag lattice constant + potential depth; see metal vs semiconductor vs insulator from the band gap at the zone boundary.",
    thumb: "📈",
    tags: ["solid-state", "physics", "semiconductors", "materials"],
  },
  {
    name: "vortex-shedding",
    label: "Vortex shedding (Kármán)",
    description: "Drag Reynolds + diameter; see Stokes / steady wake / Kármán street / drag-crisis regimes and the Strouhal frequency.",
    thumb: "🌀",
    tags: ["fluids", "turbulence", "aerodynamics", "engineering"],
  },
  {
    name: "ice-sheet-dynamics",
    label: "Ice sheet flowline",
    description: "Drag accumulation + ice temperature; see the Vialov shallow-ice profile, ELA, and net mass balance.",
    thumb: "🧊",
    tags: ["glaciology", "climate", "geophysics", "earth-science"],
  },
  {
    name: "retrosynthesis-tree",
    label: "Retrosynthesis tree",
    description: "Pick a drug (ibuprofen, paracetamol, aspirin); click nodes to explore disconnections in a 2-3 level retro tree.",
    thumb: "🧪",
    tags: ["organic-chemistry", "synthesis", "medicinal-chemistry"],
  },
  {
    name: "tanabe-sugano-diagram",
    label: "Tanabe-Sugano diagram",
    description: "Pick d-electron config (d2-d8) and Δ/B; see term energies, HS/LS crossover, predicted UV-vis transitions.",
    thumb: "🔮",
    tags: ["inorganic-chemistry", "coordination", "spectroscopy"],
  },
  {
    name: "butler-volmer-curve",
    label: "Butler-Volmer I-η",
    description: "Drag exchange current + transfer coefficient; see the I-η curve and Tafel slopes for electrochemical kinetics.",
    thumb: "⚡",
    tags: ["electrochemistry", "kinetics", "batteries", "fuel-cells"],
  },
  {
    name: "preferential-attachment",
    label: "Preferential attachment (BA)",
    description: "Drag m + steps; watch a Barabási-Albert network grow with scale-free hubs and a power-law degree distribution.",
    thumb: "🕸️",
    tags: ["network-science", "graph-theory", "complex-systems"],
  },
  {
    name: "zk-proof-verification",
    label: "ZK proof flow",
    description: "Compare Groth16, PLONK, STARK, Bulletproofs; see proof size, verifier time, trusted-setup requirements.",
    thumb: "🔐",
    tags: ["cryptography", "zero-knowledge", "blockchain"],
  },
  {
    name: "raft-log-replication",
    label: "Raft log replication",
    description: "Drag leader + log + partition; watch quorum-based replication across a 5-node Raft cluster.",
    thumb: "🗳️",
    tags: ["distributed-systems", "consensus", "databases"],
  },
  {
    name: "manhattan-plot",
    label: "GWAS Manhattan plot",
    description: "Pick phenotype + study size; see a simulated -log₁₀(p) Manhattan with the 5×10⁻⁸ genome-wide threshold.",
    thumb: "🧬",
    tags: ["genetics", "GWAS", "statistical-genetics", "biology"],
  },
  {
    name: "macarthur-consumer-resource",
    label: "MacArthur ZNGI",
    description: "Drag R*₁, R*₂, and supply point; see exclusion, coexistence, or founder-effect outcomes from consumer-resource theory.",
    thumb: "🌿",
    tags: ["ecology", "competition", "community-ecology"],
  },
  {
    name: "kinship-diagram",
    label: "Kinship diagram",
    description: "Pick a kinship system (Eskimo, Iroquois, Sudanese, Hawaiian); see how the same biology maps to different cultural terms.",
    thumb: "👪",
    tags: ["anthropology", "kinship", "social-science"],
  },
  {
    name: "forward-kinematics-arm",
    label: "Forward-kinematics arm",
    description: "Drag joint angles; see the end-effector position + manipulability score for a planar N-link revolute arm.",
    thumb: "🦾",
    tags: ["robotics", "kinematics", "control"],
  },
  {
    name: "group-orbits",
    label: "Group orbits (D4, S3, Z6, Z2×Z2)",
    description: "Pick a finite group + base point; see its orbit under the group action and verify orbit-stabilizer.",
    thumb: "🌀",
    tags: ["mathematics", "abstract-algebra", "group-theory"],
  },
  {
    name: "friedmann-equation",
    label: "Friedmann a(t) (ΛCDM)",
    description: "Drag Ω_m, Ω_Λ, H₀; see scale-factor evolution + age of universe + Big Bang and future fate.",
    thumb: "🌌",
    tags: ["cosmology", "general-relativity", "physics"],
  },
  {
    name: "schelling-segregation",
    label: "Schelling segregation",
    description: "Drag tolerance τ; run the dynamic-segregation simulation on a 30×30 torus; see emergent macro-clustering.",
    thumb: "🧩",
    tags: ["sociology", "agent-based-model", "segregation", "schelling"],
  },
  {
    name: "big-five-radar",
    label: "Big Five (OCEAN) radar",
    description: "Drag five trait sliders; compare against archetype overlays (salesperson, academic, artist, leader).",
    thumb: "🧠",
    tags: ["psychology", "personality", "big-five", "ocean"],
  },
  {
    name: "civilization-timeline",
    label: "Civilization timeline (parallel)",
    description: "Six civilizational threads on one timeline; see axial age, Maya Classic + Han + Rome simultaneity.",
    thumb: "🏛️",
    tags: ["history", "ancient", "axial-age", "civilizations"],
  },
  {
    name: "truth-table",
    label: "Truth table",
    description: "Type or pick a propositional formula (¬ ∧ ∨ → ↔); see all 2ⁿ rows + tautology/contradiction detection.",
    thumb: "🧮",
    tags: ["philosophy", "logic", "propositional-logic", "mathematics"],
  },
  {
    name: "voting-systems",
    label: "Voting systems compared",
    description: "5 voter blocks, 4 candidates, 5 tally methods (FPTP, IRV, Borda, Condorcet, Approval) — see Arrow's impossibility live.",
    thumb: "🗳️",
    tags: ["political-science", "voting", "arrow", "social-choice"],
  },
  {
    name: "clonal-selection",
    label: "Clonal selection (immune)",
    description: "Naive lymphocyte repertoire + antigen → expansion → contraction → memory; affinity maturation visible.",
    thumb: "🦠",
    tags: ["immunology", "biology", "clonal-selection", "burnet"],
  },
  {
    name: "gradient-descent-2d",
    label: "Gradient descent 2D",
    description: "2D loss surface with η, momentum β, and ellipsoid eccentricity sliders; see convergence vs divergence.",
    thumb: "📉",
    tags: ["ml", "optimization", "gradient-descent", "momentum"],
  },
  {
    name: "sampling-temperature-lab",
    label: "LLM sampling lab",
    description: "Temperature + top-k + top-p sliders on a fixed logit distribution; live entropy + kept-tokens readout.",
    thumb: "🎲",
    tags: ["ml", "llm", "sampling", "decoding"],
  },
  {
    name: "crystal-lattice",
    label: "Crystal lattice (SC/BCC/FCC)",
    description: "Cubic unit cells with rotation slider; coordination + packing-factor readout; examples (Cu, Fe, etc).",
    thumb: "💎",
    tags: ["physics", "solid-state", "materials", "crystallography"],
  },
  {
    name: "brillouin-zone",
    label: "Brillouin zone (2D)",
    description: "Wigner-Seitz construction of the first Brillouin zone for square + rectangular + hexagonal lattices.",
    thumb: "🔷",
    tags: ["physics", "solid-state", "reciprocal-lattice", "bloch"],
  },
  {
    name: "phonon-dispersion",
    label: "Phonon dispersion (1D)",
    description: "Diatomic chain ω(k); acoustic + optical branches; mass-ratio slider opens/closes the band gap.",
    thumb: "〰️",
    tags: ["physics", "solid-state", "phonons", "lattice-dynamics"],
  },
  {
    name: "precedent-network",
    label: "Precedent network (SCOTUS)",
    description: "Landmark SCOTUS cases as nodes; citation edges by doctrine; filter by civil rights / speech / privacy / federalism.",
    thumb: "⚖️",
    tags: ["law", "scotus", "precedent", "constitutional"],
  },
  {
    name: "forgetting-curve",
    label: "Forgetting curve + SM-2",
    description: "Ebbinghaus retention with spaced reviews; ease + review-count sliders; compare with no-review baseline.",
    thumb: "🧠",
    tags: ["education", "memory", "spaced-repetition", "ebbinghaus"],
  },
  {
    name: "bacterial-growth-curve",
    label: "Bacterial growth curve",
    description: "OD600 vs time with lag/exponential/stationary/death phases; Monod substrate kinetics + doubling-time slider.",
    thumb: "🦠",
    tags: ["microbiology", "growth", "monod", "kinetics"],
  },
  {
    name: "allele-frequency-drift",
    label: "Wright-Fisher drift",
    description: "Genetic drift in a finite population; N + p₀ + selection sliders; run multiple replicate trajectories.",
    thumb: "🧬",
    tags: ["evolution", "population-genetics", "drift", "wright-fisher"],
  },
  {
    name: "harmonic-series",
    label: "Harmonic series",
    description: "Fundamental + partials with timbre presets (sine, square, string, clarinet); combined waveform shown.",
    thumb: "🎵",
    tags: ["music", "acoustics", "harmonics", "timbre"],
  },
  {
    name: "zoning-grid",
    label: "Zoning grid (urban planning)",
    description: "Paint R/C/M/P/T zones on a 10×10 grid; live density + jobs + walkability + transit-access readouts.",
    thumb: "🏙️",
    tags: ["urban-planning", "zoning", "transit", "walkability"],
  },
  {
    name: "extinction-timeline",
    label: "Extinction timeline (Phanerozoic)",
    description: "Geologic periods + diversity-recovery curve + Big Five extinction markers; scrub through 540 Mya.",
    thumb: "🦖",
    tags: ["paleontology", "extinction", "geologic-time", "diversity"],
  },
  {
    name: "utility-indifference",
    label: "Utility + indifference curves",
    description: "Cobb-Douglas utility with budget line + optimal-bundle dot; drag prices, income, preference α.",
    thumb: "📊",
    tags: ["microeconomics", "consumer-theory", "utility", "demand"],
  },
  {
    name: "structural-load-flow",
    label: "Structural load flow",
    description: "Beam / cantilever / Pratt truss with point load; live reactions + bending-moment diagram.",
    thumb: "🏛️",
    tags: ["architecture", "structures", "statics", "engineering"],
  },
  {
    name: "population-pyramid",
    label: "Population pyramid",
    description: "Age × sex back-to-back bars for Italy/Niger/Japan; toggle years to see demographic transition.",
    thumb: "👥",
    tags: ["demography", "population", "aging", "fertility"],
  },
  {
    name: "map-projections",
    label: "Map projections",
    description: "Mercator / Robinson / Mollweide / Winkel-Tripel / Equal Earth with optional Tissot indicatrix.",
    thumb: "🗺️",
    tags: ["cartography", "geodesy", "projections", "gis"],
  },
  {
    name: "shot-composition",
    label: "Shot composition",
    description: "Aspect-ratio frame with rule-of-thirds + golden ratio + dynamic-symmetry + safe-zone overlays.",
    thumb: "🎬",
    tags: ["cinematography", "composition", "film", "framing"],
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
