// Sprint 90 — Static flagship demo route for the competency loop.
// Curated links only: no new APIs, no dynamic assumptions.

import { Link } from "react-router-dom";
import { CheckCircle2, Link2 } from "lucide-react";

type DemoStep = {
  title: string;
  detail: string;
  to: string;
  cta: string;
};

const STEPS: DemoStep[] = [
  {
    title: "Read the source concept",
    detail: "Start in wiki to anchor terminology and definitions.",
    to: "/wiki",
    cta: "Open wiki index",
  },
  {
    title: "Run a timed competency check",
    detail: "Use the exam framework for score + percentile diagnostics.",
    to: "/exams",
    cta: "Open exams",
  },
  {
    title: "Inspect weak concepts",
    detail: "Review model-detected weak areas after attempts and lessons.",
    to: "/me/weak-concepts",
    cta: "Open weak concepts",
  },
  {
    title: "Build portfolio proof",
    detail: "Complete capstone-track work and publish artifact pages.",
    to: "/tracks",
    cta: "Open tracks",
  },
  {
    title: "Verify transcript signatures",
    detail: "Validate signed artifact bundles at byte level.",
    to: "/verify",
    cta: "Open verifier",
  },
];

export function DemoCompetencyLoopPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      <Link to="/" className="text-xs text-muted-foreground hover:text-foreground">
        &larr; Home
      </Link>
      <h1 className="font-display text-3xl sm:text-4xl font-semibold tracking-tight mt-2">
        Competency loop demo
      </h1>
      <p className="text-sm text-muted-foreground mt-2 max-w-prose">
        Static walkthrough of Axiomic's learn → assess → diagnose → build →
        verify loop. Every link below is a live route from the app router.
      </p>

      <ol className="mt-6 space-y-3">
        {STEPS.map((step, idx) => (
          <li key={step.title} className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Step {idx + 1}
                </div>
                <h2 className="text-sm font-semibold mt-1 inline-flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-primary" strokeWidth={2} />
                  {step.title}
                </h2>
                <p className="text-xs text-muted-foreground mt-1">{step.detail}</p>
              </div>
              <Link
                to={step.to}
                className="shrink-0 inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md border border-border hover:bg-accent/40"
              >
                <Link2 className="w-3 h-3" strokeWidth={2} />
                {step.cta}
              </Link>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
