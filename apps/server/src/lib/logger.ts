// Sprint 53 — Structured server logger.
//
// Minimal Pino-shaped wrapper that emits one JSON line per event with
// a `kind` discriminator (e.g. 'ai_stream_failed', 'exec_timeout').
// Used by routes that previously logged free-form strings or
// swallowed errors entirely. Reads LOG_LEVEL from env; defaults to
// 'info' in prod, 'debug' in dev/test.
//
// Each `error()` call also feeds the in-memory error sampler
// (errorSampler.ts) so /admin/error-stats can surface the most
// recent N errors without external infra.

import { env } from "./envConfig";
import { recordError } from "./errorSampler";

export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_RANK: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function activeLevel(): LogLevel {
  const raw = (env.LOG_LEVEL ?? "").toLowerCase();
  if (raw === "debug" || raw === "info" || raw === "warn" || raw === "error") {
    return raw;
  }
  return env.NODE_ENV === "production" ? "info" : "debug";
}

interface LogFields {
  kind?: string;
  [key: string]: unknown;
}

function emit(level: LogLevel, fields: string | LogFields): void {
  if (LEVEL_RANK[level] < LEVEL_RANK[activeLevel()]) return;
  const payload =
    typeof fields === "string"
      ? { msg: fields }
      : { ...fields };
  const line = {
    level,
    ts: new Date().toISOString(),
    ...payload,
  };
  // Tests mute info+debug to keep output readable; warn+error always surface.
  if (env.NODE_ENV === "test" && (level === "info" || level === "debug")) {
    return;
  }
  // eslint-disable-next-line no-console -- this IS the logger
  const stream = level === "error" || level === "warn" ? console.error : console.log;
  try {
    stream(JSON.stringify(line));
  } catch {
    stream(`[logger] failed to serialize: level=${level}`);
  }
}

export const logger = {
  debug(fields: string | LogFields): void {
    emit("debug", fields);
  },
  info(fields: string | LogFields): void {
    emit("info", fields);
  },
  warn(fields: string | LogFields): void {
    emit("warn", fields);
  },
  error(fields: string | LogFields): void {
    emit("error", fields);
    const obj = typeof fields === "string" ? { msg: fields } : fields;
    recordError({
      kind: typeof obj.kind === "string" ? obj.kind : "unknown",
      msg: typeof obj.msg === "string" ? obj.msg : extractMessage(obj),
      fields: obj,
      ts: new Date().toISOString(),
    });
  },
};

function extractMessage(fields: LogFields): string {
  if (typeof fields.error === "string") return fields.error;
  if (typeof fields.errorMessage === "string") return fields.errorMessage;
  if (fields.err instanceof Error) return fields.err.message;
  return "(no message)";
}
