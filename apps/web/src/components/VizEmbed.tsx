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
