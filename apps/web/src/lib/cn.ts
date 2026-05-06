import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

// Compose Tailwind classes safely. clsx handles falsy values + arrays
// + objects; twMerge resolves conflicting utilities (e.g., when a
// component author passes `className="px-4"` and the consumer passes
// `className="px-6"`, the consumer wins).
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
