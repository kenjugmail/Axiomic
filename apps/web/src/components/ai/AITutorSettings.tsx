// Sprint 65a — settings popover for the AI tutor sidebar.
//
// Gear icon in the sidebar header opens this small popover with two
// toggles: hide coach suggestions, disable auto-mode-routing. Settings
// persist in localStorage via the loader in `lib/aiSettings.ts`.

import { useEffect, useRef, useState } from "react";
import { Settings } from "lucide-react";
import type { AITutorSettings as Settings_ } from "../../lib/aiSettings";

interface AITutorSettingsProps {
  value: Settings_;
  onChange: (next: Settings_) => void;
}

export function AITutorSettings({ value, onChange }: AITutorSettingsProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    }
    document.addEventListener("mousedown", handle);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handle);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  const toggle = (key: keyof Settings_) => () => {
    onChange({ ...value, [key]: !value[key] });
  };

  return (
    <div ref={ref} className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="Tutor settings"
        aria-label="Tutor settings"
        aria-haspopup="dialog"
        aria-expanded={open}
        className="p-1 hover:bg-accent rounded text-muted-foreground hover:text-foreground"
      >
        <Settings className="w-4 h-4" strokeWidth={2} aria-hidden="true" />
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="AI tutor settings"
          className="absolute right-0 z-50 mt-1 w-64 rounded-md border border-border bg-popover shadow-elevated p-3 text-xs"
        >
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
            Tutor settings
          </div>
          <SettingRow
            label="Show coach suggestions"
            description="The 'Quick checks for you' panel above the chat."
            checked={value.showSuggestions}
            onChange={toggle("showSuggestions")}
          />
          <SettingRow
            label="Auto-select mode from context"
            description="Pick Misconception or Bridge based on your weak concepts + prereq gaps."
            checked={value.autoSelectMode}
            onChange={toggle("autoSelectMode")}
          />
        </div>
      )}
    </div>
  );
}

interface SettingRowProps {
  label: string;
  description: string;
  checked: boolean;
  onChange: () => void;
}

function SettingRow({ label, description, checked, onChange }: SettingRowProps) {
  return (
    <label className="flex items-start gap-2 py-1.5 cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="mt-0.5 h-4 w-4 rounded border-border accent-primary"
      />
      <div className="flex-1 min-w-0">
        <div className="font-medium text-foreground">{label}</div>
        <div className="text-muted-foreground text-[11px] leading-snug">
          {description}
        </div>
      </div>
    </label>
  );
}
