import { describe, test, expect } from "bun:test";
import { app } from "../index";

async function req(path: string, opts?: RequestInit): Promise<Response> {
  return await app.fetch(new Request(`http://localhost/api/v1${path}`, opts));
}

function cookieHeader(cookie: string): Record<string, string> {
  return { cookie: cookie.split(";")[0] };
}

const testId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

async function signup(
  suffix: string,
  email?: string,
): Promise<{ cookie: string; username: string; email: string }> {
  const username = `inv_${suffix}_${testId}`.slice(0, 30);
  const finalEmail = email ?? `${username}@example.com`;
  const res = await req("/auth/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username,
      email: finalEmail,
      password: "testpass123",
    }),
  });
  const cookie = res.headers.get("set-cookie") || "";
  return { cookie, username, email: finalEmail };
}

async function createInviteOnlyCohort(
  cookie: string,
  slug: string,
): Promise<void> {
  const res = await req("/cohorts", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...cookieHeader(cookie) },
    body: JSON.stringify({
      slug,
      name: `Cohort ${slug}`,
      description: "Test cohort",
      visibility: "invite",
    }),
  });
  expect(res.status).toBe(201);
}

describe("cohort invitations (Sprint 52)", () => {
  test("non-organizer cannot invite", async () => {
    const owner = await signup("o1");
    const stranger = await signup("o2");
    const cohortSlug = `inv-c1-${testId}`;
    await createInviteOnlyCohort(owner.cookie, cohortSlug);

    const res = await req(`/cohorts/${cohortSlug}/invitations`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...cookieHeader(stranger.cookie),
      },
      body: JSON.stringify({ emails: ["x@example.com"] }),
    });
    expect(res.status).toBe(403);
  });

  test("organizer creates invite + invitee accepts", async () => {
    const owner = await signup("o3");
    const cohortSlug = `inv-c2-${testId}`;
    await createInviteOnlyCohort(owner.cookie, cohortSlug);

    // Create the invitee account first so the "matching email" check works.
    const inviteeEmail = `invitee_${testId}@example.com`;
    const invitee = await signup("o4", inviteeEmail);

    const sendRes = await req(`/cohorts/${cohortSlug}/invitations`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...cookieHeader(owner.cookie),
      },
      body: JSON.stringify({
        emails: [inviteeEmail],
        message: "Come join us",
      }),
    });
    expect(sendRes.status).toBe(200);
    const sendData = (await sendRes.json()) as {
      created: Array<{ email: string; token: string }>;
      skipped: unknown[];
    };
    expect(sendData.created.length).toBe(1);
    const token = sendData.created[0].token;

    // Public peek by token works.
    const peek = await req(`/cohort-invitations/${token}`);
    expect(peek.status).toBe(200);
    const peekData = (await peek.json()) as {
      invitation: { status: string };
      cohort: { slug: string };
    };
    expect(peekData.invitation.status).toBe("pending");
    expect(peekData.cohort.slug).toBe(cohortSlug);

    // Accept as the invitee.
    const acc = await req(`/cohort-invitations/${token}/accept`, {
      method: "POST",
      headers: cookieHeader(invitee.cookie),
    });
    expect(acc.status).toBe(200);
    const accData = (await acc.json()) as { ok: boolean; cohortSlug: string };
    expect(accData.ok).toBe(true);
    expect(accData.cohortSlug).toBe(cohortSlug);

    // Status flipped to accepted.
    const peek2 = await req(`/cohort-invitations/${token}`);
    const peek2Data = (await peek2.json()) as { invitation: { status: string } };
    expect(peek2Data.invitation.status).toBe("accepted");

    // Re-accept errors.
    const acc2 = await req(`/cohort-invitations/${token}/accept`, {
      method: "POST",
      headers: cookieHeader(invitee.cookie),
    });
    expect(acc2.status).toBe(409);
  });

  test("accept rejects when email doesn't match", async () => {
    const owner = await signup("o5");
    const cohortSlug = `inv-c3-${testId}`;
    await createInviteOnlyCohort(owner.cookie, cohortSlug);

    const otherUser = await signup("o6");
    const sendRes = await req(`/cohorts/${cohortSlug}/invitations`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...cookieHeader(owner.cookie),
      },
      body: JSON.stringify({
        emails: [`stranger_${testId}@example.com`],
      }),
    });
    expect(sendRes.status).toBe(200);
    const sendData = (await sendRes.json()) as {
      created: Array<{ token: string }>;
    };
    const token = sendData.created[0].token;

    const acc = await req(`/cohort-invitations/${token}/accept`, {
      method: "POST",
      headers: cookieHeader(otherUser.cookie),
    });
    expect(acc.status).toBe(403);
  });

  test("revoke flips status and prevents accept", async () => {
    const owner = await signup("o7");
    const cohortSlug = `inv-c4-${testId}`;
    await createInviteOnlyCohort(owner.cookie, cohortSlug);

    const invitee = await signup("o8");
    const sendRes = await req(`/cohorts/${cohortSlug}/invitations`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...cookieHeader(owner.cookie),
      },
      body: JSON.stringify({ emails: [invitee.email] }),
    });
    const send = (await sendRes.json()) as {
      created: Array<{ token: string }>;
    };
    const token = send.created[0].token;

    const list = await req(`/cohorts/${cohortSlug}/invitations`, {
      headers: cookieHeader(owner.cookie),
    });
    expect(list.status).toBe(200);
    const listData = (await list.json()) as {
      invitations: Array<{ id: string; status: string }>;
    };
    const inviteRow = listData.invitations[0];

    const revoke = await req(
      `/cohorts/${cohortSlug}/invitations/${inviteRow.id}/revoke`,
      {
        method: "POST",
        headers: cookieHeader(owner.cookie),
      },
    );
    expect(revoke.status).toBe(200);

    const acc = await req(`/cohort-invitations/${token}/accept`, {
      method: "POST",
      headers: cookieHeader(invitee.cookie),
    });
    expect(acc.status).toBe(409);
  });
});
