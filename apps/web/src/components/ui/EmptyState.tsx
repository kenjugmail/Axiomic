import type { LucideIcon } from "lucide-react";
import { cn } from "../../lib/cn";

interface Props {
  icon?: LucideIcon;
  title: string;
  description?: string;
  cta?: React.ReactNode;
  className?: string;
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
}: Props) {
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
          <Icon className="w-6 h-6" strokeWidth={1.6} />
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
