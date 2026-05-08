import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./App";
import { initObservability, captureError } from "./lib/observability";
import "./styles/globals.css";

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

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
