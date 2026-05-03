import type { AIProvider, StreamOptions, SummarizeThreadOptions } from "../provider";
import fs from "fs";
import path from "path";

export class MockProvider implements AIProvider {
  name = "mock";
  private responses: Map<string, any[]> = new Map();
  private loaded = false;

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

  async embed(text: string): Promise<number[]> {
    // Deterministic hash-based embeddings (384 dimensions)
    const dim = 384;
    const vec = new Array(dim).fill(0);
    const words = text.toLowerCase().split(/\s+/);

    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      let hash = 0;
      for (let j = 0; j < word.length; j++) {
        hash = ((hash << 5) - hash + word.charCodeAt(j)) | 0;
      }
      for (let d = 0; d < dim; d++) {
        const seed = hash ^ (d * 2654435761);
        vec[d] += Math.sin(seed) / words.length;
      }
    }

    // Normalize
    const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0));
    return vec.map((v) => v / (norm || 1));
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
