// Sprint 19 — smoke test for the seed surface that backs the
// /demo/attention page. The demo page deep-links to:
//   - /wiki/attention                            (concept preview)
//   - /paths/ml-engineer/lessons/attention-intro (full lesson)
//   - /forum?wiki=attention                      (filtered forum)
// If any of these break, the wow-loop demo shows broken links to a
// brand-new visitor on the homepage. This test catches the breakage
// at CI time.

import { describe, test, expect } from "bun:test";
import { app } from "../index";

async function req(path: string, opts?: RequestInit): Promise<Response> {
  return await app.fetch(new Request(`http://localhost/api/v1${path}`, opts));
}

describe("demo attention seed surface (Sprint 19)", () => {
  test("/wiki/attention returns a published page with body content", async () => {
    const res = await req("/wiki/attention");
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.page?.slug).toBe("attention");
    expect(body.page?.title?.toLowerCase()).toContain("attention");
    // The wiki endpoint returns content under `allContent.{intro|undergrad|grad}`
    // plus a tier-resolved `content` string.
    expect(typeof body.allContent?.intro).toBe("string");
    expect(body.allContent.intro.length).toBeGreaterThan(100);
  });

  test("ml-engineer path contains the attention-intro node, lesson loads", async () => {
    const res = await req("/mastery/paths/ml-engineer");
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.path?.slug).toBe("ml-engineer");
    const node = body.nodes.find((n: any) => n.slug === "attention-intro");
    expect(node).toBeDefined();
    expect(node.title.toLowerCase()).toContain("attention");

    const lessonRes = await req(`/mastery/lesson/${node.id}`);
    expect(lessonRes.status).toBe(200);
    const lessonBody = (await lessonRes.json()) as any;
    expect(lessonBody.lesson?.slides?.length).toBeGreaterThan(0);
  });

  test("/concepts/attention/preview surfaces a definition + nodeRef", async () => {
    const res = await req("/concepts/attention/preview");
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.slug).toBe("attention");
    expect(body.oneLineDef.length).toBeGreaterThan(20);
    // The seeded ml-engineer path teaches `attention` via attention-intro.
    expect(body.nodeRef).not.toBeNull();
    expect(body.nodeRef.nodeSlug).toBe("attention-intro");
    expect(body.nodeRef.pathSlug).toBe("ml-engineer");
  });
});
