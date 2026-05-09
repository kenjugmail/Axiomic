// Sprint 64b-2 — extracted + visually-refreshed tutor mode selector.
//
// Each of the 5 modes carries a Lucide icon + a brand-aligned color
// palette + a tooltip explanation. Auto-selected modes (e.g., when
// the sidebar picks "misconception" because a diagnosis matches the
// page) gain a small "auto" badge in the corner of the chip so the
// user knows the system chose it.

import { Sparkles, AlertCircle, Link as LinkIcon, Swords, PenLine } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { TutorMode } from "@axiomic/types";

interface ModeMeta {
  label: string;
  icon: LucideIcon;
  description: string;
  // Tailwind classes for the active + inactive states. Active uses the
  // mode's color; inactive stays muted but tints on hover so the
  // mode's identity is still conveyed.
  activeClass: string;
  inactiveClass: string;
}

const META: Record<TutorMode, ModeMeta> = {
  socratic: {
    label: "Socratic",
    icon: Sparkles,
    description:
      "Asks you one calibrated question first instead of dumping the answer.",
    activeClass: "border-primary bg-primary/15 text-primary",
    inactiveClass: "border-border text-muted-foreground hover:bg-primary/10 hover:text-primary",
  },
  misconception: {
    label: "Misconception",
    icon: AlertCircle,
    description:
      "Probes a specific diagnosed misunderstanding for this concept.",
    activeClass: "border-amber-500 bg-amber-500/15 text-amber-700 dark:text-amber-300",
    inactiveClass: "border-border text-muted-foreground hover:bg-amber-500/10 hover:text-amber-700 dark:hover:text-amber-300",
  },
  bridge: {
    label: "Bridge",
    icon: LinkIcon,
    description:
      "Anchors to a prerequisite you've already mastered + builds up from there.",
    activeClass: "border-sky-500 bg-sky-500/15 text-sky-700 dark:text-sky-300",
    inactiveClass: "border-border text-muted-foreground hover:bg-sky-500/10 hover:text-sky-700 dark:hover:text-sky-300",
  },
  debate: {
    label: "Debate",
    icon: Swords,
    description:
      "Argues the opposite position to stress-test your reasoning.",
    activeClass: "border-rose-500 bg-rose-500/15 text-rose-700 dark:text-rose-300",
    inactiveClass: "border-border text-muted-foreground hover:bg-rose-500/10 hover:text-rose-700 dark:hover:text-rose-300",
  },
  contribution: {
    label: "Contribute",
    icon: PenLine,
    description:
      "Suggests where the platform has gaps that you could fill.",
    activeClass: "border-emerald-500 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
    inactiveClass: "border-border text-muted-foreground hover:bg-emerald-500/10 hover:text-emerald-700 dark:hover:text-emerald-300",
  },
};

const ALL_MODES: TutorMode[] = [
  "socratic",
  "misconception",
  "bridge",
  "debate",
  "contribution",
];

interface AITutorModeSelectorProps {
  mode: TutorMode;
  onChange: (m: TutorMode) => void;
  canMisconception: boolean;
  canDebate: boolean;
  // True when the current `mode` was auto-selected from page context
  // (e.g., a diagnosis matched). Renders an "auto" badge on that chip.
  autoSelected?: boolean;
}

export function AITutorModeSelector({
  mode,
  onChange,
  canMisconception,
  canDebate,
  autoSelected,
}: AITutorModeSelectorProps) {
  return (
    <div className="px-4 py-2 border-b border-border bg-muted/20">
      <div className="flex gap-1 flex-wrap">
        {ALL_MODES.map((m) => {
          const meta = META[m];
          const enabled =
            (m === "misconception" ? canMisconception : true) &&
            (m === "debate" ? canDebate : true);
          const active = mode === m;
          const Icon = meta.icon;
          const showAutoBadge = active && autoSelected;
          return (
            <button
              key={m}
              type="button"
              disabled={!enabled}
              onClick={() => enabled && onChange(m)}
              title={meta.description}
              aria-pressed={active}
              className={`relative inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-full border transition-colors min-h-[24px] ${
                active
                  ? meta.activeClass
                  : enabled
                    ? meta.inactiveClass
                    : "border-border/40 text-muted-foreground/40 cursor-not-allowed"
              }`}
            >
              <Icon className="w-3 h-3" strokeWidth={2} aria-hidden="true" />
              <span>{meta.label}</span>
              {showAutoBadge && (
                <span
                  className="absolute -top-1.5 -right-1 text-[8px] font-semibold uppercase tracking-wider px-1 rounded-full bg-foreground text-background leading-tight"
                  aria-label="Auto-selected"
                >
                  auto
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
