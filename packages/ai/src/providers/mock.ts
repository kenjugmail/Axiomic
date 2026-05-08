import type { AIProvider, StreamOptions, SummarizeThreadOptions } from "../provider";
import fs from "fs";
import path from "path";

const EMBED_DIM = 384;

// Common English stopwords + a few markdown/LaTeX artifacts. Keeping the list
// short on purpose — TF-IDF already downweights frequent terms.
const STOPWORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "but", "by", "for", "from",
  "has", "have", "if", "in", "into", "is", "it", "its", "of", "on", "or",
  "such", "that", "the", "their", "then", "there", "these", "they", "this",
  "to", "was", "will", "with", "we", "you", "your", "i", "he", "she", "him",
  "her", "his", "hers", "our", "ours", "us", "them", "what", "which", "who",
  "whom", "whose", "do", "does", "did", "done", "doing", "can", "could",
  "should", "would", "may", "might", "must", "shall", "no", "not", "yes",
  "so", "than", "also", "more", "most", "some", "any", "all", "each",
  "every", "few", "many", "much", "other", "another", "same", "different",
  "where", "when", "how", "why", "because", "while", "before", "after",
  "above", "below", "between", "through", "during", "over", "under",
  "again", "further", "once", "very", "just", "only", "even", "still",
  "now", "here", "out", "up", "down", "off", "about", "without",
]);

export class MockProvider implements AIProvider {
  name = "mock";
  private responses: Map<string, any[]> = new Map();
  private loaded = false;
  // TF-IDF state, lazily built on first embed() call.
  private idf: Map<string, number> | null = null;
  private corpusSize = 0;
  private defaultIdf = Math.log(50);  // sane fallback before IDF is built

  private findRoot(): string {
    let dir = process.cwd();
    while (dir !== "/") {
      try {
        const pkg = JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf-8"));
        if (pkg.workspaces) return dir;
      } catch {}
      dir = path.dirname(dir);
    }
    return process.cwd();
  }

  private loadResponses() {
    if (this.loaded) return;
    this.loaded = true;

    const root = this.findRoot();
    const responsesDir = path.join(root, "seed-content/ai-responses");
    if (!fs.existsSync(responsesDir)) return;

    const files = fs.readdirSync(responsesDir).filter((f) => f.endsWith(".json"));
    for (const file of files) {
      const slug = file.replace(".json", "");
      const data = JSON.parse(fs.readFileSync(path.join(responsesDir, file), "utf-8"));
      this.responses.set(slug, data);
    }
  }

  // Build the IDF table from the seed corpus on first embed() call.
  // Corpus = each wiki page (intro tier only, since it covers the topic
  // vocabulary most concisely) plus each forum topic's title + body.
  private buildIdf() {
    if (this.idf) return;
    const docs: string[] = [];
    const root = this.findRoot();

    const pagesDir = path.join(root, "seed-content/pages");
    if (fs.existsSync(pagesDir)) {
      for (const f of fs.readdirSync(pagesDir).filter((f) => f.endsWith(".md"))) {
        const raw = fs.readFileSync(path.join(pagesDir, f), "utf-8");
        // Strip frontmatter, take the intro tier section if present.
        const noFrontmatter = raw.replace(/^---[\s\S]*?---\n/, "");
        const introStart = noFrontmatter.indexOf("<!-- tier:intro -->");
        const undergradStart = noFrontmatter.indexOf("<!-- tier:undergrad -->");
        const slice =
          introStart >= 0 && undergradStart > introStart
            ? noFrontmatter.slice(introStart, undergradStart)
            : noFrontmatter;
        docs.push(slice);
      }
    }

    const forumDir = path.join(root, "seed-content/forum/topics");
    if (fs.existsSync(forumDir)) {
      for (const f of fs.readdirSync(forumDir).filter((f) => f.endsWith(".md"))) {
        const raw = fs.readFileSync(path.join(forumDir, f), "utf-8");
        // Pull title from frontmatter + body after the second ---.
        const parts = raw.split(/\n---\n/);
        const titleMatch = parts[0]?.match(/title:\s*(.+)/);
        const title = titleMatch?.[1]?.trim() || "";
        const body = parts.slice(1).join("\n---\n");
        docs.push(`${title}\n${body}`);
      }
    }

    if (docs.length === 0) {
      // No corpus available — leave idf empty so embed() falls back to a
      // uniform-IDF hashing vectorizer.
      this.idf = new Map();
      this.corpusSize = 0;
      return;
    }

    const df = new Map<string, number>();
    for (const doc of docs) {
      const seen = new Set<string>();
      for (const tok of tokenize(doc)) {
        if (seen.has(tok)) continue;
        seen.add(tok);
        df.set(tok, (df.get(tok) ?? 0) + 1);
      }
    }

    const N = docs.length;
    const idf = new Map<string, number>();
    for (const [tok, freq] of df) {
      // Smoothed IDF: log((N + 1) / (freq + 1)) + 1 → always positive.
      idf.set(tok, Math.log((N + 1) / (freq + 1)) + 1);
    }
    this.idf = idf;
    this.corpusSize = N;
    this.defaultIdf = Math.log(N + 1) + 1;
  }

  // Sprint 63f — sentinel models so the picker has options in dev + tests.
  // The mock provider doesn't actually branch behavior on model; the names
  // exist purely to exercise the UI + endpoint contract.
  async listModels(): Promise<{ available: { id: string }[]; default: string }> {
    return {
      available: [{ id: "mock-fast" }, { id: "mock-thoughtful" }],
      default: "mock-fast",
    };
  }

  async stream(opts: StreamOptions): Promise<void> {
    this.loadResponses();

    const lastUserMessage = opts.messages.filter((m) => m.role === "user").pop()?.content || "";
    const pageSlug = this.extractPageSlug(opts.system);
    const tier = this.extractTier(opts.system);

    // Find a matching response
    const response = this.findResponse(pageSlug, lastUserMessage, tier);

    // Stream character by character with realistic delay
    const delay = process.env.NODE_ENV === "test" ? 0 : 15 + Math.random() * 10;
    for (const char of response) {
      opts.onToken(char);
      if (delay > 0) await sleep(delay);
    }
  }

  // Real semantic embeddings via TF-IDF + signed feature hashing.
  // Documents that share distinctive vocabulary cluster; documents sharing
  // only common words don't. The hashing trick projects the (sparse) TF-IDF
  // vector into a fixed 384-dim dense vector.
  async embed(text: string): Promise<number[]> {
    this.buildIdf();

    const tokens = tokenize(text);
    if (tokens.length === 0) {
      return new Array(EMBED_DIM).fill(0);
    }

    const tf = new Map<string, number>();
    for (const tok of tokens) {
      tf.set(tok, (tf.get(tok) ?? 0) + 1);
    }

    const vec = new Array(EMBED_DIM).fill(0);
    for (const [tok, count] of tf) {
      const idf = this.idf?.get(tok) ?? this.defaultIdf;
      const weight = (1 + Math.log(count)) * idf;
      const h = murmurish(tok);
      const bucket = (h >>> 0) % EMBED_DIM;
      // Signed hashing: a second hash determines the sign so that hash
      // collisions partially cancel rather than always reinforce.
      const sign = ((h >> 24) & 1) === 0 ? 1 : -1;
      vec[bucket] += sign * weight;
    }

    const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0));
    if (norm === 0) return vec;
    return vec.map((v) => v / norm);
  }

  private extractPageSlug(system: string): string {
    const match = system.match(/page:\s*(\S+)/);
    return match?.[1] || "";
  }

  private extractTier(system: string): string {
    const match = system.match(/tier:\s*(\S+)/);
    return match?.[1] || "intro";
  }

  private findResponse(pageSlug: string, query: string, tier: string): string {
    const pageResponses = this.responses.get(pageSlug);
    if (pageResponses && pageResponses.length > 0) {
      // Try to match by query keywords
      const queryLower = query.toLowerCase();
      const matched = pageResponses.find((r: any) => {
        if (!r.keywords) return false;
        return r.keywords.some((k: string) => queryLower.includes(k.toLowerCase()));
      });

      if (matched) {
        const tierResponse = matched[tier] || matched.intro || matched.response;
        return tierResponse;
      }

      // Return a random response from the page
      const randomIdx = Math.floor(Math.random() * pageResponses.length);
      const r = pageResponses[randomIdx];
      return r[tier] || r.intro || r.response;
    }

    // Generic fallback
    return this.genericResponse(query, tier);
  }

  async summarizeThread(opts: SummarizeThreadOptions): Promise<void> {
    const summary = buildMockThreadSummary(opts);
    const delay = process.env.NODE_ENV === "test" ? 0 : 12;
    for (const char of summary) {
      opts.onToken(char);
      if (delay > 0) await sleep(delay);
    }
  }

  private genericResponse(query: string, tier: string): string {
    const responses: Record<string, string> = {
      intro: `That's a great question! Let me break this down in simple terms.\n\nThe concept you're asking about is fundamental to how modern AI systems work. Think of it like building blocks — each piece builds on the ones before it.\n\nThe key insight is that neural networks learn by adjusting their internal parameters based on examples. When we talk about transformers specifically, they introduced a revolutionary way for the model to "pay attention" to different parts of the input, rather than processing everything sequentially.\n\nThis might sound abstract, but here's a concrete analogy: imagine reading a book where you can instantly flip back to any relevant earlier passage while reading a new sentence. That's essentially what the attention mechanism allows.\n\nWould you like me to elaborate on any particular aspect of this?`,
      undergrad: `Let me give you a more detailed technical explanation.\n\nThe mechanism you're asking about can be formalized mathematically. Consider an input sequence $X \\in \\mathbb{R}^{n \\times d}$ where $n$ is the sequence length and $d$ is the embedding dimension.\n\nThe core computation involves three learned projections — queries, keys, and values — each parameterized by weight matrices $W_Q, W_K, W_V \\in \\mathbb{R}^{d \\times d_k}$.\n\nThe attention scores are computed as:\n$$\\text{Attention}(Q, K, V) = \\text{softmax}\\left(\\frac{QK^T}{\\sqrt{d_k}}\\right)V$$\n\nThe $\\sqrt{d_k}$ scaling factor is crucial — without it, the dot products grow large in magnitude for high dimensions, pushing the softmax into regions of extremely small gradients.\n\nThis is important because it allows the model to create context-dependent representations, where the representation of each token is a weighted combination of all other tokens' values.\n\nShould I work through a specific example or derive any particular property?`,
      grad: `This connects to several active areas of research that are worth examining carefully.\n\nThe theoretical properties of the mechanism you're asking about have been studied extensively. Recent work by Olsson et al. (2022) on induction heads has shown that these circuits form a key building block for in-context learning. The formation of these circuits during training appears to undergo a phase transition, which connects to broader questions about grokking and sudden capability acquisition.\n\nFrom an information-theoretic perspective, the attention mechanism can be viewed as a soft dictionary lookup that performs approximate nearest-neighbor search in the key-query space. The capacity of this system scales as $O(d_k \\cdot h)$ where $h$ is the number of attention heads, providing an interesting connection to the memory capacity results of Hopfield networks (Ramsauer et al., 2021).\n\nOne important subtlety: the standard softmax attention has quadratic complexity in sequence length, which has motivated a rich literature on efficient attention variants — from linear attention (Katharopoulos et al., 2020) to the recent Mamba architecture's selective state spaces approach.\n\nThe practical implications for scaling are significant: as context windows grow from 2K to 128K+ tokens, the attention mechanism remains a bottleneck that modern architectures must carefully optimize through techniques like GQA, sliding window attention, and KV cache management.\n\nWould you like to explore any of these research directions in more depth?`,
    };

    return responses[tier] || responses.intro;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// Tokenize: lowercase, drop punctuation/markup, drop stopwords + short tokens.
// Strips common LaTeX delimiters and code-fence markers so vocabulary reflects
// content, not syntax.
function tokenize(text: string): string[] {
  const cleaned = text
    .toLowerCase()
    .replace(/```[\s\S]*?```/g, " ")  // code fences
    .replace(/\$\$[\s\S]*?\$\$/g, " ") // block math
    .replace(/\$[^$]*\$/g, " ")        // inline math
    .replace(/<!--[\s\S]*?-->/g, " ")  // html comments
    .replace(/[^a-z0-9]+/g, " ");
  const out: string[] = [];
  for (const tok of cleaned.split(/\s+/)) {
    if (tok.length < 3) continue;
    if (STOPWORDS.has(tok)) continue;
    out.push(tok);
  }
  return out;
}

// 32-bit string hash (FNV-1a-ish, good enough for hashing trick).
function murmurish(s: string): number {
  let h = 0x811c9dc5 | 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  // Final avalanche.
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h;
}

function firstSentence(text: string): string {
  const trimmed = text.replace(/\s+/g, " ").trim();
  const m = trimmed.match(/^.{20,240}?[.!?](\s|$)/);
  return (m ? m[0] : trimmed.slice(0, 200)).trim();
}

function buildMockThreadSummary(opts: SummarizeThreadOptions): string {
  const { topicTitle, postType, posts } = opts;
  const participantSet = new Set(posts.map((p) => p.author));
  const participants = [...participantSet];
  const lead = postTypeSummaryLead(postType, topicTitle);

  if (posts.length === 0) {
    return `${lead}\n\nNo replies yet — be the first to engage.`;
  }

  const bullets = posts.slice(0, 6).map((p) => {
    const sentence = firstSentence(p.body);
    return `- **${p.author}**: ${sentence}`;
  });

  const closing =
    posts.length >= 5
      ? "The discussion is converging on a few key tensions; a synthesizer post would be welcome."
      : "Early in the thread — more perspectives would sharpen the picture.";

  return [
    lead,
    "",
    `**Participants** (${participants.length}): ${participants.join(", ")}.`,
    "",
    "**Argument map:**",
    ...bullets,
    "",
    closing,
  ].join("\n");
}

function postTypeSummaryLead(postType: string, title: string): string {
  switch (postType) {
    case "claim":
      return `This thread debates the claim **"${title}"**.`;
    case "question":
      return `This thread tackles the question **"${title}"**.`;
    case "derivation":
      return `This thread reviews a derivation: **"${title}"**.`;
    case "critique":
      return `This thread is a critique titled **"${title}"**.`;
    case "synthesis":
      return `This thread is a synthesis: **"${title}"**.`;
    case "prediction":
      return `This thread evaluates a prediction: **"${title}"**.`;
    default:
      return `Discussion of **"${title}"**.`;
  }
}
