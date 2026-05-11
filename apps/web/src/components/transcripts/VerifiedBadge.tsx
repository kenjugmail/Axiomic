// Sprint 37 — Verified badge for capstone artifact pages.
//
// Fetches the signed transcript on mount and lets the visitor open a
// dialog with the manifest details + a one-click "Download transcript"
// button. The badge itself does NOT prove anything by being green; it
// links to /verify where anyone can paste the JSON and see the
// signature roundtrip.

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ShieldCheck, X } from "lucide-react";

interface SignedTranscript {
  manifest: any;
  signature: string;
  publicKey: string;
  algorithm: string;
  canonicalPayload: string;
}

interface Props {
  artifactSlug: string;
}

export function VerifiedBadge({ artifactSlug }: Props) {
  const [data, setData] = useState<SignedTranscript | null>(null);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/v1/capstones/c/${artifactSlug}/transcript`)
      .then(async (r) => {
        if (!r.ok) throw new Error("Transcript unavailable");
        return r.json();
      })
      .then((r) => {
        if (cancelled) return;
        setData(r);
      })
      .catch((e: any) => {
        if (cancelled) return;
        setError(e?.message ?? "Transcript unavailable");
      });
    return () => {
      cancelled = true;
    };
  }, [artifactSlug]);

  if (error) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
        <ShieldCheck className="w-3 h-3" strokeWidth={2} />
        Transcript unavailable
      </span>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={!data}
        className="inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-full border border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/15 transition-colors disabled:opacity-60"
      >
        <ShieldCheck className="w-3.5 h-3.5" strokeWidth={2} />
        Signed transcript
        {data && (
          <span className="font-mono opacity-70">
            · v{data.manifest.capstone.version}
          </span>
        )}
      </button>

      {open && data && (
        <TranscriptDialog
          data={data}
          artifactSlug={artifactSlug}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function TranscriptDialog({
  data,
  artifactSlug,
  onClose,
}: {
  data: SignedTranscript;
  artifactSlug: string;
  onClose: () => void;
}) {
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

  const download = () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${artifactSlug}.transcript.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(data, null, 2));
    } catch {}
  };

  const m = data.manifest;
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center p-4 sm:p-8"
      role="dialog"
      aria-modal="true"
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
              Signed capstone transcript
            </div>
            <h3 className="text-sm font-semibold leading-tight">
              {m.capstone.title} · v{m.capstone.version}
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {m.learner.displayName || `@${m.learner.username}`} ·{" "}
              {new Date(m.completedAt).toLocaleDateString()}
            </p>
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

        <div className="px-4 py-3 space-y-3 text-xs">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
              Milestones
            </div>
            <ul className="space-y-1">
              {m.milestones.map((mm: any, i: number) => (
                <li
                  key={i}
                  className="flex items-baseline justify-between gap-3"
                >
                  <span className="truncate">{mm.title}</span>
                  <span
                    className={`tabular-nums shrink-0 ${
                      mm.status === "passed"
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-muted-foreground"
                    }`}
                  >
                    {mm.score != null
                      ? `${Math.round(mm.score * 100)}%`
                      : "—"}{" "}
                    · {mm.status}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-md bg-muted/40 border border-border p-2 text-[10px] font-mono">
            <div className="text-muted-foreground uppercase tracking-wider text-[9px] mb-1">
              ed25519 signature
            </div>
            <div className="break-all">{data.signature}</div>
          </div>

          <div className="rounded-md bg-muted/40 border border-border p-2 text-[10px] font-mono">
            <div className="text-muted-foreground uppercase tracking-wider text-[9px] mb-1">
              Issuer public key
            </div>
            <div className="break-all">{data.publicKey}</div>
          </div>
        </div>

        <footer className="border-t border-border p-3 bg-muted/20 flex flex-wrap items-center gap-2 justify-between">
          <Link
            to="/verify"
            className="text-[11px] text-primary hover:underline"
          >
            Verify another transcript →
          </Link>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={copyToClipboard}
              className="text-xs px-3 py-1.5 rounded-md border border-border hover:bg-accent/40"
            >
              Copy JSON
            </button>
            <button
              type="button"
              onClick={download}
              className="text-xs px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
            >
              Download
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
