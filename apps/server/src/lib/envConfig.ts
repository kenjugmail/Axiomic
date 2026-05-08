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
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | null = null;

export function loadEnv(): Env {
  if (cached) return cached;
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    // We log instead of throwing so a typo doesn't take the server
    // down at import time; coerced defaults still apply for the
    // valid keys.
    console.warn(
      "envConfig: some env vars failed validation, using defaults where possible:",
      parsed.error.flatten().fieldErrors,
    );
    cached = envSchema.parse({});
    return cached;
  }
  cached = parsed.data;
  return cached;
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

// Production warnings — surfaced once at server boot.
export function warnOnInsecureConfig(): void {
  const e = loadEnv();
  if (e.NODE_ENV !== "production") return;
  const warnings: string[] = [];
  if (!e.AXIOMIC_SIGNING_PRIVATE_KEY_HEX) {
    warnings.push(
      "AXIOMIC_SIGNING_PRIVATE_KEY_HEX is not set in production. Capstone " +
        "transcripts will sign under an EPHEMERAL key and stop verifying " +
        "after every restart. Generate one with `bash scripts/generate-signing-key.sh` " +
        "and set it in your environment.",
    );
  }
  if (e.DEV_AUTH_BYPASS === "1") {
    warnings.push(
      "DEV_AUTH_BYPASS=1 in production is dangerous: every request runs as " +
        `${e.DEV_AUTH_BYPASS_USER} regardless of session cookie. Disable.`,
    );
  }
  if (!e.SESSION_SECRET) {
    warnings.push(
      "SESSION_SECRET is not set; session signing falls back to defaults. " +
        "Set a strong random value before public deploy.",
    );
  }
  if (e.CORS_ORIGIN === "http://localhost:5173") {
    warnings.push(
      "CORS_ORIGIN is still the dev default (http://localhost:5173). " +
        "Set it to your production frontend URL(s); comma-separate for multi-origin.",
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
