import { useEffect } from "react";

const SHORTCUTS: Array<{ keys: string[]; label: string }> = [
  { keys: ["/"], label: "Open search" },
  { keys: ["?"], label: "Show this dialog" },
  { keys: ["Esc"], label: "Close any open modal" },
];

interface Props {
  open: boolean;
  onClose: () => void;
}

export function ShortcutsDialog({ open, onClose }: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]">
      <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md bg-card border border-border rounded-xl shadow-2xl overflow-hidden">
        <div className="px-5 py-3 border-b border-border flex items-center justify-between">
          <h2 className="text-base font-semibold">Keyboard shortcuts</h2>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <ul className="divide-y divide-border">
          {SHORTCUTS.map((s) => (
            <li
              key={s.keys.join("+")}
              className="flex items-center justify-between px-5 py-2.5 text-sm"
            >
              <span className="text-muted-foreground">{s.label}</span>
              <span className="flex items-center gap-1">
                {s.keys.map((k) => (
                  <kbd
                    key={k}
                    className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono"
                  >
                    {k}
                  </kbd>
                ))}
              </span>
            </li>
          ))}
        </ul>
        <div className="px-5 py-3 border-t border-border text-xs text-muted-foreground">
          Tap the keys outside any text input.
        </div>
      </div>
    </div>
  );
}
