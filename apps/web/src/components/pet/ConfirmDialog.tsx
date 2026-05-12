// Phase 2 (prototype migration) — shared confirm dialog.
// Port of extras.jsx:5-30. Used for destructive or
// state-changing actions (e.g. switch active pet).

import { Modal } from "../ui/Modal";

interface Props {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  body: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  busy?: boolean;
}

export function ConfirmDialog({
  open,
  onCancel,
  onConfirm,
  title,
  body,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  danger = false,
  busy = false,
}: Props): JSX.Element | null {
  if (!open) return null;
  return (
    <Modal
      open={open}
      onClose={onCancel}
      size="sm"
      title={title}
      footer={
        <div className="flex justify-end gap-2">
          <button type="button" className="pet-btn ghost" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className={danger ? "pet-btn" : "pet-btn primary"}
            disabled={busy}
            onClick={onConfirm}
            style={
              danger
                ? {
                    background: "var(--warn)",
                    color: "#fff",
                    borderColor: "var(--warn)",
                  }
                : undefined
            }
          >
            {busy ? "Working…" : confirmLabel}
          </button>
        </div>
      }
    >
      <div
        className="px-6 py-5 text-sm leading-relaxed"
        style={{ color: "var(--ink-2)" }}
      >
        {body}
      </div>
    </Modal>
  );
}
