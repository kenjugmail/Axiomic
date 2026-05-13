// Phase 13C — Escape-key stack for modal/sheet layering.
//
// Multiple open overlays each registering their own `document
// .addEventListener("keydown")` for Escape was firing every
// handler at once, closing every layer on a single key press.
// Centralize handling so only the TOP-OF-STACK handler fires.
//
// Usage:
//   useEscapeStack(open, () => onClose());
//
// While `open === true`, the handler joins the LIFO stack. A
// single document-level keydown listener (attached lazily when
// the stack is non-empty) invokes only the top handler.

import { useEffect } from "react";

const stack: Array<() => void> = [];

let attached = false;
function attachListener(): void {
  if (attached) return;
  attached = true;
  document.addEventListener("keydown", onKeyDown);
}
function detachListener(): void {
  if (!attached) return;
  attached = false;
  document.removeEventListener("keydown", onKeyDown);
}
function onKeyDown(e: KeyboardEvent): void {
  if (e.key !== "Escape") return;
  const top = stack[stack.length - 1];
  if (!top) return;
  e.stopPropagation();
  top();
}

/**
 * Register `onEsc` on the Escape-stack while `open` is true. Only the
 * most-recently-pushed handler fires when the user presses Escape.
 */
export function useEscapeStack(open: boolean, onEsc: () => void): void {
  useEffect(() => {
    if (!open) return;
    stack.push(onEsc);
    attachListener();
    return () => {
      const idx = stack.lastIndexOf(onEsc);
      if (idx >= 0) stack.splice(idx, 1);
      if (stack.length === 0) detachListener();
    };
  }, [open, onEsc]);
}

// Test-only helpers (not part of the public surface).
export function __getEscapeStackSize(): number {
  return stack.length;
}
export function __resetEscapeStack(): void {
  stack.length = 0;
  detachListener();
}
