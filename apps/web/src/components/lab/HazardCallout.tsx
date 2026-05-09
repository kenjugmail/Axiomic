import { AlertTriangle } from "lucide-react";
import { MarkdownRenderer } from "../MarkdownRenderer";

interface Props {
  hazardsMd: string;
  biosafetyLevel?: number | null;
}

export function HazardCallout({ hazardsMd, biosafetyLevel }: Props) {
  const hasContent = hazardsMd.trim().length > 0 || (biosafetyLevel ?? 0) > 0;
  if (!hasContent) return null;
  return (
    <aside
      role="note"
      className="rounded-lg border border-amber-500/40 bg-amber-500/5 px-4 py-3 my-4"
    >
      <div className="flex items-start gap-3">
        <AlertTriangle
          className="w-4 h-4 text-amber-500 mt-0.5 shrink-0"
          strokeWidth={2}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400">
              Hazards
            </span>
            {biosafetyLevel ? (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/30">
                BSL-{biosafetyLevel}
              </span>
            ) : null}
          </div>
          {hazardsMd.trim().length > 0 ? (
            <MarkdownRenderer
              content={hazardsMd}
              className="text-sm [&_p]:mb-1 [&_ul]:my-1"
            />
          ) : null}
        </div>
      </div>
    </aside>
  );
}
