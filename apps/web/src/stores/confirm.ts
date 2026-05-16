// Phase 37 — promise-based confirmation, mirroring the toast store.
//
// Replaces native window.confirm() (inaccessible, unstyled,
// blocks the event loop) with an accessible modal. Call from
// anywhere:
//
//   import { confirm } from "../stores/confirm";
//   if (!(await confirm({ title: "Delete post?", destructive: true }))) return;
//
// A single <ConfirmContainer/> mounted at the app root renders
// the active request and resolves the awaiting promise.

import { create } from "zustand";

export interface ConfirmOptions {
  title: string;
  body?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  // Renders the confirm button in a destructive (red) style.
  destructive?: boolean;
}

interface ConfirmRequest extends ConfirmOptions {
  id: string;
  resolve: (ok: boolean) => void;
}

interface ConfirmState {
  current: ConfirmRequest | null;
  request: (opts: ConfirmOptions) => Promise<boolean>;
  resolve: (id: string, ok: boolean) => void;
}

export const useConfirmStore = create<ConfirmState>((set, get) => ({
  current: null,
  request: (opts) =>
    new Promise<boolean>((resolve) => {
      const id =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      // One dialog at a time: if something is already pending,
      // resolve it false (treated as cancelled) before replacing.
      const prev = get().current;
      if (prev) prev.resolve(false);
      set({ current: { ...opts, id, resolve } });
    }),
  resolve: (id, ok) => {
    const cur = get().current;
    if (!cur || cur.id !== id) return;
    cur.resolve(ok);
    set({ current: null });
  },
}));

export function confirm(opts: ConfirmOptions): Promise<boolean> {
  return useConfirmStore.getState().request(opts);
}
