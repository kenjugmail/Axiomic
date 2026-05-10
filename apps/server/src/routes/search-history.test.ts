// Sprint 70 — Search-history capture + click-through endpoint.

import { describe, test, expect } from "bun:test";
import { desc, eq } from "drizzle-orm";
import { app } from "../index";
import { getDb, searches } from "@axiomic/db";

async function search(q: string): Promise<{ res: Response; body: any; searchId: string | null }> {
  const res = await app.fetch(
    new Request(`http://localhost/api/v1/search?q=${encodeURIComponent(q)}`),
  );
  const body = await res.json();
  const searchId = res.headers.get("X-Search-Id");
  return { res, body, searchId };
}

describe("search history (Sprint 70)", () => {
  test("/search records a row + returns X-Search-Id header", async () => {
    const before = getDb().select({ id: searches.id }).from(searches).all().length;
    const { res, searchId } = await search(`unique-query-${Math.random()}`);
    expect(res.status).toBe(200);
    expect(searchId).not.toBeNull();
    const after = getDb().select({ id: searches.id }).from(searches).all().length;
    expect(after).toBe(before + 1);
  });

  test("/search/click records a click through against a known searchId", async () => {
    const { searchId } = await search(`click-query-${Math.random()}`);
    expect(searchId).not.toBeNull();

    const click = await app.fetch(
      new Request("http://localhost/api/v1/search/click", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          searchId: searchId!,
          itemKind: "research",
          itemId: "abc123",
        }),
      }),
    );
    expect(click.status).toBe(200);
    const ok = (await click.json()) as { ok: boolean };
    expect(ok.ok).toBe(true);

    const row = getDb()
      .select({ kind: searches.clickedItemKind, id: searches.clickedItemId })
      .from(searches)
      .where(eq(searches.id, searchId!))
      .get();
    expect(row?.kind).toBe("research");
    expect(row?.id).toBe("abc123");
  });

  test("/search/click is idempotent — second click returns alreadyRecorded", async () => {
    const { searchId } = await search(`idem-query-${Math.random()}`);
    expect(searchId).not.toBeNull();
    const body = JSON.stringify({
      searchId: searchId!,
      itemKind: "page",
      itemId: "first",
    });
    await app.fetch(
      new Request("http://localhost/api/v1/search/click", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      }),
    );

    const second = await app.fetch(
      new Request("http://localhost/api/v1/search/click", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          searchId: searchId!,
          itemKind: "page",
          itemId: "second",
        }),
      }),
    );
    expect(second.status).toBe(200);
    const data = (await second.json()) as { ok: boolean; alreadyRecorded?: boolean };
    expect(data.alreadyRecorded).toBe(true);

    // Original click should be preserved.
    const row = getDb()
      .select({ id: searches.clickedItemId })
      .from(searches)
      .where(eq(searches.id, searchId!))
      .get();
    expect(row?.id).toBe("first");
  });

  test("/search/click on unknown searchId returns 404", async () => {
    const res = await app.fetch(
      new Request("http://localhost/api/v1/search/click", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          searchId: "nonexistent-search-id-zzz",
          itemKind: "page",
          itemId: "foo",
        }),
      }),
    );
    expect(res.status).toBe(404);
  });

  test("anonymous queries are recorded with null userId", async () => {
    const q1 = `anon-query-${Math.random()}`;
    const q2 = `anon-query-${Math.random()}`;
    await search(q1);
    await search(q2);
    const rows = getDb()
      .select({ query: searches.query, userId: searches.userId })
      .from(searches)
      .orderBy(desc(searches.createdAt))
      .limit(20)
      .all();
    const found1 = rows.find((r) => r.query === q1);
    const found2 = rows.find((r) => r.query === q2);
    expect(found1).toBeDefined();
    expect(found2).toBeDefined();
    expect(found1?.userId).toBeNull();
    expect(found2?.userId).toBeNull();
  });
});
