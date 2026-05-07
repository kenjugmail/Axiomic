// Sprint 18 — proactive coach suggestion card.
//
// Renders a single ranked suggestion in the AI sidebar's quick-checks
// header. Three CTA shapes: open-link (default), seed-the-chat
// (passes the title as the first user message and lets the chat
// endpoint do the talking), or dismiss (just hide for the session).

import { Link } from "react-router-dom";
import {
  AlertTriangle,
  ArrowUpRight,
  BookOpen,
  GraduationCap,
  Layers,
  RotateCcw,
} from "lucide-react";
import type { CoachSuggestion, CoachSuggestionKind } from "@axiomic/types";

interface Props {
  suggestion: CoachSuggestion;
  // Optional: when the parent wants to seed the chat instead of
  // navigating, it can pass an onAccept callback. The default is to
  // render a Link to ctaUrl.
  onAccept?: (suggestion: CoachSuggestion) => void;
  onDismiss?: () => void;
}

const ICON_FOR_KIND: Record<CoachSuggestionKind, typeof BookOpen> = {
  review_prereq: Layers,
  review_mistake: RotateCcw,
  spaced_rep: AlertTriangle,
  next_node: GraduationCap,
  primer: BookOpen,
};

export function CoachSuggestionCard({ suggestion, onAccept, onDismiss }: Props) {
  const Icon = ICON_FOR_KIND[suggestion.kind] ?? BookOpen;

  const inner = (
    <>
      <div className="flex items-start gap-2">
        <div className="mt-0.5 text-muted-foreground">
          <Icon className="w-3.5 h-3.5" strokeWidth={2} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium leading-snug">
            {suggestion.title}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 leading-snug">
            {suggestion.body}
          </p>
        </div>
        <ArrowUpRight
          className="w-3 h-3 text-muted-foreground flex-shrink-0 mt-0.5"
          strokeWidth={2}
        />
      </div>
    </>
  );

  const cardClass =
    "block w-full text-left p-2.5 rounded-md border border-border bg-card hover:bg-accent/30 transition-colors duration-fast";

  return (
    <div className="relative group">
      {onAccept ? (
        <button
          type="button"
          onClick={() => onAccept(suggestion)}
          className={cardClass}
        >
          {inner}
        </button>
      ) : (
        <Link to={suggestion.ctaUrl} className={cardClass}>
          {inner}
        </Link>
      )}
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="absolute top-1 right-1 text-[10px] text-muted-foreground/60 hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity"
        >
          ✕
        </button>
      )}
    </div>
  );
}
