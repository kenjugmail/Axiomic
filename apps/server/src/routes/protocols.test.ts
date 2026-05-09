import { describe, test, expect } from "bun:test";
import { app } from "../index";

async function req(path: string, opts?: RequestInit): Promise<Response> {
  return await app.fetch(new Request(`http://localhost/api/v1${path}`, opts));
}

function cookieHeader(cookie: string): Record<string, string> {
  return { cookie: cookie.split(";")[0] };
}

const testId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

async function signup(suffix: string): Promise<{ cookie: string; username: string }> {
  const username = `lp_${suffix}_${testId}`;
  const res = await req("/auth/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username,
      email: `${username}@example.com`,
      password: "testpass123",
    }),
  });
  const cookie = res.headers.get("set-cookie") || "";
  return { cookie, username };
}

interface CreateOpts {
  status?: "draft" | "published";
  steps?: Array<{ title: string; instructionMd: string }>;
  discipline?: string;
}

async function createProtocol(
  cookie: string,
  slug: string,
  opts: CreateOpts = {},
): Promise<Response> {
  return await req("/lab/protocols", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...cookieHeader(cookie) },
    body: JSON.stringify({
      slug,
      title: `Protocol ${slug}`,
      discipline: opts.discipline ?? "biology",
      summary: "Test protocol",
      contentUndergrad: "## Body\n\nDo science.",
      hazardsMd: "Wear gloves.",
      steps: opts.steps ?? [
        { title: "Setup", instructionMd: "Set up the bench." },
        { title: "Execute", instructionMd: "Run the procedure." },
      ],
      status: opts.status ?? "draft",
    }),
  });
}

describe("lab protocols — CRUD + auth + steps (Sprint 79)", () => {
  test("requires auth to create", async () => {
    const res = await req("/lab/protocols", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        slug: `lp-anon-${testId}`,
        title: "Anon",
        discipline: "biology",
      }),
    });
    expect(res.status).toBe(401);
  });

  test("rejects publish with no steps", async () => {
    const { cookie } = await signup("nosteps");
    const res = await req("/lab/protocols", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(cookie) },
      body: JSON.stringify({
        slug: `lp-nosteps-${testId}`,
        title: "Empty",
        discipline: "biology",
        status: "published",
      }),
    });
    expect(res.status).toBe(400);
  });

  test("rejects invalid discipline", async () => {
    const { cookie } = await signup("baddisc");
    const res = await req("/lab/protocols", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(cookie) },
      body: JSON.stringify({
        slug: `lp-baddisc-${testId}`,
        title: "Bad",
        discipline: "alchemy",
      }),
    });
    expect(res.status).toBe(400);
  });

  test("rejects bad slug format", async () => {
    const { cookie } = await signup("badslug");
    const res = await req("/lab/protocols", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(cookie) },
      body: JSON.stringify({
        slug: "Has Spaces",
        title: "Bad",
        discipline: "biology",
      }),
    });
    expect(res.status).toBe(400);
  });

  test("create draft → fetch shows draft to author → list omits it", async () => {
    const { cookie } = await signup("crud");
    const slug = `lp-crud-${testId}`;
    const create = await createProtocol(cookie, slug, { status: "draft" });
    expect(create.status).toBe(201);

    // Author sees the draft.
    const draftFetch = await req(`/lab/protocols/${slug}`, {
      headers: cookieHeader(cookie),
    });
    expect(draftFetch.status).toBe(200);
    const draftBody = (await draftFetch.json()) as { protocol: any; steps: any[] };
    expect(draftBody.protocol.status).toBe("draft");
    expect(draftBody.steps.length).toBe(2);
    expect(draftBody.steps[0].ordinal).toBe(1);

    // Anonymous sees 404.
    const anonFetch = await req(`/lab/protocols/${slug}`);
    expect(anonFetch.status).toBe(404);

    // Public list omits drafts.
    const list = await req("/lab/protocols");
    expect(list.status).toBe(200);
    const lb = (await list.json()) as { protocols: any[] };
    expect(lb.protocols.some((p) => p.slug === slug)).toBe(false);
  });

  test("publish flow: draft → publish → list shows it → version snapshot exists", async () => {
    const { cookie } = await signup("pub");
    const slug = `lp-pub-${testId}`;
    expect((await createProtocol(cookie, slug)).status).toBe(201);

    const pub = await req(`/lab/protocols/${slug}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...cookieHeader(cookie) },
      body: JSON.stringify({ status: "published" }),
    });
    expect(pub.status).toBe(200);

    const list = await req("/lab/protocols");
    const lb = (await list.json()) as { protocols: any[] };
    expect(lb.protocols.some((p) => p.slug === slug)).toBe(true);

    const versions = await req(`/lab/protocols/${slug}/versions`);
    expect(versions.status).toBe(200);
    const vb = (await versions.json()) as { versions: any[] };
    expect(vb.versions.length).toBe(1);
    expect(vb.versions[0].version).toBe(1);
    expect(vb.versions[0].editMessage).toBe("Initial publication");
  });

  test("re-publish bumps version + appends snapshot", async () => {
    const { cookie } = await signup("rep");
    const slug = `lp-rep-${testId}`;
    await createProtocol(cookie, slug, { status: "published" });

    const update = await req(`/lab/protocols/${slug}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...cookieHeader(cookie) },
      body: JSON.stringify({ summary: "Updated", status: "published" }),
    });
    expect(update.status).toBe(200);

    const versions = await req(`/lab/protocols/${slug}/versions`);
    const vb = (await versions.json()) as { versions: any[] };
    expect(vb.versions.length).toBe(2);
    expect(vb.versions.map((v) => v.version)).toEqual([1, 2]);
  });

  test("update is author-only (403 for stranger)", async () => {
    const author = await signup("auth_owner");
    const stranger = await signup("auth_stranger");
    const slug = `lp-auth-${testId}`;
    await createProtocol(author.cookie, slug);
    const res = await req(`/lab/protocols/${slug}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        ...cookieHeader(stranger.cookie),
      },
      body: JSON.stringify({ title: "Stolen" }),
    });
    expect(res.status).toBe(403);
  });

  test("slug collision returns 409", async () => {
    const { cookie } = await signup("col");
    const slug = `lp-col-${testId}`;
    expect((await createProtocol(cookie, slug)).status).toBe(201);
    expect((await createProtocol(cookie, slug)).status).toBe(409);
  });

  test("drafts list returns only the caller's drafts", async () => {
    const a = await signup("dl_a");
    const b = await signup("dl_b");
    await createProtocol(a.cookie, `lp-dla-${testId}`);
    await createProtocol(b.cookie, `lp-dlb-${testId}`);
    const aDrafts = await req("/lab/protocols/me/drafts", {
      headers: cookieHeader(a.cookie),
    });
    const aBody = (await aDrafts.json()) as { protocols: any[] };
    expect(aBody.protocols.some((p) => p.slug === `lp-dla-${testId}`)).toBe(
      true,
    );
    expect(aBody.protocols.some((p) => p.slug === `lp-dlb-${testId}`)).toBe(
      false,
    );
  });

  test("step ordinals come back in order after replaceSteps", async () => {
    const { cookie } = await signup("ord");
    const slug = `lp-ord-${testId}`;
    await createProtocol(cookie, slug);
    const replace = await req(`/lab/protocols/${slug}/steps`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...cookieHeader(cookie) },
      body: JSON.stringify({
        steps: [
          { title: "C", instructionMd: "third" },
          { title: "A", instructionMd: "first" },
          { title: "B", instructionMd: "second" },
        ],
      }),
    });
    expect(replace.status).toBe(200);
    const get = await req(`/lab/protocols/${slug}`, {
      headers: cookieHeader(cookie),
    });
    const body = (await get.json()) as { steps: any[] };
    expect(body.steps.map((s) => s.ordinal)).toEqual([1, 2, 3]);
    expect(body.steps.map((s) => s.title)).toEqual(["C", "A", "B"]);
  });

  test("replaceSteps on a published protocol creates a new version snapshot", async () => {
    const { cookie } = await signup("rsv");
    const slug = `lp-rsv-${testId}`;
    await createProtocol(cookie, slug, { status: "published" });
    await req(`/lab/protocols/${slug}/steps`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...cookieHeader(cookie) },
      body: JSON.stringify({
        steps: [{ title: "Solo", instructionMd: "Alone" }],
        editMessage: "Simplified procedure",
      }),
    });
    const versions = await req(`/lab/protocols/${slug}/versions`);
    const vb = (await versions.json()) as { versions: any[] };
    expect(vb.versions.length).toBe(2);
    expect(vb.versions[1].editMessage).toBe("Simplified procedure");
  });

  test("by-author returns published protocols only", async () => {
    const { cookie, username } = await signup("ba");
    await createProtocol(cookie, `lp-ba-pub-${testId}`, { status: "published" });
    await createProtocol(cookie, `lp-ba-draft-${testId}`, { status: "draft" });
    const res = await req(
      `/lab/protocols/by-author/${encodeURIComponent(username)}`,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { protocols: any[] };
    expect(
      body.protocols.some((p) => p.slug === `lp-ba-pub-${testId}`),
    ).toBe(true);
    expect(
      body.protocols.some((p) => p.slug === `lp-ba-draft-${testId}`),
    ).toBe(false);
  });

  test("list filters by discipline query param", async () => {
    const { cookie } = await signup("disc");
    await createProtocol(cookie, `lp-disc-bio-${testId}`, {
      discipline: "biology",
      status: "published",
    });
    await createProtocol(cookie, `lp-disc-mech-${testId}`, {
      discipline: "mechanical",
      status: "published",
    });
    const res = await req("/lab/protocols?discipline=mechanical");
    const body = (await res.json()) as { protocols: any[] };
    const mySlugs = body.protocols
      .filter((p) =>
        [`lp-disc-bio-${testId}`, `lp-disc-mech-${testId}`].includes(p.slug),
      )
      .map((p) => p.slug);
    expect(mySlugs).toEqual([`lp-disc-mech-${testId}`]);
  });

  test("publishing requires the protocol to have steps", async () => {
    const { cookie } = await signup("nostepedit");
    const slug = `lp-nostep-edit-${testId}`;
    // Create with steps then strip them out before publish.
    await createProtocol(cookie, slug);
    await req(`/lab/protocols/${slug}/steps`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...cookieHeader(cookie) },
      body: JSON.stringify({ steps: [] }),
    });
    const pub = await req(`/lab/protocols/${slug}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...cookieHeader(cookie) },
      body: JSON.stringify({ status: "published" }),
    });
    expect(pub.status).toBe(400);
  });
});

describe("lab equipment — CRUD + auth (Sprint 79)", () => {
  test("requires auth to create", async () => {
    const res = await req("/lab/equipment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        slug: `eq-anon-${testId}`,
        title: "Anon",
        discipline: "biology",
      }),
    });
    expect(res.status).toBe(401);
  });

  test("create + fetch + list", async () => {
    const { cookie } = await signup("eq_crud");
    const slug = `eq-crud-${testId}`;
    const create = await req("/lab/equipment", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(cookie) },
      body: JSON.stringify({
        slug,
        title: "Eppendorf 5424R",
        discipline: "biology",
        manufacturer: "Eppendorf",
        model: "5424R",
        manualMd: "Open lid. Load tubes. Run.",
        locationHint: "Bench 3",
        bookingPolicy: "open",
        operations: [
          {
            title: "Daily check",
            bodyMd: "Inspect rotor for cracks.",
            kind: "daily-check",
          },
          {
            title: "Bearing whine",
            bodyMd: "Stop and contact lab manager.",
            kind: "common-fault",
          },
        ],
      }),
    });
    expect(create.status).toBe(201);

    const fetch = await req(`/lab/equipment/${slug}`);
    expect(fetch.status).toBe(200);
    const body = (await fetch.json()) as {
      equipment: any;
      operations: any[];
    };
    expect(body.equipment.title).toContain("Eppendorf");
    expect(body.equipment.manufacturer).toBe("Eppendorf");
    expect(body.operations.length).toBe(2);
    expect(body.operations[0].ordinal).toBe(1);
    expect(body.operations[0].kind).toBe("daily-check");

    const list = await req("/lab/equipment");
    const lb = (await list.json()) as { equipment: any[] };
    expect(lb.equipment.some((e) => e.slug === slug)).toBe(true);
  });

  test("update is author-only (403 for stranger)", async () => {
    const author = await signup("eq_owner");
    const stranger = await signup("eq_stranger");
    const slug = `eq-auth-${testId}`;
    await req("/lab/equipment", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...cookieHeader(author.cookie),
      },
      body: JSON.stringify({
        slug,
        title: "Centrifuge",
        discipline: "biology",
      }),
    });
    const res = await req(`/lab/equipment/${slug}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        ...cookieHeader(stranger.cookie),
      },
      body: JSON.stringify({ title: "Stolen" }),
    });
    expect(res.status).toBe(403);
  });

  test("slug collision returns 409", async () => {
    const { cookie } = await signup("eq_col");
    const slug = `eq-col-${testId}`;
    const make = () =>
      req("/lab/equipment", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...cookieHeader(cookie),
        },
        body: JSON.stringify({
          slug,
          title: "Centrifuge",
          discipline: "biology",
        }),
      });
    expect((await make()).status).toBe(201);
    expect((await make()).status).toBe(409);
  });

  test("replaceOperations replaces the full list with new ordinals", async () => {
    const { cookie } = await signup("eq_ops");
    const slug = `eq-ops-${testId}`;
    await req("/lab/equipment", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(cookie) },
      body: JSON.stringify({
        slug,
        title: "Plate reader",
        discipline: "biology",
      }),
    });
    const replace = await req(`/lab/equipment/${slug}/operations`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...cookieHeader(cookie) },
      body: JSON.stringify({
        operations: [
          { title: "OD600", bodyMd: "Run script.", kind: "daily-check" },
          { title: "Lamp warmup", bodyMd: "Wait 5min.", kind: "calibration" },
        ],
      }),
    });
    expect(replace.status).toBe(200);

    const fetch = await req(`/lab/equipment/${slug}`);
    const body = (await fetch.json()) as { operations: any[] };
    expect(body.operations.map((o) => o.ordinal)).toEqual([1, 2]);
    expect(body.operations.map((o) => o.kind)).toEqual([
      "daily-check",
      "calibration",
    ]);
  });

  test("retired equipment is hidden from public detail + list", async () => {
    const { cookie } = await signup("eq_ret");
    const slug = `eq-ret-${testId}`;
    await req("/lab/equipment", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cookieHeader(cookie) },
      body: JSON.stringify({
        slug,
        title: "Old scope",
        discipline: "biology",
      }),
    });
    await req(`/lab/equipment/${slug}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...cookieHeader(cookie) },
      body: JSON.stringify({ status: "retired" }),
    });
    // Anonymous sees 404.
    const anon = await req(`/lab/equipment/${slug}`);
    expect(anon.status).toBe(404);
    // Author still sees it.
    const owner = await req(`/lab/equipment/${slug}`, {
      headers: cookieHeader(cookie),
    });
    expect(owner.status).toBe(200);
    // Public list omits.
    const list = await req("/lab/equipment");
    const lb = (await list.json()) as { equipment: any[] };
    expect(lb.equipment.some((e) => e.slug === slug)).toBe(false);
  });
});
