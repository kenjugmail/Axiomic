import { forwardRef } from "react";
import { cn } from "../../lib/cn";

type Variant = "flat" | "bordered" | "elevated";

const VARIANT: Record<Variant, string> = {
  flat: "bg-card",
  bordered: "bg-card border border-border",
  elevated: "bg-card border border-border shadow-soft",
};

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: Variant;
  // Whether to render with the standard rounded-lg radius. Set false
  // when the parent handles rounding (e.g., when nesting inside a
  // wrapper that already crops with overflow-hidden).
  rounded?: boolean;
}

export const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
  { variant = "bordered", rounded = true, className, ...rest },
  ref,
) {
  return (
    <div
      ref={ref}
      className={cn(
        VARIANT[variant],
        rounded && "rounded-lg",
        "transition-colors duration-base ease-out",
        className,
      )}
      {...rest}
    />
  );
});

export function CardHeader({
  className,
  ...rest
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "px-5 py-3 border-b border-border flex items-center justify-between gap-3",
        className,
      )}
      {...rest}
    />
  );
}

export function CardBody({
  className,
  ...rest
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-5", className)} {...rest} />;
}

export function CardFooter({
  className,
  ...rest
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "px-5 py-3 border-t border-border flex items-center justify-between gap-2",
        className,
      )}
      {...rest}
    />
  );
}
