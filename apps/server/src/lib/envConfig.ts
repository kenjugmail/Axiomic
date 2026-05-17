// Sprint 45 — Typed env loader.
//
// Single source of truth for every server-side process.env read.
// Every other module imports `env` from here instead of touching
// process.env directly so the schema (and required-in-prod warnings)
// stay one file. Variables are validated lazily on first read so
// importing this file in tests doesn't crash on missing optional
// values.

import { z } from "zod";

const envSchema = z.object({
  // Runtime
  PORT: z.coerce.number().int().positive().default(3000),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),

  // Storage
  DATABASE_URL: z.string().optional(),
  UPLOADS_STORAGE_PATH: z.string().optional(),

  // CORS — comma-separated list of allowed origins. The CORS handler
  // splits + trims downstream so multi-origin and single-origin
  // configs share one var.
  CORS_ORIGIN: z.string().default("http://localhost:5173"),

  // Auth
  DEV_AUTH_BYPASS: z.string().optional(),
  DEV_AUTH_BYPASS_USER: z.string().default("alice"),
  DISABLE_JOB_RUNNER: z.string().optional(),
  SESSION_SECRET: z.string().optional(),
  BOOTSTRAP_ADMIN_USERNAME: z.string().optional(),

  // Signing — required for transcript verifiability across restarts.
  // Unset is allowed (signing.ts generates an ephemeral key with a
  // loud warning), but production deploys MUST set this.
  AXIOMIC_SIGNING_PRIVATE_KEY_HEX: z.string().optional(),

  // AI provider
  AI_PROVIDER: z.enum(["mock", "ollama"]).default("mock"),
  OLLAMA_HOST: z.string().optional(),
  OLLAMA_CHAT_MODEL: z.string().optional(),
  OLLAMA_EMBED_MODEL: z.string().optional(),

  // Server-side code execution (Sprint 44 stub + Sprint 46 local-process backend).
  SERVER_EXEC_BACKEND: z.enum(["stub", "local"]).default("stub"),
  SERVER_EXEC_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(30_000),
  SERVER_EXEC_MAX_OUTPUT_BYTES: z.coerce
    .number()
    .int()
    .positive()
    .default(1_048_576),

  // Sprint 52 — Content approval gate. When "1", lessons / wiki edits
  // route through content_proposals and require admin approval before
  // landing. Default off so local dev + tests publish-immediately.
  CONTENT_APPROVAL_ENABLED: z.string().optional(),

  // Sprint 53 — Structured logger level. Defaults to 'info' in prod,
  // 'debug' otherwise.
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).optional(),

  // Sprint 63d — error sampler observability. The sampler keeps an
  // in-process ring buffer (sized via ERROR_SAMPLER_BUFFER_SIZE) for
  // the /admin/error-stats dashboard; ERROR_LOG_DESTINATION controls
  // whether sampled errors also emit a structured JSON line on stdout
  // for external aggregators (Loki, Datadog, etc.).
  ERROR_LOG_DESTINATION: z
    .enum(["memory", "stdout", "both"])
    .default("both"),
  ERROR_SAMPLER_BUFFER_SIZE: z.coerce
    .number()
    .int()
    .positive()
    .default(200),

  // Sprint 66c — Sentry SDK shim. When SENTRY_DSN is set, the
  // observability layer initializes @sentry/node and forwards
  // `captureError` calls to it; otherwise everything stays in the
  // existing in-memory error sampler. Optional in dev / tests.
  SENTRY_DSN: z.string().optional(),
  SENTRY_ENVIRONMENT: z.string().optional(),
  SENTRY_TRACES_SAMPLE_RATE: z.coerce.number().optional(),

  // S108 — Beta hardening.
  //
  // TURNSTILE_SECRET_KEY: Cloudflare Turnstile server-side secret.
  // When unset, captcha verification short-circuits to "pass" so dev
  // and CI stay green without a Turnstile account. In production the
  // signup route returns 400 if the secret is set but verify fails.
  //
  // RESEND_API_KEY: Resend SDK key for transactional email. When unset,
  // the email layer logs the email body to stdout instead of sending —
  // a developer can finish the verify-email flow locally by clicking
  // the link from the server log.
  //
  // EMAIL_FROM: From-address on outgoing email. Defaults to
  // "noreply@axiomic.app".
  //
  // APP_BASE_URL: External base URL the verify-email link should
  // point at (e.g. https://demo.axiomic.app). Defaults to the
  // request's origin if absent; pin in production to avoid host
  // header injection attacks against the verify link.
  TURNSTILE_SECRET_KEY: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().default("noreply@axiomic.app"),
  APP_BASE_URL: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | null = null;

export function loadEnv(): Env {
  if (cached) return cached;
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    // In production, an invalid env should fail boot loudly — a typo
    // in CORS_ORIGIN or a malformed sample rate silently falling back
    // to defaults is the exact failure mode we want to surface before
    // serving requests. In development/test, warn and fall back so a
    // single bad value doesn't block local work.
    const fieldErrors = parsed.error.flatten().fieldErrors;
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "envConfig: env validation failed in production: " +
          JSON.stringify(fieldErrors),
      );
    }
    console.warn(
      "envConfig: some env vars failed validation, using defaults where possible:",
      fieldErrors,
    );
    cached = envSchema.parse({});
    return cached;
  }
  cached = parsed.data;
  return cached;
}

// Test-only: reset the cache so each test can inject its own env.
export function _resetEnvCacheForTests(): void {
  cached = null;
}

// Convenience accessor — `env.PORT` reads cleaner than `loadEnv().PORT`
// at every call site. We use a Proxy so each property hits loadEnv()
// the first time, populating the cache, and subsequent reads come
// from the cached object.
export const env: Env = new Proxy({} as Env, {
  get(_target, prop) {
    return (loadEnv() as any)[prop];
  },
});

// Production fail-fast — refuses to boot if the secrets that
// would silently degrade to ephemeral keys / stdout-only email are
// missing. Run before warnOnInsecureConfig and before app.fetch.
export function assertProductionSecrets(): void {
  const e = loadEnv();
  if (e.NODE_ENV !== "production") return;
  // DEV_AUTH_BYPASS short-circuits all authentication to a fixed
  // user. It is never legitimate in production — a warning is not
  // enough; refuse to boot entirely (same posture as the missing
  // signing key).
  if (e.DEV_AUTH_BYPASS === "1") {
    throw new Error(
      "Refusing to boot in production: DEV_AUTH_BYPASS=1 disables all " +
        "authentication (every request runs as a fixed user). Unset it.",
    );
  }
  const missing: string[] = [];
  if (!e.SESSION_SECRET) missing.push("SESSION_SECRET");
  if (!e.AXIOMIC_SIGNING_PRIVATE_KEY_HEX) missing.push("AXIOMIC_SIGNING_PRIVATE_KEY_HEX");
  if (!e.RESEND_API_KEY) missing.push("RESEND_API_KEY");
  if (missing.length > 0) {
    throw new Error(
      `Refusing to boot in production: required env vars unset: ${missing.join(", ")}. ` +
        `Generate signing keys with \`bash scripts/generate-signing-key.sh\` and ` +
        `set SESSION_SECRET / RESEND_API_KEY in the deploy environment.`,
    );
  }
}

// Production warnings — surfaced once at server boot. These cover
// the misconfigurations that aren't fatal (TURNSTILE silently
// degrades, CORS_ORIGIN is a tunable default).
export function warnOnInsecureConfig(): void {
  const e = loadEnv();
  if (e.NODE_ENV !== "production") return;
  const warnings: string[] = [];
  // DEV_AUTH_BYPASS=1 is now fatal in production (see
  // assertProductionSecrets); no warning needed here.
  if (e.DISABLE_JOB_RUNNER === "1") {
    warnings.push(
      "DISABLE_JOB_RUNNER=1 in production: background jobs are off — " +
        "credential transparency tree heads won't be signed and " +
        "email/notification dispatch is suspended. Unset unless this " +
        "instance is intentionally web-only.",
    );
  }
  if (e.CORS_ORIGIN === "http://localhost:5173") {
    warnings.push(
      "CORS_ORIGIN is still the dev default (http://localhost:5173). " +
        "Set it to your production frontend URL(s); comma-separate for multi-origin.",
    );
  }
  if (!e.TURNSTILE_SECRET_KEY) {
    warnings.push(
      "TURNSTILE_SECRET_KEY is not set; signup captcha verification " +
        "short-circuits to pass. Configure Cloudflare Turnstile before public deploy.",
    );
  }
  if (warnings.length > 0) {
    console.warn(
      "\n=== axiomic production-config warnings ===\n" +
        warnings.map((w) => `- ${w}`).join("\n") +
        "\n",
    );
  }
}
