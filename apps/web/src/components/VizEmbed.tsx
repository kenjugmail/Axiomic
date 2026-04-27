import { lazy, Suspense } from "react";

// Lazy-load visualizations
const AttentionHeatmap = lazy(() => import("@axiomic/viz/src/components/AttentionHeatmap").then(m => ({ default: m.AttentionHeatmap })));
const SoftmaxTemperature = lazy(() => import("@axiomic/viz/src/components/SoftmaxTemperature").then(m => ({ default: m.SoftmaxTemperature })));
const PositionalEncoding = lazy(() => import("@axiomic/viz/src/components/PositionalEncoding").then(m => ({ default: m.PositionalEncoding })));
const TokenizerPlayground = lazy(() => import("@axiomic/viz/src/components/TokenizerPlayground").then(m => ({ default: m.TokenizerPlayground })));
const BeamSearchTree = lazy(() => import("@axiomic/viz/src/components/BeamSearchTree").then(m => ({ default: m.BeamSearchTree })));
const LayerActivations = lazy(() => import("@axiomic/viz/src/components/LayerActivations").then(m => ({ default: m.LayerActivations })));
const QKVStepThrough = lazy(() => import("@axiomic/viz/src/components/QKVStepThrough").then(m => ({ default: m.QKVStepThrough })));
const EmbeddingExplorer = lazy(() => import("@axiomic/viz/src/components/EmbeddingExplorer").then(m => ({ default: m.EmbeddingExplorer })));

const VIZ_REGISTRY: Record<string, React.LazyExoticComponent<React.ComponentType<any>>> = {
  "attention-heatmap": AttentionHeatmap,
  "softmax-temperature": SoftmaxTemperature,
  "positional-encoding": PositionalEncoding,
  "tokenizer-playground": TokenizerPlayground,
  "beam-search-tree": BeamSearchTree,
  "layer-activations": LayerActivations,
  "qkv-step-through": QKVStepThrough,
  "embedding-explorer": EmbeddingExplorer,
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
