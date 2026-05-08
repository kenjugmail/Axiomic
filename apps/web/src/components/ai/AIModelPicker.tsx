// Sprint 63f — compact model picker chip for the AI sidebar.
//
// Renders a dropdown listing whatever models GET /api/v1/ai/models
// returned for the configured provider. Selection persists in
// localStorage (`axiomic.ai.model`); the AISidebar passes it as the
// `model` field on every /ai/chat call.

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";

export interface ModelOption {
  id: string;
  label?: string;
}

interface AIModelPickerProps {
  models: ModelOption[];
  value: string | null;
  onChange: (id: string) => void;
  provider?: string;
  className?: string;
}

export function AIModelPicker({
  models,
  value,
  onChange,
  provider,
  className,
}: AIModelPickerProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  if (models.length === 0) return null;

  const current = value ?? models[0]?.id ?? "";
  const display = current.length > 28 ? current.slice(0, 27) + "…" : current;

  return (
    <div ref={ref} className={`relative ${className ?? ""}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title={provider ? `Provider: ${provider}` : "Choose model"}
        className="flex items-center gap-1 text-[11px] px-2 py-1 rounded-md border border-border hover:bg-accent/50 transition-colors text-muted-foreground"
      >
        <span className="truncate max-w-[10rem]">{display}</span>
        <ChevronDown className="w-3 h-3" />
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-1 w-56 rounded-md border border-border bg-popover shadow-elevated text-xs">
          {provider && (
            <div className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border">
              Provider: {provider}
            </div>
          )}
          <ul className="max-h-64 overflow-y-auto py-1">
            {models.map((m) => (
              <li key={m.id}>
                <button
                  type="button"
                  onClick={() => {
                    onChange(m.id);
                    setOpen(false);
                  }}
                  className="w-full text-left flex items-center gap-2 px-3 py-1.5 hover:bg-accent/50"
                >
                  <Check
                    className={`w-3 h-3 ${
                      m.id === current ? "opacity-100" : "opacity-0"
                    }`}
                  />
                  <span className="truncate">{m.label ?? m.id}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
