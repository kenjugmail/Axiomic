// Phase 37 — renders the active confirm() request as an accessible
// modal (focus-trap + return-focus + Escape inherited from Modal).
// Mounted once at the app root beside ToastContainer.

import { useConfirmStore } from "../../stores/confirm";
import { Modal } from "./Modal";
import { cn } from "../../lib/cn";

export function ConfirmContainer() {
  const current = useConfirmStore((s) => s.current);
  const resolve = useConfirmStore((s) => s.resolve);
  if (!current) return null;

  const {
    id,
    title,
    body,
    confirmLabel = "Confirm",
    cancelLabel = "Cancel",
    destructive,
  } = current;

  return (
    <Modal
      open
      onClose={() => resolve(id, false)}
      title={title}
      size="sm"
      showClose={false}
      footer={
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => resolve(id, false)}
            className="px-3 py-1.5 rounded-md text-sm border border-border hover:bg-accent/40"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            autoFocus
            onClick={() => resolve(id, true)}
            className={cn(
              "px-3 py-1.5 rounded-md text-sm font-medium text-white",
              destructive
                ? "bg-rose-600 hover:bg-rose-700"
                : "bg-primary hover:bg-primary/90",
            )}
          >
            {confirmLabel}
          </button>
        </div>
      }
    >
      <p className="px-5 py-4 text-sm text-muted-foreground">
        {body ?? "This action cannot be undone."}
      </p>
    </Modal>
  );
}
