// Sprint 35 — version snapshot tests.
//
// Cover: snapshot creation on publish + republish, draft saves do NOT
// snapshot, /versions list returns ordered rows, /versions/:n returns
// frozen content, draft papers are 404 on the versions endpoint.

import { describe, test, expect } from "bun:test";
import { app } from "../index";
import { getDb, researchPaperVersions, researchPapers, users } from "@axiomic/db";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import { snapshotResearchPaper } from "../lib/versionSnapshots";

async function req(path: string, opts?: RequestInit): Promise<Response> {
  return await app.fetch(new Request(`http://localhost/api/v1${path}`, opts));
}

const testId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

function makePaper(opts: { slug: string; status: "draft" | "published"; authorId: string; title?: string }) {
  const db = getDb();
  const id = randomUUID();
  db.insert(researchPapers).values({
    id,
    slug: opts.slug,
    title: opts.title ?? "Test paper",
    summary: "summary",
    abstract: "abstract",
    contentIntro: "intro body",
    contentUndergrad: "undergrad body",
    contentGrad: "grad body",
    canonicalTier: "undergrad",
    paperStructureJson: "{}",
    referencesJson: "[]",
    coauthorsJson: "[]",
    coverEmoji: "📄",
    accentColor: "indigo",
    status: opts.status,
    tags: "[]",
    format: "research",
    authorId: opts.authorId,
  }).run();
  return id;
}

async function ensureUser(suffix: string) {
  const db = getDb();
  const username = `ver_${suffix}_${testId}`.slice(0, 30);
  const id = randomUUID();
  db.insert(users).values({
    id,
    username,
    email: `${username}@example.com`,
    passwordHash: "$argon2id$v=19$m=65536,t=3,p=4$xx$yy",
    displayName: `Ver ${suffix}`,
    bio: "test",
  }).run();
  return { id, username };
}

describe("Sprint 35 — paper version snapshots", () => {
  test("snapshotResearchPaper is a no-op for drafts", async () => {
    const author = await ensureUser("draft");
    const paperId = makePaper({
      slug: `ver-draft-${testId}`,
      status: "draft",
      authorId: author.id,
    });
    const result = snapshotResearchPaper(paperId);
    expect(result).toBe(null);
    const db = getDb();
    const versions = db
      .select()
      .from(researchPaperVersions)
      .where(eq(researchPaperVersions.paperId, paperId))
      .all();
    expect(versions.length).toBe(0);
  });

  test("first snapshot of a published paper creates v1; second creates v2", async () => {
    const author = await ensureUser("seq");
    const paperId = makePaper({
      slug: `ver-seq-${testId}`,
      status: "published",
      authorId: author.id,
    });
    const v1 = snapshotResearchPaper(paperId, {
      editedBy: author.id,
      editMessage: "Initial",
    });
    expect(v1).toBe(1);
    const v2 = snapshotResearchPaper(paperId, {
      editedBy: author.id,
      editMessage: "Tweaks",
    });
    expect(v2).toBe(2);
    const db = getDb();
    const versions = db
      .select()
      .from(researchPaperVersions)
      .where(eq(researchPaperVersions.paperId, paperId))
      .all();
    expect(versions.length).toBe(2);

    const paper = db
      .select({ currentVersion: researchPapers.currentVersion })
      .from(researchPapers)
      .where(eq(researchPapers.id, paperId))
      .get();
    expect(paper?.currentVersion).toBe(2);
  });

  test("GET /research/:slug/versions returns versions list with editor + message", async () => {
    const author = await ensureUser("list");
    const slug = `ver-list-${testId}`;
    const paperId = makePaper({ slug, status: "published", authorId: author.id });
    snapshotResearchPaper(paperId, { editedBy: author.id, editMessage: "v1" });
    snapshotResearchPaper(paperId, { editedBy: author.id, editMessage: "v2" });

    const res = await req(`/research/${slug}/versions`);
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.currentVersion).toBe(2);
    expect(data.versions.length).toBe(2);
    expect(data.versions[0].version).toBe(1);
    expect(data.versions[1].version).toBe(2);
    expect(data.versions[1].editorUsername).toBe(author.username);
    expect(data.versions[1].editMessage).toBe("v2");
  });

  test("GET /research/:slug/versions/:n returns frozen content", async () => {
    const author = await ensureUser("frozen");
    const slug = `ver-frozen-${testId}`;
    const paperId = makePaper({
      slug,
      status: "published",
      authorId: author.id,
      title: "Original title",
    });
    snapshotResearchPaper(paperId, { editedBy: author.id, editMessage: "v1" });

    // Mutate the paper's title without re-snapshotting.
    const db = getDb();
    db.update(researchPapers)
      .set({ title: "Updated title" })
      .where(eq(researchPapers.id, paperId))
      .run();

    const res = await req(`/research/${slug}/versions/1`);
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    // Frozen snapshot keeps the original title.
    expect(data.title).toBe("Original title");
    expect(data.contentIntro).toBe("intro body");
  });

  test("draft paper /versions endpoint is 404", async () => {
    const author = await ensureUser("draft-404");
    const slug = `ver-draft-404-${testId}`;
    makePaper({ slug, status: "draft", authorId: author.id });
    const res = await req(`/research/${slug}/versions`);
    expect(res.status).toBe(404);
  });

  test("unknown version returns 404", async () => {
    const author = await ensureUser("unk");
    const slug = `ver-unk-${testId}`;
    const paperId = makePaper({ slug, status: "published", authorId: author.id });
    snapshotResearchPaper(paperId, { editedBy: author.id, editMessage: "v1" });
    const res = await req(`/research/${slug}/versions/999`);
    expect(res.status).toBe(404);
  });
});
