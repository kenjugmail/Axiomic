import type { AIProvider, StreamOptions } from "../provider";
import { MockProvider } from "./mock";

export class OllamaProvider implements AIProvider {
  name = "ollama";
  private host: string;
  private chatModel: string;
  private embedModel: string;
  private fallback: MockProvider;
  private available: boolean | null = null;

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

      const res = await fetch(`${this.host}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: this.chatModel,
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
}
