// S108 — Transactional email wrapper.
//
// Beta-friendly: when RESEND_API_KEY is unset (which is the case in
// dev, CI, and any self-hosted instance that hasn't signed up for
// Resend), we log the email body to stdout instead of sending. A
// developer can then complete the verify-email flow locally by
// clicking the link printed in the server log. Production deploys
// set RESEND_API_KEY and the actual SDK call is made.
//
// Failures never throw past this module — email is best-effort.
// The caller's flow continues regardless; if Resend is down or
// rate-limited the user can request a resend.

import { env } from "./envConfig";
import { logger } from "./logger";

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export interface SendEmailResult {
  delivered: "resend" | "console" | "skipped";
  reason?: string;
}

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const apiKey = env.RESEND_API_KEY;
  if (!apiKey) {
    logger.info({
      kind: "email.console_fallback",
      msg: `[email] RESEND_API_KEY unset; would have sent "${input.subject}" to ${input.to}`,
      to: input.to,
      subject: input.subject,
      textPreview: input.text.slice(0, 500),
    });
    return { delivered: "console" };
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: env.EMAIL_FROM,
        to: input.to,
        subject: input.subject,
        html: input.html,
        text: input.text,
      }),
    });
    if (!res.ok) {
      const reason = `resend_http_${res.status}`;
      logger.warn({ kind: "email.send_failed", msg: reason, to: input.to, reason });
      return { delivered: "skipped", reason };
    }
    return { delivered: "resend" };
  } catch (e) {
    const reason = e instanceof Error ? e.message : "send_threw";
    logger.warn({ kind: "email.send_failed", msg: reason, to: input.to, reason });
    return { delivered: "skipped", reason };
  }
}
