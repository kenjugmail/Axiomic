// Sprint 28 — `:::lab[name]` directive renderer. Mirrors VizEmbed but
// for interactive widgets that carry learner state.

import { Suspense } from "react";
import { getLab } from "../labs/registry";
import type { LabProps } from "../labs/registry";

interface Props extends LabProps {
  name: string;
}

export function LabEmbed({ name, ...rest }: Props) {
  const Lab = getLab(name);
  if (!Lab) {
    return (
      <div className="my-4 p-4 rounded-lg border border-amber-500/40 bg-amber-500/5 text-xs text-amber-700 dark:text-amber-300">
        Unknown lab: <span className="font-mono">{name}</span>
      </div>
    );
  }
  return (
    <Suspense
      fallback={
        <div className="my-4 p-4 rounded-lg border border-border bg-muted/20 text-xs text-muted-foreground">
          Loading lab…
        </div>
      }
    >
      <Lab {...rest} />
    </Suspense>
  );
}
