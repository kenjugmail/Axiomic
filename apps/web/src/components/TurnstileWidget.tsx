// S108 — Cloudflare Turnstile widget wrapper.
//
// Loads Cloudflare's turnstile script once and renders a widget into
// a div. When VITE_TURNSTILE_SITE_KEY is unset we render nothing and
// call `onToken` with `null`, so the SignupPage can submit anyway —
// the server side also bypasses verification when its secret is unset.
//
// Avoids adding a new npm dep; uses the official global JS API.

import { useEffect, useRef } from "react";

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: HTMLElement,
        opts: {
          sitekey: string;
          callback?: (token: string) => void;
          "error-callback"?: () => void;
          "expired-callback"?: () => void;
          theme?: "auto" | "light" | "dark";
        },
      ) => string;
      reset: (widgetId?: string) => void;
      remove: (widgetId?: string) => void;
    };
  }
}

const SCRIPT_URL = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
let scriptPromise: Promise<void> | null = null;

function loadTurnstileScript(): Promise<void> {
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve, reject) => {
    if (typeof window === "undefined") return resolve();
    if (window.turnstile) return resolve();
    const existing = document.querySelector(`script[src^="${SCRIPT_URL.split("?")[0]}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("turnstile_script_load_failed")));
      return;
    }
    const s = document.createElement("script");
    s.src = SCRIPT_URL;
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("turnstile_script_load_failed"));
    document.head.appendChild(s);
  });
  return scriptPromise;
}

interface TurnstileWidgetProps {
  onToken: (token: string | null) => void;
  // Sentinel: when site key is missing we render nothing.
  className?: string;
}

export function TurnstileWidget({ onToken, className = "" }: TurnstileWidgetProps) {
  const siteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!siteKey) {
      // Captcha disabled for this build; signal pass-through to the
      // submit handler so the page works in dev.
      onToken(null);
      return;
    }
    let cancelled = false;
    loadTurnstileScript()
      .then(() => {
        if (cancelled || !containerRef.current || !window.turnstile) return;
        widgetIdRef.current = window.turnstile.render(containerRef.current, {
          sitekey: siteKey,
          callback: (token) => onToken(token),
          "error-callback": () => onToken(null),
          "expired-callback": () => onToken(null),
        });
      })
      .catch(() => {
        // Script failed to load — fall back to bypass so the user
        // isn't locked out by a CDN hiccup.
        if (!cancelled) onToken(null);
      });
    return () => {
      cancelled = true;
      if (widgetIdRef.current && window.turnstile) {
        try {
          window.turnstile.remove(widgetIdRef.current);
        } catch {
          // ignore — the script may have unloaded already
        }
      }
    };
  }, [siteKey, onToken]);

  if (!siteKey) return null;
  return <div ref={containerRef} className={className} />;
}
