// Sprint 34 — citation endpoint tests.
//
// We verify:
//   - GET /research/:slug/cite returns JSON with bibtex + ris + plain
//   - ?format=bibtex returns text/x-bibtex with @misc{...}
//   - ?format=ris returns RIS payload with TY/AU/TI/PY/UR/ER tags
//   - draft papers are 404 (citations are public-only)
//   - capstone cite endpoint mirrors the paper shape

import { describe, test, expect } from "bun:test";
import { app } from "../index";
import {
  capstones,
  getDb,
  researchPapers,
  users,
} from "@axiomic/db";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import {
  toBibtex,
  toRis,
  toPlainText,
  type CitationSource,
} from "../lib/citations";

async function req(path: string, opts?: RequestInit): Promise<Response> {
  return await app.fetch(new Request(`http://localhost/api/v1${path}`, opts));
}

const testId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

async function ensureUser(suffix: string) {
  const db = getDb();
  const username = `cite_${suffix}_${testId}`.slice(0, 30);
  const id = randomUUID();
  db.insert(users).values({
    id,
    username,
    email: `${username}@example.com`,
    passwordHash: "$argon2id$v=19$m=65536,t=3,p=4$xx$yy",
    displayName: `Cite ${suffix}`,
    bio: "test",
  }).run();
  return { id, username };
}

function ensurePublishedPaper(authorId: string, slugSuffix: string) {
  const db = getDb();
  const slug = `cite-paper-${slugSuffix}-${testId}`;
  const id = randomUUID();
  db.insert(researchPapers).values({
    id,
    slug,
    title: "On the dynamics of attention",
    summary: "A short note on attention.",
    abstract: "Attention is the core mechanism of transformers.",
    contentIntro: "Intro version.",
    contentUndergrad: "Undergrad version.",
    contentGrad: "Graduate version.",
    canonicalTier: "undergrad",
    paperStructureJson: "{}",
    referencesJson: "[]",
    coauthorsJson: JSON.stringify(["Jane Doe"]),
    coverEmoji: "📄",
    accentColor: "indigo",
    status: "published",
    tags: "[]",
    format: "research",
    authorId,
  }).run();
  return slug;
}

function ensureDraftPaper(authorId: string, slugSuffix: string) {
  const db = getDb();
  const slug = `cite-draft-${slugSuffix}-${testId}`;
  const id = randomUUID();
  db.insert(researchPapers).values({
    id,
    slug,
    title: "Hidden draft",
    summary: "draft",
    abstract: "draft",
    contentIntro: "",
    contentUndergrad: "",
    contentGrad: "",
    canonicalTier: "undergrad",
    paperStructureJson: "{}",
    referencesJson: "[]",
    coauthorsJson: "[]",
    coverEmoji: "📄",
    accentColor: "indigo",
    status: "draft",
    tags: "[]",
    format: "research",
    authorId,
  }).run();
  return slug;
}

function ensurePublishedCapstone(authorId: string, slugSuffix: string) {
  const db = getDb();
  const slug = `cite-capstone-${slugSuffix}-${testId}`;
  const id = randomUUID();
  db.insert(capstones).values({
    id,
    slug,
    title: "Build a Transformer",
    summary: "A capstone where you implement attention from scratch.",
    contentIntro: "intro",
    contentUndergrad: "undergrad brief",
    contentGrad: "grad brief",
    canonicalTier: "undergrad",
    estimatedWeeks: 6,
    prerequisiteWikiSlugs: "[]",
    prerequisiteNodeIds: "[]",
    tags: "[]",
    coverEmoji: "🎓",
    accentColor: "violet",
    status: "published",
    authorId,
  }).run();
  return slug;
}

describe("Sprint 34 — citation export", () => {
  test("formatters produce well-formed BibTeX + RIS + plain text", () => {
    const src: CitationSource = {
      kind: "paper",
      slug: "test",
      title: "On Diffusion & Models",
      authors: ["Ada Lovelace", "Alan Turing"],
      year: 2026,
      url: "https://axiomic.app/research/test",
      abstract: "Short abstract.",
      publishedAt: "2026-01-01T00:00:00Z",
    };
    const bib = toBibtex(src);
    expect(bib).toContain("@misc{");
    // Ampersand in title must be escaped.
    expect(bib).toContain("\\&");
    expect(bib).toContain("Ada Lovelace and Alan Turing");
    expect(bib).toContain("https://axiomic.app/research/test");

    const ris = toRis(src);
    expect(ris).toContain("TY  - GEN");
    expect(ris).toContain("AU  - Ada Lovelace");
    expect(ris).toContain("AU  - Alan Turing");
    expect(ris).toContain("ER  - ");
    expect(ris).toContain("PY  - 2026");

    const plain = toPlainText(src);
    expect(plain).toContain("Ada Lovelace & Alan Turing");
    expect(plain).toContain("(2026)");
  });

  test("GET /research/:slug/cite returns JSON with all formats", async () => {
    const author = await ensureUser("p1");
    const slug = ensurePublishedPaper(author.id, "p1");
    const res = await req(`/research/${slug}/cite`);
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.title).toBe("On the dynamics of attention");
    expect(data.authors[0]).toBe(`Cite p1`);
    expect(data.authors).toContain("Jane Doe");
    expect(typeof data.bibtex).toBe("string");
    expect(data.bibtex).toContain("@misc{");
    expect(data.ris).toContain("TY  - GEN");
    expect(data.permalink).toBe(`/cite/p/${author.username}/${slug}`);
  });

  test("GET /research/:slug/cite?format=bibtex returns plain BibTeX text", async () => {
    const author = await ensureUser("p2");
    const slug = ensurePublishedPaper(author.id, "p2");
    const res = await req(`/research/${slug}/cite?format=bibtex`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type") ?? "").toContain("x-bibtex");
    const body = await res.text();
    expect(body.startsWith("@misc{")).toBe(true);
  });

  test("GET /research/:slug/cite?format=ris returns RIS payload", async () => {
    const author = await ensureUser("p3");
    const slug = ensurePublishedPaper(author.id, "p3");
    const res = await req(`/research/${slug}/cite?format=ris`);
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain("TY  - GEN");
    expect(body).toContain("ER  - ");
  });

  test("draft paper is 404 from the cite endpoint", async () => {
    const author = await ensureUser("p4");
    const slug = ensureDraftPaper(author.id, "p4");
    const res = await req(`/research/${slug}/cite`);
    expect(res.status).toBe(404);
  });

  test("unknown paper is 404", async () => {
    const res = await req("/research/__nope_404__/cite");
    expect(res.status).toBe(404);
  });

  test("GET /capstones/:slug/cite mirrors paper shape", async () => {
    const author = await ensureUser("c1");
    const slug = ensurePublishedCapstone(author.id, "c1");
    const res = await req(`/capstones/${slug}/cite`);
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.title).toBe("Build a Transformer");
    expect(data.bibtex).toContain("@misc{");
    expect(data.permalink).toBe(`/cite/c/${author.username}/${slug}`);
  });
});

void eq;
