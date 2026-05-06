import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Download, Trophy } from "lucide-react";
import { api } from "../lib/api";
import type { PathCertificateResponse } from "@axiomic/types";

// On-screen accent — uses our second-tier accent palette so light
// + dark mode track the rest of the app instead of saturated rainbow.
const ACCENT_BG_FROM: Record<string, string> = {
  indigo: "from-accent-indigo",
  emerald: "from-accent-emerald",
  rose: "from-accent-rose",
  amber: "from-accent-amber",
  sky: "from-accent-sky",
  violet: "from-accent-violet",
};

// Read a CSS variable from :root and convert the HSL triplet into
// an SVG-friendly hex string. The certificate is a downloaded SVG
// so we resolve at build-time; CSS vars don't follow the file once
// detached.
function resolveAccentHex(name: string): string {
  const fallback = "#6366f1";
  if (typeof window === "undefined") return fallback;
  try {
    const v = getComputedStyle(document.documentElement)
      .getPropertyValue(`--accent-${name}`)
      .trim();
    if (!v) return fallback;
    // var like "239 70% 58%". Convert via canvas-free HSL→RGB.
    const m = v.match(/^(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)%\s+(\d+(?:\.\d+)?)%$/);
    if (!m) return fallback;
    return hslToHex(parseFloat(m[1]), parseFloat(m[2]), parseFloat(m[3]));
  } catch {
    return fallback;
  }
}

function hslToHex(h: number, s: number, l: number): string {
  const sN = s / 100;
  const lN = l / 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = sN * Math.min(lN, 1 - lN);
  const f = (n: number) => {
    const c = lN - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    return Math.round(255 * c)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

// Render an SVG card that can be saved or shared. Keeps the layout
// fully resolution-independent so saving the SVG yields a crisp
// share image at any size.
function buildSvg(cert: PathCertificateResponse): string {
  const c = resolveAccentHex(cert.accentColor);
  const date = new Date(cert.completedAt).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const name = (cert.displayName || cert.username).replace(/[<>&"']/g, "");
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${c}" stop-opacity="0.95"/>
      <stop offset="100%" stop-color="#0f172a"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  <rect x="40" y="40" width="1120" height="550" fill="none" stroke="white" stroke-opacity="0.3" stroke-width="2" rx="16"/>
  <text x="600" y="180" text-anchor="middle" font-family="Georgia, serif" font-size="32" fill="white" fill-opacity="0.85">Certificate of completion</text>
  <text x="600" y="280" text-anchor="middle" font-family="Georgia, serif" font-size="64" fill="white" font-weight="bold">${name}</text>
  <text x="600" y="340" text-anchor="middle" font-family="Inter, system-ui, sans-serif" font-size="22" fill="white" fill-opacity="0.85">has completed all ${cert.totalNodes} nodes of</text>
  <text x="600" y="410" text-anchor="middle" font-family="Inter, system-ui, sans-serif" font-size="44" fill="white" font-weight="bold">${cert.pathTitle}</text>
  <text x="600" y="500" text-anchor="middle" font-family="Inter, system-ui, sans-serif" font-size="18" fill="white" fill-opacity="0.7">${cert.achievements} achievements earned · ${date}</text>
  <text x="1130" y="600" text-anchor="end" font-family="Inter, system-ui, sans-serif" font-size="14" fill="white" fill-opacity="0.4">axiomic.io</text>
</svg>`;
}

export function PathCertificatePage() {
  const { pathSlug, username } = useParams<{ pathSlug: string; username: string }>();
  const [cert, setCert] = useState<PathCertificateResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!pathSlug || !username) return;
    api.gamification
      .certificate(pathSlug, username)
      .then(setCert)
      .catch((e) =>
        setError(
          e?.message ??
            "Couldn't load the certificate — make sure the path is fully complete.",
        ),
      );
  }, [pathSlug, username]);

  const download = () => {
    if (!cert) return;
    const svg = buildSvg(cert);
    const blob = new Blob([svg], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${cert.username}-${cert.pathSlug}-certificate.svg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (error) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center space-y-3">
        <p className="text-destructive">{error}</p>
        <Link to={`/paths/${pathSlug}`} className="text-primary hover:underline">
          Back to path
        </Link>
      </div>
    );
  }
  if (!cert) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-12">
        <div className="animate-pulse h-72 bg-muted rounded-xl" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <Link to={`/paths/${cert.pathSlug}`} className="text-sm text-muted-foreground hover:text-foreground">
        &larr; Back to {cert.pathTitle}
      </Link>
      <h1 className="font-display text-3xl font-semibold mt-2 mb-6">
        Certificate of completion
      </h1>

      <div
        className={`rounded-xl overflow-hidden text-white shadow-elevated bg-gradient-to-br ${
          ACCENT_BG_FROM[cert.accentColor] ?? ACCENT_BG_FROM.indigo
        } to-foreground`}
      >
        <div className="p-12 text-center space-y-4 border-2 border-white/20 m-2 rounded-lg">
          <div className="inline-flex items-center gap-2 text-xs uppercase tracking-wider opacity-80">
            <Trophy className="w-3.5 h-3.5" strokeWidth={2} />
            Certificate of completion
          </div>
          <h2 className="font-display text-5xl font-semibold">
            {cert.displayName || cert.username}
          </h2>
          <p className="text-base opacity-90">
            has completed all {cert.totalNodes} nodes of
          </p>
          <p className="text-3xl font-semibold">{cert.pathTitle}</p>
          <p className="text-sm opacity-80">
            {cert.achievements} achievements earned ·{" "}
            {new Date(cert.completedAt).toLocaleDateString(undefined, {
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </p>
        </div>
      </div>

      <div className="flex gap-3 mt-6">
        <button
          onClick={download}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90"
        >
          <Download className="w-3.5 h-3.5" strokeWidth={2.5} />
          Download SVG
        </button>
        <Link
          to={`/profile/${cert.username}`}
          className="px-4 py-2 rounded-md border border-border text-sm hover:bg-accent/40"
        >
          See profile
        </Link>
      </div>
    </div>
  );
}
