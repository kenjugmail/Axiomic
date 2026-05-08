// Sprint 64a — fixed-position container for active toasts. Mounted
// once at the app root (App.tsx). Renders the active set bottom-right
// at >=sm; bottom-center at <sm so they stack predictably above the
// thumb-zone on phones.

import { useToastStore } from "../../stores/toast";
import { ToastCard } from "./Toast";

export function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts);
  if (toasts.length === 0) return null;
  return (
    <div
      className="fixed z-[60] flex flex-col gap-2 pointer-events-none inset-x-0 bottom-4 px-3 items-center sm:items-end sm:right-4 sm:left-auto sm:bottom-4 sm:px-0"
      aria-label="Notifications"
    >
      {toasts.map((t) => (
        <div key={t.id} className="pointer-events-auto w-full sm:w-auto">
          <ToastCard toast={t} />
        </div>
      ))}
    </div>
  );
}
