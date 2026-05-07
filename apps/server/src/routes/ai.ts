import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { getAIProvider } from "@axiomic/ai";
import { getDb, wikiPages, pageVersions, newsArticles, researchPapers, users } from "@axiomic/db";
import { eq, desc, sql } from "drizzle-orm";
import { getSessionUser, requireAuth } from "../middleware/auth";
import { buildCoachContext, summarizeCoachContext } from "../lib/userContext";
import { getOrEmbed } from "../lib/embeddingCache";
import { buildTutorModePrompt } from "../lib/tutorModes";

const ai = new Hono();

// Rate limiting state (simple in-memory)
const rateLimits = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const entry = rateLimits.get(key);
  if (!entry || now > entry.resetAt) {
    rateLimits.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (entry.count >= max) return false;
  entry.count++;
  return true;
}

// Stream chat
const chatSchema = z.object({
  pageSlug: z.string(),
  tier: z.string(),
  messages: z.array(
    z.object({
      role: z.enum(["user", "assistant"]),
      content: z.string(),
    })
  ),
  // Sprint 30 — optional tutor mode + per-mode context.
  mode: z
    .enum(["socratic", "misconception", "bridge", "debate", "contribution"])
    .optional(),
  modeContext: z
    .object({
      diagnosisId: z.string().optional(),
      forumTopicId: z.string().optional(),
      capstoneSlug: z.string().optional(),
      milestoneId: z.string().optional(),
      pageSlug: z.string().optional(),
    })
    .optional(),
});

ai.post("/chat", zValidator("json", chatSchema), async (c) => {
  const { pageSlug, tier, messages, mode, modeContext } = c.req.valid("json");
  const user = await getSessionUser(c);
  const rateLimitKey = user?.id || c.req.header("x-forwarded-for") || "anonymous";

  if (!checkRateLimit(`chat:${rateLimitKey}`, 30, 60000)) {
    return c.json({ error: "Rate limited. Try again in a minute." }, 429);
  }

  const db = getDb();
  const provider = getAIProvider();

  // Get page content for context
  let pageContent = "";
  let pageTitle = "";
  const page = db.select().from(wikiPages).where(eq(wikiPages.slug, pageSlug)).get();
  if (page) {
    const version = db
      .select()
      .from(pageVersions)
      .where(eq(pageVersions.pageId, page.id))
      .orderBy(desc(pageVersions.version))
      .get();
    if (version) {
      const contentMap: Record<string, string> = {
        intro: version.contentIntro,
        undergrad: version.contentUndergrad,
        grad: version.contentGrad,
      };
      pageContent = contentMap[tier] || version.contentIntro;
      pageTitle = page.title;
    }
  }

  // Sprint 18 — fold the user's coaching context into the system
  // prompt when we have a session. Keeps the chat behavior identical
  // for anonymous viewers; signed-in users with mistakes / weak
  // concepts get a Socratic, state-aware tutor.
  let coachSummary = "";
  if (user) {
    try {
      const ctx = buildCoachContext(user.id, { pageSlug });
      coachSummary = summarizeCoachContext(ctx);
    } catch {
      // ignore — fall back to the generic prompt
    }
  }

  // Sprint 30 — optional tutor-mode addendum on top of the base prompt.
  let modePrompt = "";
  if (mode) {
    const result = buildTutorModePrompt(
      mode,
      { ...(modeContext ?? {}), pageSlug },
      user?.id ?? null,
    );
    if (result.invalid) {
      return c.json({ error: result.invalid }, 400);
    }
    modePrompt = result.prompt;
  }

  const system = `You are an AI tutor on the Axiomic learning platform. You are helping the user understand the topic "${pageTitle}".

page: ${pageSlug}
tier: ${tier}

Current page content:
${pageContent.slice(0, 3000)}

Guidelines:
- Adjust your language to the ${tier} level
- Reference specific parts of the page content when relevant
- Be encouraging but precise
- If asked to quiz, generate relevant questions
- Format responses with markdown and LaTeX where appropriate${
    coachSummary ? `\n\n${coachSummary}` : ""
  }${modePrompt ? `\n\n${modePrompt}` : ""}`;

  // SSE stream
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      try {
        await provider.stream({
          system,
          messages,
          onToken: (token) => {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ token })}\n\n`));
          },
        });
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      } catch (err) {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ error: "Stream failed" })}\n\n`)
        );
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
});

// Related pages via embeddings
ai.get("/related/:slug", async (c) => {
  const slug = c.req.param("slug");
  const db = getDb();
  const provider = getAIProvider();

  const page = db.select().from(wikiPages).where(eq(wikiPages.slug, slug)).get();
  if (!page) return c.json({ pages: [] });

  const version = db
    .select()
    .from(pageVersions)
    .where(eq(pageVersions.pageId, page.id))
    .orderBy(desc(pageVersions.version))
    .get();

  if (!version) return c.json({ pages: [] });

  // Get embedding for current page
  const queryEmbed = await provider.embed(
    `${page.title} ${version.contentIntro.slice(0, 500)}`
  );

  // Get all other pages and their embeddings
  const allPages = db.select().from(wikiPages).all();
  const scored: { page: typeof allPages[0]; score: number }[] = [];

  for (const p of allPages) {
    if (p.id === page.id) continue;
    const pVersion = db
      .select()
      .from(pageVersions)
      .where(eq(pageVersions.pageId, p.id))
      .orderBy(desc(pageVersions.version))
      .get();
    if (!pVersion) continue;

    const pEmbed = await provider.embed(
      `${p.title} ${pVersion.contentIntro.slice(0, 500)}`
    );
    const score = cosineSimilarity(queryEmbed, pEmbed);
    scored.push({ page: p, score });
  }

  scored.sort((a, b) => b.score - a.score);
  return c.json({ pages: scored.slice(0, 5).map((s) => s.page) });
});

// Rewrite text at different tier level
const rewriteSchema = z.object({
  text: z.string(),
  targetTier: z.string(),
  pageSlug: z.string(),
});

ai.post("/rewrite", zValidator("json", rewriteSchema), async (c) => {
  const { text, targetTier, pageSlug } = c.req.valid("json");
  const provider = getAIProvider();

  const system = `You rewrite educational content at different difficulty levels.
page: ${pageSlug}
tier: ${targetTier}

Rewrite the following text at the ${targetTier} level. Preserve the core meaning but adjust complexity, vocabulary, and mathematical notation as appropriate for the level.`;

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      await provider.stream({
        system,
        messages: [{ role: "user", content: text }],
        onToken: (token) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ token })}\n\n`));
        },
      });
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
});

// Generate flashcards
ai.get("/flashcards/:slug", async (c) => {
  const slug = c.req.param("slug");
  const tier = c.req.query("tier") || "intro";
  const db = getDb();
  const provider = getAIProvider();

  const page = db.select().from(wikiPages).where(eq(wikiPages.slug, slug)).get();
  if (!page) return c.json({ cards: [] });

  const version = db
    .select()
    .from(pageVersions)
    .where(eq(pageVersions.pageId, page.id))
    .orderBy(desc(pageVersions.version))
    .get();

  if (!version) return c.json({ cards: [] });

  const contentMap: Record<string, string> = {
    intro: version.contentIntro,
    undergrad: version.contentUndergrad,
    grad: version.contentGrad,
  };
  const content = contentMap[tier] || version.contentIntro;

  // For mock provider, generate cards from content
  const cards = generateFlashcards(page.title, content, tier);
  return c.json({ cards });
});

function generateFlashcards(title: string, content: string, tier: string) {
  // Extract key concepts from markdown
  const headings = content.match(/^#{1,3}\s+(.+)/gm) || [];
  const cards = [];

  cards.push({
    front: `What is ${title}?`,
    back: content.split("\n").filter((l) => l.trim() && !l.startsWith("#")).slice(0, 3).join(" ").slice(0, 300),
  });

  for (const heading of headings.slice(0, 5)) {
    const text = heading.replace(/^#+\s+/, "");
    const idx = content.indexOf(heading);
    const nextHeading = content.indexOf("\n#", idx + 1);
    const section = content.slice(idx + heading.length, nextHeading > -1 ? nextHeading : idx + 500).trim();
    const firstParagraph = section.split("\n\n")[0]?.slice(0, 250) || "";

    if (firstParagraph.length > 30) {
      cards.push({ front: `Explain: ${text}`, back: firstParagraph });
    }
  }

  return cards.slice(0, 8);
}

// --- AI authoring helpers (news drafts, polish, TL;DR, explain) ---

// Wraps a streaming AI call as an SSE response. The handler shape is
// identical for every authoring endpoint — only the system prompt and
// user message change.
function streamingResponse(
  system: string,
  userMessage: string,
): Response {
  const provider = getAIProvider();
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      try {
        await provider.stream({
          system,
          messages: [{ role: "user", content: userMessage }],
          onToken: (token) => {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ token })}\n\n`),
            );
          },
        });
      } catch (err: any) {
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ error: err?.message ?? "stream failed" })}\n\n`,
          ),
        );
      }
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
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

const draftSchema = z.object({
  prompt: z.string().min(3).max(2000),
  tags: z.array(z.string()).optional(),
});

ai.post("/news/draft", zValidator("json", draftSchema), async (c) => {
  const { prompt, tags } = c.req.valid("json");
  const user = await getSessionUser(c);
  const rateLimitKey = user?.id || c.req.header("x-forwarded-for") || "anonymous";
  if (!checkRateLimit(`draft:${rateLimitKey}`, 10, 60_000)) {
    return c.json({ error: "Rate limited. Try again in a minute." }, 429);
  }

  const tagHint = tags && tags.length > 0
    ? `\nThe author wants this tagged: ${tags.join(", ")}.`
    : "";

  const system = `You draft long-form news articles for the Axiomic learning platform — a Brilliant/Khan-Academy-style site for ML and AI. Voice: clear, opinionated, technical but warm. Style: magazine-style, not academic.

Output rules:
- Markdown body only. Do NOT include the title, byline, or YAML frontmatter — those are set elsewhere in the UI.
- Open with a hook, not a definition.
- Use level-2 headings (## ...) to structure 3-6 sections. Keep paragraphs tight.
- LaTeX is supported via $...$ inline and $$...$$ block. Code blocks via triple backticks.
- You can embed an inline visualization with the directive ::viz[name] on its own line. Available names: attention-heatmap, softmax-temperature, positional-encoding, tokenizer-playground, beam-search-tree, layer-activations, qkv-step-through, embedding-explorer, activation-function-gallery. Use at most one or two — and only when they actually illustrate the point.
- Aim for ~500-900 words.${tagHint}`;

  return streamingResponse(system, prompt);
});

const polishSchema = z.object({
  original: z.string(),
  proposed: z.string().min(1),
  message: z.string().optional(),
});

ai.post("/news/polish", zValidator("json", polishSchema), async (c) => {
  const { original, proposed, message } = c.req.valid("json");
  const user = await getSessionUser(c);
  const rateLimitKey = user?.id || c.req.header("x-forwarded-for") || "anonymous";
  if (!checkRateLimit(`polish:${rateLimitKey}`, 15, 60_000)) {
    return c.json({ error: "Rate limited. Try again in a minute." }, 429);
  }

  const system = `You are an editing assistant on the Axiomic platform. The user is proposing an edit to a news article and wants the wording polished before they submit it for the original author's review.

Output rules:
- Return ONLY the polished markdown body. No commentary, no preamble, no explanation.
- Preserve the structure, tone, and intent of the proposed version.
- Fix grammar, tighten sentences, smooth flow. Do not add new claims or remove substantive content the proposer added.
- Preserve LaTeX, code blocks, and ::viz[...] directives verbatim.`;

  const userMessage = `Original article body (for reference, not to be returned):
\`\`\`
${original.slice(0, 6000)}
\`\`\`

Proposed edit body (POLISH THIS — return only the polished version):
\`\`\`
${proposed.slice(0, 6000)}
\`\`\`
${message ? `\nProposer's note about the change: ${message}` : ""}`;

  return streamingResponse(system, userMessage);
});

// --- Lesson authoring helpers ----------------------------------------

const lessonDraftSchema = z.object({
  topic: z.string().min(2).max(400),
  // Optional: which slide kind the user wants. Defaults to "text".
  kind: z.enum(["text", "question"]).optional(),
});

ai.post(
  "/lesson/draft-slide",
  zValidator("json", lessonDraftSchema),
  async (c) => {
    const { topic, kind = "text" } = c.req.valid("json");
    const user = await getSessionUser(c);
    const rateLimitKey =
      user?.id || c.req.header("x-forwarded-for") || "anonymous";
    if (!checkRateLimit(`lesson-draft:${rateLimitKey}`, 20, 60_000)) {
      return c.json({ error: "Rate limited. Try again in a minute." }, 429);
    }

    if (kind === "question") {
      const system = `You write multiple-choice check-your-understanding questions for an interactive ML/AI lesson on the Axiomic learning platform. Output a single JSON object with this exact shape and nothing else (no prose, no code fences):

{"question": "...", "options": ["...", "...", "...", "..."], "correctIndex": 0, "explanation": "..."}

Constraints:
- Exactly 4 options. The correct answer is exactly one of them.
- Question is one sentence, ≤ 30 words.
- Distractors should be plausible but wrong; no "all of the above" tricks.
- Explanation is one or two sentences pointing at the underlying intuition.`;
      return streamingResponse(system, `Topic: ${topic}`);
    }

    const system = `You draft a single short slide for an interactive ML/AI lesson on the Axiomic learning platform. Voice: clear, technical, slightly warm — like a great TA at office hours.

Output rules:
- Output a single JSON object and nothing else (no prose, no code fences):
  {"title": "Short Title", "body": "markdown body", "viz": "name-or-null"}
- Title is ≤ 6 words, headline-cased.
- Body is 80-180 words of markdown. Use one short paragraph, optionally followed by a tiny bullet list. LaTeX via $...$ is fine.
- "viz" is OPTIONAL. If a visualization fits, set it to one of: softmax-temperature-preview, attention-heatmap-explorer, gradient-descent-2d, tokenizer-playground, embedding-explorer, layer-activations, positional-encoding, activation-function-gallery, lorenz-attractor, double-pendulum, phase-portrait-1d. Otherwise set "viz": null.
- Don't include any other keys. The client will parse this JSON.`;

    return streamingResponse(system, `Topic: ${topic}`);
  },
);

const lessonPolishSchema = z.object({
  // Either polish a slide title (short) or its body (longer markdown).
  field: z.enum(["title", "body"]),
  current: z.string().min(1).max(20000),
  hint: z.string().max(400).optional(),
});

ai.post(
  "/lesson/polish-slide",
  zValidator("json", lessonPolishSchema),
  async (c) => {
    const { field, current, hint } = c.req.valid("json");
    const user = await getSessionUser(c);
    const rateLimitKey =
      user?.id || c.req.header("x-forwarded-for") || "anonymous";
    if (!checkRateLimit(`lesson-polish:${rateLimitKey}`, 30, 60_000)) {
      return c.json({ error: "Rate limited. Try again in a minute." }, 429);
    }

    const baseRules =
      field === "title"
        ? `Polish a slide title. Keep it ≤ 6 words. Make it concrete and active. Output ONLY the polished title — no quotes, no commentary.`
        : `Polish slide body markdown. Keep the same length and structure. Don't add new claims; just sharpen the prose, fix typos, and make the math + code crisp. Output ONLY the polished markdown — no commentary.`;

    const system = `You polish lesson content for the Axiomic learning platform. ${baseRules}${
      hint ? `\n\nAuthor hint: ${hint}` : ""
    }`;

    return streamingResponse(system, current);
  },
);

const lessonRewriteSchema = z.object({
  slide: z.string().min(1).max(20000),
  analytics: z
    .object({
      views: z.number(),
      dropOff: z.number(),
      incorrectRate: z.number(),
    })
    .optional(),
  hint: z.string().max(400).optional(),
});

ai.post(
  "/lesson/rewrite-from-analytics",
  zValidator("json", lessonRewriteSchema),
  async (c) => {
    const { slide, analytics, hint } = c.req.valid("json");
    const user = await getSessionUser(c);
    const rateLimitKey =
      user?.id || c.req.header("x-forwarded-for") || "anonymous";
    if (!checkRateLimit(`lesson-rewrite:${rateLimitKey}`, 15, 60_000)) {
      return c.json({ error: "Rate limited. Try again in a minute." }, 429);
    }

    const ctx = analytics
      ? `\n\nThis slide is underperforming: ${analytics.views} views, drop-off ${analytics.dropOff}, incorrect-rate ${(analytics.incorrectRate * 100).toFixed(0)}%. Rewrite for clarity — common drop-off triggers are jargon dumped without setup, missing examples, and skipped steps in math. Be concrete.`
      : "";

    const system = `You rewrite an underperforming lesson slide to be clearer and stickier. Keep roughly the same length. Output ONLY the rewritten slide — markdown body for text slides, or a single JSON object for question slides (matching the existing question's shape). No commentary.${ctx}${
      hint ? `\n\nAuthor hint: ${hint}` : ""
    }`;

    return streamingResponse(system, slide);
  },
);

// --- Wiki authoring helpers ------------------------------------------

const wikiDraftSchema = z.object({
  topic: z.string().min(2).max(400),
  // Tier the draft should target. Wiki pages have 3 tiers; mirror that.
  tier: z.enum(["intro", "undergrad", "grad"]).optional(),
});

ai.post(
  "/wiki/draft",
  zValidator("json", wikiDraftSchema),
  async (c) => {
    const { topic, tier = "intro" } = c.req.valid("json");
    const user = await getSessionUser(c);
    const rateLimitKey =
      user?.id || c.req.header("x-forwarded-for") || "anonymous";
    if (!checkRateLimit(`wiki-draft:${rateLimitKey}`, 10, 60_000)) {
      return c.json({ error: "Rate limited. Try again in a minute." }, 429);
    }

    const tierBlurb =
      tier === "intro"
        ? "Write at the intro tier: intuitive, accessible, build vocabulary, almost no math."
        : tier === "undergrad"
          ? "Write at the undergraduate tier: full math (LaTeX), worked examples, derivations where they help."
          : "Write at the graduate tier: terse + research-flavored, link to active questions in the field, density is fine.";

    const system = `You draft wiki page content for the Axiomic learning platform. ${tierBlurb}

Output rules:
- Markdown body only. No frontmatter, no title, no byline.
- Open with a one-sentence definition or hook.
- Use level-2 headings (## ...) for 3-5 sections.
- LaTeX via $...$ inline and $$...$$ block. Code blocks via triple backticks.
- You may embed a visualization with :::viz[name]. Available names: attention-heatmap, softmax-temperature, positional-encoding, tokenizer-playground, beam-search-tree, layer-activations, qkv-step-through, embedding-explorer, activation-function-gallery. At most one or two.
- Aim for 400-700 words.`;

    return streamingResponse(system, `Topic: ${topic}`);
  },
);

const wikiPolishSchema = z.object({
  current: z.string().min(1).max(40000),
  tier: z.enum(["intro", "undergrad", "grad"]).optional(),
  hint: z.string().max(400).optional(),
});

ai.post(
  "/wiki/polish",
  zValidator("json", wikiPolishSchema),
  async (c) => {
    const { current, tier, hint } = c.req.valid("json");
    const user = await getSessionUser(c);
    const rateLimitKey =
      user?.id || c.req.header("x-forwarded-for") || "anonymous";
    if (!checkRateLimit(`wiki-polish:${rateLimitKey}`, 20, 60_000)) {
      return c.json({ error: "Rate limited. Try again in a minute." }, 429);
    }

    const tierBlurb = tier
      ? ` Maintain the ${tier} tier (don't dumb it down or jargonize it up).`
      : "";

    const system = `You polish wiki page markdown for the Axiomic learning platform.${tierBlurb} Keep length and structure the same — sharpen prose, fix typos, tighten math + code. Don't add new claims. Output ONLY the polished markdown.${
      hint ? `\n\nAuthor hint: ${hint}` : ""
    }`;

    return streamingResponse(system, current);
  },
);

const articleHelpSchema = z.object({
  slug: z.string(),
});

async function loadNewsBody(slug: string): Promise<string | null> {
  const db = getDb();
  const row = db
    .select({ body: newsArticles.body, status: newsArticles.status })
    .from(newsArticles)
    .where(eq(newsArticles.slug, slug))
    .get();
  if (!row || row.status !== "published") return null;
  return row.body;
}

ai.post("/article/tldr", zValidator("json", articleHelpSchema), async (c) => {
  const { slug } = c.req.valid("json");
  const user = await getSessionUser(c);
  const rateLimitKey = user?.id || c.req.header("x-forwarded-for") || "anonymous";
  if (!checkRateLimit(`tldr:${rateLimitKey}`, 30, 60_000)) {
    return c.json({ error: "Rate limited. Try again in a minute." }, 429);
  }
  const body = await loadNewsBody(slug);
  if (!body) return c.json({ error: "Article not found" }, 404);

  const system = `Write a 2-3 sentence TL;DR of the article below. No headings. No bullet points. Plain prose only. Match the article's tone.`;
  return streamingResponse(system, body.slice(0, 8000));
});

ai.post("/article/explain", zValidator("json", articleHelpSchema), async (c) => {
  const { slug } = c.req.valid("json");
  const user = await getSessionUser(c);
  const rateLimitKey = user?.id || c.req.header("x-forwarded-for") || "anonymous";
  if (!checkRateLimit(`explain:${rateLimitKey}`, 20, 60_000)) {
    return c.json({ error: "Rate limited. Try again in a minute." }, 429);
  }
  const body = await loadNewsBody(slug);
  if (!body) return c.json({ error: "Article not found" }, 404);

  const system = `Re-explain the following article for someone brand-new to the topic. Use everyday vocabulary, replace jargon with concrete analogies, keep the structure compact (3-5 short paragraphs). Don't talk down — explain. Markdown body only, no headings.`;
  return streamingResponse(system, body.slice(0, 8000));
});

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB) || 1);
}

// --- AI extensions: tag suggestions, practice questions, semantic related ---

// Run a streaming completion to its end and return the accumulated
// text. Used for endpoints that need a single JSON-shaped reply.
async function completion(system: string, userMessage: string): Promise<string> {
  const provider = getAIProvider();
  let acc = "";
  await provider.stream({
    system,
    messages: [{ role: "user", content: userMessage }],
    onToken: (t) => {
      acc += t;
    },
  });
  return acc;
}

// Best-effort JSON extraction from a model reply. Models sometimes
// wrap the JSON in fences or prose; strip what we can and try again.
function extractJson<T>(text: string): T | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidates = [fenced ? fenced[1] : null, text];
  for (const cand of candidates) {
    if (!cand) continue;
    const trimmed = cand.trim();
    try {
      return JSON.parse(trimmed) as T;
    } catch {
      // try slicing from first `{` or `[` to matching last `}`/`]`
      const firstBracket = Math.min(
        ...["{", "["]
          .map((c) => trimmed.indexOf(c))
          .filter((i) => i >= 0),
      );
      const lastBracket = Math.max(
        trimmed.lastIndexOf("}"),
        trimmed.lastIndexOf("]"),
      );
      if (
        Number.isFinite(firstBracket) &&
        lastBracket > firstBracket
      ) {
        try {
          return JSON.parse(trimmed.slice(firstBracket, lastBracket + 1)) as T;
        } catch {
          // give up
        }
      }
    }
  }
  return null;
}

const tagSuggestSchema = z.object({
  title: z.string(),
  summary: z.string().optional(),
  body: z.string().optional(),
});

ai.post("/news/tag-suggest", zValidator("json", tagSuggestSchema), async (c) => {
  const { title, summary, body } = c.req.valid("json");
  const session = await getSessionUser(c);
  const rateLimitKey = session?.id || c.req.header("x-forwarded-for") || "anonymous";
  if (!checkRateLimit(`tagsuggest:${rateLimitKey}`, 30, 60_000)) {
    return c.json({ error: "Rate limited. Try again in a minute." }, 429);
  }

  const system = `Suggest 3-6 short, lowercase, kebab-case tags for the article below. Tags should be 1-3 words, focused on the topic and audience (e.g., "transformers", "rope", "mechanistic-interpretability"). Return ONLY valid JSON of the form {"tags": ["tag-one", "tag-two", "tag-three"]}. No prose.`;
  const userMessage = `Title: ${title}\n\nSummary: ${summary ?? ""}\n\nBody (first 4000 chars):\n${(body ?? "").slice(0, 4000)}`;
  const raw = await completion(system, userMessage);
  const parsed = extractJson<{ tags?: string[] }>(raw);
  const tags = Array.isArray(parsed?.tags)
    ? parsed.tags
        .filter((t): t is string => typeof t === "string")
        .map((t) =>
          t
            .toLowerCase()
            .trim()
            .replace(/[^a-z0-9\s-]/g, "")
            .replace(/\s+/g, "-")
            .replace(/-+/g, "-")
            .replace(/^-|-$/g, "")
            .slice(0, 40),
        )
        .filter(Boolean)
        .slice(0, 8)
    : [];
  return c.json({ tags });
});

const practiceSchema = z.object({
  pageSlug: z.string(),
  tier: z.string().default("intro"),
});

ai.post(
  "/wiki/practice-questions",
  zValidator("json", practiceSchema),
  async (c) => {
    const { pageSlug, tier } = c.req.valid("json");
    const session = await getSessionUser(c);
    const rateLimitKey = session?.id || c.req.header("x-forwarded-for") || "anonymous";
    if (!checkRateLimit(`practice:${rateLimitKey}`, 15, 60_000)) {
      return c.json({ error: "Rate limited. Try again in a minute." }, 429);
    }

    const db = getDb();
    const page = db.select().from(wikiPages).where(eq(wikiPages.slug, pageSlug)).get();
    if (!page) return c.json({ error: "Page not found" }, 404);
    const version = db
      .select()
      .from(pageVersions)
      .where(eq(pageVersions.pageId, page.id))
      .orderBy(desc(pageVersions.version))
      .get();
    if (!version) return c.json({ error: "Page has no content" }, 404);
    const contentMap: Record<string, string> = {
      intro: version.contentIntro,
      undergrad: version.contentUndergrad,
      grad: version.contentGrad,
    };
    const content = (contentMap[tier] || version.contentIntro).slice(0, 6000);

    const system = `Generate exactly 3 multiple-choice practice questions from the article below. Each question MUST have 4 options and exactly one correct answer. Return ONLY valid JSON of the form:
{"questions":[{"question":"...","options":["...","...","...","..."],"correctIndex":0,"explanation":"..."}]}
No prose, no commentary, no preamble.`;
    const raw = await completion(system, `Article: ${page.title}\n\n${content}`);
    const parsed = extractJson<{ questions?: any[] }>(raw);
    const questions = Array.isArray(parsed?.questions)
      ? parsed.questions
          .filter(
            (q) =>
              q &&
              typeof q.question === "string" &&
              Array.isArray(q.options) &&
              q.options.length === 4 &&
              typeof q.correctIndex === "number" &&
              q.correctIndex >= 0 &&
              q.correctIndex < 4,
          )
          .slice(0, 5)
      : [];
    return c.json({ questions });
  },
);

// Embedding-based "related news" — replaces the cheap same-author
// heuristic with semantic similarity over article titles + summaries.
ai.get("/news/related-semantic/:slug", async (c) => {
  const slug = c.req.param("slug")!;
  const db = getDb();
  const provider = getAIProvider();

  const article = db
    .select({
      id: newsArticles.id,
      title: newsArticles.title,
      summary: newsArticles.summary,
    })
    .from(newsArticles)
    .where(eq(newsArticles.slug, slug))
    .get();
  if (!article) return c.json({ articles: [] });

  const others = db
    .select({
      id: newsArticles.id,
      slug: newsArticles.slug,
      title: newsArticles.title,
      summary: newsArticles.summary,
      coverEmoji: newsArticles.coverEmoji,
      accentColor: newsArticles.accentColor,
      authorId: newsArticles.authorId,
    })
    .from(newsArticles)
    .where(eq(newsArticles.status, "published"))
    .all()
    .filter((a) => a.id !== article.id);

  if (others.length === 0) return c.json({ articles: [] });

  // Get author usernames for the byline.
  const authorIds = Array.from(new Set(others.map((o) => o.authorId)));
  const authorRows = db
    .select({ id: users.id, username: users.username })
    .from(users)
    .where(sql`${users.id} in ${authorIds}`)
    .all();
  const authorMap = new Map(authorRows.map((u) => [u.id, u.username]));

  const queryEmbed = await provider.embed(`${article.title}\n${article.summary}`);
  const scored: Array<{ a: (typeof others)[number]; score: number }> = [];
  for (const a of others) {
    const e = await provider.embed(`${a.title}\n${a.summary}`);
    scored.push({ a, score: cosineSimilarity(queryEmbed, e) });
  }
  scored.sort((x, y) => y.score - x.score);
  const top = scored.slice(0, 4).map(({ a }) => ({
    id: a.id,
    slug: a.slug,
    title: a.title,
    summary: a.summary,
    coverEmoji: a.coverEmoji,
    accentColor: a.accentColor,
    authorUsername: authorMap.get(a.authorId) ?? "unknown",
  }));
  return c.json({ articles: top });
});

// --- Paper → Lesson pipeline ----------------------------------------
//
// Streams a `{slides: LessonSlide[]}` JSON payload that turns a published
// news article into a teachable lesson scaffold. The author edits + saves
// via the existing lesson editor; on save the article + lesson get
// cross-linked via news_articles.derived_lesson_node_id and
// mastery_nodes.source_article_id (see /news/:slug/derive-lesson).
const lessonFromArticleSchema = z.object({
  slug: z.string().min(1).max(200),
  textSlides: z.number().int().min(2).max(8).optional(),
  questionSlides: z.number().int().min(0).max(6).optional(),
});

ai.post(
  "/lesson/from-article",
  zValidator("json", lessonFromArticleSchema),
  async (c) => {
    const { slug, textSlides = 5, questionSlides = 3 } = c.req.valid("json");
    const user = await getSessionUser(c);
    const rateLimitKey =
      user?.id || c.req.header("x-forwarded-for") || "anonymous";
    if (!checkRateLimit(`lesson-from-article:${rateLimitKey}`, 8, 60_000)) {
      return c.json({ error: "Rate limited. Try again in a minute." }, 429);
    }

    const body = await loadNewsBody(slug);
    if (!body) return c.json({ error: "Article not found" }, 404);

    const system = `You convert a published research article on the Axiomic learning platform into an interactive lesson. Output a single JSON object and nothing else (no prose, no code fences, no commentary):

{"slides": [
  {"kind": "text", "title": "Short Title", "body": "markdown body"},
  ...
  {"kind": "question", "question": {"id": "q-1", "kind": "multiple_choice", "question": "...", "options": ["...","...","...","..."], "correctIndex": 0, "explanation": "..."}}
]}

Constraints:
- Produce exactly ${textSlides} text slides followed by exactly ${questionSlides} question slides.
- Text slides: title ≤ 6 words headline-cased; body 80-180 words of markdown; one short paragraph optionally followed by a tiny bullet list; LaTeX via $...$ is fine.
- Question slides: kind="multiple_choice"; exactly 4 options; correctIndex is 0-3; one-sentence question ≤ 30 words; explanation one or two sentences.
- Question ids must be unique within the lesson (q-1, q-2, ...).
- Cover the article's main thread: derive concepts in order, then check understanding with the questions.
- Don't invent facts not supported by the article.
- The output must be valid JSON parseable by JSON.parse.`;

    return streamingResponse(system, body.slice(0, 8000));
  },
);

// --- Coach: per-user context + ranked proactive suggestions --------
//
// Sprint 18. The sidebar calls /coach/context on mount to render a
// "Quick checks" header (mistakes, due flashcards, prereq gaps) and
// /coach/suggest to get 3-5 ranked CTAs. Both are auth-only because
// the entire payload is per-user state.

ai.get("/coach/context", requireAuth, async (c) => {
  const user = c.get("user")!;
  const pageSlug = c.req.query("pageSlug") || undefined;
  const lite = c.req.query("lite") === "1";
  const ctx = buildCoachContext(user.id, { pageSlug, lite });
  return c.json(ctx);
});

const coachSuggestSchema = z.object({
  pageSlug: z.string().optional(),
});

ai.post(
  "/coach/suggest",
  requireAuth,
  zValidator("json", coachSuggestSchema),
  async (c) => {
    const user = c.get("user")!;
    const { pageSlug } = c.req.valid("json");
    if (!checkRateLimit(`coach-suggest:${user.id}`, 30, 60_000)) {
      return c.json({ error: "Rate limited. Try again in a minute." }, 429);
    }

    const ctx = buildCoachContext(user.id, { pageSlug });
    const suggestions = rankSuggestions(ctx);
    return c.json({ suggestions });
  },
);

interface CoachSuggestion {
  kind:
    | "review_prereq"
    | "review_mistake"
    | "spaced_rep"
    | "next_node"
    | "primer";
  title: string;
  body: string;
  ctaUrl: string;
}

// Rule-based ranker. Cheap, deterministic, and good enough — the LLM
// gets to lean Socratic in the chat itself, but the suggestions are
// just "what to do next" routed straight to the right URL. We cap at
// 3 to keep the sidebar's quick-checks list short.
function rankSuggestions(ctx: ReturnType<typeof buildCoachContext>): CoachSuggestion[] {
  const out: CoachSuggestion[] = [];

  if (ctx.prerequisiteGaps.length > 0) {
    const gap = ctx.prerequisiteGaps[0];
    out.push({
      kind: "review_prereq",
      title: `Brush up on ${gap.title} first`,
      body:
        "This page assumes some background you haven't completed yet. A quick lesson should make the rest land.",
      ctaUrl: `/paths/${gap.pathSlug}/lessons/${gap.nodeSlug}`,
    });
  }

  if (ctx.recentMistakes.length > 0) {
    const m = ctx.recentMistakes[0];
    out.push({
      kind: "review_mistake",
      title: `Replay a mistake from ${m.nodeSlug}`,
      body: m.questionText
        ? `You missed "${m.questionText}" ${m.occurrences}× recently.`
        : `Open question that's tripped you up ${m.occurrences}×. Take another shot.`,
      ctaUrl: `/paths/${m.pathSlug}/lessons/${m.nodeSlug}`,
    });
  }

  if (ctx.dueFlashcards > 0) {
    out.push({
      kind: "spaced_rep",
      title: `Review ${ctx.dueFlashcards} due card${ctx.dueFlashcards === 1 ? "" : "s"}`,
      body: "5 minutes of spaced repetition keeps last week's lesson sticky.",
      ctaUrl: "/flashcards",
    });
  }

  if (ctx.currentLessonProgress) {
    const { title, slideIdx, totalSlides, pathSlug, nodeSlug } =
      ctx.currentLessonProgress;
    out.push({
      kind: "next_node",
      title: `Pick up "${title}"`,
      body:
        totalSlides > 0
          ? `You stopped on slide ${slideIdx + 1} of ${totalSlides}.`
          : "You have an in-flight lesson — resume where you left off.",
      ctaUrl: `/paths/${pathSlug}/lessons/${nodeSlug}`,
    });
  }

  return out.slice(0, 3);
}

// --- Sprint 21 — Research Paper Generator endpoints ----------------
//
// Six endpoints driving the wizard flow at /research/new/wizard:
//   /paper/outline          — streams JSON outline from a topic
//   /paper/draft-section    — streams markdown for one outlined section
//   /paper/suggest-viz      — non-streaming, ranks the platform viz catalog
//   /paper/suggest-concepts — non-streaming, finds [[slug]] candidates by embedding
//   /paper/suggest-references — non-streaming, finds platform citations
//   /paper/derive-tier      — streams a tier-shifted body
//
// All require authentication so the per-user rate limit applies. The
// wizard's auto-draft button calls these in series client-side.

const VIZ_CATALOG: Array<{ name: string; blurb: string }> = [
  { name: "attention-heatmap", blurb: "Cells of attention weights from queries to keys; great for explaining attention concentrations." },
  { name: "softmax-temperature", blurb: "Slider for softmax temperature showing how the distribution sharpens or flattens." },
  { name: "positional-encoding", blurb: "Sinusoidal vs RoPE positional embeddings, comparing the geometry." },
  { name: "tokenizer-playground", blurb: "Type a sentence and see how a BPE tokenizer splits it." },
  { name: "beam-search-tree", blurb: "Beam search expanding step by step; shows hypothesis pruning." },
  { name: "layer-activations", blurb: "Histograms of activation magnitudes across transformer layers." },
  { name: "qkv-step-through", blurb: "Walks the Q-K-V matmul for one token, value by value." },
  { name: "embedding-explorer", blurb: "2D projection of word embeddings, with nearest-neighbour highlights." },
  { name: "activation-function-gallery", blurb: "Side-by-side plots of ReLU/GELU/SiLU/etc." },
  { name: "lorenz-attractor", blurb: "Chaotic ODE; useful for dynamical-systems intuition." },
  { name: "double-pendulum", blurb: "Sensitivity-to-initial-conditions demo for nonlinear dynamics." },
  { name: "phase-portrait-1d", blurb: "1D phase portraits for fixed-point + stability analysis." },
];

const PAPER_FORMAT_BLURB: Record<string, string> = {
  research: "Original results + method. Audience: practitioners + researchers.",
  explainer: "Existing concepts made accessible. Audience: motivated learners.",
  survey: "Lay of the land + open questions. Audience: orienting researchers.",
  opinion: "An argued position with evidence. Audience: peers in the field.",
};

const TIER_VOICE: Record<string, string> = {
  intro: "Plain English. Almost no math. Build intuition with analogies. Aim for a curious novice.",
  undergrad: "Full mathematical fluency, derivations, worked examples. Aim for a strong undergraduate.",
  grad: "Terse, research-flavored, links to open questions. Aim for an active researcher.",
};

const LENGTH_TARGET: Record<string, string> = {
  short: "Aim for 400-600 words total across all sections.",
  medium: "Aim for 800-1400 words total across all sections.",
  deep: "Aim for 1800-3000 words across all sections.",
};

// 1. /paper/outline — streams a JSON outline from a topic.
const paperOutlineSchema = z.object({
  title: z.string().min(3).max(200),
  researchQuestion: z.string().max(500).optional(),
  format: z.enum(["research", "explainer", "survey", "opinion"]).default("research"),
  tier: z.enum(["intro", "undergrad", "grad"]).default("undergrad"),
  length: z.enum(["short", "medium", "deep"]).default("medium"),
});

ai.post("/paper/outline", zValidator("json", paperOutlineSchema), async (c) => {
  const { title, researchQuestion, format, tier, length } = c.req.valid("json");
  const user = await getSessionUser(c);
  if (!user) return c.json({ error: "Authentication required" }, 401);
  if (!checkRateLimit(`paper-outline:${user.id}`, 12, 60_000)) {
    return c.json({ error: "Rate limited. Try again in a minute." }, 429);
  }

  const system = `You outline research papers for the Axiomic learning platform — a Brilliant/Khan-Academy-style site for ML and AI. Output a single JSON object and nothing else (no prose, no code fences):

{"sections": [
  {"title": "...", "kind": "concept" | "method" | "result" | "discussion" | "background", "bullets": ["...","..."]}
]}

Constraints:
- 4-7 sections.
- Each section has 3-5 bullets capturing what the section will argue / show / derive.
- "kind" tags the section so downstream tools can render it correctly: concept (definitions/intuition), method (derivation, algorithm, math), result (figure / experiment / claim), discussion (interpretation, caveats), background (prior work).
- Open with a hook section (kind=background or concept), close with a discussion or future-work section.
- Keep titles ≤ 60 chars, snappy.
- Bullets are full sentences a reader could understand without context.
- Match the format: ${PAPER_FORMAT_BLURB[format] ?? PAPER_FORMAT_BLURB.research}
- Voice: ${TIER_VOICE[tier]}
- ${LENGTH_TARGET[length]}`;

  const userMessage = `Title: ${title}${
    researchQuestion ? `\n\nResearch question: ${researchQuestion}` : ""
  }`;

  return streamingResponse(system, userMessage);
});

// 2. /paper/draft-section — streams markdown for one outlined section.
const paperDraftSectionSchema = z.object({
  paper: z.object({
    title: z.string().min(1).max(200),
    format: z.enum(["research", "explainer", "survey", "opinion"]).default("research"),
  }),
  section: z.object({
    title: z.string().min(1).max(120),
    kind: z.enum(["concept", "method", "result", "discussion", "background"]).optional(),
    bullets: z.array(z.string().max(400)).max(8),
  }),
  // Optional prior-section context (last ~600 chars) so the LLM can
  // pick up where the paper left off without repeating itself.
  prior: z.string().max(2000).optional(),
  tier: z.enum(["intro", "undergrad", "grad"]).default("undergrad"),
  length: z.enum(["short", "medium", "deep"]).default("medium"),
});

const SECTION_LENGTH: Record<string, string> = {
  short: "120-220 words.",
  medium: "200-360 words.",
  deep: "350-600 words.",
};

ai.post(
  "/paper/draft-section",
  zValidator("json", paperDraftSectionSchema),
  async (c) => {
    const { paper, section, prior, tier, length } = c.req.valid("json");
    const user = await getSessionUser(c);
    if (!user) return c.json({ error: "Authentication required" }, 401);
    if (!checkRateLimit(`paper-section:${user.id}`, 30, 60_000)) {
      return c.json({ error: "Rate limited. Try again in a minute." }, 429);
    }

    const system = `You draft one section of a research paper for the Axiomic platform. Output ONLY the section's markdown body — no heading (the platform renders the title separately), no commentary, no preamble.

Constraints:
- Length: ${SECTION_LENGTH[length] ?? SECTION_LENGTH.medium}
- Voice: ${TIER_VOICE[tier]}
- Format: ${PAPER_FORMAT_BLURB[paper.format] ?? PAPER_FORMAT_BLURB.research}
- LaTeX via $...$ inline and $$...$$ block. Code blocks via triple backticks.
- You may embed a visualization with :::viz[name] when one fits; available viz names: ${VIZ_CATALOG.map((v) => v.name).join(", ")}. At most one per section.
- You may reference platform concepts via [[concept-slug]] inline links; readers see hover cards. Use kebab-case slugs that match wiki page names if you know them; otherwise stick to plain prose.
- Do NOT repeat content from the prior section.
- Do NOT add citations like "[1]"; references are managed separately.`;

    const userMessage = `Paper title: ${paper.title}

Section to draft:
- Title: ${section.title}
- Kind: ${section.kind ?? "concept"}
- Bullets to cover:
${section.bullets.map((b, i) => `  ${i + 1}. ${b}`).join("\n")}
${prior ? `\nPrior section (for continuity, do not repeat):\n${prior.slice(-1500)}` : ""}`;

    return streamingResponse(system, userMessage);
  },
);

// 3. /paper/suggest-viz — ranks the platform viz catalog for a section.
const paperSuggestVizSchema = z.object({
  section: z.object({
    title: z.string().min(1).max(120),
    body: z.string().max(8000),
  }),
});

ai.post(
  "/paper/suggest-viz",
  zValidator("json", paperSuggestVizSchema),
  async (c) => {
    const { section } = c.req.valid("json");
    const user = await getSessionUser(c);
    if (!user) return c.json({ error: "Authentication required" }, 401);
    if (!checkRateLimit(`paper-viz:${user.id}`, 30, 60_000)) {
      return c.json({ error: "Rate limited. Try again in a minute." }, 429);
    }

    // Cheap keyword-match ranker — LLM doesn't help here; a tiny
    // overlap-of-tokens heuristic ranks the catalog in ~1ms and
    // returns the top 3. Stays deterministic and offline-friendly.
    const haystack = (section.title + " " + section.body).toLowerCase();
    const tokens = haystack
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length > 3);
    const tokenSet = new Set(tokens);

    const scored = VIZ_CATALOG.map((v) => {
      const haystackV = (v.name + " " + v.blurb).toLowerCase();
      const vTokens = haystackV
        .split(/[^a-z0-9]+/)
        .filter((t) => t.length > 3);
      let score = 0;
      for (const t of vTokens) if (tokenSet.has(t)) score++;
      // Boost when the viz name appears in the body verbatim.
      if (haystack.includes(v.name)) score += 5;
      return { viz: v, score };
    })
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);

    return c.json({
      suggestions: scored.map((s) => ({
        name: s.viz.name,
        blurb: s.viz.blurb,
        score: s.score,
      })),
    });
  },
);

// 4. /paper/suggest-concepts — find [[slug]] candidates from the wiki
// corpus. Embeddings would be nicer; here we use a fast title +
// keyword heuristic so this stays fast even on small deploys.
const paperSuggestConceptsSchema = z.object({
  body: z.string().min(20).max(50000),
});

ai.post(
  "/paper/suggest-concepts",
  zValidator("json", paperSuggestConceptsSchema),
  async (c) => {
    const { body } = c.req.valid("json");
    const user = await getSessionUser(c);
    if (!user) return c.json({ error: "Authentication required" }, 401);
    if (!checkRateLimit(`paper-concepts:${user.id}`, 20, 60_000)) {
      return c.json({ error: "Rate limited. Try again in a minute." }, 429);
    }

    const db = getDb();
    const haystack = body.toLowerCase();

    // Sprint 25 — embedding-backed ranking against the wiki corpus.
    // We embed the query body once, then score each wiki page via the
    // cache so subsequent calls hit precomputed vectors.
    const provider = getAIProvider();
    const queryEmbed = await provider.embed(body.slice(0, 2000));

    const pages = db
      .select({
        id: wikiPages.id,
        slug: wikiPages.slug,
        title: wikiPages.title,
      })
      .from(wikiPages)
      .all();

    const scored: Array<{ slug: string; title: string; score: number }> = [];
    for (const p of pages) {
      // Already linked? Skip — author has it.
      if (
        haystack.includes(`[[${p.slug}]]`) ||
        haystack.includes(`[[${p.slug}|`)
      ) {
        continue;
      }
      const e = await getOrEmbed(
        "wiki_page",
        p.id,
        `${p.title}\n${p.slug.replace(/-/g, " ")}`,
      );
      const score = cosineSimilarity(queryEmbed, e);
      if (score > 0.18) {
        scored.push({ slug: p.slug, title: p.title, score });
      }
    }
    scored.sort((a, b) => b.score - a.score);
    return c.json({ suggestions: scored.slice(0, 6) });
  },
);

// 5. /paper/suggest-references — find platform citations (other
// research papers + news articles) by embedding similarity.
const paperSuggestRefsSchema = z.object({
  title: z.string().min(1).max(200),
  body: z.string().min(50).max(50000),
});

ai.post(
  "/paper/suggest-references",
  zValidator("json", paperSuggestRefsSchema),
  async (c) => {
    const { title, body } = c.req.valid("json");
    const user = await getSessionUser(c);
    if (!user) return c.json({ error: "Authentication required" }, 401);
    if (!checkRateLimit(`paper-refs:${user.id}`, 12, 60_000)) {
      return c.json({ error: "Rate limited. Try again in a minute." }, 429);
    }

    const provider = getAIProvider();
    const queryEmbed = await provider.embed(`${title}\n\n${body.slice(0, 2000)}`);

    const db = getDb();
    const articles = db
      .select({
        id: newsArticles.id,
        slug: newsArticles.slug,
        title: newsArticles.title,
        summary: newsArticles.summary,
        kind: sql<string>`'news'`,
      })
      .from(newsArticles)
      .where(eq(newsArticles.status, "published"))
      .all();
    const papers = db
      .select({
        id: researchPapers.id,
        slug: researchPapers.slug,
        title: researchPapers.title,
        summary: researchPapers.summary,
        kind: sql<string>`'research'`,
      })
      .from(researchPapers)
      .where(eq(researchPapers.status, "published"))
      .all();
    const corpus = [...articles, ...papers];

    // Sprint 25 — go through the embedding cache instead of
    // re-computing every corpus embedding on every wizard call.
    const scored: Array<{
      title: string;
      slug: string;
      kind: string;
      score: number;
    }> = [];
    for (const item of corpus) {
      const e = await getOrEmbed(
        item.kind === "news" ? "news_article" : "research_paper",
        item.id,
        `${item.title}\n${item.summary}`,
      );
      scored.push({
        title: item.title,
        slug: item.slug,
        kind: item.kind,
        score: cosineSimilarity(queryEmbed, e),
      });
    }
    scored.sort((a, b) => b.score - a.score);

    const top = scored.slice(0, 5).map((s) => ({
      kind: s.kind,
      slug: s.slug,
      title: s.title,
      url:
        s.kind === "news" ? `/news/${s.slug}` : `/research/${s.slug}`,
      score: s.score,
    }));
    return c.json({ suggestions: top });
  },
);

// 6. /paper/derive-tier — streams a tier-shifted body.
const paperDeriveTierSchema = z.object({
  canonicalBody: z.string().min(50).max(50000),
  canonicalTier: z.enum(["intro", "undergrad", "grad"]),
  targetTier: z.enum(["intro", "undergrad", "grad"]),
  format: z.enum(["research", "explainer", "survey", "opinion"]).default("research"),
});

ai.post(
  "/paper/derive-tier",
  zValidator("json", paperDeriveTierSchema),
  async (c) => {
    const { canonicalBody, canonicalTier, targetTier, format } = c.req.valid("json");
    const user = await getSessionUser(c);
    if (!user) return c.json({ error: "Authentication required" }, 401);
    if (canonicalTier === targetTier) {
      return c.json({ error: "Source and target tiers are the same." }, 400);
    }
    if (!checkRateLimit(`paper-derive:${user.id}`, 12, 60_000)) {
      return c.json({ error: "Rate limited. Try again in a minute." }, 429);
    }

    const direction =
      tierRank(targetTier) > tierRank(canonicalTier) ? "deepen" : "simplify";

    const system = `You re-render a research paper for the Axiomic platform from one reading depth to another.

Source tier: ${canonicalTier}
Target tier: ${targetTier} (${direction === "deepen" ? "go deeper — add math, derivations, frontier links" : "simplify — strip math, lean on analogy and intuition"}).
Format: ${PAPER_FORMAT_BLURB[format] ?? PAPER_FORMAT_BLURB.research}

Voice for the target tier: ${TIER_VOICE[targetTier]}

Output rules:
- Markdown only. No commentary.
- Preserve all :::viz[name] embeds verbatim.
- Preserve [[concept-slug]] references verbatim — they're the platform's hover-card primitive.
- ${direction === "simplify"
        ? "Convert dense math into prose where possible; keep one canonical equation per major idea, no more."
        : "Add the missing math + derivations a research-frontier reader expects; reference open questions where relevant."}
- Section headings (## ...) are kept as-is so the structure stays consistent across tiers.`;

    return streamingResponse(system, canonicalBody);
  },
);

function tierRank(t: "intro" | "undergrad" | "grad"): number {
  return t === "intro" ? 1 : t === "undergrad" ? 2 : 3;
}

// Sprint 30 — Explain-it-back grader. Takes a learner's free-text
// answer + an author-provided rubric and returns a per-criterion grade
// with feedback. Same shape as the capstone grader (S27) — reuse the
// underlying provider call so behavior stays consistent.
const explainBackSchema = z.object({
  prompt: z.string().min(1).max(2000),
  answer: z.string().min(1).max(8000),
  rubric: z.object({
    criteria: z
      .array(
        z.object({
          id: z.string().min(1).max(40),
          description: z.string().min(1).max(400),
          weight: z.number().min(0).max(1).optional(),
        }),
      )
      .min(1)
      .max(8),
    passingScore: z.number().min(0).max(1).optional().default(0.6),
  }),
});

ai.post(
  "/explain-back/grade",
  zValidator("json", explainBackSchema),
  async (c) => {
    const user = await getSessionUser(c);
    if (!user) return c.json({ error: "Sign in to grade explain-back." }, 401);
    if (!checkRateLimit(`explainback:${user.id}`, 60, 60000)) {
      return c.json({ error: "Rate limited." }, 429);
    }
    const { prompt, answer, rubric } = c.req.valid("json");
    const provider = getAIProvider();

    const system = `You grade an "explain-it-back" answer against a rubric. \
Reply with ONLY a single JSON object:

{
  "perCriterion": [{"criterionId": string, "score": 0..1, "feedback": string}],
  "summary": string
}

Be specific. Reward concrete examples + correct mechanism. Penalise vague restatement.`;

    const criteriaBlock = rubric.criteria
      .map((cr) => `- (${cr.id}) ${cr.description}`)
      .join("\n");
    const userMessage = `Question: ${prompt}\n\nLearner answer:\n${answer}\n\nRubric:\n${criteriaBlock}\n\nReply with ONLY the JSON.`;

    let raw = "";
    try {
      await provider.stream({
        system,
        messages: [{ role: "user", content: userMessage }],
        onToken: (t) => {
          raw += t;
        },
      });
    } catch {
      raw = "";
    }

    // Best-effort parse with heuristic fallback identical in shape.
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    let perCriterion: Array<{ criterionId: string; score: number; feedback: string }> = [];
    let summary = "";
    if (start >= 0 && end > start) {
      try {
        const parsed = JSON.parse(raw.slice(start, end + 1));
        if (Array.isArray(parsed.perCriterion)) {
          perCriterion = parsed.perCriterion.filter(
            (x: any) =>
              typeof x?.criterionId === "string" &&
              typeof x?.score === "number" &&
              typeof x?.feedback === "string",
          );
        }
        if (typeof parsed.summary === "string") summary = parsed.summary;
      } catch {
        // ignore — heuristic below.
      }
    }

    if (perCriterion.length === 0) {
      // Heuristic: score on length + presence of explanation cues.
      const words = answer.split(/\s+/).filter(Boolean).length;
      const lengthScore = Math.min(1, words / 100);
      const cueScore = /because|therefore|so that|which means|the reason/i.test(answer)
        ? 1
        : 0.4;
      const score = Math.max(0, Math.min(1, 0.7 * lengthScore + 0.3 * cueScore));
      perCriterion = rubric.criteria.map((cr) => ({
        criterionId: cr.id,
        score,
        feedback:
          words < 30
            ? "Answer is short — explain the mechanism, not just the conclusion."
            : "Reasoning is present; cite a concrete example to push the score up.",
      }));
      summary = score >= rubric.passingScore
        ? "Heuristic pass — a human grader could sharpen the per-criterion scores."
        : "Heuristic flag — answer needs more concrete reasoning.";
    }

    const totalWeight =
      rubric.criteria.reduce((s, c) => s + (c.weight ?? 1), 0) || 1;
    const byId = new Map(perCriterion.map((c) => [c.criterionId, c]));
    let weighted = 0;
    for (const cr of rubric.criteria) {
      const got = byId.get(cr.id);
      const score = got?.score ?? 0;
      weighted += score * (cr.weight ?? 1);
    }
    const score = Math.max(0, Math.min(1, weighted / totalWeight));

    return c.json({
      grade: {
        score,
        perCriterion,
        summary,
        passed: score >= rubric.passingScore,
      },
    });
  },
);

export { ai as aiRouter };
