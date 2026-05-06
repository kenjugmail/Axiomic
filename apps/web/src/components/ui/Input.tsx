import { forwardRef } from "react";
import { cn } from "../../lib/cn";

const BASE =
  "w-full rounded-md border bg-background text-sm " +
  "transition-colors duration-fast ease-out " +
  "focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent " +
  "disabled:opacity-60 disabled:cursor-not-allowed " +
  "placeholder:text-muted-foreground/70";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, invalid, ...rest },
  ref,
) {
  return (
    <input
      ref={ref}
      className={cn(
        BASE,
        "px-3 py-2 h-9",
        invalid ? "border-destructive ring-destructive/30" : "border-input",
        className,
      )}
      {...rest}
    />
  );
});

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  function Textarea({ className, invalid, ...rest }, ref) {
    return (
      <textarea
        ref={ref}
        className={cn(
          BASE,
          "px-3 py-2 resize-y",
          invalid ? "border-destructive ring-destructive/30" : "border-input",
          className,
        )}
        {...rest}
      />
    );
  },
);
