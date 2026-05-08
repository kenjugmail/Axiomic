import type {
  AIProvider,
  ModelInfo,
  StreamOptions,
  SummarizeThreadOptions,
} from "../provider";
import { MockProvider } from "./mock";

export class OllamaProvider implements AIProvider {
  name = "ollama";
  private host: string;
  private chatModel: string;
  private embedModel: string;
  private fallback: MockProvider;
  private available: boolean | null = null;
  // Sprint 63f — cache the /api/tags response for 5 minutes so the
  // picker doesn't hammer the host on every sidebar open.
  private modelsCache: { ts: number; models: ModelInfo[] } | null = null;
  private static readonly MODELS_TTL_MS = 5 * 60 * 1000;

  constructor() {
    this.host = process.env.OLLAMA_HOST || "http://localhost:11434";
    this.chatModel = process.env.OLLAMA_CHAT_MODEL || "llama3.1:8b";
    this.embedModel = process.env.OLLAMA_EMBED_MODEL || "nomic-embed-text";
    this.fallback = new MockProvider();
  }

  private async checkAvailability(): Promise<boolean> {
    if (this.available !== null) return this.available;
    try {
      const res = await fetch(`${this.host}/api/tags`, { signal: AbortSignal.timeout(2000) });
      this.available = res.ok;
    } catch {
      this.available = false;
    }
    if (!this.available) {
      console.warn("Ollama not available, falling back to MockProvider");
    }
    return this.available;
  }

  async stream(opts: StreamOptions): Promise<void> {
    if (!(await this.checkAvailability())) {
      return this.fallback.stream(opts);
    }

    try {
      const messages = [
        { role: "system" as const, content: opts.system },
        ...opts.messages,
      ];

      // Sprint 63f — honor per-request model override; fall back to the
      // configured default.
      const effectiveModel = opts.model && opts.model.trim().length > 0
        ? opts.model
        : this.chatModel;

      const res = await fetch(`${this.host}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: effectiveModel,
          messages,
          stream: true,
        }),
      });

      if (!res.ok || !res.body) {
        console.warn("Ollama stream failed, falling back to mock");
        return this.fallback.stream(opts);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const data = JSON.parse(line);
            if (data.message?.content) {
              opts.onToken(data.message.content);
            }
          } catch {
            // skip malformed lines
          }
        }
      }
    } catch (err) {
      console.warn("Ollama error, falling back to mock:", err);
      return this.fallback.stream(opts);
    }
  }

  async summarizeThread(opts: SummarizeThreadOptions): Promise<void> {
    if (!(await this.checkAvailability())) {
      return this.fallback.summarizeThread(opts);
    }
    const transcript = opts.posts
      .map((p, i) => `[reply ${i + 1}] ${p.author}: ${p.body}`)
      .join("\n\n");
    const system = `You are a thread synthesizer for the Axiomic discourse forum. Summarize the discussion crisply and faithfully.

Topic type: ${opts.postType}
Topic title: ${opts.topicTitle}

Original post:
${opts.topicBody}

Replies:
${transcript || "(none yet)"}

Produce a markdown summary with three short sections: (1) the core question/claim, (2) the main positions and who held them, (3) where the thread converges or diverges. Be neutral. Do not invent points that no one made.`;

    return this.stream({
      system,
      messages: [{ role: "user", content: "Summarize this thread." }],
      onToken: opts.onToken,
    });
  }

  async embed(text: string): Promise<number[]> {
    if (!(await this.checkAvailability())) {
      return this.fallback.embed(text);
    }

    try {
      const res = await fetch(`${this.host}/api/embed`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: this.embedModel,
          input: text,
        }),
      });

      if (!res.ok) {
        return this.fallback.embed(text);
      }

      const data = await res.json() as any;
      return data.embeddings?.[0] || (await this.fallback.embed(text));
    } catch {
      return this.fallback.embed(text);
    }
  }

  // Sprint 63f — returns Ollama-installed models via /api/tags. Falls
  // back to a single-entry list with the configured default when the
  // host is unreachable.
  async listModels(): Promise<{ available: ModelInfo[]; default: string }> {
    const now = Date.now();
    if (
      this.modelsCache &&
      now - this.modelsCache.ts < OllamaProvider.MODELS_TTL_MS
    ) {
      return { available: this.modelsCache.models, default: this.chatModel };
    }

    let models: ModelInfo[] = [];
    try {
      const res = await fetch(`${this.host}/api/tags`, {
        signal: AbortSignal.timeout(2000),
      });
      if (res.ok) {
        const data = (await res.json()) as { models?: Array<{ name?: string }> };
        models = (data.models ?? [])
          .map((m) => m?.name)
          .filter((n): n is string => typeof n === "string" && n.length > 0)
          .map((id) => ({ id }));
      }
    } catch {
      // fall through to default-only
    }

    if (models.length === 0) {
      models = [{ id: this.chatModel }];
    } else if (!models.some((m) => m.id === this.chatModel)) {
      // Make sure the configured default appears even if /api/tags didn't
      // mention it (e.g. on a fresh host before the model is pulled).
      models = [{ id: this.chatModel }, ...models];
    }

    this.modelsCache = { ts: now, models };
    return { available: models, default: this.chatModel };
  }
}
