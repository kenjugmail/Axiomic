// Sprint 34 — Citation popover.
//
// Renders a simple modal with three tabs: BibTeX / RIS / plain text.
// Each has a copy-to-clipboard button. Drops onto research papers and
// capstones via a "Cite this" toolbar button.

import { useEffect, useState } from "react";
import { Check, Copy, X } from "lucide-react";
import { api } from "../../lib/api";

interface Props {
  kind: "paper" | "capstone";
  slug: string;
  onClose: () => void;
}

interface CitationData {
  title: string;
  authors: string[];
  year: number;
  url: string;
  permalink: string;
  bibtex: string;
  ris: string;
  plain: string;
}

type Tab = "plain" | "bibtex" | "ris";

const TAB_LABELS: Record<Tab, string> = {
  plain: "Plain text",
  bibtex: "BibTeX",
  ris: "RIS",
};

export function CiteDialog({ kind, slug, onClose }: Props) {
  const [data, setData] = useState<CitationData | null>(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<Tab>("plain");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const fetcher = kind === "paper" ? api.citations.paper : api.citations.capstone;
    fetcher(slug)
      .then((r) => {
        if (cancelled) return;
        setData(r);
      })
      .catch((e: any) => {
        if (cancelled) return;
        setError(e?.message ?? "Failed to load citation");
      });
    return () => {
      cancelled = true;
    };
  }, [kind, slug]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const text = data ? data[tab] : "";

  const onCopy = async () => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center p-4 sm:p-8 animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-label="Cite this work"
    >
      <button
        type="button"
        aria-label="Close dialog"
        onClick={onClose}
        className="absolute inset-0 bg-background/70 backdrop-blur-sm"
      />
      <div className="relative w-full max-w-xl bg-card border border-border rounded-xl shadow-elevated overflow-hidden">
        <header className="flex items-start justify-between gap-3 px-4 py-3 border-b border-border">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Cite this {kind}
            </div>
            <h3 className="text-sm font-semibold leading-tight">
              {data?.title ?? "Loading…"}
            </h3>
            {data && (
              <p className="text-xs text-muted-foreground mt-0.5">
                {data.authors.join(", ")} · {data.year}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 -mr-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/40"
            aria-label="Close"
          >
            <X className="w-4 h-4" strokeWidth={2} />
          </button>
        </header>

        <div className="px-4 pt-3 flex gap-1 border-b border-border">
          {(Object.keys(TAB_LABELS) as Tab[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`text-xs px-3 py-1.5 -mb-px rounded-t-md border-b-2 transition-colors ${
                tab === t
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {TAB_LABELS[t]}
            </button>
          ))}
        </div>

        <div className="p-4 space-y-3">
          {error ? (
            <p className="text-sm text-rose-600 dark:text-rose-400">{error}</p>
          ) : !data ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : (
            <>
              <pre className="text-xs font-mono whitespace-pre-wrap break-words p-3 rounded-md bg-muted/40 border border-border max-h-72 overflow-y-auto">
                {text}
              </pre>
              <div className="flex flex-wrap items-center gap-2 justify-between">
                <div className="text-[11px] text-muted-foreground">
                  Permalink:{" "}
                  <code className="px-1.5 py-0.5 rounded bg-muted">
                    {data.permalink}
                  </code>
                </div>
                <button
                  type="button"
                  onClick={onCopy}
                  className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                >
                  {copied ? (
                    <>
                      <Check className="w-3.5 h-3.5" strokeWidth={2} />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" strokeWidth={2} />
                      Copy
                    </>
                  )}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
