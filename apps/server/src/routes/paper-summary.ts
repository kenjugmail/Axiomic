// Sprint 70 — Tier-aware AI summary for research papers.
//
// Streams a markdown summary scoped to one of three reader tiers:
// 'intro', 'undergrad', 'grad'. Cached in `paper_summaries` keyed by
// (paperKind, paperId, tier, modelId) so toggling tiers in the drawer
// doesn't re-burn inference. Cache hits return the stored summary as a
// single SSE token; misses stream from the provider and persist on
// completion.

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import { getAIProvider } from "@axiomic/ai";
import { getDb, paperSummaries, researchPapers } from "@axiomic/db";
import { logger } from "../lib/logger";
import { requireAuth } from "../middleware/auth";
import type { Env } from "../env";

export const paperSummaryRouter = new Hono<Env>();

const TIERS = ["intro", "undergrad", "grad"] as const;
type Tier = (typeof TIERS)[number];

// Sprint 78 — guard against attacker-controlled model strings used as
// part of the cache key. Only models the provider lists are
// acceptable; anything else falls through to `defaultModel`.
async function resolveSafeModel(
  override: string | undefined,
): Promise<string> {
  const provider = getAIProvider();
  let defaultModel = "default";
  const allowed = new Set<string>();
  try {
    const { available, default: dflt } = await provider.listModels();
    defaultModel = dflt;
    for (const m of available) allowed.add(m.id);
  } catch {
    return "default";
  }
  if (override && allowed.has(override)) return override;
  return defaultModel;
}

const requestSchema = z.object({
  tier: z.enum(TIERS).default("undergrad"),
  // Optional model override. Defaults to the provider's configured
  // default model.
  model: z.string().optional(),
});

interface PaperRow {
  id: string;
  slug: string;
  title: string;
  abstract: string;
  summary: string;
  contentIntro: string;
  contentUndergrad: string;
  contentGrad: string;
  format: string;
}

function pickBody(p: PaperRow, tier: Tier): string {
  // Prefer the requested tier's body; fall back through the others if
  // it's empty (older papers may have a single canonical body only).
  if (tier === "intro" && p.contentIntro.trim().length > 0) return p.contentIntro;
  if (tier === "grad" && p.contentGrad.trim().length > 0) return p.contentGrad;
  if (tier === "undergrad" && p.contentUndergrad.trim().length > 0)
    return p.contentUndergrad;
  return (
    p.contentUndergrad ||
    p.contentIntro ||
    p.contentGrad ||
    p.abstract ||
    p.summary
  );
}

function buildSystemPrompt(tier: Tier): string {
  const audience =
    tier === "intro"
      ? "a curious high-school student new to the field"
      : tier === "grad"
        ? "a graduate researcher already fluent in the field's terminology"
        : "an undergraduate familiar with the basics but not the latest results";
  return `You are summarizing a research paper for ${audience}.
Write a concise markdown summary with these sections, in order:
- **What it shows** (2-3 sentences)
- **Why it matters** (2-3 sentences)
- **One key idea to remember** (1 sentence)

Constraints:
- Use markdown headers \`## What it shows\`, \`## Why it matters\`, \`## One key idea to remember\`.
- Adapt vocabulary to the audience: ${
    tier === "intro"
      ? "avoid jargon; explain technical terms inline."
      : tier === "grad"
        ? "use the field's standard terminology without lengthy explanation."
        : "introduce technical terms briefly when first used."
  }
- Do NOT invent results not in the source.
- Keep the total under 250 words.`;
}

function buildUserMessage(p: PaperRow, tier: Tier): string {
  const body = pickBody(p, tier);
  return `Title: ${p.title}

Abstract:
${p.abstract.slice(0, 1500)}

Body:
${body.slice(0, 6000)}`;
}

paperSummaryRouter.post(
  "/:slug/summary",
  // Sprint 78 — gate behind auth so anonymous attackers can't burn
  // unbounded LLM inference by streaming summaries with an arbitrary
  // model string as cache key.
  requireAuth,
  zValidator("json", requestSchema),
  async (c) => {
    const slug = c.req.param("slug");
    const { tier, model: modelOverride } = c.req.valid("json");
    const db = getDb();

    const paper = db
      .select({
        id: researchPapers.id,
        slug: researchPapers.slug,
        title: researchPapers.title,
        abstract: researchPapers.abstract,
        summary: researchPapers.summary,
        contentIntro: researchPapers.contentIntro,
        contentUndergrad: researchPapers.contentUndergrad,
        contentGrad: researchPapers.contentGrad,
        format: researchPapers.format,
        status: researchPapers.status,
      })
      .from(researchPapers)
      .where(eq(researchPapers.slug, slug))
      .get();

    if (!paper || paper.status !== "published") {
      return c.json({ error: "Paper not found" }, 404);
    }

    const provider = getAIProvider();
    const resolvedModel = await resolveSafeModel(modelOverride);
    const modelId = resolvedModel;

    // Cache lookup. A hit returns the cached summary as a single SSE
    // chunk so the client can render it immediately without paying
    // inference latency on tier toggles.
    const cached = db
      .select({ summaryMd: paperSummaries.summaryMd })
      .from(paperSummaries)
      .where(
        and(
          eq(paperSummaries.paperKind, "research"),
          eq(paperSummaries.paperId, paper.id),
          eq(paperSummaries.tier, tier),
          eq(paperSummaries.modelId, modelId),
        ),
      )
      .get();

    if (cached) {
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ token: cached.summaryMd, cached: true })}\n\n`,
            ),
          );
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        },
      });
      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
          "X-Cache-Hit": "1",
        },
      });
    }

    const system = buildSystemPrompt(tier);
    const userMessage = buildUserMessage(paper, tier);

    let canceled = false;
    const abortCtrl = new AbortController();
    const collected: string[] = [];

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
            model: resolvedModel,
            signal: abortCtrl.signal,
            onToken: (token) => {
              collected.push(token);
              safeEnqueue(
                encoder.encode(`data: ${JSON.stringify({ token })}\n\n`),
              );
            },
          });
          if (!canceled) {
            // Cap stored summary at ~8KB. The prompt asks for under
            // 250 words; a runaway model emitting megabytes would
            // otherwise be replayed on every cache hit and bloat the
            // SSE payload.
            const summary = collected.join("").slice(0, 8000);
            try {
              db.insert(paperSummaries)
                .values({
                  id: randomUUID(),
                  paperKind: "research",
                  paperId: paper.id,
                  tier,
                  modelId,
                  summaryMd: summary,
                })
                .run();
            } catch {
              // A race where two concurrent requests both miss + try to
              // insert is fine; the unique index will reject one. The
              // user still got their stream.
            }
          }
          safeEnqueue(encoder.encode("data: [DONE]\n\n"));
        } catch (err) {
          if (canceled) return;
          const e = err as Error | undefined;
          logger.error({
            kind: "ai_stream_failed",
            endpoint: "/research/:slug/summary",
            slug,
            tier,
            errorClass: e?.name ?? "unknown",
            errorMessage: e?.message ?? String(err),
          });
          safeEnqueue(
            encoder.encode(
              `data: ${JSON.stringify({ error: "Stream failed" })}\n\n`,
            ),
          );
        }
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
  },
);

// GET variant returns the cached summary without triggering a fresh
// generation. Useful for "preview" UI that wants to know if a summary
// exists without paying inference.
paperSummaryRouter.get(
  "/:slug/summary",
  zValidator(
    "query",
    z.object({
      tier: z.enum(TIERS).default("undergrad"),
      model: z.string().optional(),
    }),
  ),
  async (c) => {
    const slug = c.req.param("slug");
    const { tier, model: modelOverride } = c.req.valid("query");
    const db = getDb();

    const paper = db
      .select({ id: researchPapers.id, status: researchPapers.status })
      .from(researchPapers)
      .where(eq(researchPapers.slug, slug))
      .get();
    if (!paper || paper.status !== "published") {
      return c.json({ error: "Paper not found" }, 404);
    }

    // GET path uses the same allowlist as POST so the cache key
    // can't be poisoned with arbitrary attacker-controlled strings.
    const modelId = await resolveSafeModel(modelOverride);

    const cached = db
      .select({
        summaryMd: paperSummaries.summaryMd,
        generatedAt: paperSummaries.generatedAt,
      })
      .from(paperSummaries)
      .where(
        and(
          eq(paperSummaries.paperKind, "research"),
          eq(paperSummaries.paperId, paper.id),
          eq(paperSummaries.tier, tier),
          eq(paperSummaries.modelId, modelId ?? "default"),
        ),
      )
      .get();

    if (!cached) {
      return c.json({ cached: false });
    }
    return c.json({
      cached: true,
      tier,
      modelId,
      summaryMd: cached.summaryMd,
      generatedAt: cached.generatedAt,
    });
  },
);
