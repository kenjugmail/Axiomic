import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { getAIProvider } from "@axiomic/ai";
import { getDb, wikiPages, pageVersions, newsArticles, users } from "@axiomic/db";
import { eq, desc, sql } from "drizzle-orm";
import { getSessionUser } from "../middleware/auth";

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
});

ai.post("/chat", zValidator("json", chatSchema), async (c) => {
  const { pageSlug, tier, messages } = c.req.valid("json");
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
- Format responses with markdown and LaTeX where appropriate`;

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

export { ai as aiRouter };
