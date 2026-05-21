import type { AIProvider } from "./provider";
import { MockProvider } from "./providers/mock";
import { OllamaProvider } from "./providers/ollama";
import { AnthropicProvider } from "./providers/anthropic";

export type { AIProvider, ChatMessage, StreamOptions, ModelInfo } from "./provider";
export { MockProvider } from "./providers/mock";
export { OllamaProvider } from "./providers/ollama";
export { AnthropicProvider } from "./providers/anthropic";

let _provider: AIProvider | null = null;

export function getAIProvider(): AIProvider {
  if (_provider) return _provider;

  const providerName = process.env.AI_PROVIDER || "mock";

  switch (providerName) {
    case "ollama":
      _provider = new OllamaProvider();
      break;
    case "anthropic":
      _provider = new AnthropicProvider();
      break;
    case "mock":
    default:
      _provider = new MockProvider();
      break;
  }

  console.log(`AI provider initialized: ${_provider.name}`);
  return _provider;
}
