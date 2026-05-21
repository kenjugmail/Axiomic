import { Component, Suspense, lazy } from "react";

// Lazy-loaded viz registry. Each entry is its own chunk so a lesson
// that doesn't reference a viz pays nothing to load it. Shared between
// LessonPage (player) and LessonPreviewModal (editor preview).
const LazySoftmaxTemperatureSlider = lazy(() =>
  import(
    "../../../../../packages/viz/src/quiz/SoftmaxTemperatureSlider"
  ).then((m) => ({ default: m.SoftmaxTemperatureSlider })),
);
const LazyAttentionHeatmapExplorer = lazy(() =>
  import(
    "../../../../../packages/viz/src/quiz/AttentionHeatmapExplorer"
  ).then((m) => ({ default: m.AttentionHeatmapExplorer })),
);
const LazyGradientDescent2D = lazy(() =>
  import("../../../../../packages/viz/src/quiz/GradientDescent2D").then(
    (m) => ({ default: m.GradientDescent2D }),
  ),
);
const LazyTokenizerPlayground = lazy(() =>
  import(
    "../../../../../packages/viz/src/components/TokenizerPlayground"
  ).then((m) => ({ default: m.TokenizerPlayground })),
);
const LazyEmbeddingExplorer = lazy(() =>
  import(
    "../../../../../packages/viz/src/components/EmbeddingExplorer"
  ).then((m) => ({ default: m.EmbeddingExplorer })),
);
const LazyLayerActivations = lazy(() =>
  import("../../../../../packages/viz/src/components/LayerActivations").then(
    (m) => ({ default: m.LayerActivations }),
  ),
);
const LazyPositionalEncoding = lazy(() =>
  import(
    "../../../../../packages/viz/src/components/PositionalEncoding"
  ).then((m) => ({ default: m.PositionalEncoding })),
);
const LazyActivationFunctionGallery = lazy(() =>
  import(
    "../../../../../packages/viz/src/components/ActivationFunctionGallery"
  ).then((m) => ({ default: m.ActivationFunctionGallery })),
);
const LazyLorenzAttractor = lazy(() =>
  import("../../../../../packages/viz/src/components/LorenzAttractor").then(
    (m) => ({ default: m.LorenzAttractor }),
  ),
);
const LazySolarPVCurve = lazy(() =>
  import("../../../../../packages/viz/src/components/SolarPVCurve").then(
    (m) => ({ default: m.SolarPVCurve }),
  ),
);
const LazyCarnotCycle = lazy(() =>
  import("../../../../../packages/viz/src/components/CarnotCycle").then(
    (m) => ({ default: m.CarnotCycle }),
  ),
);
const LazyBeamDeflection = lazy(() =>
  import("../../../../../packages/viz/src/components/BeamDeflection").then(
    (m) => ({ default: m.BeamDeflection }),
  ),
);
const LazyPKCurve = lazy(() =>
  import("../../../../../packages/viz/src/components/PKCurve").then(
    (m) => ({ default: m.PKCurve }),
  ),
);
const LazyROCCurve = lazy(() =>
  import("../../../../../packages/viz/src/components/ROCCurve").then(
    (m) => ({ default: m.ROCCurve }),
  ),
);
const LazyOrderBook = lazy(() =>
  import("../../../../../packages/viz/src/components/OrderBook").then(
    (m) => ({ default: m.OrderBook }),
  ),
);
const LazyMohrsCircle = lazy(() =>
  import("../../../../../packages/viz/src/components/MohrsCircle").then(
    (m) => ({ default: m.MohrsCircle }),
  ),
);
const LazyHRDiagram = lazy(() =>
  import("../../../../../packages/viz/src/components/HRDiagram").then(
    (m) => ({ default: m.HRDiagram }),
  ),
);
const LazySIRModel = lazy(() =>
  import("../../../../../packages/viz/src/components/SIRModel").then(
    (m) => ({ default: m.SIRModel }),
  ),
);
const LazyReactorComparator = lazy(() =>
  import("../../../../../packages/viz/src/components/ReactorComparator").then(
    (m) => ({ default: m.ReactorComparator }),
  ),
);
const LazyPointKinetics = lazy(() =>
  import("../../../../../packages/viz/src/components/PointKinetics").then(
    (m) => ({ default: m.PointKinetics }),
  ),
);
const LazyOceanTSDiagram = lazy(() =>
  import("../../../../../packages/viz/src/components/OceanTSDiagram").then(
    (m) => ({ default: m.OceanTSDiagram }),
  ),
);
const LazyAtmosphericSounding = lazy(() =>
  import("../../../../../packages/viz/src/components/AtmosphericSounding").then(
    (m) => ({ default: m.AtmosphericSounding }),
  ),
);
const LazyECGSimulator = lazy(() =>
  import("../../../../../packages/viz/src/components/ECGSimulator").then(
    (m) => ({ default: m.ECGSimulator }),
  ),
);
const LazyShannonChannel = lazy(() =>
  import("../../../../../packages/viz/src/components/ShannonChannel").then(
    (m) => ({ default: m.ShannonChannel }),
  ),
);
const LazyGaussianBeam = lazy(() =>
  import("../../../../../packages/viz/src/components/GaussianBeam").then(
    (m) => ({ default: m.GaussianBeam }),
  ),
);
const LazyVowelFormantChart = lazy(() =>
  import("../../../../../packages/viz/src/components/VowelFormantChart").then(
    (m) => ({ default: m.VowelFormantChart }),
  ),
);
const LazyPhillipsCurve = lazy(() =>
  import("../../../../../packages/viz/src/components/PhillipsCurve").then(
    (m) => ({ default: m.PhillipsCurve }),
  ),
);
const LazyHillFunction = lazy(() =>
  import("../../../../../packages/viz/src/components/HillFunction").then(
    (m) => ({ default: m.HillFunction }),
  ),
);
const LazyDriftDiffusion = lazy(() =>
  import("../../../../../packages/viz/src/components/DriftDiffusion").then(
    (m) => ({ default: m.DriftDiffusion }),
  ),
);
const LazyDoublePendulum = lazy(() =>
  import("../../../../../packages/viz/src/components/DoublePendulum").then(
    (m) => ({ default: m.DoublePendulum }),
  ),
);
const LazyPhasePortrait1D = lazy(() =>
  import("../../../../../packages/viz/src/components/PhasePortrait1D").then(
    (m) => ({ default: m.PhasePortrait1D }),
  ),
);
const LazyMM1Queue = lazy(() =>
  import("../../../../../packages/viz/src/components/MM1Queue").then(
    (m) => ({ default: m.MM1Queue }),
  ),
);
const LazyLotkaVolterra = lazy(() =>
  import("../../../../../packages/viz/src/components/LotkaVolterra").then(
    (m) => ({ default: m.LotkaVolterra }),
  ),
);
const LazyRadiocarbonDecay = lazy(() =>
  import("../../../../../packages/viz/src/components/RadiocarbonDecay").then(
    (m) => ({ default: m.RadiocarbonDecay }),
  ),
);
const LazyAlignmentMatrix = lazy(() =>
  import("../../../../../packages/viz/src/components/AlignmentMatrix").then(
    (m) => ({ default: m.AlignmentMatrix }),
  ),
);
const LazyRamachandranPlot = lazy(() =>
  import("../../../../../packages/viz/src/components/RamachandranPlot").then(
    (m) => ({ default: m.RamachandranPlot }),
  ),
);
const LazyHodgkinHuxleyAP = lazy(() =>
  import("../../../../../packages/viz/src/components/HodgkinHuxleyAP").then(
    (m) => ({ default: m.HodgkinHuxleyAP }),
  ),
);
const LazyLawsonCriterion = lazy(() =>
  import("../../../../../packages/viz/src/components/LawsonCriterion").then(
    (m) => ({ default: m.LawsonCriterion }),
  ),
);
const LazyBandStructure = lazy(() =>
  import("../../../../../packages/viz/src/components/BandStructure").then(
    (m) => ({ default: m.BandStructure }),
  ),
);
const LazyVortexShedding = lazy(() =>
  import("../../../../../packages/viz/src/components/VortexShedding").then(
    (m) => ({ default: m.VortexShedding }),
  ),
);
const LazyIceSheetDynamics = lazy(() =>
  import("../../../../../packages/viz/src/components/IceSheetDynamics").then(
    (m) => ({ default: m.IceSheetDynamics }),
  ),
);
const LazyRetrosynthesisTree = lazy(() =>
  import("../../../../../packages/viz/src/components/RetrosynthesisTree").then(
    (m) => ({ default: m.RetrosynthesisTree }),
  ),
);
const LazyTanabeSuganoDiagram = lazy(() =>
  import("../../../../../packages/viz/src/components/TanabeSuganoDiagram").then(
    (m) => ({ default: m.TanabeSuganoDiagram }),
  ),
);
const LazyButlerVolmerCurve = lazy(() =>
  import("../../../../../packages/viz/src/components/ButlerVolmerCurve").then(
    (m) => ({ default: m.ButlerVolmerCurve }),
  ),
);
const LazyPreferentialAttachment = lazy(() =>
  import("../../../../../packages/viz/src/components/PreferentialAttachment").then(
    (m) => ({ default: m.PreferentialAttachment }),
  ),
);
const LazyZKProofVerification = lazy(() =>
  import("../../../../../packages/viz/src/components/ZKProofVerification").then(
    (m) => ({ default: m.ZKProofVerification }),
  ),
);
const LazyRaftLogReplication = lazy(() =>
  import("../../../../../packages/viz/src/components/RaftLogReplication").then(
    (m) => ({ default: m.RaftLogReplication }),
  ),
);
const LazyManhattanPlot = lazy(() =>
  import("../../../../../packages/viz/src/components/ManhattanPlot").then(
    (m) => ({ default: m.ManhattanPlot }),
  ),
);
const LazyMacArthurConsumerResource = lazy(() =>
  import("../../../../../packages/viz/src/components/MacArthurConsumerResource").then(
    (m) => ({ default: m.MacArthurConsumerResource }),
  ),
);
const LazyKinshipDiagram = lazy(() =>
  import("../../../../../packages/viz/src/components/KinshipDiagram").then(
    (m) => ({ default: m.KinshipDiagram }),
  ),
);

function VizSkeleton() {
  return (
    <div className="min-h-[280px] w-full rounded-md bg-muted animate-pulse" />
  );
}

class VizErrorBoundary extends Component<
  { children: React.ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {}
  render() {
    if (this.state.failed) {
      return (
        <div className="min-h-[120px] flex items-center justify-center rounded-md border border-dashed border-border bg-muted/40 text-xs text-muted-foreground p-4 text-center">
          Visualization unavailable — keep reading; the concept stands on
          its own.
        </div>
      );
    }
    return this.props.children;
  }
}

function VizByName({
  name,
  props,
}: {
  name: string;
  props?: Record<string, unknown>;
}) {
  switch (name) {
    case "softmax-temperature-preview":
      return (
        <LazySoftmaxTemperatureSlider
          value={typeof props?.value === "number" ? props.value : 1}
        />
      );
    case "attention-heatmap-explorer":
      return (
        <LazyAttentionHeatmapExplorer
          presetIndex={
            typeof props?.presetIndex === "number" ? props.presetIndex : 0
          }
        />
      );
    case "gradient-descent-2d":
      return (
        <LazyGradientDescent2D
          learningRate={
            typeof props?.learningRate === "number" ? props.learningRate : 0.1
          }
          {...(props as object)}
        />
      );
    case "tokenizer-playground":
      return <LazyTokenizerPlayground />;
    case "embedding-explorer":
      return <LazyEmbeddingExplorer />;
    case "layer-activations":
      return <LazyLayerActivations />;
    case "positional-encoding":
      return <LazyPositionalEncoding />;
    case "activation-function-gallery":
      return (
        <LazyActivationFunctionGallery
          x={typeof props?.x === "number" ? props.x : undefined}
        />
      );
    case "lorenz-attractor":
      return <LazyLorenzAttractor {...(props as object)} />;
    case "double-pendulum":
      return <LazyDoublePendulum {...(props as object)} />;
    case "phase-portrait-1d":
      return <LazyPhasePortrait1D {...(props as object)} />;
    case "solar-pv-curve":
      return <LazySolarPVCurve {...(props as object)} />;
    case "carnot-cycle":
      return <LazyCarnotCycle {...(props as object)} />;
    case "beam-deflection":
      return <LazyBeamDeflection {...(props as object)} />;
    case "pk-curve":
      return <LazyPKCurve {...(props as object)} />;
    case "roc-curve":
      return <LazyROCCurve {...(props as object)} />;
    case "order-book":
      return <LazyOrderBook {...(props as object)} />;
    case "mohrs-circle":
      return <LazyMohrsCircle {...(props as object)} />;
    case "hr-diagram":
      return <LazyHRDiagram {...(props as object)} />;
    case "sir-model":
      return <LazySIRModel {...(props as object)} />;
    case "reactor-comparator":
      return <LazyReactorComparator {...(props as object)} />;
    case "point-kinetics":
      return <LazyPointKinetics {...(props as object)} />;
    case "ocean-ts-diagram":
      return <LazyOceanTSDiagram {...(props as object)} />;
    case "atmospheric-sounding":
      return <LazyAtmosphericSounding {...(props as object)} />;
    case "ecg-simulator":
      return <LazyECGSimulator {...(props as object)} />;
    case "shannon-channel":
      return <LazyShannonChannel {...(props as object)} />;
    case "gaussian-beam":
      return <LazyGaussianBeam {...(props as object)} />;
    case "vowel-formant-chart":
      return <LazyVowelFormantChart {...(props as object)} />;
    case "phillips-curve":
      return <LazyPhillipsCurve {...(props as object)} />;
    case "hill-function":
      return <LazyHillFunction {...(props as object)} />;
    case "drift-diffusion":
      return <LazyDriftDiffusion {...(props as object)} />;
    case "mm1-queue":
      return <LazyMM1Queue {...(props as object)} />;
    case "lotka-volterra":
      return <LazyLotkaVolterra {...(props as object)} />;
    case "radiocarbon-decay":
      return <LazyRadiocarbonDecay {...(props as object)} />;
    case "alignment-matrix":
      return <LazyAlignmentMatrix {...(props as object)} />;
    case "ramachandran-plot":
      return <LazyRamachandranPlot {...(props as object)} />;
    case "hodgkin-huxley-ap":
      return <LazyHodgkinHuxleyAP {...(props as object)} />;
    case "lawson-criterion":
      return <LazyLawsonCriterion {...(props as object)} />;
    case "band-structure":
      return <LazyBandStructure {...(props as object)} />;
    case "vortex-shedding":
      return <LazyVortexShedding {...(props as object)} />;
    case "ice-sheet-dynamics":
      return <LazyIceSheetDynamics {...(props as object)} />;
    case "retrosynthesis-tree":
      return <LazyRetrosynthesisTree {...(props as object)} />;
    case "tanabe-sugano-diagram":
      return <LazyTanabeSuganoDiagram {...(props as object)} />;
    case "butler-volmer-curve":
      return <LazyButlerVolmerCurve {...(props as object)} />;
    case "preferential-attachment":
      return <LazyPreferentialAttachment {...(props as object)} />;
    case "zk-proof-verification":
      return <LazyZKProofVerification {...(props as object)} />;
    case "raft-log-replication":
      return <LazyRaftLogReplication {...(props as object)} />;
    case "manhattan-plot":
      return <LazyManhattanPlot {...(props as object)} />;
    case "macarthur-consumer-resource":
      return <LazyMacArthurConsumerResource {...(props as object)} />;
    case "kinship-diagram":
      return <LazyKinshipDiagram {...(props as object)} />;
    default:
      return null;
  }
}

export function PreviewViz(props: {
  name: string;
  props?: Record<string, unknown>;
}) {
  return (
    <VizErrorBoundary>
      <Suspense fallback={<VizSkeleton />}>
        <VizByName {...props} />
      </Suspense>
    </VizErrorBoundary>
  );
}
