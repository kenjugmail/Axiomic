// Sprint 33 — Knowledge MRI drill panel.
//
// Click a heatmap cell → this slides in from the right. Shows the
// concept's status, evidence, and a single "Next action" CTA chosen
// from state.

import { Link } from "react-router-dom";
import { ChevronRight, Sparkles, X } from "lucide-react";
import type { KnowledgeMriNode } from "@axiomic/types";

interface Props {
  node: KnowledgeMriNode;
  pathSlug: string;
  onClose: () => void;
}

interface NextAction {
  label: string;
  href: string;
  reason: string;
}

function pickNextAction(node: KnowledgeMriNode, pathSlug: string): NextAction {
  // Active misconception → coach me in misconception mode. No
  // diagnosisId is wired through here yet; AISidebar's auto-routing
  // will select the right diagnosis once on the wiki page.
  if (node.activeDiagnoses > 0 && node.pageSlug) {
    return {
      label: "Coach me on this misconception",
      href: `/wiki/${node.pageSlug}?aiMode=misconception`,
      reason: `${node.activeDiagnoses} active misconception${node.activeDiagnoses === 1 ? "" : "s"} detected on this concept.`,
    };
  }
  if (!node.prereqsMet && node.pageSlug) {
    return {
      label: "Bridge from a prereq",
      href: `/wiki/${node.pageSlug}?aiMode=bridge`,
      reason: "You haven't mastered all the prerequisites yet — start with a bridge explanation.",
    };
  }
  if (
    node.status === "mastered" &&
    node.flashcardRetention !== null &&
    node.flashcardRetention < 0.6 &&
    node.pageSlug
  ) {
    return {
      label: "Review flashcards",
      href: `/flashcards?slug=${encodeURIComponent(node.pageSlug)}`,
      reason: "Recent flashcard retention is dipping — quick review.",
    };
  }
  if (node.status === "untouched") {
    return {
      label: "Start lesson",
      href: `/paths/${pathSlug}/lessons/${node.nodeSlug}`,
      reason: "You haven't started this node yet.",
    };
  }
  if (node.unresolvedMistakes > 0 && node.pageSlug) {
    return {
      label: "Review missed questions",
      href: `/wiki/${node.pageSlug}?practice=1`,
      reason: `${node.unresolvedMistakes} unresolved mistake${node.unresolvedMistakes === 1 ? "" : "s"} on this concept.`,
    };
  }
  return {
    label: "Open lesson",
    href: `/paths/${pathSlug}/lessons/${node.nodeSlug}`,
    reason: "Keep going.",
  };
}

export function MriDrillPanel({ node, pathSlug, onClose }: Props) {
  const next = pickNextAction(node, pathSlug);
  const retentionPct =
    node.flashcardRetention != null
      ? Math.round(node.flashcardRetention * 100)
      : null;
  const quizPct =
    node.quizScore != null ? Math.round(node.quizScore * 100) : null;

  return (
    <aside
      className="fixed right-0 top-14 bottom-0 w-full sm:w-96 z-30 bg-card border-l border-border flex flex-col animate-fade-in shadow-elevated"
      role="complementary"
      aria-label="Concept detail"
    >
      <header className="flex items-start justify-between gap-3 px-4 py-3 border-b border-border">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
            {node.level}
          </div>
          <h3 className="font-display text-base font-semibold tracking-tight leading-tight">
            {node.pageTitle ?? node.title}
          </h3>
          <span
            className={`mt-1 inline-block text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full border ${
              node.status === "mastered"
                ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-700 dark:text-emerald-300"
                : node.status === "in_progress"
                  ? "bg-amber-500/15 border-amber-500/40 text-amber-700 dark:text-amber-300"
                  : "bg-muted border-border text-muted-foreground"
            }`}
          >
            {node.status === "in_progress" ? "started" : node.status}
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-1.5 -mr-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/40"
          aria-label="Close detail"
        >
          <X className="w-4 h-4" strokeWidth={2} />
        </button>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
            Why this color
          </div>
          <ul className="space-y-1.5 text-xs">
            <li className="flex justify-between">
              <span className="text-muted-foreground">Quiz score</span>
              <span className="tabular-nums">
                {quizPct != null ? `${quizPct}%` : "—"}
              </span>
            </li>
            <li className="flex justify-between">
              <span className="text-muted-foreground">Active misconceptions</span>
              <span
                className={`tabular-nums ${
                  node.activeDiagnoses > 0
                    ? "text-rose-600 dark:text-rose-400"
                    : ""
                }`}
              >
                {node.activeDiagnoses}
              </span>
            </li>
            <li className="flex justify-between">
              <span className="text-muted-foreground">Unresolved mistakes</span>
              <span
                className={`tabular-nums ${
                  node.unresolvedMistakes > 0
                    ? "text-amber-700 dark:text-amber-300"
                    : ""
                }`}
              >
                {node.unresolvedMistakes}
              </span>
            </li>
            <li className="flex justify-between">
              <span className="text-muted-foreground">Flashcard retention</span>
              <span className="tabular-nums">
                {retentionPct != null ? `${retentionPct}%` : "—"}
              </span>
            </li>
            <li className="flex justify-between">
              <span className="text-muted-foreground">Prereqs met</span>
              <span>{node.prereqsMet ? "yes" : "no"}</span>
            </li>
          </ul>
        </div>

        {node.pageSlug && (
          <Link
            to={`/wiki/${node.pageSlug}`}
            className="block text-xs px-3 py-2 rounded-md border border-border hover:bg-accent/40 transition-colors"
          >
            Open the wiki page →
          </Link>
        )}

        {node.status === "mastered" && node.nodeSlug && (
          <Link
            to={`/paths/${pathSlug}/lessons/${node.nodeSlug}`}
            className="block text-xs px-3 py-2 rounded-md border border-border hover:bg-accent/40 transition-colors"
          >
            Review the lesson →
          </Link>
        )}
      </div>

      <footer className="border-t border-border p-3 bg-muted/20">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
          Next action
        </div>
        <p className="text-xs text-muted-foreground mb-2">{next.reason}</p>
        <Link
          to={next.href}
          className="inline-flex items-center justify-between w-full px-3 py-2 rounded-md bg-primary text-primary-foreground text-sm hover:bg-primary/90 transition-colors"
        >
          <span className="inline-flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5" strokeWidth={2} />
            {next.label}
          </span>
          <ChevronRight className="w-4 h-4" strokeWidth={2} />
        </Link>
      </footer>
    </aside>
  );
}
