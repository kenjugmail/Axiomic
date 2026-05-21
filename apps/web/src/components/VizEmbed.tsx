import { lazy, Suspense } from "react";

// Lazy-load visualizations from the viz package source
const AttentionHeatmap = lazy(() => import("../../../../packages/viz/src/components/AttentionHeatmap").then(m => ({ default: m.AttentionHeatmap })));
const SoftmaxTemperature = lazy(() => import("../../../../packages/viz/src/components/SoftmaxTemperature").then(m => ({ default: m.SoftmaxTemperature })));
const PositionalEncoding = lazy(() => import("../../../../packages/viz/src/components/PositionalEncoding").then(m => ({ default: m.PositionalEncoding })));
const TokenizerPlayground = lazy(() => import("../../../../packages/viz/src/components/TokenizerPlayground").then(m => ({ default: m.TokenizerPlayground })));
const BeamSearchTree = lazy(() => import("../../../../packages/viz/src/components/BeamSearchTree").then(m => ({ default: m.BeamSearchTree })));
const LayerActivations = lazy(() => import("../../../../packages/viz/src/components/LayerActivations").then(m => ({ default: m.LayerActivations })));
const QKVStepThrough = lazy(() => import("../../../../packages/viz/src/components/QKVStepThrough").then(m => ({ default: m.QKVStepThrough })));
const EmbeddingExplorer = lazy(() => import("../../../../packages/viz/src/components/EmbeddingExplorer").then(m => ({ default: m.EmbeddingExplorer })));
const ActivationFunctionGallery = lazy(() => import("../../../../packages/viz/src/components/ActivationFunctionGallery").then(m => ({ default: m.ActivationFunctionGallery })));
const LorenzAttractor = lazy(() => import("../../../../packages/viz/src/components/LorenzAttractor").then(m => ({ default: m.LorenzAttractor })));
const DoublePendulum = lazy(() => import("../../../../packages/viz/src/components/DoublePendulum").then(m => ({ default: m.DoublePendulum })));
const PhasePortrait1D = lazy(() => import("../../../../packages/viz/src/components/PhasePortrait1D").then(m => ({ default: m.PhasePortrait1D })));
const SolarPVCurve = lazy(() => import("../../../../packages/viz/src/components/SolarPVCurve").then(m => ({ default: m.SolarPVCurve })));
const CarnotCycle = lazy(() => import("../../../../packages/viz/src/components/CarnotCycle").then(m => ({ default: m.CarnotCycle })));
const BeamDeflection = lazy(() => import("../../../../packages/viz/src/components/BeamDeflection").then(m => ({ default: m.BeamDeflection })));
const PKCurve = lazy(() => import("../../../../packages/viz/src/components/PKCurve").then(m => ({ default: m.PKCurve })));
const ROCCurve = lazy(() => import("../../../../packages/viz/src/components/ROCCurve").then(m => ({ default: m.ROCCurve })));
const OrderBook = lazy(() => import("../../../../packages/viz/src/components/OrderBook").then(m => ({ default: m.OrderBook })));
const MohrsCircle = lazy(() => import("../../../../packages/viz/src/components/MohrsCircle").then(m => ({ default: m.MohrsCircle })));
const HRDiagram = lazy(() => import("../../../../packages/viz/src/components/HRDiagram").then(m => ({ default: m.HRDiagram })));
const SIRModel = lazy(() => import("../../../../packages/viz/src/components/SIRModel").then(m => ({ default: m.SIRModel })));
const ReactorComparator = lazy(() => import("../../../../packages/viz/src/components/ReactorComparator").then(m => ({ default: m.ReactorComparator })));
const PointKinetics = lazy(() => import("../../../../packages/viz/src/components/PointKinetics").then(m => ({ default: m.PointKinetics })));
const OceanTSDiagram = lazy(() => import("../../../../packages/viz/src/components/OceanTSDiagram").then(m => ({ default: m.OceanTSDiagram })));
const AtmosphericSounding = lazy(() => import("../../../../packages/viz/src/components/AtmosphericSounding").then(m => ({ default: m.AtmosphericSounding })));
const ECGSimulator = lazy(() => import("../../../../packages/viz/src/components/ECGSimulator").then(m => ({ default: m.ECGSimulator })));
const ShannonChannel = lazy(() => import("../../../../packages/viz/src/components/ShannonChannel").then(m => ({ default: m.ShannonChannel })));
const GaussianBeam = lazy(() => import("../../../../packages/viz/src/components/GaussianBeam").then(m => ({ default: m.GaussianBeam })));
const VowelFormantChart = lazy(() => import("../../../../packages/viz/src/components/VowelFormantChart").then(m => ({ default: m.VowelFormantChart })));
const PhillipsCurve = lazy(() => import("../../../../packages/viz/src/components/PhillipsCurve").then(m => ({ default: m.PhillipsCurve })));
const HillFunction = lazy(() => import("../../../../packages/viz/src/components/HillFunction").then(m => ({ default: m.HillFunction })));
const DriftDiffusion = lazy(() => import("../../../../packages/viz/src/components/DriftDiffusion").then(m => ({ default: m.DriftDiffusion })));
const MM1Queue = lazy(() => import("../../../../packages/viz/src/components/MM1Queue").then(m => ({ default: m.MM1Queue })));
const LotkaVolterra = lazy(() => import("../../../../packages/viz/src/components/LotkaVolterra").then(m => ({ default: m.LotkaVolterra })));
const RadiocarbonDecay = lazy(() => import("../../../../packages/viz/src/components/RadiocarbonDecay").then(m => ({ default: m.RadiocarbonDecay })));
const AlignmentMatrix = lazy(() => import("../../../../packages/viz/src/components/AlignmentMatrix").then(m => ({ default: m.AlignmentMatrix })));
const RamachandranPlot = lazy(() => import("../../../../packages/viz/src/components/RamachandranPlot").then(m => ({ default: m.RamachandranPlot })));
const HodgkinHuxleyAP = lazy(() => import("../../../../packages/viz/src/components/HodgkinHuxleyAP").then(m => ({ default: m.HodgkinHuxleyAP })));
const LawsonCriterion = lazy(() => import("../../../../packages/viz/src/components/LawsonCriterion").then(m => ({ default: m.LawsonCriterion })));
const BandStructure = lazy(() => import("../../../../packages/viz/src/components/BandStructure").then(m => ({ default: m.BandStructure })));
const VortexShedding = lazy(() => import("../../../../packages/viz/src/components/VortexShedding").then(m => ({ default: m.VortexShedding })));
const IceSheetDynamics = lazy(() => import("../../../../packages/viz/src/components/IceSheetDynamics").then(m => ({ default: m.IceSheetDynamics })));
const RetrosynthesisTree = lazy(() => import("../../../../packages/viz/src/components/RetrosynthesisTree").then(m => ({ default: m.RetrosynthesisTree })));
const TanabeSuganoDiagram = lazy(() => import("../../../../packages/viz/src/components/TanabeSuganoDiagram").then(m => ({ default: m.TanabeSuganoDiagram })));
const ButlerVolmerCurve = lazy(() => import("../../../../packages/viz/src/components/ButlerVolmerCurve").then(m => ({ default: m.ButlerVolmerCurve })));
const PreferentialAttachment = lazy(() => import("../../../../packages/viz/src/components/PreferentialAttachment").then(m => ({ default: m.PreferentialAttachment })));
const ZKProofVerification = lazy(() => import("../../../../packages/viz/src/components/ZKProofVerification").then(m => ({ default: m.ZKProofVerification })));
const RaftLogReplication = lazy(() => import("../../../../packages/viz/src/components/RaftLogReplication").then(m => ({ default: m.RaftLogReplication })));
const ManhattanPlot = lazy(() => import("../../../../packages/viz/src/components/ManhattanPlot").then(m => ({ default: m.ManhattanPlot })));
const MacArthurConsumerResource = lazy(() => import("../../../../packages/viz/src/components/MacArthurConsumerResource").then(m => ({ default: m.MacArthurConsumerResource })));
const KinshipDiagram = lazy(() => import("../../../../packages/viz/src/components/KinshipDiagram").then(m => ({ default: m.KinshipDiagram })));
const ForwardKinematicsArm = lazy(() => import("../../../../packages/viz/src/components/ForwardKinematicsArm").then(m => ({ default: m.ForwardKinematicsArm })));
const GroupOrbits = lazy(() => import("../../../../packages/viz/src/components/GroupOrbits").then(m => ({ default: m.GroupOrbits })));
const FriedmannEquation = lazy(() => import("../../../../packages/viz/src/components/FriedmannEquation").then(m => ({ default: m.FriedmannEquation })));
const SchellingSegregation = lazy(() => import("../../../../packages/viz/src/components/SchellingSegregation").then(m => ({ default: m.SchellingSegregation })));
const BigFiveRadar = lazy(() => import("../../../../packages/viz/src/components/BigFiveRadar").then(m => ({ default: m.BigFiveRadar })));
const CivilizationTimeline = lazy(() => import("../../../../packages/viz/src/components/CivilizationTimeline").then(m => ({ default: m.CivilizationTimeline })));
const TruthTable = lazy(() => import("../../../../packages/viz/src/components/TruthTable").then(m => ({ default: m.TruthTable })));
const VotingSystems = lazy(() => import("../../../../packages/viz/src/components/VotingSystems").then(m => ({ default: m.VotingSystems })));
const ClonalSelection = lazy(() => import("../../../../packages/viz/src/components/ClonalSelection").then(m => ({ default: m.ClonalSelection })));
const GradientDescent2D = lazy(() => import("../../../../packages/viz/src/quiz/GradientDescent2D").then(m => ({ default: m.GradientDescent2D })));
const SamplingTemperatureLab = lazy(() => import("../../../../packages/viz/src/components/SamplingTemperatureLab").then(m => ({ default: m.SamplingTemperatureLab })));
const CrystalLattice = lazy(() => import("../../../../packages/viz/src/components/CrystalLattice").then(m => ({ default: m.CrystalLattice })));
const BrillouinZone = lazy(() => import("../../../../packages/viz/src/components/BrillouinZone").then(m => ({ default: m.BrillouinZone })));
const PhononDispersion = lazy(() => import("../../../../packages/viz/src/components/PhononDispersion").then(m => ({ default: m.PhononDispersion })));
const PrecedentNetwork = lazy(() => import("../../../../packages/viz/src/components/PrecedentNetwork").then(m => ({ default: m.PrecedentNetwork })));
const ForgettingCurve = lazy(() => import("../../../../packages/viz/src/components/ForgettingCurve").then(m => ({ default: m.ForgettingCurve })));
const BacterialGrowthCurve = lazy(() => import("../../../../packages/viz/src/components/BacterialGrowthCurve").then(m => ({ default: m.BacterialGrowthCurve })));
const AlleleFrequencyDrift = lazy(() => import("../../../../packages/viz/src/components/AlleleFrequencyDrift").then(m => ({ default: m.AlleleFrequencyDrift })));
const HarmonicSeries = lazy(() => import("../../../../packages/viz/src/components/HarmonicSeries").then(m => ({ default: m.HarmonicSeries })));
const ZoningGrid = lazy(() => import("../../../../packages/viz/src/components/ZoningGrid").then(m => ({ default: m.ZoningGrid })));
const ExtinctionTimeline = lazy(() => import("../../../../packages/viz/src/components/ExtinctionTimeline").then(m => ({ default: m.ExtinctionTimeline })));
const UtilityIndifference = lazy(() => import("../../../../packages/viz/src/components/UtilityIndifference").then(m => ({ default: m.UtilityIndifference })));
const StructuralLoadFlow = lazy(() => import("../../../../packages/viz/src/components/StructuralLoadFlow").then(m => ({ default: m.StructuralLoadFlow })));

// Names exposed here are also surfaced in the wiki editor's viz-picker.
// Keep the catalog ordered by topic adjacency rather than alphabetically
// so the picker reads as a learning sequence.
export const VIZ_NAMES = [
  "attention-heatmap",
  "softmax-temperature",
  "positional-encoding",
  "tokenizer-playground",
  "beam-search-tree",
  "layer-activations",
  "qkv-step-through",
  "embedding-explorer",
  "activation-function-gallery",
  "lorenz-attractor",
  "double-pendulum",
  "phase-portrait-1d",
  "solar-pv-curve",
  "carnot-cycle",
  "beam-deflection",
  "pk-curve",
  "roc-curve",
  "order-book",
  "mohrs-circle",
  "hr-diagram",
  "sir-model",
  "reactor-comparator",
  "point-kinetics",
  "ocean-ts-diagram",
  "atmospheric-sounding",
  "ecg-simulator",
  "shannon-channel",
  "gaussian-beam",
  "vowel-formant-chart",
  "phillips-curve",
  "hill-function",
  "drift-diffusion",
  "mm1-queue",
  "lotka-volterra",
  "radiocarbon-decay",
  "alignment-matrix",
  "ramachandran-plot",
  "hodgkin-huxley-ap",
  "lawson-criterion",
  "band-structure",
  "vortex-shedding",
  "ice-sheet-dynamics",
  "retrosynthesis-tree",
  "tanabe-sugano-diagram",
  "butler-volmer-curve",
  "preferential-attachment",
  "zk-proof-verification",
  "raft-log-replication",
  "manhattan-plot",
  "macarthur-consumer-resource",
  "kinship-diagram",
  "forward-kinematics-arm",
  "group-orbits",
  "friedmann-equation",
  "schelling-segregation",
  "big-five-radar",
  "civilization-timeline",
  "truth-table",
  "voting-systems",
  "clonal-selection",
  "gradient-descent-2d",
  "sampling-temperature-lab",
  "crystal-lattice",
  "brillouin-zone",
  "phonon-dispersion",
  "precedent-network",
  "forgetting-curve",
  "bacterial-growth-curve",
  "allele-frequency-drift",
  "harmonic-series",
  "zoning-grid",
  "extinction-timeline",
  "utility-indifference",
  "structural-load-flow",
] as const;

const VIZ_REGISTRY: Record<string, React.LazyExoticComponent<React.ComponentType<any>>> = {
  "attention-heatmap": AttentionHeatmap,
  "softmax-temperature": SoftmaxTemperature,
  "positional-encoding": PositionalEncoding,
  "tokenizer-playground": TokenizerPlayground,
  "beam-search-tree": BeamSearchTree,
  "layer-activations": LayerActivations,
  "qkv-step-through": QKVStepThrough,
  "embedding-explorer": EmbeddingExplorer,
  "activation-function-gallery": ActivationFunctionGallery,
  "lorenz-attractor": LorenzAttractor,
  "double-pendulum": DoublePendulum,
  "phase-portrait-1d": PhasePortrait1D,
  "solar-pv-curve": SolarPVCurve,
  "carnot-cycle": CarnotCycle,
  "beam-deflection": BeamDeflection,
  "pk-curve": PKCurve,
  "roc-curve": ROCCurve,
  "order-book": OrderBook,
  "mohrs-circle": MohrsCircle,
  "hr-diagram": HRDiagram,
  "sir-model": SIRModel,
  "reactor-comparator": ReactorComparator,
  "point-kinetics": PointKinetics,
  "ocean-ts-diagram": OceanTSDiagram,
  "atmospheric-sounding": AtmosphericSounding,
  "ecg-simulator": ECGSimulator,
  "shannon-channel": ShannonChannel,
  "gaussian-beam": GaussianBeam,
  "vowel-formant-chart": VowelFormantChart,
  "phillips-curve": PhillipsCurve,
  "hill-function": HillFunction,
  "drift-diffusion": DriftDiffusion,
  "mm1-queue": MM1Queue,
  "lotka-volterra": LotkaVolterra,
  "radiocarbon-decay": RadiocarbonDecay,
  "alignment-matrix": AlignmentMatrix,
  "ramachandran-plot": RamachandranPlot,
  "hodgkin-huxley-ap": HodgkinHuxleyAP,
  "lawson-criterion": LawsonCriterion,
  "band-structure": BandStructure,
  "vortex-shedding": VortexShedding,
  "ice-sheet-dynamics": IceSheetDynamics,
  "retrosynthesis-tree": RetrosynthesisTree,
  "tanabe-sugano-diagram": TanabeSuganoDiagram,
  "butler-volmer-curve": ButlerVolmerCurve,
  "preferential-attachment": PreferentialAttachment,
  "zk-proof-verification": ZKProofVerification,
  "raft-log-replication": RaftLogReplication,
  "manhattan-plot": ManhattanPlot,
  "macarthur-consumer-resource": MacArthurConsumerResource,
  "kinship-diagram": KinshipDiagram,
  "forward-kinematics-arm": ForwardKinematicsArm,
  "group-orbits": GroupOrbits,
  "friedmann-equation": FriedmannEquation,
  "schelling-segregation": SchellingSegregation,
  "big-five-radar": BigFiveRadar,
  "civilization-timeline": CivilizationTimeline,
  "truth-table": TruthTable,
  "voting-systems": VotingSystems,
  "clonal-selection": ClonalSelection,
  "gradient-descent-2d": GradientDescent2D,
  "sampling-temperature-lab": SamplingTemperatureLab,
  "crystal-lattice": CrystalLattice,
  "brillouin-zone": BrillouinZone,
  "phonon-dispersion": PhononDispersion,
  "precedent-network": PrecedentNetwork,
  "forgetting-curve": ForgettingCurve,
  "bacterial-growth-curve": BacterialGrowthCurve,
  "allele-frequency-drift": AlleleFrequencyDrift,
  "harmonic-series": HarmonicSeries,
  "zoning-grid": ZoningGrid,
  "extinction-timeline": ExtinctionTimeline,
  "utility-indifference": UtilityIndifference,
  "structural-load-flow": StructuralLoadFlow,
};

interface VizEmbedProps {
  name: string;
}

export function VizEmbed({ name }: VizEmbedProps) {
  const Component = VIZ_REGISTRY[name];

  if (!Component) {
    return (
      <div className="my-4 p-4 rounded-lg border border-border bg-muted/50 text-sm text-muted-foreground">
        Visualization "{name}" not found.
      </div>
    );
  }

  return (
    <Suspense
      fallback={
        <div className="my-4 p-8 rounded-lg border border-border bg-muted/50 flex items-center justify-center">
          <div className="animate-pulse text-sm text-muted-foreground">Loading visualization...</div>
        </div>
      }
    >
      <Component />
    </Suspense>
  );
}
