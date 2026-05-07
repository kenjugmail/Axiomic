import { useEffect, useRef, useState } from "react";
import { MessageSquarePlus } from "lucide-react";
import { extractTextQuote, type TextQuote } from "../../lib/textQuote";

interface Props {
  // The article element. We listen for selectionchange and only show
  // the popover when the user has a non-trivial range selected inside
  // this root.
  rootRef: React.RefObject<HTMLElement | null>;
  // Whether the user is signed in. Anonymous readers don't see the
  // popover — selecting text shouldn't tease a feature they can't use.
  signedIn: boolean;
  // Called when the user clicks "Discuss this claim". The parent opens
  // the new-thread dialog with this quote pre-filled.
  onStart: (quote: TextQuote, range: Range) => void;
}

interface PopoverState {
  visible: boolean;
  top: number;
  left: number;
  quote: TextQuote | null;
  range: Range | null;
}

export function ClaimSelectionPopover({ rootRef, signedIn, onStart }: Props) {
  const [state, setState] = useState<PopoverState>({
    visible: false,
    top: 0,
    left: 0,
    quote: null,
    range: null,
  });
  // Debounce selectionchange — Firefox + Safari fire it many times per
  // drag. We only care about the final position once the user pauses.
  const debounceRef = useRef<number | null>(null);

  useEffect(() => {
    if (!signedIn) return;

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
        if (!quote) {
          setState((s) => ({ ...s, visible: false }));
          return;
        }
        const rect = range.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) {
          setState((s) => ({ ...s, visible: false }));
          return;
        }
        // Position above the selection, horizontally centered. Account
        // for scroll so we use viewport-relative coords with `position:
        // fixed`.
        const top = rect.top - 44;
        const left = rect.left + rect.width / 2;
        setState({ visible: true, top, left, quote, range: range.cloneRange() });
      }, 80);
    };

    document.addEventListener("selectionchange", handle);
    return () => {
      document.removeEventListener("selectionchange", handle);
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [rootRef, signedIn]);

  if (!state.visible || !state.quote) return null;

  return (
    <div
      className="fixed z-40 -translate-x-1/2 animate-fade-in"
      style={{ top: state.top, left: state.left }}
      // Prevent mousedown from clearing the selection before our click
      // fires.
      onMouseDown={(e) => e.preventDefault()}
    >
      <button
        onClick={() => {
          if (state.quote && state.range) {
            onStart(state.quote, state.range);
            setState((s) => ({ ...s, visible: false }));
          }
        }}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-foreground text-background text-xs font-medium shadow-floating hover:bg-foreground/90"
      >
        <MessageSquarePlus className="w-3.5 h-3.5" strokeWidth={2} />
        Discuss this claim
      </button>
    </div>
  );
}
