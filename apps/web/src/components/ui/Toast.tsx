// Sprint 64a — single toast card. Renders alongside its siblings in
// the ToastContainer; manages its own close button.

import { CheckCircle2, X, AlertCircle, Info } from "lucide-react";
import { useToastStore, type Toast as ToastModel, type ToastKind } from "../../stores/toast";

const KIND_ICON: Record<ToastKind, typeof CheckCircle2> = {
  success: CheckCircle2,
  error: AlertCircle,
  info: Info,
};

const KIND_STYLES: Record<ToastKind, { icon: string; border: string }> = {
  success: {
    icon: "text-emerald-500",
    border: "border-emerald-500/40",
  },
  error: {
    icon: "text-red-500",
    border: "border-red-500/40",
  },
  info: {
    icon: "text-sky-500",
    border: "border-sky-500/40",
  },
};

export function ToastCard({ toast }: { toast: ToastModel }) {
  const dismiss = useToastStore((s) => s.dismiss);
  const Icon = KIND_ICON[toast.kind];
  const styles = KIND_STYLES[toast.kind];
  return (
    <div
      role={toast.kind === "error" ? "alert" : "status"}
      aria-live={toast.kind === "error" ? "assertive" : "polite"}
      className={`flex gap-3 items-start max-w-sm w-full bg-card border ${styles.border} rounded-lg shadow-elevated p-3 animate-fade-in`}
    >
      <Icon className={`w-5 h-5 mt-0.5 flex-shrink-0 ${styles.icon}`} strokeWidth={2} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium leading-tight">{toast.title}</p>
        {toast.description && (
          <p className="text-xs text-muted-foreground mt-1 leading-snug break-words">
            {toast.description}
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={() => dismiss(toast.id)}
        aria-label="Dismiss notification"
        className="flex-shrink-0 p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/50 -mt-0.5 -mr-0.5"
      >
        <X className="w-3.5 h-3.5" strokeWidth={2} />
      </button>
    </div>
  );
}
