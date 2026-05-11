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
    title: "Diagnose",
    detail:
      "What does this learner already know — with evidence, not self-report? Tiered explanations and tracked progress reveal gaps before they compound.",
    to: "/wiki",
    cta: "Open wiki",
  },
  {
    title: "Assess",
    detail:
      "Timed competency checks with section-level scoring and percentile diagnostics. No multiple-choice-only theatrics.",
    to: "/exams",
    cta: "Open exams",
  },
  {
    title: "Remediate",
    detail:
      "Weak concepts surface automatically from the learner's own work — quizzes, lesson interactions, capstone submissions — not from a curriculum guess.",
    to: "/me/weak-concepts",
    cta: "Open weak concepts",
  },
  {
    title: "Build",
    detail:
      "Capstones produce original artifacts — code, papers, lab reports — graded against a public rubric. Portfolio, not test score.",
    to: "/tracks",
    cta: "Open tracks",
  },
  {
    title: "Verify",
    detail:
      "Signed transcripts any employer or institution can verify in seconds against Axiomic's public ed25519 key. No phone-home, no trust-us.",
    to: "/verify?artifact=demo-student-6-clip-style-retriever",
    cta: "Verify a real credential",
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
        How Axiomic turns "I took a course" into "here is a signed,
        verifiable record of what I can do." Five steps. Every link
        below is a live route in this build.
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

      {/* Audience-specific exits. Both land on routes that exist in
          this build — the institution path goes to the public class
          directory; the evaluator path opens the pre-populated verify
          page for the seeded demo capstone. */}
      <div className="mt-8 grid sm:grid-cols-2 gap-3">
        <Link
          to="/classes/discover"
          className="rounded-lg border border-border bg-card p-4 hover:border-primary/40 transition-colors"
        >
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
            For institutions
          </div>
          <div className="mt-1 text-sm font-semibold">Show me cohort tools</div>
          <div className="mt-1 text-xs text-muted-foreground">
            Class directory, roster progress, instructor dashboards.
          </div>
        </Link>
        <Link
          to="/verify?artifact=demo-student-6-clip-style-retriever"
          className="rounded-lg border border-border bg-card p-4 hover:border-primary/40 transition-colors"
        >
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
            For evaluators
          </div>
          <div className="mt-1 text-sm font-semibold">Verify a real credential</div>
          <div className="mt-1 text-xs text-muted-foreground">
            Live signature check against the seeded demo capstone artifact.
          </div>
        </Link>
      </div>
    </div>
  );
}
