// Sprint 66c — Web observability shim.
//
// Mirrors the server shim. When `VITE_SENTRY_DSN` is set, the web
// bundle initializes `@sentry/react` and exposes `captureError`
// that forwards to Sentry. When unset, captureError logs to the
// console only — keeps dev quiet, prod errors visible.
//
// The Sentry SDK weighs ~50 KB gzipped, so we import it lazily +
// only fire init when the DSN env is present.

let ready = false;
let sentryModule: typeof import("@sentry/react") | null = null;

export async function initObservability(): Promise<void> {
  const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
  if (!dsn) return;
  try {
    const Sentry = await import("@sentry/react");
    Sentry.init({
      dsn,
      environment: (import.meta.env.MODE as string) || "production",
      tracesSampleRate: 0,
    });
    sentryModule = Sentry;
    ready = true;
  } catch (err) {
    console.warn("observability: Sentry init failed; continuing without:", err);
  }
}

export function captureError(
  err: unknown,
  context?: { kind?: string; fields?: Record<string, unknown> },
): void {
  // Always log to the console so dev sees it.
  console.error("captureError", { kind: context?.kind, err, fields: context?.fields });
  if (ready && sentryModule) {
    try {
      const e = err instanceof Error ? err : new Error(String(err));
      sentryModule.captureException(e, {
        tags: context?.kind ? { kind: context.kind } : undefined,
        extra: context?.fields,
      });
    } catch {
      // never block the UI path
    }
  }
}
