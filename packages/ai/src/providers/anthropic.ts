import type { AIProvider, StreamOptions, ModelInfo } from "../provider";

// Anthropic / Claude API provider. Uses @anthropic-ai/sdk if it's
// installed; the SDK is loaded via a runtime import so this file
// type-checks even when the dep isn't present (it's not a hard
// requirement for the workspace — only routes that explicitly call
// the Anthropic provider need the SDK installed).
//
// AI_PROVIDER=anthropic + ANTHROPIC_API_KEY=<key> activates this.

const DEFAULT_MODEL = "claude-sonnet-4-6";
const AVAILABLE_MODELS: ModelInfo[] = [
  { id: "claude-opus-4-7", label: "Claude Opus 4.7 (most capable)" },
  { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6 (balanced)" },
  { id: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5 (fast + cheap)" },
];

interface AnthropicMessage {
  role: "user" | "assistant";
  content: string;
}

interface AnthropicClient {
  messages: {
    stream(opts: {
      model: string;
      max_tokens: number;
      system?: string;
      messages: AnthropicMessage[];
    }): AsyncIterable<{
      type: string;
      delta?: { type?: string; text?: string };
    }> & { finalMessage?: () => Promise<unknown> };
  };
}

let _client: AnthropicClient | null = null;
let _clientInitTried = false;

async function loadClient(apiKey: string): Promise<AnthropicClient | null> {
  if (_client) return _client;
  if (_clientInitTried) return null;
  _clientInitTried = true;
  try {
    // Dynamic import keeps the SDK an optional dep — typecheck works
    // without it installed; runtime fails cleanly if it's missing.
    // Indirect import string defeats TypeScript module-resolution at
    // compile time; this only loads at runtime when the SDK is present.
    const moduleName = "@anthropic-ai/sdk";
    const mod: unknown = await import(/* @vite-ignore */ /* webpackIgnore: true */ moduleName);
    type AnthropicCtor = new (cfg: { apiKey: string }) => AnthropicClient;
    type AnthropicModule = {
      default?: AnthropicCtor;
      Anthropic?: AnthropicCtor;
    };
    const m = mod as AnthropicModule;
    const Anthropic = m.default ?? m.Anthropic;
    if (!Anthropic) return null;
    _client = new Anthropic({ apiKey });
    return _client;
  } catch {
    return null;
  }
}

export class AnthropicProvider implements AIProvider {
  name = "anthropic";

  async stream(opts: StreamOptions): Promise<void> {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error(
        "ANTHROPIC_API_KEY env var is required for the Anthropic provider",
      );
    }
    const client = await loadClient(apiKey);
    if (!client) {
      throw new Error(
        "@anthropic-ai/sdk is not installed. Run `bun add @anthropic-ai/sdk` in packages/ai.",
      );
    }
    const messages: AnthropicMessage[] = opts.messages
      .filter((m) => m.role !== "system")
      .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));
    const stream = client.messages.stream({
      model: opts.model ?? DEFAULT_MODEL,
      max_tokens: 8192,
      system: opts.system,
      messages,
    });
    for await (const event of stream) {
      if (opts.signal?.aborted) return;
      if (event.type === "content_block_delta" && event.delta?.type === "text_delta" && event.delta.text) {
        opts.onToken(event.delta.text);
      }
    }
  }

  async embed(_text: string): Promise<number[]> {
    throw new Error("Anthropic provider does not support embeddings; use ollama/mock for embeddings");
  }

  async listModels(): Promise<{ available: ModelInfo[]; default: string }> {
    return { available: AVAILABLE_MODELS, default: DEFAULT_MODEL };
  }
}
