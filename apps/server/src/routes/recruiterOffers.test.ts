// Phase 34E — consented recruiter↔candidate match handshake.
//
// Recruiter sends a signed, skill-gap-snapshotted offer; the
// candidate verifies it through /keys/verify, accepts (auto-
// minting a working scoped share link), or declines. Dup 409,
// non-candidate respond 404, withdraw.

import { describe, test, expect } from "bun:test";
import { app } from "../index";

async function req(path: string, opts?: RequestInit): Promise<Response> {
  return await app.fetch(new Request(`http://localhost/api/v1${path}`, opts));
}
function cookieHeader(cookie: string): Record<string, string> {
  return { cookie: cookie.split(";")[0] };
}
const testRun = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

async function signup(suffix: string) {
  const username = `ro_${suffix}_${testRun}`.slice(0, 30);
  const res = await req("/auth/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username,
      email: `${username}@example.com`,
      password: "testpass123",
    }),
  });
  const data = (await res.json()) as { user: { id: string } };
  return {
    cookie: res.headers.get("set-cookie") || "",
    userId: data.user.id,
    username,
  };
}

describe("recruiter match offers (Phase 34A)", () => {
  test("offer → verifiable → accept mints share link; dup/withdraw/guard", async () => {
    const recruiter = await signup("rec");
    const cand = await signup("can");
    const cand2 = await signup("ca2");

    const o = await req("/recruiter/offers", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...cookieHeader(recruiter.cookie),
      },
      body: JSON.stringify({
        candidateUsername: cand.username,
        roleSlug: "ml-engineer",
        messageMd: "Strong fit.",
      }),
    });
    expect(o.status).toBe(201);

    // Duplicate (recruiter, candidate, role) → 409.
    const dup = await req("/recruiter/offers", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...cookieHeader(recruiter.cookie),
      },
      body: JSON.stringify({
        candidateUsername: cand.username,
        roleSlug: "ml-engineer",
      }),
    });
    expect(dup.status).toBe(409);

    // Candidate sees it + the signed offer verifies.
    const inbox = (await (
      await req("/me/offers", { headers: cookieHeader(cand.cookie) })
    ).json()) as {
      offers: Array<{
        id: string;
        status: string;
        signedOffer: {
          manifest: Record<string, unknown>;
          signature: string;
          publicKey: string;
        } | null;
      }>;
    };
    expect(inbox.offers.length).toBe(1);
    const offer = inbox.offers[0];
    expect(offer.status).toBe("pending");
    const vr = await req("/keys/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        manifest: offer.signedOffer!.manifest,
        signature: offer.signedOffer!.signature,
        publicKey: offer.signedOffer!.publicKey,
      }),
    });
    expect(((await vr.json()) as { valid: boolean }).valid).toBe(true);

    // Non-candidate can't respond.
    const denied = await req(`/me/offers/${offer.id}/respond`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...cookieHeader(recruiter.cookie),
      },
      body: JSON.stringify({ accept: true }),
    });
    expect(denied.status).toBe(404);

    // Accept → scoped share link minted + usable.
    const acc = await req(`/me/offers/${offer.id}/respond`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...cookieHeader(cand.cookie),
      },
      body: JSON.stringify({ accept: true }),
    });
    const ab = (await acc.json()) as { status: string; shareUrl?: string };
    expect(ab.status).toBe("accepted");
    expect(ab.shareUrl).toBeTruthy();
    const token = ab.shareUrl!.split("/share/")[1];
    const shared = await req(`/public/share/${token}`);
    expect(shared.status).toBe(200);

    // Recruiter sees the accepted offer + share url.
    const sent = (await (
      await req("/recruiter/offers", {
        headers: cookieHeader(recruiter.cookie),
      })
    ).json()) as { offers: Array<{ status: string; shareUrl: string | null }> };
    expect(sent.offers[0].status).toBe("accepted");
    expect(sent.offers[0].shareUrl).toBeTruthy();

    // Decline path (different candidate).
    await req("/recruiter/offers", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...cookieHeader(recruiter.cookie),
      },
      body: JSON.stringify({
        candidateUsername: cand2.username,
        roleSlug: "ml-engineer",
      }),
    });
    const inbox2 = (await (
      await req("/me/offers", { headers: cookieHeader(cand2.cookie) })
    ).json()) as { offers: Array<{ id: string }> };
    const dec = await req(`/me/offers/${inbox2.offers[0].id}/respond`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...cookieHeader(cand2.cookie),
      },
      body: JSON.stringify({ accept: false }),
    });
    expect(((await dec.json()) as { status: string }).status).toBe(
      "declined",
    );

    // Withdraw a fresh pending offer (different role to dodge uq).
    await req("/recruiter/offers", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...cookieHeader(recruiter.cookie),
      },
      body: JSON.stringify({
        candidateUsername: cand.username,
        roleSlug: "data-analyst",
      }),
    });
    const sent2 = (await (
      await req("/recruiter/offers", {
        headers: cookieHeader(recruiter.cookie),
      })
    ).json()) as { offers: Array<{ id: string; status: string }> };
    const pendingOffer = sent2.offers.find((x) => x.status === "pending")!;
    const wd = await req(
      `/recruiter/offers/${pendingOffer.id}/withdraw`,
      { method: "POST", headers: cookieHeader(recruiter.cookie) },
    );
    expect(wd.status).toBe(200);
  });
});
