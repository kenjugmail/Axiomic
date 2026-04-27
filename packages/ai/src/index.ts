import type { AIProvider } from "./provider";
import { MockProvider } from "./providers/mock";
import { OllamaProvider } from "./providers/ollama";

export type { AIProvider, ChatMessage, StreamOptions } from "./provider";
export { MockProvider } from "./providers/mock";
export { OllamaProvider } from "./providers/ollama";

let _provider: AIProvider | null = null;

export function getAIProvider(): AIProvider {
  if (_provider) return _provider;

  const providerName = process.env.AI_PROVIDER || "mock";

  switch (providerName) {
    case "ollama":
      _provider = new OllamaProvider();
      break;
    case "mock":
    default:
      _provider = new MockProvider();
      break;
  }

  console.log(`AI provider initialized: ${_provider.name}`);
  return _provider;
}
