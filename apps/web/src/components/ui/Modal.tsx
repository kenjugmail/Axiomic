import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { cn } from "../../lib/cn";
import { useEscapeStack } from "../../hooks/useEscapeStack";

type Size = "sm" | "md" | "lg" | "xl";

// Phase 17B — return-focus + Tab cycling helpers.
const FOCUSABLE_SELECTOR =
  "a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex=\"-1\"])";

function getFocusable(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (el) => !el.hasAttribute("data-focus-trap-sentinel"),
  );
}

const SIZE: Record<Size, string> = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-2xl",
  xl: "max-w-4xl",
};

interface Props {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  description?: React.ReactNode;
  // Pulls a top-aligned panel rather than centered. Useful for taller
  // content like the lesson player.
  topAligned?: boolean;
  size?: Size;
  // Extra controls in the header (right of the title, before the X).
  headerExtra?: React.ReactNode;
  // When false, hides the default X close button (caller renders their
  // own footer-level close).
  showClose?: boolean;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

export function Modal({
  open,
  onClose,
  title,
  description,
  topAligned,
  size = "md",
  headerExtra,
  showClose = true,
  children,
  footer,
}: Props) {
  // Phase 13C — route through the shared Escape-stack so only the
  // topmost open overlay closes per key press. Prevents a stacked
  // sheet + modal combo from both closing on a single Escape.
  useEscapeStack(open, onClose);

  // Phase 17B — focus trap + return-focus. On open we capture the
  // currently focused element (the trigger), move focus into the
  // dialog, and cycle Tab/Shift+Tab between the first and last
  // focusable controls. On close we hand focus back to the trigger
  // so keyboard users don't lose their place.
  const panelRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    triggerRef.current = (document.activeElement as HTMLElement) ?? null;
    const panel = panelRef.current;
    if (panel) {
      const focusables = getFocusable(panel);
      const target = focusables[0] ?? panel;
      // Defer one frame so the modal's children have mounted before
      // we measure focusables. Without this we sometimes focus the
      // empty container.
      requestAnimationFrame(() => target.focus());
    }
    return () => {
      const t = triggerRef.current;
      // Some triggers unmount (e.g., a tile that re-renders). Guard
      // against focusing a detached node.
      if (t && document.body.contains(t)) {
        t.focus();
      }
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const panel = panelRef.current;
      if (!panel) return;
      const focusables = getFocusable(panel);
      if (focusables.length === 0) {
        e.preventDefault();
        return;
      }
      const first = focusables[0]!;
      const last = focusables[focusables.length - 1]!;
      const active = document.activeElement;
      if (e.shiftKey) {
        if (active === first || !panel.contains(active)) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (active === last || !panel.contains(active)) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  if (!open) return null;

  return (
    <div
      className={cn(
        "fixed inset-0 z-50 flex items-start justify-center",
        topAligned ? "pt-[6vh]" : "pt-[15vh]",
      )}
    >
      <button
        type="button"
        aria-label="Close dialog"
        className="absolute inset-0 bg-background/70 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
      />
      <div
        ref={panelRef}
        tabIndex={-1}
        className={cn(
          "relative w-full bg-card border border-border rounded-xl shadow-floating overflow-hidden flex flex-col max-h-[88vh] animate-fade-in focus:outline-none",
          SIZE[size],
        )}
        role="dialog"
        aria-modal="true"
      >
        {(title || headerExtra || showClose) && (
          <div className="px-5 py-3 border-b border-border flex items-center justify-between gap-3 shrink-0">
            <div className="min-w-0 flex-1">
              {title && (
                <h2 className="text-base font-semibold truncate">{title}</h2>
              )}
              {description && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  {description}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2">
              {headerExtra}
              {showClose && (
                <button
                  onClick={onClose}
                  className="text-muted-foreground hover:text-foreground transition-colors duration-fast"
                  aria-label="Close"
                >
                  <X className="w-5 h-5" strokeWidth={1.8} />
                </button>
              )}
            </div>
          </div>
        )}
        <div className="flex-1 overflow-y-auto">{children}</div>
        {footer && (
          <div className="px-5 py-3 border-t border-border shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
