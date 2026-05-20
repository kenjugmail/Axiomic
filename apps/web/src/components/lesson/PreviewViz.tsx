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
