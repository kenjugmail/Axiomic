// Sprint 28 — Lab framework registry.
//
// A "Lab" is a structured interactive widget embedded inside markdown
// via `:::lab[lab-name]`. Distinct from a viz: vizes are passive
// visualizations; labs carry learner state and can expose an
// `evaluate(state)` summary for the rubric grader.
//
// Adding a new lab: write a component that takes `(props: LabProps)`,
// register it below, and reference it via the directive.

import { lazy, type LazyExoticComponent, type ComponentType } from "react";

export interface LabProps {
  // Stable identity for the lab instance — used as a localStorage key.
  instanceId?: string;
  // Optional config string parsed out of the directive.
  config?: string;
  // Notify the parent (e.g. CapstoneWorkspacePage) of state changes.
  // The lab decides what state shape is meaningful.
  onStateChange?: (state: Record<string, unknown>) => void;
}

const LABS: Record<string, LazyExoticComponent<ComponentType<LabProps>>> = {
  "attention-weights-lab": lazy(() =>
    import("./AttentionWeightsLab").then((m) => ({ default: m.AttentionWeightsLab })),
  ),
  "tokenizer-playground-lab": lazy(() =>
    import("./TokenizerPlaygroundLab").then((m) => ({ default: m.TokenizerPlaygroundLab })),
  ),
  "sampling-temperature-lab": lazy(() =>
    import("./SamplingTemperatureLab").then((m) => ({ default: m.SamplingTemperatureLab })),
  ),
};

export const LAB_NAMES = Object.keys(LABS);

export function getLab(
  name: string,
): LazyExoticComponent<ComponentType<LabProps>> | null {
  return LABS[name] ?? null;
}
