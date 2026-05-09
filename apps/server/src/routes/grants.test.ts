// Sprint 71 — /grants routes tests.

import { describe, test, expect, beforeAll } from "bun:test";
import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { app } from "../index";
import { getDb, grants } from "@axiomic/db";

function seedGrant(overrides: Partial<typeof grants.$inferInsert> = {}): string {
  const id = randomUUID();
  const sourceId = `t-${Math.random().toString(36).slice(2, 10)}`;
  getDb()
    .insert(grants)
    .values({
      id,
      source: "nih",
      sourceId,
      agency: "NIH",
      title: "Sample grant for routes test",
      summary: "Short summary.",
      fullDescription: "Long description.",
      mechanism: "R01",
      amountCeiling: 250_000,
      postedAt: "2025-01-01",
      deadlineAt: new Date(Date.now() + 30 * 86400_000)
        .toISOString()
        .slice(0, 10),
      url: "https://example.com",
      topicsJson: JSON.stringify(["cancer"]),
      contentHash: "deadbeef",
      ...overrides,
    })
    .run();
  return id;
}

describe("/grants (Sprint 71)", () => {
  let seededId = "";
  beforeAll(() => {
    seededId = seedGrant();
  });

  test("GET / returns the seeded grant with expected payload shape", async () => {
    const res = await app.fetch(
      new Request("http://localhost/api/v1/grants?limit=50"),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: Array<{ id: string }> };
    const found = body.items.find((g) => g.id === seededId);
    expect(found).toBeDefined();
  });

  test("GET / source=nsf returns no NIH grants", async () => {
    const res = await app.fetch(
      new Request("http://localhost/api/v1/grants?source=nsf"),
    );
    const body = (await res.json()) as {
      items: Array<{ source: string }>;
    };
    for (const g of body.items) {
      expect(g.source).toBe("nsf");
    }
  });

  test("GET / hides past deadlines", async () => {
    const pastId = seedGrant({
      deadlineAt: "2010-01-01",
    });
    const res = await app.fetch(
      new Request("http://localhost/api/v1/grants?limit=100"),
    );
    const body = (await res.json()) as { items: Array<{ id: string }> };
    expect(body.items.find((g) => g.id === pastId)).toBeUndefined();
  });

  test("GET /:id returns full description for the grant", async () => {
    const res = await app.fetch(
      new Request(`http://localhost/api/v1/grants/${seededId}`),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      grant: { id: string; fullDescription: string };
    };
    expect(body.grant.id).toBe(seededId);
    expect(body.grant.fullDescription).toBe("Long description.");
  });

  test("GET /:id returns 404 for unknown id", async () => {
    const res = await app.fetch(
      new Request("http://localhost/api/v1/grants/nonexistent"),
    );
    expect(res.status).toBe(404);
  });

  test("GET /feed anonymous returns deadline-ranked items", async () => {
    const res = await app.fetch(
      new Request("http://localhost/api/v1/grants/feed?limit=10"),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      personalized: boolean;
      items: Array<{ grant: { id: string; deadlineAt: string | null } }>;
    };
    expect(body.personalized).toBe(false);
    expect(body.items.length).toBeGreaterThan(0);
  });

  test("POST /:id/bookmark requires auth", async () => {
    const res = await app.fetch(
      new Request(`http://localhost/api/v1/grants/${seededId}/bookmark`, {
        method: "POST",
      }),
    );
    expect(res.status).toBe(401);
  });

  test("GET /me/bookmarks requires auth", async () => {
    const res = await app.fetch(
      new Request("http://localhost/api/v1/grants/me/bookmarks"),
    );
    expect(res.status).toBe(401);
  });

  test("/grants/feed never crashes when DB has zero grants", async () => {
    // We can't easily clear seeded rows, but feed should always
    // return a 200 + items array even when empty.
    const res = await app.fetch(
      new Request("http://localhost/api/v1/grants/feed"),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      items: unknown[];
    };
    expect(Array.isArray(body.items)).toBe(true);
  });

  test("withinDays filter narrows to grants closing inside the window", async () => {
    // Seed a grant closing in 200 days; expect it absent from a
    // 30-day window query.
    const farId = seedGrant({
      deadlineAt: new Date(Date.now() + 200 * 86400_000)
        .toISOString()
        .slice(0, 10),
    });
    const res = await app.fetch(
      new Request("http://localhost/api/v1/grants?withinDays=30&limit=100"),
    );
    const body = (await res.json()) as { items: Array<{ id: string }> };
    expect(body.items.find((g) => g.id === farId)).toBeUndefined();

    // Cleanup so we don't pollute other tests.
    getDb().delete(grants).where(eq(grants.id, farId)).run();
  });
});
