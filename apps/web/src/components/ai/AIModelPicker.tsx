// Sprint 63f — compact model picker chip for the AI sidebar.
//
// Renders a dropdown listing whatever models GET /api/v1/ai/models
// returned for the configured provider. Selection persists in
// localStorage (`axiomic.ai.model`); the AISidebar passes it as the
// `model` field on every /ai/chat call.
//
// Sprint 64a-4 — keyboard navigation: ArrowDown/Up moves the
// highlight, Enter/Space selects, Escape closes.

import { useEffect, useId, useRef, useState } from "react";
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
  const [highlight, setHighlight] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listboxId = useId();

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

  // When opening, highlight the current selection so ArrowDown/Up
  // navigation has a sensible starting point.
  useEffect(() => {
    if (!open) return;
    const idx = models.findIndex((m) => m.id === value);
    setHighlight(idx >= 0 ? idx : 0);
  }, [open, models, value]);

  if (models.length === 0) return null;

  const current = value ?? models[0]?.id ?? "";
  const display = current.length > 28 ? current.slice(0, 27) + "…" : current;

  const onButtonKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setOpen(true);
    }
  };

  const onListKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      buttonRef.current?.focus();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => (h + 1) % models.length);
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => (h - 1 + models.length) % models.length);
      return;
    }
    if (e.key === "Home") {
      e.preventDefault();
      setHighlight(0);
      return;
    }
    if (e.key === "End") {
      e.preventDefault();
      setHighlight(models.length - 1);
      return;
    }
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      const m = models[highlight];
      if (m) {
        onChange(m.id);
        setOpen(false);
        buttonRef.current?.focus();
      }
    }
  };

  return (
    <div ref={ref} className={`relative ${className ?? ""}`}>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        onKeyDown={onButtonKey}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        title={provider ? `Provider: ${provider}` : "Choose model"}
        className="flex items-center gap-1 text-[11px] px-2 py-1 rounded-md border border-border hover:bg-accent/50 transition-colors text-muted-foreground min-h-[28px]"
      >
        <span className="truncate max-w-[10rem]">{display}</span>
        <ChevronDown className="w-3 h-3" aria-hidden="true" />
      </button>
      {open && (
        <div
          className="absolute right-0 z-[200] mt-1 w-56 rounded-md border border-border bg-popover shadow-elevated text-xs"
          onKeyDown={onListKey}
        >
          {provider && (
            <div className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border">
              Provider: {provider}
            </div>
          )}
          <ul
            id={listboxId}
            role="listbox"
            aria-label="Choose model"
            tabIndex={-1}
            ref={(el) => el?.focus()}
            className="max-h-64 overflow-y-auto py-1 outline-none"
          >
            {models.map((m, i) => {
              const selected = m.id === current;
              const highlighted = i === highlight;
              return (
                <li
                  key={m.id}
                  role="option"
                  aria-selected={selected}
                >
                  <button
                    type="button"
                    onClick={() => {
                      onChange(m.id);
                      setOpen(false);
                      buttonRef.current?.focus();
                    }}
                    onMouseEnter={() => setHighlight(i)}
                    className={`w-full text-left flex items-center gap-2 px-3 py-1.5 ${
                      highlighted ? "bg-accent/70" : "hover:bg-accent/50"
                    }`}
                  >
                    <Check
                      className={`w-3 h-3 ${
                        selected ? "opacity-100" : "opacity-0"
                      }`}
                      aria-hidden="true"
                    />
                    <span className="truncate">{m.label ?? m.id}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
