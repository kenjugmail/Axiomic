// S108 — Cloudflare Turnstile server-side verification.
//
// Turnstile is Cloudflare's free captcha. The client embeds a widget
// from @marsidev/react-turnstile which produces a token; the server
// posts that token to siteverify with the secret key to confirm.
//
// When TURNSTILE_SECRET_KEY is unset (dev / CI / self-hosted with
// captcha disabled), this module short-circuits to success so the
// signup route doesn't break. Production deploys that want the
// captcha enabled set the secret; production deploys that don't want
// it leave the secret unset and the captcha is silently bypassed.

import { env } from "./envConfig";

const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export interface TurnstileVerifyResult {
  ok: boolean;
  reason?: string;
}

export async function verifyTurnstile(
  token: string | undefined,
  remoteIp?: string,
): Promise<TurnstileVerifyResult> {
  const secret = env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    // Captcha not configured for this deploy — bypass.
    return { ok: true, reason: "turnstile_not_configured" };
  }
  if (!token) {
    return { ok: false, reason: "missing_token" };
  }
  try {
    const body = new URLSearchParams();
    body.set("secret", secret);
    body.set("response", token);
    if (remoteIp) body.set("remoteip", remoteIp);
    const res = await fetch(VERIFY_URL, {
      method: "POST",
      body,
    });
    if (!res.ok) {
      return { ok: false, reason: `siteverify_http_${res.status}` };
    }
    const data = (await res.json()) as { success: boolean; "error-codes"?: string[] };
    if (!data.success) {
      return { ok: false, reason: (data["error-codes"] ?? ["unknown"]).join(",") };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "verify_threw" };
  }
}
