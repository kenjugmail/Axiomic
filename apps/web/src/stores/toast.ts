// Sprint 64a — global toast notification store.
//
// Centralizes success / error / info feedback for any page. Replaces
// the per-page `setError(...)` + silent `.catch(() => {})` pattern with
// a single API. Designed to be cheap to call from anywhere:
//
//   import { toast } from "../stores/toast";
//   toast.success("Saved");
//   toast.error("Couldn't save", "Try again or refresh.");

import { create } from "zustand";

export type ToastKind = "success" | "error" | "info";

export interface Toast {
  id: string;
  kind: ToastKind;
  title: string;
  description?: string;
  // Auto-dismiss after this many ms. Set 0 to require manual dismiss.
  durationMs: number;
}

interface ToastState {
  toasts: Toast[];
  push: (
    kind: ToastKind,
    title: string,
    description?: string,
    durationMs?: number,
  ) => void;
  dismiss: (id: string) => void;
  clear: () => void;
}

export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],
  push: (kind, title, description, durationMs = 5000) => {
    const id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    set((s) => ({
      toasts: [...s.toasts, { id, kind, title, description, durationMs }],
    }));
    if (durationMs > 0) {
      setTimeout(() => {
        get().dismiss(id);
      }, durationMs);
    }
  },
  dismiss: (id) => {
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
  },
  clear: () => set({ toasts: [] }),
}));

// Convenience helpers — most callers don't want the kind argument
// inline. `toast.success("Saved")` reads cleaner than
// `useToastStore.getState().push("success", "Saved")`.
export const toast = {
  success(title: string, description?: string, durationMs?: number) {
    useToastStore.getState().push("success", title, description, durationMs);
  },
  error(title: string, description?: string, durationMs?: number) {
    useToastStore.getState().push("error", title, description, durationMs);
  },
  info(title: string, description?: string, durationMs?: number) {
    useToastStore.getState().push("info", title, description, durationMs);
  },
};
