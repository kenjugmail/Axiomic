// Phase 39 — "Goodness" mission tests.
//
// The chain: create → open-join → add sub-problem → submit a
// contribution w/ artifacts → two trusted reviewers confirm ⇒
// credentialMintedAt set + the signed manifest verifies at
// /keys/verify + a transparency leaf is appended + it appears in
// GET /public/missions/:slug impact; refute past threshold ⇒
// revoked + drops from impact; non-member POST contribution ⇒ 403
// while GET mission ⇒ 200 (open); review-rooms canAccess admits a
// member to mission_working_group, rejects a non-member.

import { describe, test, expect } from "bun:test";
import { app } from "../index";

async function req(path: string, opts?: RequestInit): Promise<Response> {
  return await app.fetch(new Request(`http://localhost/api/v1${path}`, opts));
}

function cookieHeader(cookie: string): Record<string, string> {
  return { cookie: cookie.split(";")[0] };
}

const testRun = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

async function signup(
  suffix: string,
): Promise<{ cookie: string; userId: string; username: string }> {
  const username = `mn_${suffix}_${testRun}`.slice(0, 30);
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
  const cookie = res.headers.get("set-cookie") || "";
  return { cookie, userId: data.user.id, username };
}

function jsonHeaders(cookie: string): Record<string, string> {
  return { "Content-Type": "application/json", ...cookieHeader(cookie) };
}

describe("Goodness missions (Phase 39)", () => {
  test("create → join → contribute → 2 confirms mint a signed credential; refute revokes; open-read but member-gated writes; room access", async () => {
    const { getDb, missionContributions } = await import("@axiomic/db");
    const { eq } = await import("drizzle-orm");

    const creator = await signup("cr");
    const member = await signup("mb");
    const r1 = await signup("r1");
    const r2 = await signup("r2");
    const outsider = await signup("out");

    // Create a mission (creator auto-joins as organizer).
    const created = await req("/missions", {
      method: "POST",
      headers: jsonHeaders(creator.cookie),
      body: JSON.stringify({
        title: `Climate resilience ${testRun}`,
        problemMd: "Reduce smallholder crop loss.",
        theme: "climate",
        topicTags: ["agriculture", "climate"],
      }),
    });
    expect(created.status).toBe(201);
    const { slug } = (await created.json()) as { slug: string };

    // Open read works WITHOUT auth.
    const anon = await req(`/missions/${slug}`);
    expect(anon.status).toBe(200);

    // A non-member can READ the mission (open).
    const read = await req(`/missions/${slug}`, {
      headers: cookieHeader(outsider.cookie),
    });
    expect(read.status).toBe(200);
    const readBody = (await read.json()) as {
      mission: { id: string };
      membership: unknown;
    };
    const missionId = readBody.mission.id;
    expect(readBody.membership).toBeNull();

    // A non-member CANNOT post a contribution (403) — open read,
    // member-gated write.
    const denied = await req(`/missions/${slug}/contributions`, {
      method: "POST",
      headers: jsonHeaders(outsider.cookie),
      body: JSON.stringify({ kind: "analysis", bodyMd: "drive-by" }),
    });
    expect(denied.status).toBe(403);

    // Member open-joins.
    const joined = await req(`/missions/${slug}/join`, {
      method: "POST",
      headers: jsonHeaders(member.cookie),
    });
    expect(joined.status).toBe(201);

    // Member adds a sub-problem.
    const sp = await req(`/missions/${slug}/subproblems`, {
      method: "POST",
      headers: jsonHeaders(member.cookie),
      body: JSON.stringify({
        title: `Cold-chain gaps ${testRun}`,
        descriptionMd: "Map where the cold chain breaks.",
      }),
    });
    expect(sp.status).toBe(201);
    const { id: subproblemId } = (await sp.json()) as { id: string };

    // Member submits a contribution with an artifact link.
    const contrib = await req(`/missions/${slug}/contributions`, {
      method: "POST",
      headers: jsonHeaders(member.cookie),
      body: JSON.stringify({
        subproblemId,
        kind: "data",
        bodyMd: "Dataset of 1,200 sensor readings.",
        artifacts: [
          { kind: "dataset", url: "https://example.com/data.csv", label: "Sensor CSV" },
        ],
      }),
    });
    expect(contrib.status).toBe(201);
    const { id: contributionId } = (await contrib.json()) as { id: string };

    // Author can't self-review.
    const selfRev = await req(
      `/missions/${slug}/contributions/${contributionId}/review`,
      {
        method: "POST",
        headers: jsonHeaders(member.cookie),
        body: JSON.stringify({ verdict: "confirmed" }),
      },
    );
    expect(selfRev.status).toBe(403);

    // Reviewer 1 confirms.
    const rev1 = await req(
      `/missions/${slug}/contributions/${contributionId}/review`,
      {
        method: "POST",
        headers: jsonHeaders(r1.cookie),
        body: JSON.stringify({ verdict: "confirmed", notesMd: "Checks out." }),
      },
    );
    expect(rev1.status).toBe(200);

    // Duplicate review by r1 → 409.
    const dup = await req(
      `/missions/${slug}/contributions/${contributionId}/review`,
      {
        method: "POST",
        headers: jsonHeaders(r1.cookie),
        body: JSON.stringify({ verdict: "confirmed" }),
      },
    );
    expect(dup.status).toBe(409);

    // Not yet minted (only one confirm).
    const mid = getDb()
      .select()
      .from(missionContributions)
      .where(eq(missionContributions.id, contributionId))
      .get();
    expect(mid?.credentialMintedAt).toBeNull();

    // Reviewer 2 confirms → crosses the weight threshold.
    const rev2 = await req(
      `/missions/${slug}/contributions/${contributionId}/review`,
      {
        method: "POST",
        headers: jsonHeaders(r2.cookie),
        body: JSON.stringify({ verdict: "confirmed" }),
      },
    );
    expect(rev2.status).toBe(200);

    const after = getDb()
      .select()
      .from(missionContributions)
      .where(eq(missionContributions.id, contributionId))
      .get();
    expect(after?.credentialMintedAt).toBeTruthy();

    // Surfaces in the contributor's wallet as a signed credential
    // AND the signed manifest verifies at /keys/verify.
    const wallet = (await (
      await req("/me/credentials", { headers: cookieHeader(member.cookie) })
    ).json()) as {
      credentials: Array<{
        kind: string;
        signed: boolean;
        credential: {
          manifest: Record<string, unknown>;
          signature: string;
        } | null;
      }>;
    };
    const cred = wallet.credentials.find(
      (x) => x.kind === "mission_contribution",
    );
    expect(cred).toBeDefined();
    expect(cred?.signed).toBe(true);
    const vr = await req("/keys/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cred!.credential),
    });
    expect(((await vr.json()) as { valid: boolean }).valid).toBe(true);

    // Transparency leaf appended for the minted contribution.
    const inc = (await (
      await req(
        `/public/transparency/inclusion?kind=mission_contribution&ref=${contributionId}`,
      )
    ).json()) as { events: unknown[] };
    expect(inc.events.length).toBeGreaterThanOrEqual(1);

    // Appears in the public impact graph.
    const impact1 = (await (
      await req(`/public/missions/${slug}`)
    ).json()) as {
      verifiedContributions: Array<{ contributionId: string }>;
    };
    expect(
      impact1.verifiedContributions.some(
        (v) => v.contributionId === contributionId,
      ),
    ).toBe(true);

    // review-rooms canAccess: a member can read the working-group
    // room thread; an outsider (non-member) is rejected.
    const memberRoom = await req(
      `/review-rooms/mission_working_group/${missionId}/messages`,
      { headers: cookieHeader(member.cookie) },
    );
    expect(memberRoom.status).toBe(200);
    const outsiderRoom = await req(
      `/review-rooms/mission_working_group/${missionId}/messages`,
      { headers: cookieHeader(outsider.cookie) },
    );
    expect(outsiderRoom.status).toBe(403);

    // Refute past the threshold ⇒ credential revoked + drops from
    // the public impact graph. Two fresh trusted reviewers refute.
    const r3 = await signup("r3");
    const r4 = await signup("r4");
    await req(
      `/missions/${slug}/contributions/${contributionId}/review`,
      {
        method: "POST",
        headers: jsonHeaders(r3.cookie),
        body: JSON.stringify({ verdict: "refuted" }),
      },
    );
    const refute2 = await req(
      `/missions/${slug}/contributions/${contributionId}/review`,
      {
        method: "POST",
        headers: jsonHeaders(r4.cookie),
        body: JSON.stringify({ verdict: "refuted" }),
      },
    );
    expect(refute2.status).toBe(200);

    const impact2 = (await (
      await req(`/public/missions/${slug}`)
    ).json()) as {
      verifiedContributions: Array<{ contributionId: string }>;
    };
    expect(
      impact2.verifiedContributions.some(
        (v) => v.contributionId === contributionId,
      ),
    ).toBe(false);
  });

  test("org-backing + expert attest: non-admin 403, dup 409, non-backer-org attest 403, backing-org verifier attest surfaces in public impact", async () => {
    const { getDb, missionContributions } = await import("@axiomic/db");
    const { eq } = await import("drizzle-orm");

    const creator = await signup("bcr");
    const contributor = await signup("bct");
    const cr1 = await signup("bc1");
    const cr2 = await signup("bc2");
    const orgAdmin = await signup("oad");
    const orgVerifier = await signup("ovf");
    const org2Admin = await signup("o2a");
    const org2Verifier = await signup("o2v");

    // Mission.
    const created = await req("/missions", {
      method: "POST",
      headers: jsonHeaders(creator.cookie),
      body: JSON.stringify({
        title: `Backed mission ${testRun}`,
        problemMd: "A problem an org will back.",
        theme: "health",
        topicTags: ["health"],
      }),
    });
    expect(created.status).toBe(201);
    const { slug } = (await created.json()) as { slug: string };

    // Backing org (its creator = admin) + a verifier member.
    const orgSlug = `g-org1-${testRun}`.slice(0, 40);
    const mkOrg = await req("/orgs", {
      method: "POST",
      headers: jsonHeaders(orgAdmin.cookie),
      body: JSON.stringify({ slug: orgSlug, name: "Backing Lab" }),
    });
    expect(mkOrg.status).toBe(201);
    const addVerifier = await req(`/orgs/${orgSlug}/members`, {
      method: "POST",
      headers: jsonHeaders(orgAdmin.cookie),
      body: JSON.stringify({
        username: orgVerifier.username,
        role: "verifier",
      }),
    });
    expect(addVerifier.status).toBe(201);

    // A non-admin of the org cannot back the mission (gateOrg admin gate).
    const nonAdminBack = await req(`/missions/${slug}/backers`, {
      method: "POST",
      headers: jsonHeaders(contributor.cookie),
      body: JSON.stringify({ orgSlug }),
    });
    expect(nonAdminBack.status).toBe(403);

    // The org admin backs the mission.
    const back = await req(`/missions/${slug}/backers`, {
      method: "POST",
      headers: jsonHeaders(orgAdmin.cookie),
      body: JSON.stringify({ orgSlug }),
    });
    expect(back.status).toBe(201);

    // Backing the same org twice ⇒ 409.
    const dupBack = await req(`/missions/${slug}/backers`, {
      method: "POST",
      headers: jsonHeaders(orgAdmin.cookie),
      body: JSON.stringify({ orgSlug }),
    });
    expect(dupBack.status).toBe(409);

    // Contributor joins + posts; two trusted reviewers confirm ⇒ minted.
    expect(
      (
        await req(`/missions/${slug}/join`, {
          method: "POST",
          headers: jsonHeaders(contributor.cookie),
        })
      ).status,
    ).toBe(201);
    const contrib = await req(`/missions/${slug}/contributions`, {
      method: "POST",
      headers: jsonHeaders(contributor.cookie),
      body: JSON.stringify({
        kind: "analysis",
        bodyMd: "An analysis worth attesting.",
        artifacts: [],
      }),
    });
    expect(contrib.status).toBe(201);
    const { id: contributionId } = (await contrib.json()) as { id: string };
    for (const r of [cr1, cr2]) {
      const rv = await req(
        `/missions/${slug}/contributions/${contributionId}/review`,
        {
          method: "POST",
          headers: jsonHeaders(r.cookie),
          body: JSON.stringify({ verdict: "confirmed" }),
        },
      );
      expect(rv.status).toBe(200);
    }
    const minted = getDb()
      .select()
      .from(missionContributions)
      .where(eq(missionContributions.id, contributionId))
      .get();
    expect(minted?.credentialMintedAt).toBeTruthy();

    // A verifier of a DIFFERENT org (not a backer of this mission)
    // cannot attest ⇒ 403, even though the contribution is
    // peer-verified and they hold the verifier role in their own org.
    // This locks the dual gate (verifier role AND org-backs-mission).
    const org2Slug = `g-org2-${testRun}`.slice(0, 40);
    expect(
      (
        await req("/orgs", {
          method: "POST",
          headers: jsonHeaders(org2Admin.cookie),
          body: JSON.stringify({ slug: org2Slug, name: "Other Lab" }),
        })
      ).status,
    ).toBe(201);
    expect(
      (
        await req(`/orgs/${org2Slug}/members`, {
          method: "POST",
          headers: jsonHeaders(org2Admin.cookie),
          body: JSON.stringify({
            username: org2Verifier.username,
            role: "verifier",
          }),
        })
      ).status,
    ).toBe(201);
    const nonBackerAttest = await req(
      `/missions/${slug}/contributions/${contributionId}/attest`,
      {
        method: "POST",
        headers: jsonHeaders(org2Verifier.cookie),
        body: JSON.stringify({ orgSlug: org2Slug, statement: "" }),
      },
    );
    expect(nonBackerAttest.status).toBe(403);

    // The backing org's verifier attests ⇒ 201, and it surfaces in the
    // public impact graph scoped to this contribution.
    const attest = await req(
      `/missions/${slug}/contributions/${contributionId}/attest`,
      {
        method: "POST",
        headers: jsonHeaders(orgVerifier.cookie),
        body: JSON.stringify({
          orgSlug,
          statement: "Reviewed and endorsed by our lab.",
        }),
      },
    );
    expect(attest.status).toBe(201);

    const impact = (await (
      await req(`/public/missions/${slug}`)
    ).json()) as {
      orgAttestations: Array<{ contributionId: string; orgSlug: string }>;
    };
    expect(
      impact.orgAttestations.some((a) => a.contributionId === contributionId),
    ).toBe(true);
  });
});
