// Sprint 83 — AI authoring helpers + symptom-driven troubleshooting.
//
// Two flavors:
//   - SSE streaming endpoints that draft Markdown for protocols /
//     equipment manuals from a one-line spec (mirrors the news /
//     research wizard pattern).
//   - A semantic search endpoint that crawls protocolSteps +
//     equipment + the misconception catalog so an intern with "my
//     gel didn't run" gets routed to the right verification step or
//     known-issue note.

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, eq, inArray } from "drizzle-orm";
import { randomUUID } from "crypto";
import { getAIProvider } from "@axiomic/ai";
import {
  equipment,
  getDb,
  misconceptionCatalog,
  protocolSteps,
  protocols,
} from "@axiomic/db";
import { getSessionUser, requireAuth } from "../middleware/auth";
import { checkRateLimit, rateLimitIdentity } from "../lib/rateLimit";
import { cosineSimilarity } from "../lib/searchIndex";
import type { Env } from "../env";

export const aiLabRouter = new Hono<Env>();
export const labTroubleshootRouter = new Hono<Env>();
// Per-protocol troubleshooting CRUD — mounted under /lab so the
// public path is /lab/protocols/:slug/troubleshooting (matches the
// rest of the /lab namespace).
export const labProtocolsTroubleshootingRouter = new Hono<Env>();

// --- shared SSE wrapper --------------------------------------------

function streamingResponse(
  system: string,
  userMessage: string,
): Response {
  const provider = getAIProvider();
  let canceled = false;
  const abortCtrl = new AbortController();
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const safeEnqueue = (chunk: Uint8Array) => {
        if (canceled) return;
        try {
          controller.enqueue(chunk);
        } catch {
          canceled = true;
          abortCtrl.abort();
        }
      };
      try {
        await provider.stream({
          system,
          messages: [{ role: "user", content: userMessage }],
          signal: abortCtrl.signal,
          onToken: (token) => {
            safeEnqueue(
              encoder.encode(`data: ${JSON.stringify({ token })}\n\n`),
            );
          },
        });
      } catch (err: any) {
        if (!canceled) {
          // Heuristic fallback: when the provider is down we still
          // want the wizard to render *something*, so the client can
          // skim a placeholder draft and keep editing. Ships the
          // fallback as a single token then closes.
          const fallback =
            FALLBACK_MARKER + (err?.message ?? "stream failed");
          safeEnqueue(
            encoder.encode(
              `data: ${JSON.stringify({ token: fallback })}\n\n`,
            ),
          );
        }
      }
      safeEnqueue(encoder.encode("data: [DONE]\n\n"));
      if (!canceled) {
        try {
          controller.close();
        } catch {
          // already closed
        }
      }
    },
    cancel() {
      canceled = true;
      abortCtrl.abort();
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

const FALLBACK_MARKER = "[ai_unavailable] ";

// --- POST /ai/lab/draft-protocol -----------------------------------

const draftProtocolSchema = z.object({
  spec: z.string().min(3).max(500),
  discipline: z
    .enum([
      "biology",
      "chemistry",
      "mechanical",
      "electrical",
      "materials",
      "cs-lab",
      "physics",
    ])
    .optional()
    .default("biology"),
});

aiLabRouter.post(
  "/draft-protocol",
  zValidator("json", draftProtocolSchema),
  async (c) => {
    const { spec, discipline } = c.req.valid("json");
    const user = await getSessionUser(c);
    const rateLimitKey = rateLimitIdentity(c, user?.id);
    if (!checkRateLimit(`lab-draft:${rateLimitKey}`, 8, 60_000)) {
      return c.json({ error: "Rate limited. Try again in a minute." }, 429);
    }

    const system = `You draft hands-on lab protocols for the Axiomic learning platform. Voice: precise, safety-first, written like a senior scientist mentoring an intern.

Output rules:
- Markdown only. No frontmatter, no title heading — those are set in the UI.
- Open with a one-paragraph summary describing what the protocol does + when to use it.
- Then a "## Hazards" section flagging key safety concerns.
- Then a "## Steps" section with exactly 5 numbered steps. Each step gets:
    - a one-line title prefixed with the number,
    - a short instruction body (2-4 sentences),
    - an italic "verify:" line describing how the intern knows the step worked.
- Use \`code spans\` for reagent volumes and equipment slugs. Use $...$ for inline math when relevant.
- Discipline context: ${discipline}.
- DO NOT invent specific brand-named consumables you can't verify; prefer generic descriptions.
- Aim for ~250-450 words total.`;

    return streamingResponse(system, spec);
  },
);

// --- POST /ai/lab/draft-equipment-manual ---------------------------

const draftManualSchema = z.object({
  manufacturer: z.string().min(1).max(120),
  model: z.string().min(1).max(120),
  notes: z.string().max(500).optional(),
});

aiLabRouter.post(
  "/draft-equipment-manual",
  zValidator("json", draftManualSchema),
  async (c) => {
    const { manufacturer, model, notes } = c.req.valid("json");
    const user = await getSessionUser(c);
    const rateLimitKey = rateLimitIdentity(c, user?.id);
    if (!checkRateLimit(`lab-draft:${rateLimitKey}`, 8, 60_000)) {
      return c.json({ error: "Rate limited. Try again in a minute." }, 429);
    }

    const system = `You draft equipment manuals for a teaching lab. Voice: like a grad student introducing a new intern to the gear. Practical, safety-aware, no marketing fluff.

Output rules:
- Markdown only. No frontmatter, no title heading.
- Open with a one-paragraph "what is this and when do you reach for it" summary.
- Then "## Daily checks" — 3-5 bullet items the intern verifies before each use.
- Then "## Common operations" — 2-4 named procedures with short instructions.
- Then "## Common faults" — 2-4 named symptoms with quick fixes.
- Then "## Hazards" — key safety considerations.
- DO NOT fabricate model-specific specs you can't verify. Prefer phrases like "consult the manufacturer datasheet" over made-up numbers.
- Aim for ~300-500 words.`;

    const userMessage = `Manufacturer: ${manufacturer}\nModel: ${model}${notes ? `\nExtra context: ${notes}` : ""}`;
    return streamingResponse(system, userMessage);
  },
);

// --- POST /lab/protocols/:slug/troubleshooting ---------------------
//
// Author seeds a "common mistake" entry persisted to the
// misconceptionCatalog (conceptSlug='protocol-${slug}'). The AI
// tutor can then coach against it via the existing misconception
// pipeline. Author-only.

const troubleshootSeedSchema = z.object({
  key: z
    .string()
    .min(2)
    .max(80)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "key must be kebab-case"),
  label: z.string().min(2).max(160),
  description: z.string().min(2).max(2000),
  correctionPromptTemplate: z.string().max(2000).optional(),
});

labProtocolsTroubleshootingRouter.post(
  "/protocols/:slug/troubleshooting",
  requireAuth,
  zValidator("json", troubleshootSeedSchema),
  async (c) => {
    const slug = c.req.param("slug")!;
    const user = c.get("user")!;
    const data = c.req.valid("json");
    const db = getDb();

    const proto = db
      .select({
        id: protocols.id,
        slug: protocols.slug,
        title: protocols.title,
        authorId: protocols.authorId,
      })
      .from(protocols)
      .where(eq(protocols.slug, slug))
      .get();
    if (!proto) return c.json({ error: "Protocol not found" }, 404);
    if (proto.authorId !== user.id) {
      return c.json(
        { error: "Only the protocol author can seed troubleshooting." },
        403,
      );
    }

    const conceptSlug = `protocol-${proto.slug}`;
    const existing = db
      .select({ id: misconceptionCatalog.id })
      .from(misconceptionCatalog)
      .where(
        and(
          eq(misconceptionCatalog.conceptSlug, conceptSlug),
          eq(misconceptionCatalog.key, data.key),
        ),
      )
      .get();

    if (existing) {
      db.update(misconceptionCatalog)
        .set({
          label: data.label,
          description: data.description,
          correctionPromptTemplate:
            data.correctionPromptTemplate ?? "",
        })
        .where(eq(misconceptionCatalog.id, existing.id))
        .run();
      return c.json({ ok: true, id: existing.id, updated: true });
    }

    const id = randomUUID();
    db.insert(misconceptionCatalog)
      .values({
        id,
        conceptSlug,
        key: data.key,
        label: data.label,
        description: data.description,
        correctionPromptTemplate:
          data.correctionPromptTemplate ?? "",
      })
      .run();
    return c.json({ ok: true, id, updated: false }, 201);
  },
);

// --- GET /lab/protocols/:slug/troubleshooting ----------------------

labProtocolsTroubleshootingRouter.get(
  "/protocols/:slug/troubleshooting",
  async (c) => {
    const slug = c.req.param("slug")!;
    const db = getDb();
    const proto = db
      .select({ id: protocols.id, slug: protocols.slug })
      .from(protocols)
      .where(eq(protocols.slug, slug))
      .get();
    if (!proto) return c.json({ error: "Protocol not found" }, 404);
    const rows = db
      .select({
        id: misconceptionCatalog.id,
        key: misconceptionCatalog.key,
        label: misconceptionCatalog.label,
        description: misconceptionCatalog.description,
      })
      .from(misconceptionCatalog)
      .where(eq(misconceptionCatalog.conceptSlug, `protocol-${proto.slug}`))
      .all();
    return c.json({ entries: rows });
  },
);

// --- GET /lab/troubleshoot?q= --------------------------------------
//
// Embedding-based search across:
//   - protocolSteps.verificationMd   (linked back to the protocol)
//   - equipment.hazardsMd / manualMd (linked back to the equipment)
//   - misconceptionCatalog (lab-protocol entries)
//
// Holds a tiny per-process cache of the candidate embeddings; refreshed
// on a 5-minute TTL so newly-authored content surfaces quickly without
// the lab corpus being re-embedded on every search call.

interface TroubleshootCandidate {
  kind: "protocol-step" | "equipment" | "misconception";
  slug: string; // protocol slug or equipment slug or misconception key
  title: string; // protocol/equipment title (for grouping in UI)
  snippet: string; // step title + verification, or hazard, or misconception label
  href: string;
  vector: number[];
}

let candidateCache: TroubleshootCandidate[] | null = null;
let candidateBuiltAt = 0;
const CACHE_TTL_MS = 5 * 60_000;

async function safeEmbed(text: string): Promise<number[] | null> {
  try {
    return await getAIProvider().embed(text);
  } catch {
    return null;
  }
}

async function buildCandidates(): Promise<TroubleshootCandidate[]> {
  const db = getDb();
  const out: TroubleshootCandidate[] = [];

  // Protocol steps with non-empty verifications.
  const stepRows = db
    .select({
      stepId: protocolSteps.id,
      stepTitle: protocolSteps.title,
      verificationMd: protocolSteps.verificationMd,
      ordinal: protocolSteps.ordinal,
      protocolId: protocolSteps.protocolId,
    })
    .from(protocolSteps)
    .all();
  const protocolIds = [...new Set(stepRows.map((r) => r.protocolId))];
  const protocolsById = new Map<
    string,
    { slug: string; title: string; status: string }
  >();
  if (protocolIds.length > 0) {
    db.select({
      id: protocols.id,
      slug: protocols.slug,
      title: protocols.title,
      status: protocols.status,
    })
      .from(protocols)
      .where(inArray(protocols.id, protocolIds))
      .all()
      .forEach((p) =>
        protocolsById.set(p.id, {
          slug: p.slug,
          title: p.title,
          status: p.status,
        }),
      );
  }
  for (const s of stepRows) {
    const proto = protocolsById.get(s.protocolId);
    if (!proto || proto.status !== "published") continue;
    const text = s.verificationMd?.trim();
    if (!text) continue;
    const snippet = `${s.stepTitle}: ${text}`.slice(0, 500);
    const vector = await safeEmbed(`${proto.title} ${s.stepTitle} ${text}`);
    if (!vector) continue;
    out.push({
      kind: "protocol-step",
      slug: proto.slug,
      title: proto.title,
      snippet,
      href: `/lab/protocols/${proto.slug}#step-${s.ordinal}`,
      vector,
    });
  }

  // Equipment hazards + manual snippets.
  const equipmentRows = db
    .select({
      id: equipment.id,
      slug: equipment.slug,
      title: equipment.title,
      hazardsMd: equipment.hazardsMd,
      manualMd: equipment.manualMd,
      status: equipment.status,
    })
    .from(equipment)
    .all();
  for (const e of equipmentRows) {
    if (e.status !== "active") continue;
    const blob = `${e.hazardsMd ?? ""}\n${(e.manualMd ?? "").slice(0, 1500)}`;
    if (!blob.trim()) continue;
    const snippet = (e.hazardsMd?.trim() || e.manualMd || "").slice(0, 500);
    const vector = await safeEmbed(`${e.title} ${blob}`);
    if (!vector) continue;
    out.push({
      kind: "equipment",
      slug: e.slug,
      title: e.title,
      snippet,
      href: `/lab/equipment/${e.slug}`,
      vector,
    });
  }

  // Lab-protocol misconception entries (S83 troubleshooting seeds).
  const miscRows = db
    .select({
      id: misconceptionCatalog.id,
      key: misconceptionCatalog.key,
      label: misconceptionCatalog.label,
      description: misconceptionCatalog.description,
      conceptSlug: misconceptionCatalog.conceptSlug,
    })
    .from(misconceptionCatalog)
    .all();
  for (const m of miscRows) {
    if (!m.conceptSlug.startsWith("protocol-")) continue;
    const protoSlug = m.conceptSlug.slice("protocol-".length);
    const blob = `${m.label}\n${m.description}`;
    const vector = await safeEmbed(`${m.label} ${m.description}`);
    if (!vector) continue;
    out.push({
      kind: "misconception",
      slug: m.key,
      title: m.label,
      snippet: m.description.slice(0, 500),
      href: `/lab/protocols/${protoSlug}#troubleshoot-${m.key}`,
      vector,
    });
  }

  return out;
}

async function getCandidates(): Promise<TroubleshootCandidate[]> {
  const now = Date.now();
  if (candidateCache && now - candidateBuiltAt < CACHE_TTL_MS) {
    return candidateCache;
  }
  const built = await buildCandidates();
  candidateCache = built;
  candidateBuiltAt = now;
  return built;
}

// Test/admin hook so route tests can rebuild after seeding new
// content without sleeping out the TTL.
export function invalidateTroubleshootCache(): void {
  candidateCache = null;
  candidateBuiltAt = 0;
}

const troubleshootSchema = z.object({
  q: z.string().min(2).max(200),
  limit: z.coerce.number().int().min(1).max(20).optional().default(8),
});

labTroubleshootRouter.get(
  "/troubleshoot",
  zValidator("query", troubleshootSchema),
  async (c) => {
    const { q, limit } = c.req.valid("query");
    const queryEmbed = await safeEmbed(q);
    const candidates = await getCandidates();
    const qLower = q.toLowerCase();

    const scored = candidates
      .map((cand) => {
        const semantic = queryEmbed
          ? cosineSimilarity(queryEmbed, cand.vector)
          : 0;
        const keywordHit =
          cand.title.toLowerCase().includes(qLower) ||
          cand.snippet.toLowerCase().includes(qLower);
        let score = semantic;
        if (keywordHit) score += 0.4;
        return { cand, score, keywordHit };
      })
      .filter((s) => s.score > 0.18 || s.keywordHit)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    return c.json({
      query: q,
      results: scored.map((s) => ({
        kind: s.cand.kind,
        slug: s.cand.slug,
        title: s.cand.title,
        snippet: s.cand.snippet,
        href: s.cand.href,
        score: Math.round(s.score * 1000) / 1000,
      })),
    });
  },
);
