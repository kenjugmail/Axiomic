export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface StreamOptions {
  system: string;
  messages: ChatMessage[];
  onToken: (token: string) => void;
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
  name: string;
}
