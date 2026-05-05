import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { getAIProvider } from "@axiomic/ai";
import { getDb, wikiPages, pageVersions, newsArticles } from "@axiomic/db";
import { eq, desc } from "drizzle-orm";
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

export { ai as aiRouter };
