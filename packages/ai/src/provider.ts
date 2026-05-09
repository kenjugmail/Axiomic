export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface StreamOptions {
  system: string;
  messages: ChatMessage[];
  onToken: (token: string) => void;
  // Sprint 63f — optional per-request model override. Falls back to
  // the provider's default chat model when undefined.
  model?: string;
}

export interface ModelInfo {
  id: string;
  label?: string;
}

export interface ThreadPost {
  author: string;
  body: string;
}

export interface SummarizeThreadOptions {
  topicTitle: string;
  topicBody: string;
  postType: string;
  posts: ThreadPost[];
  onToken: (token: string) => void;
}

export interface AIProvider {
  stream(opts: StreamOptions): Promise<void>;
  embed(text: string): Promise<number[]>;
  // Optional capability — providers without it cause the route to fall back to
  // a deterministic non-AI summary.
  summarizeThread?(opts: SummarizeThreadOptions): Promise<void>;
  // Sprint 63f — list available chat models for this provider, plus the
  // currently-configured default. Used by /api/v1/ai/models to populate
  // the AIModelPicker.
  listModels(): Promise<{ available: ModelInfo[]; default: string }>;
  name: string;
}
