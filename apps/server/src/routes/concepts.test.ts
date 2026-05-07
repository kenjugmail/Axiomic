import { describe, test, expect } from "bun:test";
import { app } from "../index";

async function req(path: string, opts?: RequestInit): Promise<Response> {
  return await app.fetch(new Request(`http://localhost/api/v1${path}`, opts));
}

describe("concept preview endpoint (Sprint 17)", () => {
  test("404 on unknown slug", async () => {
    const res = await req("/concepts/this-slug-definitely-doesnt-exist/preview");
    expect(res.status).toBe(404);
  });

  test("returns title + oneLineDef + threadCount + nodeRef for a seeded concept", async () => {
    // The seed creates a wiki page for `attention`, with at least one
    // mastery node referencing it.
    const res = await req("/concepts/attention/preview");
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.slug).toBe("attention");
    expect(typeof body.title).toBe("string");
    expect(body.title.length).toBeGreaterThan(0);
    expect(typeof body.oneLineDef).toBe("string");
    expect(typeof body.threadCount).toBe("number");
    expect(body.threadCount).toBeGreaterThanOrEqual(0);
    if (body.nodeRef) {
      expect(typeof body.nodeRef.nodeSlug).toBe("string");
      expect(typeof body.nodeRef.pathSlug).toBe("string");
    }
    // masteryStatus is null for anonymous viewers regardless of node ref.
    expect(body.masteryStatus).toBeNull();
  });
});
