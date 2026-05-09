// Sprint 63g — generalized text-selection popover.
//
// Generalizes the S14 ClaimSelectionPopover. Watches the document for
// `selectionchange` events; when the user selects ≥4 chars inside the
// `rootRef` element, shows a floating button row with whatever actions
// were configured. The original S14 "Discuss this claim" is now ONE
// action; "Ask tutor" added in this sprint is another.
//
// Position: above the selection's bounding rect, horizontally centered,
// using `position: fixed` so it stays put on scroll.

import { useEffect, useRef, useState, type ReactNode } from "react";
import { extractTextQuote, type TextQuote } from "../lib/textQuote";

export interface SelectionAction {
  id: string;
  // Icon + label. Keep the label short — popovers compete with the
  // user's selected text for screen real estate.
  icon: ReactNode;
  label: string;
  onSelect: (quote: TextQuote, range: Range) => void;
  // Optional: hide this action when this returns false. Lets pages
  // gate "Discuss this claim" on signed-in vs anonymous, etc.
  enabled?: boolean;
}

interface SelectionPopoverProps {
  rootRef: React.RefObject<HTMLElement | null>;
  actions: SelectionAction[];
  // Minimum selection length (in characters) before the popover shows.
  // Default 4 — a single word usually isn't worth interrupting reading.
  minLength?: number;
}

interface PopoverState {
  visible: boolean;
  top: number;
  left: number;
  quote: TextQuote | null;
  range: Range | null;
}

export function SelectionPopover({
  rootRef,
  actions,
  minLength = 4,
}: SelectionPopoverProps) {
  const [state, setState] = useState<PopoverState>({
    visible: false,
    top: 0,
    left: 0,
    quote: null,
    range: null,
  });
  const debounceRef = useRef<number | null>(null);

  useEffect(() => {
    if (actions.length === 0) return;

    const handle = () => {
      if (debounceRef.current) {
        window.clearTimeout(debounceRef.current);
      }
      debounceRef.current = window.setTimeout(() => {
        const root = rootRef.current;
        if (!root) {
          setState((s) => ({ ...s, visible: false }));
          return;
        }
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0 || sel.isCollapsed) {
          setState((s) => ({ ...s, visible: false }));
          return;
        }
        const range = sel.getRangeAt(0);
        if (
          !root.contains(range.startContainer) ||
          !root.contains(range.endContainer)
        ) {
          setState((s) => ({ ...s, visible: false }));
          return;
        }
        const quote = extractTextQuote(root);
        if (!quote || quote.exact.trim().length < minLength) {
          setState((s) => ({ ...s, visible: false }));
          return;
        }
        const rect = range.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) {
          setState((s) => ({ ...s, visible: false }));
          return;
        }
        const top = rect.top - 44;
        const left = rect.left + rect.width / 2;
        setState({
          visible: true,
          top,
          left,
          quote,
          range: range.cloneRange(),
        });
      }, 80);
    };

    document.addEventListener("selectionchange", handle);
    return () => {
      document.removeEventListener("selectionchange", handle);
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [rootRef, actions.length, minLength]);

  const enabled = actions.filter((a) => a.enabled !== false);
  if (!state.visible || !state.quote || enabled.length === 0) return null;

  return (
    <div
      className="fixed z-40 -translate-x-1/2 animate-fade-in"
      style={{ top: state.top, left: state.left }}
      onMouseDown={(e) => e.preventDefault()}
    >
      <div className="inline-flex items-center gap-1 rounded-full bg-foreground text-background text-xs font-medium shadow-floating overflow-hidden">
        {enabled.map((action, i) => (
          <button
            key={action.id}
            onClick={() => {
              if (state.quote && state.range) {
                action.onSelect(state.quote, state.range);
                setState((s) => ({ ...s, visible: false }));
              }
            }}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 hover:bg-background/15 ${
              i > 0 ? "border-l border-background/20" : ""
            }`}
          >
            {action.icon}
            <span>{action.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
