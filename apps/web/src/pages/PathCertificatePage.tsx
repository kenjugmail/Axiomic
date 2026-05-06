import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../lib/api";
import type { PathCertificateResponse } from "@axiomic/types";

const ACCENT_GRADIENT: Record<string, string> = {
  indigo: "from-indigo-600 to-violet-700",
  emerald: "from-emerald-600 to-teal-700",
  rose: "from-rose-600 to-pink-700",
  amber: "from-amber-600 to-orange-700",
  sky: "from-sky-600 to-cyan-700",
  violet: "from-violet-600 to-fuchsia-700",
};

// Render an SVG card that can be saved or shared. Keeps the layout
// fully resolution-independent so saving the SVG yields a crisp
// share image at any size.
function buildSvg(cert: PathCertificateResponse): string {
  const accent: Record<string, string> = {
    indigo: "#6366f1",
    emerald: "#10b981",
    rose: "#f43f5e",
    amber: "#f59e0b",
    sky: "#0ea5e9",
    violet: "#8b5cf6",
  };
  const c = accent[cert.accentColor] ?? "#6366f1";
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
      <h1 className="text-2xl font-bold mt-2 mb-6">Certificate of completion</h1>

      <div
        className={`rounded-2xl overflow-hidden bg-gradient-to-br ${ACCENT_GRADIENT[cert.accentColor] ?? ACCENT_GRADIENT.indigo} text-white shadow-2xl`}
      >
        <div className="p-12 text-center space-y-4 border-2 border-white/20 m-2 rounded-xl">
          <div className="text-sm uppercase tracking-wider opacity-80">Certificate of completion</div>
          <h2 className="text-5xl font-serif">
            {cert.displayName || cert.username}
          </h2>
          <p className="text-lg opacity-90">has completed all {cert.totalNodes} nodes of</p>
          <p className="text-3xl font-bold">{cert.pathTitle}</p>
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
          className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90"
        >
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
