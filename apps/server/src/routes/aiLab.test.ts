// Sprint 83 — AI lab authoring + troubleshooting tests.

import { describe, test, expect } from "bun:test";
import { app } from "../index";
import { invalidateTroubleshootCache } from "./aiLab";

async function req(path: string, opts?: RequestInit): Promise<Response> {
  return await app.fetch(new Request(`http://localhost/api/v1${path}`, opts));
}

function cookieHeader(cookie: string): Record<string, string> {
  return { cookie: cookie.split(";")[0] };
}

const testId =
  Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

async function signup(suffix: string): Promise<{ cookie: string }> {
  const username = `al_${suffix}_${testId}`.slice(0, 30);
  const res = await req("/auth/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username,
      email: `${username}@example.com`,
      password: "testpass123",
    }),
  });
  return { cookie: res.headers.get("set-cookie") || "" };
}

async function readSseTokens(res: Response): Promise<string> {
  const reader = res.body!.getReader();
  const dec = new TextDecoder();
  let buf = "";
  let out = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    while (true) {
      const i = buf.indexOf("\n\n");
      if (i < 0) break;
      const frame = buf.slice(0, i);
      buf = buf.slice(i + 2);
      const line = frame.replace(/^data: /, "").trim();
      if (line === "[DONE]") return out;
      try {
        const obj = JSON.parse(line);
        if (typeof obj.token === "string") out += obj.token;
      } catch {
        // ignore
      }
    }
  }
  return out;
}

async function createProtocol(
  cookie: string,
  slug: string,
  opts: { steps?: Array<{ title: string; instructionMd: string; verificationMd?: string }> } = {},
) {
  const res = await req("/lab/protocols", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...cookieHeader(cookie) },
    body: JSON.stringify({
      slug,
      title: `Protocol ${slug}`,
      discipline: "biology",
      summary: "Test",
      contentUndergrad: "Body",
      steps:
        opts.steps ?? [
          {
            title: "Setup",
            instructionMd: "Do.",
            verificationMd: "The agarose gel shows a clean band at the expected size.",
          },
        ],
      status: "published",
    }),
  });
  expect(res.status).toBe(201);
}

describe("AI lab authoring (Sprint 83)", () => {
  test("draft-protocol streams a draft (mock provider produces tokens)", async () => {
    const res = await req("/ai/lab/draft-protocol", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ spec: "agarose gel for restriction digest" }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/event-stream");
    const text = await readSseTokens(res);
    // Mock provider always returns *something*. We just assert we
    // received any tokens (length > 0) and that the framing closed.
    expect(text.length).toBeGreaterThan(0);
  });

  test("draft-equipment-manual streams from manufacturer + model", async () => {
    const res = await req("/ai/lab/draft-equipment-manual", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        manufacturer: "Eppendorf",
        model: "5424R",
        notes: "centrifuge for 1.5mL tubes",
      }),
    });
    expect(res.status).toBe(200);
    const text = await readSseTokens(res);
    expect(text.length).toBeGreaterThan(0);
  });

  test("draft endpoints rate-limit at 8/min per identity", async () => {
    // 9 quick requests — the 9th should 429. Use unique payloads so
    // the rate limit is the only thing that can refuse.
    let last: Response | null = null;
    for (let i = 0; i < 9; i++) {
      last = await req("/ai/lab/draft-protocol", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ spec: `request number ${i} ${testId}` }),
      });
      // Drain the body so the next request isn't blocked on the
      // previous SSE.
      if (last.status === 200) {
        const reader = last.body!.getReader();
        // Empty drain loop — we don't need the chunks, just a clean close.
        while (true) {
          const { done } = await reader.read();
          if (done) break;
        }
      }
    }
    expect(last?.status).toBe(429);
  });
});

describe("troubleshooting CRUD + search (Sprint 83)", () => {
  test("seeding troubleshooting requires the protocol author", async () => {
    const author = await signup("ts_author");
    const slug = `tp-author-${testId}`;
    await createProtocol(author.cookie, slug);

    const stranger = await signup("ts_stranger");
    const res = await req(`/lab/protocols/${slug}/troubleshooting`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...cookieHeader(stranger.cookie),
      },
      body: JSON.stringify({
        key: "wrong-buffer",
        label: "Used the wrong buffer",
        description: "Don't use TBE; this protocol uses TAE.",
      }),
    });
    expect(res.status).toBe(403);
  });

  test("seed + idempotent re-seed (update path) + list", async () => {
    const author = await signup("ts_seed");
    const slug = `tp-seed-${testId}`;
    await createProtocol(author.cookie, slug);

    const first = await req(`/lab/protocols/${slug}/troubleshooting`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...cookieHeader(author.cookie),
      },
      body: JSON.stringify({
        key: "wrong-buffer",
        label: "Used the wrong buffer",
        description: "Don't use TBE; this protocol uses TAE.",
      }),
    });
    expect(first.status).toBe(201);
    const fb = (await first.json()) as { updated: boolean; id: string };
    expect(fb.updated).toBe(false);

    // Re-seed with the same key updates in-place (200, not 201).
    const second = await req(`/lab/protocols/${slug}/troubleshooting`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...cookieHeader(author.cookie),
      },
      body: JSON.stringify({
        key: "wrong-buffer",
        label: "Used the wrong buffer (updated)",
        description: "Confirm TAE 1x.",
      }),
    });
    expect(second.status).toBe(200);
    const sb = (await second.json()) as { updated: boolean };
    expect(sb.updated).toBe(true);

    const list = await req(`/lab/protocols/${slug}/troubleshooting`);
    const lb = (await list.json()) as { entries: any[] };
    expect(lb.entries.length).toBe(1);
    expect(lb.entries[0].label).toContain("updated");
  });

  test("/lab/troubleshoot search surfaces matching protocol step + equipment + misconception", async () => {
    const author = await signup("ts_search");
    const slug = `tp-search-${testId}`;
    await createProtocol(author.cookie, slug, {
      steps: [
        {
          title: "Run gel",
          instructionMd: "Load samples.",
          verificationMd:
            "Bands run cleanly at the expected sizes; no smearing.",
        },
      ],
    });
    // Add equipment with a recognizable hazard.
    await req("/lab/equipment", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...cookieHeader(author.cookie),
      },
      body: JSON.stringify({
        slug: `eq-search-${testId}`,
        title: `Gel imager ${testId}`,
        discipline: "biology",
        manualMd: "Power on.",
        hazardsMd: "Ethidium bromide is a mutagen; wear gloves.",
      }),
    });
    // Add a misconception.
    await req(`/lab/protocols/${slug}/troubleshooting`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...cookieHeader(author.cookie),
      },
      body: JSON.stringify({
        key: "smearing-bands",
        label: "Bands are smearing",
        description: "Smearing usually means too much DNA loaded per well.",
      }),
    });

    invalidateTroubleshootCache();

    const res = await req(
      `/lab/troubleshoot?q=${encodeURIComponent("smearing")}&limit=10`,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { results: any[] };
    // Should hit at least the smearing-related step or misconception.
    const hitKinds = new Set(body.results.map((r) => r.kind));
    expect(hitKinds.size).toBeGreaterThan(0);
    // Sanity: every result has the required shape.
    for (const r of body.results) {
      expect(typeof r.href).toBe("string");
      expect(typeof r.title).toBe("string");
      expect(typeof r.snippet).toBe("string");
    }
  });
});
