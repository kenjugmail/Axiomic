// Phase 32E — credential freshness band.
//
// Pure-unit thresholds + the additive /keys/verify fields (a
// freshly-signed composite score is `fresh`, ageDays 0). The
// signed manifest bytes are NOT changed by freshness — only the
// response envelope gains derived fields.

import { describe, test, expect } from "bun:test";
import { app } from "../index";
import {
  ageDays,
  freshnessBand,
  FRESH_MAX_DAYS,
  AGING_MAX_DAYS,
} from "./freshness";

function daysAgo(n: number): string {
  return new Date(Date.now() - n * 86_400_000).toISOString();
}

describe("freshness band (Phase 32B)", () => {
  test("thresholds + null handling", () => {
    expect(ageDays(null)).toBe(null);
    expect(ageDays("not-a-date")).toBe(null);
    expect(freshnessBand(undefined)).toBe(null);

    expect(ageDays(daysAgo(0))).toBe(0);
    expect(freshnessBand(daysAgo(1))).toBe("fresh");
    expect(freshnessBand(daysAgo(FRESH_MAX_DAYS))).toBe("fresh");
    expect(freshnessBand(daysAgo(FRESH_MAX_DAYS + 1))).toBe("aging");
    expect(freshnessBand(daysAgo(AGING_MAX_DAYS))).toBe("aging");
    expect(freshnessBand(daysAgo(AGING_MAX_DAYS + 1))).toBe("stale");
    expect(freshnessBand(daysAgo(5000))).toBe("stale");
  });

  test("/keys/verify carries additive freshness fields", async () => {
    const tr = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const username = `fr_${tr}`.slice(0, 30);
    const su = await app.fetch(
      new Request("http://localhost/api/v1/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username,
          email: `${username}@example.com`,
          password: "testpass123",
        }),
      }),
    );
    const cookie = (su.headers.get("set-cookie") || "").split(";")[0];

    const cs = (await (
      await app.fetch(
        new Request(
          "http://localhost/api/v1/me/credentials/composite-score",
          { headers: { cookie } },
        ),
      )
    ).json()) as {
      credential: {
        manifest: Record<string, unknown>;
        signature: string;
        publicKey: string;
      };
    };

    const vr = await app.fetch(
      new Request("http://localhost/api/v1/keys/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          manifest: cs.credential.manifest,
          signature: cs.credential.signature,
          publicKey: cs.credential.publicKey,
        }),
      }),
    );
    const vb = (await vr.json()) as {
      valid: boolean;
      revoked: boolean;
      ageDays: number | null;
      freshness: string | null;
    };
    expect(vb.valid).toBe(true);
    expect(vb.revoked).toBe(false);
    // issuedAt is "just now" → fresh, age 0.
    expect(vb.ageDays).toBe(0);
    expect(vb.freshness).toBe("fresh");
  });
});
