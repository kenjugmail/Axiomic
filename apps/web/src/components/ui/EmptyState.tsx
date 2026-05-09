import type { LucideIcon } from "lucide-react";
import { cn } from "../../lib/cn";

interface Props {
  icon?: LucideIcon;
  title: string;
  description?: string;
  cta?: React.ReactNode;
  className?: string;
  // Sprint 64a — compact variant: no dashed border, tighter padding,
  // no icon-bubble. Use inside a parent card that already has its
  // own chrome (e.g., the Knowledge MRI header card).
  compact?: boolean;
}

// Single empty-state primitive used by every list / search / review
// page. Uniform visual treatment so a user who's seen one knows
// what's going on the moment they land on another.
export function EmptyState({
  icon: Icon,
  title,
  description,
  cta,
  className,
  compact,
}: Props) {
  if (compact) {
    return (
      <div
        className={cn(
          "py-4 text-center flex flex-col items-center gap-2 animate-fade-in",
          className,
        )}
      >
        {Icon && (
          <Icon
            className="w-5 h-5 text-muted-foreground"
            strokeWidth={1.6}
            aria-hidden="true"
          />
        )}
        <div className="space-y-0.5">
          <p className="text-sm font-medium">{title}</p>
          {description && (
            <p className="text-xs text-muted-foreground max-w-sm mx-auto">
              {description}
            </p>
          )}
        </div>
        {cta && <div className="mt-1">{cta}</div>}
      </div>
    );
  }
  return (
    <div
      className={cn(
        "py-16 px-6 text-center border border-dashed border-border rounded-lg",
        "flex flex-col items-center gap-3 animate-fade-in",
        className,
      )}
    >
      {Icon && (
        <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center text-muted-foreground">
          <Icon className="w-6 h-6" strokeWidth={1.6} aria-hidden="true" />
        </div>
      )}
      <div className="space-y-1">
        <h3 className="text-base font-semibold">{title}</h3>
        {description && (
          <p className="text-sm text-muted-foreground max-w-sm mx-auto">
            {description}
          </p>
        )}
      </div>
      {cta && <div className="mt-2">{cta}</div>}
    </div>
  );
}
