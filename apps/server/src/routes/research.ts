// Sprint 20 — Research papers router.
//
// Distinct from /news: tiered content (intro/undergrad/grad), paper-
// structure metadata, format flag. Mirrors the news_articles authoring
// shape for everything else (slug, title, abstract, references,
// coauthors, status, tags, accent + emoji) so existing patterns port.
//
// v1 scope: CRUD + per-tier read + drafts list. Comments / claim
// threads / artifacts / reproductions on research papers come back in
// a follow-up sprint.

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, asc, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { randomUUID } from "crypto";
import {
  claimThreads,
  getDb,
  newsComments,
  researchPapers,
  researchPaperVersions,
  reproductions,
  runnableArtifacts,
  users,
} from "@axiomic/db";
import { requireAuth, getSessionUser } from "../middleware/auth";
import { notify, notifyMentions } from "../lib/notifications";
import { invalidateSearchIndex } from "../lib/searchIndex";
import { extractReferencedWikiSlugs } from "../lib/crossLinks";
import {
  toBibtex,
  toRis,
  toPlainText,
  type CitationSource,
} from "../lib/citations";
import { snapshotResearchPaper } from "../lib/versionSnapshots";
import type { Env } from "../env";

export const researchRouter = new Hono<Env>();

// --- helpers ---------------------------------------------------------

function readingMinutes(body: string): number {
  const words = (body || "").split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 220));
}

function safeParseStrArray(json: string): string[] {
  try {
    const arr = JSON.parse(json);
    if (!Array.isArray(arr)) return [];
    return arr.filter((s): s is string => typeof s === "string");
  } catch {
    return [];
  }
}

interface ReferenceEntry {
  label?: string;
  text: string;
  url?: string;
}

function parseReferences(json: string): ReferenceEntry[] {
  try {
    const arr = JSON.parse(json);
    if (!Array.isArray(arr)) return [];
    return arr.filter(
      (r): r is ReferenceEntry =>
        r != null && typeof r === "object" && typeof r.text === "string",
    );
  } catch {
    return [];
  }
}

function safeParsePaperStructure(json: string): Record<string, string> {
  try {
    const obj = JSON.parse(json);
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) return {};
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (typeof v === "string" && v.trim().length > 0) out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

// Pick the tier the reader asked for, falling back to the canonical
// tier when their requested tier is empty (so a paper that only has
// `undergrad` content isn't blank when accessed with `?tier=intro`).
type Tier = "intro" | "undergrad" | "grad";
const TIERS: Tier[] = ["intro", "undergrad", "grad"];

function pickContent(
  paper: {
    contentIntro: string;
    contentUndergrad: string;
    contentGrad: string;
    canonicalTier: string;
  },
  requested: Tier,
): { tier: Tier; content: string } {
  const map: Record<Tier, string> = {
    intro: paper.contentIntro,
    undergrad: paper.contentUndergrad,
    grad: paper.contentGrad,
  };
  if (map[requested] && map[requested].trim().length > 0) {
    return { tier: requested, content: map[requested] };
  }
  // Fall back to the canonical tier (may itself be the requested one).
  const canonical = (TIERS as string[]).includes(paper.canonicalTier)
    ? (paper.canonicalTier as Tier)
    : "undergrad";
  if (map[canonical].trim().length > 0) {
    return { tier: canonical, content: map[canonical] };
  }
  // Final fallback: any non-empty tier.
  for (const t of TIERS) {
    if (map[t].trim().length > 0) return { tier: t, content: map[t] };
  }
  return { tier: requested, content: "" };
}

// --- shared validation ---------------------------------------------

const slugSchema = z
  .string()
  .min(1)
  .max(120)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "slug must be kebab-case");

const tagSchema = z.array(z.string().min(1).max(40)).max(8).optional();

const formatSchema = z
  .enum(["research", "explainer", "survey", "opinion"])
  .optional()
  .default("research");

const tierSchema = z.enum(["intro", "undergrad", "grad"]);

const referenceSchema = z.object({
  label: z.string().max(40).optional(),
  text: z.string().min(1).max(500),
  url: z.string().url().max(500).optional(),
});

const paperStructureSchema = z
  .object({
    researchQuestion: z.string().max(500).optional(),
    hypothesis: z.string().max(1000).optional(),
    method: z.string().max(2000).optional(),
    results: z.string().max(2000).optional(),
    discussion: z.string().max(2000).optional(),
    futureWork: z.string().max(1000).optional(),
  })
  .optional();

function normalizeTags(input: string[] | undefined): string[] {
  if (!input) return [];
  const seen = new Set<string>();
  for (const raw of input) {
    const t = raw.trim().toLowerCase().replace(/\s+/g, "-");
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(t)) continue;
    seen.add(t);
    if (seen.size >= 8) break;
  }
  return [...seen];
}

const createSchema = z.object({
  slug: slugSchema,
  title: z.string().min(1).max(200),
  summary: z.string().max(500).optional().default(""),
  format: formatSchema,
  abstract: z.string().max(8000).optional().default(""),
  contentIntro: z.string().max(50000).optional().default(""),
  contentUndergrad: z.string().max(50000).optional().default(""),
  contentGrad: z.string().max(50000).optional().default(""),
  canonicalTier: tierSchema.optional().default("undergrad"),
  paperStructure: paperStructureSchema,
  references: z.array(referenceSchema).max(200).optional(),
  coauthors: z.array(z.string().min(1).max(50)).max(20).optional(),
  coverEmoji: z.string().max(8).optional(),
  accentColor: z
    .enum(["indigo", "emerald", "rose", "amber", "sky", "violet"])
    .optional(),
  tags: tagSchema,
  status: z.enum(["draft", "published"]).optional().default("draft"),
});

const updateSchema = createSchema.partial().extend({
  // slug is immutable for now — drop it from PUT to avoid stale links.
  slug: z.never().optional(),
});

// --- routes ---------------------------------------------------------

// GET /research — list published papers, optionally filtered by tag /
// format. Returns ordered by createdAt desc.
researchRouter.get("/", async (c) => {
  const db = getDb();
  const tag = c.req.query("tag")?.toLowerCase();
  const format = c.req.query("format");
  let rows = db
    .select({
      id: researchPapers.id,
      slug: researchPapers.slug,
      title: researchPapers.title,
      summary: researchPapers.summary,
      format: researchPapers.format,
      abstract: researchPapers.abstract,
      coverEmoji: researchPapers.coverEmoji,
      accentColor: researchPapers.accentColor,
      tags: researchPapers.tags,
      authorId: researchPapers.authorId,
      authorUsername: users.username,
      authorDisplayName: users.displayName,
      createdAt: researchPapers.createdAt,
      updatedAt: researchPapers.updatedAt,
    })
    .from(researchPapers)
    .innerJoin(users, eq(researchPapers.authorId, users.id))
    .where(eq(researchPapers.status, "published"))
    .orderBy(desc(researchPapers.createdAt))
    .all();
  if (format) {
    rows = rows.filter((r) => r.format === format);
  }
  if (tag) {
    rows = rows.filter((r) => safeParseStrArray(r.tags).includes(tag));
  }
  return c.json({
    papers: rows.map((r) => ({
      id: r.id,
      slug: r.slug,
      title: r.title,
      summary: r.summary,
      format: r.format,
      abstract: r.abstract,
      coverEmoji: r.coverEmoji,
      accentColor: r.accentColor,
      tags: safeParseStrArray(r.tags),
      authorId: r.authorId,
      authorUsername: r.authorUsername,
      authorDisplayName: r.authorDisplayName,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    })),
  });
});

// GET /research/by-author/:username — published papers by one user.
researchRouter.get("/by-author/:username", async (c) => {
  const username = c.req.param("username")!;
  const db = getDb();
  const author = db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.username, username))
    .get();
  if (!author) return c.json({ papers: [] });

  const rows = db
    .select({
      id: researchPapers.id,
      slug: researchPapers.slug,
      title: researchPapers.title,
      summary: researchPapers.summary,
      format: researchPapers.format,
      coverEmoji: researchPapers.coverEmoji,
      accentColor: researchPapers.accentColor,
      tags: researchPapers.tags,
      createdAt: researchPapers.createdAt,
    })
    .from(researchPapers)
    .where(
      and(
        eq(researchPapers.authorId, author.id),
        eq(researchPapers.status, "published"),
      ),
    )
    .orderBy(desc(researchPapers.createdAt))
    .all();
  return c.json({
    papers: rows.map((r) => ({
      ...r,
      tags: safeParseStrArray(r.tags),
    })),
  });
});

// GET /research/me/drafts — author's own drafts.
researchRouter.get("/me/drafts", requireAuth, async (c) => {
  const user = c.get("user")!;
  const db = getDb();
  const rows = db
    .select({
      id: researchPapers.id,
      slug: researchPapers.slug,
      title: researchPapers.title,
      summary: researchPapers.summary,
      format: researchPapers.format,
      coverEmoji: researchPapers.coverEmoji,
      accentColor: researchPapers.accentColor,
      tags: researchPapers.tags,
      updatedAt: researchPapers.updatedAt,
    })
    .from(researchPapers)
    .where(
      and(
        eq(researchPapers.authorId, user.id),
        eq(researchPapers.status, "draft"),
      ),
    )
    .orderBy(desc(researchPapers.updatedAt))
    .all();
  return c.json({
    papers: rows.map((r) => ({
      ...r,
      tags: safeParseStrArray(r.tags),
    })),
  });
});

// GET /research/:slug — single paper at a chosen tier. Drafts are
// only visible to their author.
researchRouter.get("/:slug", async (c) => {
  const slug = c.req.param("slug")!;
  const requestedTier = (c.req.query("tier") as Tier) || "undergrad";
  const tier: Tier = (TIERS as string[]).includes(requestedTier)
    ? requestedTier
    : "undergrad";
  const db = getDb();
  const session = await getSessionUser(c);

  const row = db
    .select({
      id: researchPapers.id,
      slug: researchPapers.slug,
      title: researchPapers.title,
      summary: researchPapers.summary,
      format: researchPapers.format,
      abstract: researchPapers.abstract,
      contentIntro: researchPapers.contentIntro,
      contentUndergrad: researchPapers.contentUndergrad,
      contentGrad: researchPapers.contentGrad,
      currentVersion: researchPapers.currentVersion,
      canonicalTier: researchPapers.canonicalTier,
      paperStructureJson: researchPapers.paperStructureJson,
      referencesJson: researchPapers.referencesJson,
      coauthorsJson: researchPapers.coauthorsJson,
      coverEmoji: researchPapers.coverEmoji,
      accentColor: researchPapers.accentColor,
      status: researchPapers.status,
      tags: researchPapers.tags,
      authorId: researchPapers.authorId,
      authorUsername: users.username,
      authorDisplayName: users.displayName,
      lastEditorId: researchPapers.lastEditorId,
      createdAt: researchPapers.createdAt,
      updatedAt: researchPapers.updatedAt,
    })
    .from(researchPapers)
    .innerJoin(users, eq(researchPapers.authorId, users.id))
    .where(eq(researchPapers.slug, slug))
    .get();
  if (!row) return c.json({ error: "Paper not found" }, 404);

  if (row.status === "draft" && (!session || session.id !== row.authorId)) {
    return c.json({ error: "Paper not found" }, 404);
  }

  const editor = row.lastEditorId
    ? db
        .select({ username: users.username })
        .from(users)
        .where(eq(users.id, row.lastEditorId))
        .get()
    : null;

  const picked = pickContent(row, tier);
  const isAuthor = !!session && session.id === row.authorId;

  // Tier availability — used by the toggle to mute empty tiers.
  const availableTiers: Tier[] = [];
  if (row.contentIntro.trim().length > 0) availableTiers.push("intro");
  if (row.contentUndergrad.trim().length > 0) availableTiers.push("undergrad");
  if (row.contentGrad.trim().length > 0) availableTiers.push("grad");

  // Sprint 23.5 — bundle artifacts + reproStats so the reader renders
  // in one round-trip, mirroring the news article shape.
  const artifacts = db
    .select({
      id: runnableArtifacts.id,
      kind: runnableArtifacts.kind,
      url: runnableArtifacts.url,
      label: runnableArtifacts.label,
      description: runnableArtifacts.description,
      createdAt: runnableArtifacts.createdAt,
    })
    .from(runnableArtifacts)
    .where(
      and(
        eq(runnableArtifacts.targetKind, "research_paper"),
        eq(runnableArtifacts.targetId, row.id),
      ),
    )
    .orderBy(asc(runnableArtifacts.createdAt))
    .all();

  const reproRows = db
    .select({
      status: reproductions.status,
      reproducerId: reproductions.reproducerId,
    })
    .from(reproductions)
    .where(
      and(
        eq(reproductions.targetKind, "research_paper"),
        eq(reproductions.targetId, row.id),
      ),
    )
    .all();
  const reproStats = {
    total: reproRows.length,
    success: 0,
    partial: 0,
    failed: 0,
    mine: session ? reproRows.some((r) => r.reproducerId === session.id) : false,
  };
  for (const r of reproRows) {
    if (r.status === "success") reproStats.success++;
    else if (r.status === "partial") reproStats.partial++;
    else if (r.status === "failed") reproStats.failed++;
  }

  const prereqWikiSlugs = extractReferencedWikiSlugs(
    `${row.abstract}\n${row.contentIntro}\n${row.contentUndergrad}\n${row.contentGrad}`,
  );

  return c.json({
    paper: {
      id: row.id,
      slug: row.slug,
      title: row.title,
      summary: row.summary,
      format: row.format,
      abstract: row.abstract,
      content: picked.content,
      tier: picked.tier,
      requestedTier: tier,
      availableTiers,
      allContent: {
        intro: row.contentIntro,
        undergrad: row.contentUndergrad,
        grad: row.contentGrad,
      },
      canonicalTier: row.canonicalTier,
      paperStructure: safeParsePaperStructure(row.paperStructureJson),
      references: parseReferences(row.referencesJson),
      coauthors: safeParseStrArray(row.coauthorsJson),
      coverEmoji: row.coverEmoji,
      accentColor: row.accentColor,
      status: row.status,
      tags: safeParseStrArray(row.tags),
      authorId: row.authorId,
      authorUsername: row.authorUsername,
      authorDisplayName: row.authorDisplayName,
      lastEditorUsername: editor?.username ?? null,
      currentVersion: row.currentVersion,
      readingMinutes: readingMinutes(picked.content),
      isAuthor,
      artifacts,
      reproStats,
      prereqWikiSlugs,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    },
  });
});

// Sprint 34 — Citation export. BibTeX / RIS / plain-text formatters
// + JSON bundle. Resolves authors via authorUsername + coauthors and
// derives the canonical URL from the paper slug.
researchRouter.get("/:slug/cite", async (c) => {
  const slug = c.req.param("slug")!;
  const format = c.req.query("format") ?? "json";
  const db = getDb();
  const row = db
    .select({
      slug: researchPapers.slug,
      title: researchPapers.title,
      summary: researchPapers.summary,
      abstract: researchPapers.abstract,
      coauthorsJson: researchPapers.coauthorsJson,
      authorUsername: users.username,
      authorDisplayName: users.displayName,
      status: researchPapers.status,
      createdAt: researchPapers.createdAt,
      updatedAt: researchPapers.updatedAt,
    })
    .from(researchPapers)
    .innerJoin(users, eq(researchPapers.authorId, users.id))
    .where(eq(researchPapers.slug, slug))
    .get();
  if (!row) return c.json({ error: "Paper not found" }, 404);
  if (row.status !== "published") {
    return c.json({ error: "Citations are only available for published papers" }, 404);
  }

  const coauthors = safeParseStrArray(row.coauthorsJson);
  const primary = row.authorDisplayName || row.authorUsername;
  const url = `https://axiomic.app/research/${row.slug}`;
  const src: CitationSource = {
    kind: "paper",
    slug: row.slug,
    title: row.title,
    authors: [primary, ...coauthors],
    year: new Date(row.createdAt).getUTCFullYear(),
    url,
    abstract: row.abstract || row.summary,
    publishedAt: row.createdAt,
  };

  if (format === "bibtex" || format === "bib") {
    return new Response(toBibtex(src), {
      headers: {
        "content-type": "application/x-bibtex; charset=utf-8",
        "content-disposition": `inline; filename=\"${row.slug}.bib\"`,
      },
    });
  }
  if (format === "ris") {
    return new Response(toRis(src), {
      headers: {
        "content-type": "application/x-research-info-systems; charset=utf-8",
        "content-disposition": `inline; filename=\"${row.slug}.ris\"`,
      },
    });
  }
  return c.json({
    slug: src.slug,
    title: src.title,
    authors: src.authors,
    year: src.year,
    url: src.url,
    permalink: `/cite/p/${row.authorUsername}/${row.slug}`,
    bibtex: toBibtex(src),
    ris: toRis(src),
    plain: toPlainText(src),
  });
});

// POST /research — create a new paper (defaults to draft).
researchRouter.post(
  "/",
  requireAuth,
  zValidator("json", createSchema),
  async (c) => {
    const user = c.get("user")!;
    const data = c.req.valid("json");
    const db = getDb();

    const collision = db
      .select({ id: researchPapers.id })
      .from(researchPapers)
      .where(eq(researchPapers.slug, data.slug))
      .get();
    if (collision) {
      return c.json({ error: "Slug already in use" }, 409);
    }

    // Require at least one non-empty tier.
    const hasContent =
      (data.contentIntro?.trim().length ?? 0) > 0 ||
      (data.contentUndergrad?.trim().length ?? 0) > 0 ||
      (data.contentGrad?.trim().length ?? 0) > 0;
    if (!hasContent && data.status === "published") {
      return c.json({ error: "Cannot publish an empty paper" }, 400);
    }

    const id = randomUUID();
    db.insert(researchPapers)
      .values({
        id,
        slug: data.slug,
        title: data.title.trim(),
        summary: data.summary?.trim() ?? "",
        format: data.format,
        abstract: data.abstract?.trim() ?? "",
        contentIntro: data.contentIntro ?? "",
        contentUndergrad: data.contentUndergrad ?? "",
        contentGrad: data.contentGrad ?? "",
        canonicalTier: data.canonicalTier,
        paperStructureJson: JSON.stringify(data.paperStructure ?? {}),
        referencesJson: JSON.stringify(data.references ?? []),
        coauthorsJson: JSON.stringify(data.coauthors ?? []),
        coverEmoji: data.coverEmoji?.slice(0, 8) || "📄",
        accentColor: data.accentColor ?? "violet",
        status: data.status,
        tags: JSON.stringify(normalizeTags(data.tags)),
        authorId: user.id,
      })
      .run();

    invalidateSearchIndex();
    if (data.status === "published") {
      // First publish gets the version-1 snapshot. snapshotResearchPaper
      // is a no-op for non-published rows, so this is safe.
      snapshotResearchPaper(id, { editedBy: user.id, editMessage: "Initial publication" });
    }
    return c.json({ paperId: id, slug: data.slug }, 201);
  },
);

// PUT /research/:slug — update an existing paper. Author-only.
researchRouter.put(
  "/:slug",
  requireAuth,
  zValidator("json", updateSchema),
  async (c) => {
    const slug = c.req.param("slug")!;
    const user = c.get("user")!;
    const db = getDb();

    const existing = db
      .select({
        id: researchPapers.id,
        authorId: researchPapers.authorId,
        status: researchPapers.status,
      })
      .from(researchPapers)
      .where(eq(researchPapers.slug, slug))
      .get();
    if (!existing) return c.json({ error: "Paper not found" }, 404);
    if (existing.authorId !== user.id) {
      return c.json({ error: "Only the author can edit this paper." }, 403);
    }

    const data = c.req.valid("json");
    const patch: Record<string, unknown> = {
      updatedAt: new Date().toISOString(),
      lastEditorId: user.id,
    };
    if (data.title != null) patch.title = data.title.trim();
    if (data.summary != null) patch.summary = data.summary.trim();
    if (data.format != null) patch.format = data.format;
    if (data.abstract != null) patch.abstract = data.abstract.trim();
    if (data.contentIntro != null) patch.contentIntro = data.contentIntro;
    if (data.contentUndergrad != null) patch.contentUndergrad = data.contentUndergrad;
    if (data.contentGrad != null) patch.contentGrad = data.contentGrad;
    if (data.canonicalTier != null) patch.canonicalTier = data.canonicalTier;
    if (data.paperStructure != null) {
      patch.paperStructureJson = JSON.stringify(data.paperStructure);
    }
    if (data.references != null) {
      patch.referencesJson = JSON.stringify(data.references);
    }
    if (data.coauthors != null) {
      patch.coauthorsJson = JSON.stringify(data.coauthors);
    }
    if (data.coverEmoji != null) patch.coverEmoji = data.coverEmoji.slice(0, 8) || "📄";
    if (data.accentColor != null) patch.accentColor = data.accentColor;
    if (data.tags != null) patch.tags = JSON.stringify(normalizeTags(data.tags));
    if (data.status != null) patch.status = data.status;

    db.update(researchPapers)
      .set(patch)
      .where(eq(researchPapers.id, existing.id))
      .run();

    invalidateSearchIndex();

    // Sprint 35 — snapshot a new version when the row is currently
    // published OR when this update transitions a draft to published.
    const nowPublished =
      (data.status ?? existing.status) === "published";
    if (nowPublished) {
      snapshotResearchPaper(existing.id, {
        editedBy: user.id,
        editMessage:
          existing.status !== "published" && data.status === "published"
            ? "Initial publication"
            : null,
      });
    }
    return c.json({ ok: true });
  },
);

// Sprint 35 — Versions list + per-version snapshot endpoints.
//
// GET /research/:slug/versions returns the version history for a
// published paper (oldest → newest). Each entry carries a slim
// summary; full content is fetched via .../versions/:n.
researchRouter.get("/:slug/versions", async (c) => {
  const slug = c.req.param("slug")!;
  const db = getDb();
  const paper = db
    .select({
      id: researchPapers.id,
      status: researchPapers.status,
      currentVersion: researchPapers.currentVersion,
    })
    .from(researchPapers)
    .where(eq(researchPapers.slug, slug))
    .get();
  if (!paper) return c.json({ error: "Paper not found" }, 404);
  if (paper.status !== "published") {
    return c.json({ error: "Paper not found" }, 404);
  }

  const rows = db
    .select({
      version: researchPaperVersions.version,
      title: researchPaperVersions.title,
      editedBy: researchPaperVersions.editedBy,
      editMessage: researchPaperVersions.editMessage,
      createdAt: researchPaperVersions.createdAt,
    })
    .from(researchPaperVersions)
    .where(eq(researchPaperVersions.paperId, paper.id))
    .orderBy(asc(researchPaperVersions.version))
    .all();

  const editorIds = [
    ...new Set(rows.map((r) => r.editedBy).filter((x): x is string => !!x)),
  ];
  const editors = editorIds.length
    ? db
        .select({ id: users.id, username: users.username })
        .from(users)
        .where(inArray(users.id, editorIds))
        .all()
    : [];
  const usernameById = new Map(editors.map((e) => [e.id, e.username]));

  return c.json({
    currentVersion: paper.currentVersion,
    versions: rows.map((r) => ({
      version: r.version,
      title: r.title,
      editorUsername: r.editedBy ? usernameById.get(r.editedBy) ?? null : null,
      editMessage: r.editMessage,
      createdAt: r.createdAt,
    })),
  });
});

researchRouter.get("/:slug/versions/:n", async (c) => {
  const slug = c.req.param("slug")!;
  const n = parseInt(c.req.param("n") ?? "0", 10);
  if (!Number.isFinite(n) || n < 1) {
    return c.json({ error: "Invalid version" }, 400);
  }
  const db = getDb();
  const paper = db
    .select({ id: researchPapers.id, status: researchPapers.status })
    .from(researchPapers)
    .where(eq(researchPapers.slug, slug))
    .get();
  if (!paper) return c.json({ error: "Paper not found" }, 404);
  if (paper.status !== "published") {
    return c.json({ error: "Paper not found" }, 404);
  }
  const v = db
    .select()
    .from(researchPaperVersions)
    .where(
      and(
        eq(researchPaperVersions.paperId, paper.id),
        eq(researchPaperVersions.version, n),
      ),
    )
    .get();
  if (!v) return c.json({ error: "Version not found" }, 404);
  const editor = v.editedBy
    ? db
        .select({ username: users.username })
        .from(users)
        .where(eq(users.id, v.editedBy))
        .get()
    : null;
  return c.json({
    version: v.version,
    title: v.title,
    summary: v.summary,
    abstract: v.abstract,
    contentIntro: v.contentIntro,
    contentUndergrad: v.contentUndergrad,
    contentGrad: v.contentGrad,
    paperStructure: safeParsePaperStructure(v.paperStructureJson),
    references: parseReferences(v.referencesJson),
    editorUsername: editor?.username ?? null,
    editMessage: v.editMessage,
    createdAt: v.createdAt,
  });
});

// --- Sprint 23 — research-paper comments (polymorphic on news_comments)
//
// Reuses the news_comments table via the (target_kind, target_id)
// discriminator added in migration 0023. Article-id stays null on
// these rows. Reading + writing follows the same shape as
// /news/:slug/comments but scoped to target_kind='research_paper'.

function previewSnippet(text: string, max = 140): string {
  if (!text) return "";
  const flat = text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`\n]*`/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/[*_>~]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return flat.length > max ? flat.slice(0, max - 1) + "…" : flat;
}

researchRouter.get("/:slug/comments", async (c) => {
  const slug = c.req.param("slug")!;
  const db = getDb();

  const paper = db
    .select({ id: researchPapers.id })
    .from(researchPapers)
    .where(eq(researchPapers.slug, slug))
    .get();
  if (!paper) return c.json({ error: "Paper not found" }, 404);

  const rows = db
    .select({
      id: newsComments.id,
      parentId: newsComments.parentId,
      userId: newsComments.userId,
      username: users.username,
      displayName: users.displayName,
      content: newsComments.content,
      editedAt: newsComments.editedAt,
      createdAt: newsComments.createdAt,
    })
    .from(newsComments)
    .innerJoin(users, eq(newsComments.userId, users.id))
    .where(
      and(
        eq(newsComments.targetKind, "research_paper"),
        eq(newsComments.targetId, paper.id),
        // Exclude claim-thread replies — those render in their own
        // panel pinned to the article passage they discuss, not in
        // the paper-level comment list.
        isNull(newsComments.claimThreadId),
      ),
    )
    .orderBy(desc(newsComments.createdAt))
    .all();

  // Tree builder mirrors the one in /news/:slug/comments.
  type Node = {
    id: string;
    articleId: string;
    parentId: string | null;
    userId: string;
    username: string;
    displayName: string | null;
    content: string;
    editedAt: string | null;
    createdAt: string;
    children: Node[];
  };
  const byId = new Map<string, Node>();
  for (const r of rows) {
    byId.set(r.id, {
      id: r.id,
      articleId: paper.id,
      parentId: r.parentId,
      userId: r.userId,
      username: r.username,
      displayName: r.displayName,
      content: r.content,
      editedAt: r.editedAt,
      createdAt: r.createdAt,
      children: [],
    });
  }
  const roots: Node[] = [];
  for (const node of byId.values()) {
    if (node.parentId && byId.has(node.parentId)) {
      byId.get(node.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  return c.json({ comments: roots });
});

const researchCommentSchema = z.object({
  content: z.string().min(1).max(5000),
  parentId: z.string().optional(),
});

researchRouter.post(
  "/:slug/comments",
  requireAuth,
  zValidator("json", researchCommentSchema),
  async (c) => {
    const slug = c.req.param("slug")!;
    const { content, parentId } = c.req.valid("json");
    const user = c.get("user")!;
    const db = getDb();

    const paper = db
      .select({ id: researchPapers.id, authorId: researchPapers.authorId })
      .from(researchPapers)
      .where(eq(researchPapers.slug, slug))
      .get();
    if (!paper) return c.json({ error: "Paper not found" }, 404);

    let parentAuthorId: string | null = null;
    if (parentId) {
      const parent = db
        .select({
          id: newsComments.id,
          targetKind: newsComments.targetKind,
          targetId: newsComments.targetId,
          userId: newsComments.userId,
        })
        .from(newsComments)
        .where(eq(newsComments.id, parentId))
        .get();
      if (
        !parent ||
        parent.targetKind !== "research_paper" ||
        parent.targetId !== paper.id
      ) {
        return c.json({ error: "Parent comment not found" }, 400);
      }
      parentAuthorId = parent.userId;
    }

    const id = randomUUID();
    db.insert(newsComments)
      .values({
        id,
        articleId: null,
        parentId: parentId ?? null,
        userId: user.id,
        content,
        targetKind: "research_paper",
        targetId: paper.id,
      })
      .run();

    // Mention notifications first so we can dedupe.
    const mentioned = await notifyMentions({
      body: content,
      actorId: user.id,
      // Reuse the existing news_comment subject type — clients deep-
      // link via contextSlug, which carries the slug regardless of
      // whether it's a news article or a research paper.
      subjectType: "news_comment",
      subjectId: id,
      contextSlug: slug,
      preview: previewSnippet(content),
    });

    if (parentAuthorId && !mentioned.has(parentAuthorId)) {
      await notify({
        recipientId: parentAuthorId,
        actorId: user.id,
        kind: "comment_reply",
        subjectType: "news_comment",
        subjectId: id,
        contextSlug: slug,
        preview: previewSnippet(content),
      });
    } else if (
      !parentAuthorId &&
      paper.authorId !== user.id &&
      !mentioned.has(paper.authorId)
    ) {
      await notify({
        recipientId: paper.authorId,
        actorId: user.id,
        kind: "comment_reply",
        subjectType: "news_comment",
        subjectId: id,
        contextSlug: slug,
        preview: previewSnippet(content),
      });
    }

    return c.json({ commentId: id }, 201);
  },
);

// --- Sprint 23.5 — claim-anchored discussion threads (polymorphic on claim_threads + news_comments)

const claimThreadCreateSchema = z.object({
  exact: z.string().min(4).max(2000),
  prefix: z.string().max(80).optional().default(""),
  suffix: z.string().max(80).optional().default(""),
  body: z.string().min(1).max(5000),
});

researchRouter.post(
  "/:slug/claim-threads",
  requireAuth,
  zValidator("json", claimThreadCreateSchema),
  async (c) => {
    const slug = c.req.param("slug")!;
    const user = c.get("user")!;
    const { exact, prefix, suffix, body } = c.req.valid("json");
    const db = getDb();

    const paper = db
      .select({ id: researchPapers.id, authorId: researchPapers.authorId })
      .from(researchPapers)
      .where(eq(researchPapers.slug, slug))
      .get();
    if (!paper) return c.json({ error: "Paper not found" }, 404);

    const threadId = randomUUID();
    const commentId = randomUUID();
    db.insert(claimThreads)
      .values({
        id: threadId,
        articleId: null,
        authorId: user.id,
        exact,
        prefix,
        suffix,
        targetKind: "research_paper",
        targetId: paper.id,
      })
      .run();
    db.insert(newsComments)
      .values({
        id: commentId,
        articleId: null,
        parentId: null,
        userId: user.id,
        content: body,
        claimThreadId: threadId,
        targetKind: "research_paper",
        targetId: paper.id,
      })
      .run();

    if (paper.authorId !== user.id) {
      const mentioned = await notifyMentions({
        body,
        actorId: user.id,
        subjectType: "claim_thread",
        subjectId: threadId,
        contextSlug: slug,
        preview: previewSnippet(body),
      });
      if (!mentioned.has(paper.authorId)) {
        await notify({
          recipientId: paper.authorId,
          actorId: user.id,
          kind: "claim_thread_reply",
          subjectType: "claim_thread",
          subjectId: threadId,
          contextSlug: slug,
          preview: previewSnippet(`Claimed: "${exact.slice(0, 80)}"`),
        });
      }
    } else {
      await notifyMentions({
        body,
        actorId: user.id,
        subjectType: "claim_thread",
        subjectId: threadId,
        contextSlug: slug,
        preview: previewSnippet(body),
      });
    }

    return c.json({ threadId, commentId }, 201);
  },
);

researchRouter.get("/:slug/claim-threads", async (c) => {
  const slug = c.req.param("slug")!;
  const db = getDb();

  const paper = db
    .select({ id: researchPapers.id })
    .from(researchPapers)
    .where(eq(researchPapers.slug, slug))
    .get();
  if (!paper) return c.json({ error: "Paper not found" }, 404);

  const threads = db
    .select({
      id: claimThreads.id,
      authorId: claimThreads.authorId,
      authorUsername: users.username,
      exact: claimThreads.exact,
      prefix: claimThreads.prefix,
      suffix: claimThreads.suffix,
      createdAt: claimThreads.createdAt,
    })
    .from(claimThreads)
    .innerJoin(users, eq(claimThreads.authorId, users.id))
    .where(
      and(
        eq(claimThreads.targetKind, "research_paper"),
        eq(claimThreads.targetId, paper.id),
      ),
    )
    .orderBy(asc(claimThreads.createdAt))
    .all();

  if (threads.length === 0) return c.json({ threads: [] });

  const threadIds = threads.map((t) => t.id);
  const replyRows = db
    .select({
      id: newsComments.id,
      threadId: newsComments.claimThreadId,
      userId: newsComments.userId,
      username: users.username,
      content: newsComments.content,
      editedAt: newsComments.editedAt,
      createdAt: newsComments.createdAt,
    })
    .from(newsComments)
    .innerJoin(users, eq(newsComments.userId, users.id))
    .where(
      and(
        eq(newsComments.targetKind, "research_paper"),
        eq(newsComments.targetId, paper.id),
        sql`${newsComments.claimThreadId} IN (${sql.join(
          threadIds.map((id) => sql`${id}`),
          sql`, `,
        )})`,
      ),
    )
    .orderBy(asc(newsComments.createdAt))
    .all();

  const repliesByThread = new Map<string, typeof replyRows>();
  for (const r of replyRows) {
    if (!r.threadId) continue;
    const list = repliesByThread.get(r.threadId);
    if (list) list.push(r);
    else repliesByThread.set(r.threadId, [r]);
  }

  return c.json({
    threads: threads.map((t) => ({
      id: t.id,
      authorId: t.authorId,
      authorUsername: t.authorUsername,
      exact: t.exact,
      prefix: t.prefix,
      suffix: t.suffix,
      createdAt: t.createdAt,
      replies: (repliesByThread.get(t.id) ?? []).map((r) => ({
        id: r.id,
        userId: r.userId,
        username: r.username,
        content: r.content,
        editedAt: r.editedAt,
        createdAt: r.createdAt,
      })),
    })),
  });
});

const claimThreadReplySchema = z.object({
  content: z.string().min(1).max(5000),
});

researchRouter.post(
  "/:slug/claim-threads/:threadId/replies",
  requireAuth,
  zValidator("json", claimThreadReplySchema),
  async (c) => {
    const slug = c.req.param("slug")!;
    const threadId = c.req.param("threadId")!;
    const user = c.get("user")!;
    const { content } = c.req.valid("json");
    const db = getDb();

    const paper = db
      .select({ id: researchPapers.id })
      .from(researchPapers)
      .where(eq(researchPapers.slug, slug))
      .get();
    if (!paper) return c.json({ error: "Paper not found" }, 404);

    const thread = db
      .select({
        id: claimThreads.id,
        targetKind: claimThreads.targetKind,
        targetId: claimThreads.targetId,
        authorId: claimThreads.authorId,
      })
      .from(claimThreads)
      .where(eq(claimThreads.id, threadId))
      .get();
    if (
      !thread ||
      thread.targetKind !== "research_paper" ||
      thread.targetId !== paper.id
    ) {
      return c.json({ error: "Thread not found" }, 404);
    }

    const id = randomUUID();
    db.insert(newsComments)
      .values({
        id,
        articleId: null,
        parentId: null,
        userId: user.id,
        content,
        claimThreadId: threadId,
        targetKind: "research_paper",
        targetId: paper.id,
      })
      .run();

    const mentioned = await notifyMentions({
      body: content,
      actorId: user.id,
      subjectType: "claim_thread",
      subjectId: threadId,
      contextSlug: slug,
      preview: previewSnippet(content),
    });

    const participants = db
      .select({ userId: newsComments.userId })
      .from(newsComments)
      .where(eq(newsComments.claimThreadId, threadId))
      .all();
    const recipients = new Set<string>([thread.authorId]);
    for (const p of participants) recipients.add(p.userId);
    recipients.delete(user.id);
    for (const m of mentioned) recipients.delete(m);

    for (const recipientId of recipients) {
      await notify({
        recipientId,
        actorId: user.id,
        kind: "claim_thread_reply",
        subjectType: "claim_thread",
        subjectId: threadId,
        contextSlug: slug,
        preview: previewSnippet(content),
      });
    }

    return c.json({ commentId: id }, 201);
  },
);

// --- Sprint 23.5 — runnable artifacts (polymorphic on runnable_artifacts)

const ARTIFACT_KINDS = ["github", "colab", "docker", "dataset", "arxiv", "other"] as const;

const artifactSchema = z.object({
  kind: z.enum(ARTIFACT_KINDS),
  url: z.string().url().max(500),
  label: z.string().min(1).max(120),
  description: z.string().max(800).optional(),
});

researchRouter.post(
  "/:slug/artifacts",
  requireAuth,
  zValidator("json", artifactSchema),
  async (c) => {
    const slug = c.req.param("slug")!;
    const user = c.get("user")!;
    const { kind, url, label, description } = c.req.valid("json");
    const db = getDb();

    const paper = db
      .select({
        id: researchPapers.id,
        authorId: researchPapers.authorId,
        coauthorsJson: researchPapers.coauthorsJson,
      })
      .from(researchPapers)
      .where(eq(researchPapers.slug, slug))
      .get();
    if (!paper) return c.json({ error: "Paper not found" }, 404);

    const isAuthor = paper.authorId === user.id;
    const coauthors = safeParseStrArray(paper.coauthorsJson);
    const isCoauthor = coauthors.includes(user.username);
    if (!isAuthor && !isCoauthor) {
      return c.json({ error: "Only the author or coauthors can attach artifacts." }, 403);
    }

    const id = randomUUID();
    db.insert(runnableArtifacts)
      .values({
        id,
        articleId: null,
        kind,
        url,
        label: label.trim(),
        description: description?.trim() || null,
        targetKind: "research_paper",
        targetId: paper.id,
      })
      .run();
    return c.json({ artifactId: id }, 201);
  },
);

researchRouter.delete("/:slug/artifacts/:id", requireAuth, async (c) => {
  const slug = c.req.param("slug")!;
  const id = c.req.param("id")!;
  const user = c.get("user")!;
  const db = getDb();

  const paper = db
    .select({
      id: researchPapers.id,
      authorId: researchPapers.authorId,
      coauthorsJson: researchPapers.coauthorsJson,
    })
    .from(researchPapers)
    .where(eq(researchPapers.slug, slug))
    .get();
  if (!paper) return c.json({ error: "Paper not found" }, 404);

  const isAuthor = paper.authorId === user.id;
  const coauthors = safeParseStrArray(paper.coauthorsJson);
  const isCoauthor = coauthors.includes(user.username);
  if (!isAuthor && !isCoauthor) {
    return c.json({ error: "Only the author or coauthors can remove artifacts." }, 403);
  }

  const existing = db
    .select({
      id: runnableArtifacts.id,
      targetKind: runnableArtifacts.targetKind,
      targetId: runnableArtifacts.targetId,
    })
    .from(runnableArtifacts)
    .where(eq(runnableArtifacts.id, id))
    .get();
  if (!existing) return c.json({ error: "Artifact not found" }, 404);
  if (
    existing.targetKind !== "research_paper" ||
    existing.targetId !== paper.id
  ) {
    return c.json({ error: "Artifact does not belong to this paper" }, 400);
  }

  db.delete(runnableArtifacts).where(eq(runnableArtifacts.id, id)).run();
  return c.json({ ok: true });
});

researchRouter.get("/:slug/artifacts", async (c) => {
  const slug = c.req.param("slug")!;
  const db = getDb();
  const paper = db
    .select({ id: researchPapers.id })
    .from(researchPapers)
    .where(eq(researchPapers.slug, slug))
    .get();
  if (!paper) return c.json({ error: "Paper not found" }, 404);

  const rows = db
    .select({
      id: runnableArtifacts.id,
      kind: runnableArtifacts.kind,
      url: runnableArtifacts.url,
      label: runnableArtifacts.label,
      description: runnableArtifacts.description,
      createdAt: runnableArtifacts.createdAt,
    })
    .from(runnableArtifacts)
    .where(
      and(
        eq(runnableArtifacts.targetKind, "research_paper"),
        eq(runnableArtifacts.targetId, paper.id),
      ),
    )
    .orderBy(asc(runnableArtifacts.createdAt))
    .all();
  return c.json({ artifacts: rows });
});

// --- Sprint 23.5 — reproductions (polymorphic on reproductions)

const reproductionSchema = z.object({
  artifactId: z.string().optional(),
  status: z.enum(["success", "partial", "failed"]),
  notes: z.string().max(2000).optional(),
  evidenceUrl: z.string().url().max(500).optional(),
});

researchRouter.post(
  "/:slug/reproductions",
  requireAuth,
  zValidator("json", reproductionSchema),
  async (c) => {
    const slug = c.req.param("slug")!;
    const user = c.get("user")!;
    const { artifactId, status, notes, evidenceUrl } = c.req.valid("json");
    const db = getDb();

    const paper = db
      .select({
        id: researchPapers.id,
        title: researchPapers.title,
        authorId: researchPapers.authorId,
      })
      .from(researchPapers)
      .where(eq(researchPapers.slug, slug))
      .get();
    if (!paper) return c.json({ error: "Paper not found" }, 404);

    if (paper.authorId === user.id) {
      return c.json({ error: "You can't reproduce your own paper." }, 400);
    }

    if (artifactId) {
      const a = db
        .select({
          id: runnableArtifacts.id,
          targetKind: runnableArtifacts.targetKind,
          targetId: runnableArtifacts.targetId,
        })
        .from(runnableArtifacts)
        .where(eq(runnableArtifacts.id, artifactId))
        .get();
      if (
        !a ||
        a.targetKind !== "research_paper" ||
        a.targetId !== paper.id
      ) {
        return c.json({ error: "Artifact not found on this paper" }, 400);
      }
    }

    const existing = db
      .select({ id: reproductions.id })
      .from(reproductions)
      .where(
        and(
          eq(reproductions.targetKind, "research_paper"),
          eq(reproductions.targetId, paper.id),
          eq(reproductions.reproducerId, user.id),
        ),
      )
      .get();
    if (existing) {
      return c.json(
        { error: "You've already submitted a receipt for this paper." },
        409,
      );
    }

    const id = randomUUID();
    db.insert(reproductions)
      .values({
        id,
        articleId: null,
        artifactId: artifactId ?? null,
        reproducerId: user.id,
        status,
        notes: notes?.trim() || null,
        evidenceUrl: evidenceUrl ?? null,
        targetKind: "research_paper",
        targetId: paper.id,
      })
      .run();

    const verdict =
      status === "success" ? "✓ reproduced" : status === "partial" ? "~ partial" : "✗ failed";
    await notify({
      recipientId: paper.authorId,
      actorId: user.id,
      kind: "article_reproduced",
      subjectType: "reproduction",
      subjectId: id,
      contextSlug: slug,
      preview: previewSnippet(`${verdict}: "${paper.title}"`),
    });

    return c.json({ reproductionId: id }, 201);
  },
);

researchRouter.get("/:slug/reproductions", async (c) => {
  const slug = c.req.param("slug")!;
  const db = getDb();
  const paper = db
    .select({ id: researchPapers.id })
    .from(researchPapers)
    .where(eq(researchPapers.slug, slug))
    .get();
  if (!paper) return c.json({ error: "Paper not found" }, 404);

  const rows = db
    .select({
      id: reproductions.id,
      artifactId: reproductions.artifactId,
      reproducerId: reproductions.reproducerId,
      reproducerUsername: users.username,
      status: reproductions.status,
      notes: reproductions.notes,
      evidenceUrl: reproductions.evidenceUrl,
      createdAt: reproductions.createdAt,
    })
    .from(reproductions)
    .innerJoin(users, eq(reproductions.reproducerId, users.id))
    .where(
      and(
        eq(reproductions.targetKind, "research_paper"),
        eq(reproductions.targetId, paper.id),
      ),
    )
    .orderBy(desc(reproductions.createdAt))
    .all();

  const stats = { total: rows.length, success: 0, partial: 0, failed: 0 };
  for (const r of rows) {
    if (r.status === "success") stats.success++;
    else if (r.status === "partial") stats.partial++;
    else if (r.status === "failed") stats.failed++;
  }

  return c.json({ reproductions: rows, stats });
});

// Suppress unused-import warnings.
void or;