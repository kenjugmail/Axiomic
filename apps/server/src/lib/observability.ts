// Sprint 66c — Server observability shim.
//
// The platform's error story today is the in-process ring buffer in
// `errorSampler.ts` + the structured stdout sink it gained in S63d.
// Both are good enough for single-host deploys; multi-instance ops
// want a real aggregator. This module wraps `@sentry/node` so
// `captureError(err, context)` forwards to Sentry when `SENTRY_DSN`
// is set, falls through to `errorSampler.recordError` otherwise.
//
// The Sentry SDK is loaded lazily — importing it costs ~3 MB of
// JS even when unused, so we gate it on the DSN env var. Tests +
// dev with no DSN see zero overhead.

import { env } from "./envConfig";
import { recordError, type ErrorEntry } from "./errorSampler";

let sentryReady = false;
let sentryModule: typeof import("@sentry/node") | null = null;
let initPromise: Promise<void> | null = null;

async function initSentry(): Promise<void> {
  if (sentryReady) return;
  if (!env.SENTRY_DSN) return;
  if (initPromise) return initPromise;
  initPromise = (async () => {
    try {
      const Sentry = await import("@sentry/node");
      Sentry.init({
        dsn: env.SENTRY_DSN,
        environment: env.SENTRY_ENVIRONMENT ?? env.NODE_ENV,
        tracesSampleRate: env.SENTRY_TRACES_SAMPLE_RATE ?? 0,
      });
      sentryModule = Sentry;
      sentryReady = true;
    } catch (err) {
      // SDK install missing or init failure — don't take the request
      // down; the error sampler still records the original error.
      console.warn(
        "observability: failed to initialize Sentry SDK; continuing with sampler-only:",
        err,
      );
    }
  })();
  return initPromise;
}

// Eager init kicks off in the background once the module is imported
// in production. In tests / dev without a DSN this is a no-op.
void initSentry();

export interface CaptureContext {
  kind?: string;
  fields?: Record<string, unknown>;
  // S108 — Request-level context. When the error handler has these
  // they're forwarded to Sentry as proper structured fields (user
  // tags + route tag) instead of buried in `fields`. Makes the
  // Sentry "filter by user / route" UI actually useful.
  userId?: string;
  userRole?: string;
  route?: string;
  method?: string;
  statusCode?: number;
}

export function captureError(err: unknown, context?: CaptureContext): void {
  // Always feed the in-process sampler so /admin/error-stats stays
  // populated alongside whatever Sentry receives.
  const e = err instanceof Error ? err : new Error(String(err));
  const entry: ErrorEntry = {
    kind: context?.kind ?? "captured_error",
    msg: e.message,
    ts: new Date().toISOString(),
    fields: {
      errorClass: e.name,
      ...(context?.fields ?? {}),
      ...(context?.userId ? { userId: context.userId } : {}),
      ...(context?.userRole ? { userRole: context.userRole } : {}),
      ...(context?.route ? { route: context.route } : {}),
      ...(context?.method ? { method: context.method } : {}),
      ...(context?.statusCode ? { statusCode: context.statusCode } : {}),
    },
  };
  recordError(entry);

  if (sentryReady && sentryModule) {
    try {
      // Sentry's user/tags are first-class fields; everything else
      // goes into `extra`.
      if (context?.userId) {
        sentryModule.setUser({
          id: context.userId,
          ...(context.userRole ? { role: context.userRole } : {}),
        });
      }
      sentryModule.captureException(e, {
        tags: {
          kind: entry.kind,
          ...(context?.route ? { route: context.route } : {}),
          ...(context?.method ? { method: context.method } : {}),
          ...(context?.statusCode ? { statusCode: String(context.statusCode) } : {}),
          ...(context?.userRole ? { user_role: context.userRole } : {}),
        },
        extra: context?.fields,
      });
    } catch {
      // never let observability break the request path
    }
  }
}

// Test hook — flush + reset the lazy init state. Used by future
// suites that want to assert on captureError behavior.
export function _resetForTests(): void {
  sentryReady = false;
  sentryModule = null;
  initPromise = null;
}
