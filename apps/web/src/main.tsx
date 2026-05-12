import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./App";
import { initObservability, captureError } from "./lib/observability";
import "./styles/globals.css";
// Phase 9 — pet styles loaded as a side-effect CSS import so they
// bypass the Tailwind @layer pipeline that mangles the @layer base
// :where(...) block in this file. See the note in globals.css.
import "./styles/pet-tokens.css";

// Sprint 66c — kick off Sentry init early. No-op when VITE_SENTRY_DSN
// is unset (dev / tests). Errors after init are routed through the
// shim's captureError; we also bridge unhandled errors + promise
// rejections so the SDK sees what slips through component boundaries.
void initObservability();
window.addEventListener("error", (e) => {
  captureError(e.error ?? e.message, { kind: "window_error" });
});
window.addEventListener("unhandledrejection", (e) => {
  captureError(e.reason, { kind: "unhandled_rejection" });
});

// S107a — register the Web Push service worker. The SW receives
// push events and surfaces them as native notifications via
// self.registration.showNotification(). Registration is best-effort:
// browsers without serviceWorker support (or insecure contexts in
// dev) silently skip. The actual permission prompt is gated behind
// an explicit user click in Settings; this just makes the SW
// available so subscribe() works when the user opts in.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/service-worker.js", { scope: "/" })
      .catch((err) => {
        console.warn("[push] service worker registration failed", err);
      });
  });
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
