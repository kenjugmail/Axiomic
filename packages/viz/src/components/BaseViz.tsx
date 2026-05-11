import React from "react";

interface BaseVizProps {
  title?: string;
  description?: string;
  height?: number;
  children: React.ReactNode;
  onReset?: () => void;
}

export function BaseViz({ title, description, height = 400, children, onReset }: BaseVizProps) {
  return (
    <div className="my-6 rounded-lg border border-border bg-card overflow-hidden">
      {(title || onReset) && (
        <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-muted/50">
          <div>
            {title && <h4 className="text-sm font-medium font-sans">{title}</h4>}
            {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
          </div>
          {onReset && (
            <button
              onClick={onReset}
              className="text-xs px-2 py-1 rounded bg-secondary hover:bg-secondary/80 text-secondary-foreground transition-colors"
            >
              Reset
            </button>
          )}
        </div>
      )}
      <div style={{ height }} className="relative">
        {children}
      </div>
    </div>
  );
}
