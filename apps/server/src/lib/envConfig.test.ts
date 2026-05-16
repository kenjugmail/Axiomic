// Sprint 108 — envConfig prod-throws / dev-warns behavior.
//
// Validation failures in NODE_ENV=production must throw at boot so a
// typo doesn't silently fall back to localhost defaults and serve a
// pitch demo behind the wrong CORS origin. In dev/test we keep the
// warn-and-fallback behavior so a single bad value doesn't block work.

import { describe, test, expect, beforeEach, afterAll, mock } from "bun:test";
import { loadEnv, _resetEnvCacheForTests, assertProductionSecrets } from "./envConfig";

const snapshot = { ...process.env };

function restoreEnv() {
  for (const k of Object.keys(process.env)) {
    if (!(k in snapshot)) delete process.env[k];
  }
  Object.assign(process.env, snapshot);
}

describe("envConfig validation", () => {
  beforeEach(() => {
    restoreEnv();
    _resetEnvCacheForTests();
  });

  afterAll(() => {
    restoreEnv();
    _resetEnvCacheForTests();
  });

  test("production: invalid AI_PROVIDER throws", () => {
    process.env.NODE_ENV = "production";
    process.env.AI_PROVIDER = "not-a-real-provider";
    expect(() => loadEnv()).toThrow(/env validation failed in production/);
  });

  test("production: invalid SENTRY_TRACES_SAMPLE_RATE throws", () => {
    process.env.NODE_ENV = "production";
    process.env.SENTRY_TRACES_SAMPLE_RATE = "not-a-number";
    expect(() => loadEnv()).toThrow(/env validation failed in production/);
  });

  test("production: invalid SERVER_EXEC_BACKEND throws", () => {
    process.env.NODE_ENV = "production";
    process.env.SERVER_EXEC_BACKEND = "rce-go-brrr";
    expect(() => loadEnv()).toThrow(/env validation failed in production/);
  });

  test("development: invalid AI_PROVIDER warns and falls back", () => {
    process.env.NODE_ENV = "development";
    process.env.AI_PROVIDER = "not-a-real-provider";
    const warnMock = mock(() => {});
    const original = console.warn;
    console.warn = warnMock;
    try {
      const env = loadEnv();
      expect(env.AI_PROVIDER).toBe("mock"); // default applied
      expect(warnMock).toHaveBeenCalled();
    } finally {
      console.warn = original;
    }
  });

  test("production: valid env loads cleanly", () => {
    process.env.NODE_ENV = "production";
    process.env.CORS_ORIGIN = "https://demo.axiomic.app";
    process.env.AI_PROVIDER = "mock";
    process.env.SERVER_EXEC_BACKEND = "stub";
    expect(() => loadEnv()).not.toThrow();
    const env = loadEnv();
    expect(env.NODE_ENV).toBe("production");
    expect(env.CORS_ORIGIN).toBe("https://demo.axiomic.app");
  });
});

describe("assertProductionSecrets (Phase I)", () => {
  beforeEach(() => {
    restoreEnv();
    _resetEnvCacheForTests();
  });

  afterAll(() => {
    restoreEnv();
    _resetEnvCacheForTests();
  });

  test("dev: no-op (does not throw)", () => {
    process.env.NODE_ENV = "development";
    expect(() => assertProductionSecrets()).not.toThrow();
  });

  test("test: no-op (does not throw)", () => {
    process.env.NODE_ENV = "test";
    expect(() => assertProductionSecrets()).not.toThrow();
  });

  test("production: throws when SESSION_SECRET missing", () => {
    process.env.NODE_ENV = "production";
    process.env.AXIOMIC_SIGNING_PRIVATE_KEY_HEX = "deadbeef";
    process.env.RESEND_API_KEY = "re_xxx";
    delete process.env.SESSION_SECRET;
    expect(() => assertProductionSecrets()).toThrow(/SESSION_SECRET/);
  });

  test("production: throws when AXIOMIC_SIGNING_PRIVATE_KEY_HEX missing", () => {
    process.env.NODE_ENV = "production";
    process.env.SESSION_SECRET = "s3cret";
    process.env.RESEND_API_KEY = "re_xxx";
    delete process.env.AXIOMIC_SIGNING_PRIVATE_KEY_HEX;
    expect(() => assertProductionSecrets()).toThrow(/AXIOMIC_SIGNING_PRIVATE_KEY_HEX/);
  });

  test("production: throws when RESEND_API_KEY missing", () => {
    process.env.NODE_ENV = "production";
    process.env.SESSION_SECRET = "s3cret";
    process.env.AXIOMIC_SIGNING_PRIVATE_KEY_HEX = "deadbeef";
    delete process.env.RESEND_API_KEY;
    expect(() => assertProductionSecrets()).toThrow(/RESEND_API_KEY/);
  });

  test("production: lists all missing in error message", () => {
    process.env.NODE_ENV = "production";
    delete process.env.SESSION_SECRET;
    delete process.env.AXIOMIC_SIGNING_PRIVATE_KEY_HEX;
    delete process.env.RESEND_API_KEY;
    expect(() => assertProductionSecrets()).toThrow(
      /SESSION_SECRET.*AXIOMIC_SIGNING_PRIVATE_KEY_HEX.*RESEND_API_KEY/,
    );
  });

  test("production: passes when all secrets set", () => {
    process.env.NODE_ENV = "production";
    process.env.SESSION_SECRET = "s3cret";
    process.env.AXIOMIC_SIGNING_PRIVATE_KEY_HEX = "deadbeef";
    process.env.RESEND_API_KEY = "re_xxx";
    expect(() => assertProductionSecrets()).not.toThrow();
  });

  // Phase 36 — DEV_AUTH_BYPASS=1 is a total auth bypass; it must
  // be fatal in production, not merely warned, even when every
  // other secret is correctly configured.
  test("production: throws when DEV_AUTH_BYPASS=1 (even with all secrets)", () => {
    process.env.NODE_ENV = "production";
    process.env.SESSION_SECRET = "s3cret";
    process.env.AXIOMIC_SIGNING_PRIVATE_KEY_HEX = "deadbeef";
    process.env.RESEND_API_KEY = "re_xxx";
    process.env.DEV_AUTH_BYPASS = "1";
    expect(() => assertProductionSecrets()).toThrow(/DEV_AUTH_BYPASS/);
  });
});
