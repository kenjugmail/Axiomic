// Sprint 72 — /authors/:username + author-claims endpoints.

import { describe, test, expect } from "bun:test";
import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { app } from "../index";
import {
  externalPaperAuthorships,
  externalPapers,
  getDb,
  users,
} from "@axiomic/db";

function makeUser(overrides: Partial<typeof users.$inferInsert> = {}): {
  id: string;
  username: string;
} {
  const id = randomUUID();
  const username = `aut-${Math.random().toString(36).slice(2, 10)}`;
  getDb()
    .insert(users)
    .values({
      id,
      username,
      email: `${username}@test.local`,
      passwordHash: "x".repeat(60),
      ...overrides,
    })
    .run();
  return { id, username };
}

function makeExternalPaper(authors: Array<{ name: string }>): string {
  const id = randomUUID();
  const sourceId = `ap-${Math.random().toString(36).slice(2, 10)}`;
  getDb()
    .insert(externalPapers)
    .values({
      id,
      source: "arxiv",
      sourceId,
      title: "Author test paper",
      authorsJson: JSON.stringify(authors),
      contentHash: "y".repeat(8),
    })
    .run();
  return id;
}

describe("/authors (Sprint 72)", () => {
  test("GET unknown username → 404", async () => {
    const res = await app.fetch(
      new Request("http://localhost/api/v1/authors/nope-doesnt-exist"),
    );
    expect(res.status).toBe(404);
  });

  test("GET returns user shape + empty paper lists for fresh account", async () => {
    const u = makeUser({ orcid: null });
    const res = await app.fetch(
      new Request(`http://localhost/api/v1/authors/${u.username}`),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      user: { username: string };
      papers: { internal: unknown[]; external: unknown[] };
      socialPosts: unknown[];
    };
    expect(body.user.username).toBe(u.username);
    expect(body.papers.internal).toEqual([]);
    expect(body.papers.external).toEqual([]);
  });

  test("GET surfaces a claimed external paper after authorship inserted", async () => {
    const u = makeUser();
    const paperId = makeExternalPaper([{ name: "Me" }]);
    getDb()
      .insert(externalPaperAuthorships)
      .values({
        id: randomUUID(),
        externalPaperId: paperId,
        ordinal: 0,
        userId: u.id,
        verifiedVia: "admin_verified",
      })
      .run();
    const res = await app.fetch(
      new Request(`http://localhost/api/v1/authors/${u.username}`),
    );
    const body = (await res.json()) as {
      papers: {
        external: Array<{ paper: { title: string }; verifiedVia: string }>;
      };
    };
    expect(body.papers.external.length).toBe(1);
    expect(body.papers.external[0].verifiedVia).toBe("admin_verified");
  });
});

describe("/author-claims (Sprint 72)", () => {
  test("anonymous POST is rejected", async () => {
    const res = await app.fetch(
      new Request("http://localhost/api/v1/author-claims", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ externalPaperId: "x", ordinal: 0 }),
      }),
    );
    expect(res.status).toBe(401);
  });

  test("anonymous GET /me is rejected", async () => {
    const res = await app.fetch(
      new Request("http://localhost/api/v1/author-claims/me"),
    );
    expect(res.status).toBe(401);
  });
});

describe("/external-papers/:id/authors/:ordinal/questions (Sprint 72)", () => {
  test("GET returns shape + authorClaimed flag", async () => {
    const u = makeUser();
    const paperId = makeExternalPaper([{ name: "Solo" }]);
    getDb()
      .insert(externalPaperAuthorships)
      .values({
        id: randomUUID(),
        externalPaperId: paperId,
        ordinal: 0,
        userId: u.id,
        verifiedVia: "orcid_auto",
      })
      .run();
    const res = await app.fetch(
      new Request(
        `http://localhost/api/v1/external-papers/${paperId}/authors/0/questions`,
      ),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      questions: unknown[];
      authorClaimed: boolean;
    };
    expect(body.authorClaimed).toBe(true);
    expect(body.questions).toEqual([]);
  });

  test("GET on unknown paper id returns 404", async () => {
    const res = await app.fetch(
      new Request(
        "http://localhost/api/v1/external-papers/does-not-exist/authors/0/questions",
      ),
    );
    expect(res.status).toBe(404);
  });

  test("POST requires auth", async () => {
    const paperId = makeExternalPaper([{ name: "X" }]);
    const res = await app.fetch(
      new Request(
        `http://localhost/api/v1/external-papers/${paperId}/authors/0/questions`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: "Hello" }),
        },
      ),
    );
    expect(res.status).toBe(401);
  });

  test("ordinal cleanup on bad value returns 400", async () => {
    const paperId = makeExternalPaper([{ name: "X" }]);
    const res = await app.fetch(
      new Request(
        `http://localhost/api/v1/external-papers/${paperId}/authors/notanumber/questions`,
      ),
    );
    expect(res.status).toBe(400);
  });
});

// Cleanup: avoid leaving unused-var warnings for the import.
void eq;
