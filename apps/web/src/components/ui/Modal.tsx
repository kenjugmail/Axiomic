import { useEffect } from "react";
import { X } from "lucide-react";
import { cn } from "../../lib/cn";

type Size = "sm" | "md" | "lg" | "xl";

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
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className={cn(
        "fixed inset-0 z-50 flex items-start justify-center",
        topAligned ? "pt-[6vh]" : "pt-[15vh]",
      )}
    >
      <div
        className="absolute inset-0 bg-background/70 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
      />
      <div
        className={cn(
          "relative w-full bg-card border border-border rounded-xl shadow-floating overflow-hidden flex flex-col max-h-[88vh] animate-fade-in",
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
