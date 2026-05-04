import { useState } from "react";
import { VIZ_NAMES } from "./VizEmbed";

interface Props {
  // Called with the directive string (e.g. ":::viz[tokenizer-playground]:::").
  onPick: (directive: string) => void;
}

// "+ Insert viz" toolbar control for the wiki editor. Inserts a
// `:::viz[name]:::` directive that the MarkdownRenderer expands to the
// chosen visualization in trusted contexts.
export function VizPickerButton({ onPick }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="px-3 py-1.5 rounded-md text-sm bg-secondary text-secondary-foreground hover:bg-secondary/80"
      >
        + Insert viz
      </button>
      {open && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <div className="absolute right-0 mt-1 w-64 z-20 rounded-md border border-border bg-card shadow-lg overflow-hidden">
            <ul className="max-h-64 overflow-y-auto">
              {VIZ_NAMES.map((name) => (
                <li key={name}>
                  <button
                    type="button"
                    onClick={() => {
                      onPick(`\n::viz[${name}]\n`);
                      setOpen(false);
                    }}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-accent/50 font-mono"
                  >
                    {name}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}
