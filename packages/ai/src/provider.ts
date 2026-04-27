export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface StreamOptions {
  system: string;
  messages: ChatMessage[];
  onToken: (token: string) => void;
}

export interface AIProvider {
  stream(opts: StreamOptions): Promise<void>;
  embed(text: string): Promise<number[]>;
  name: string;
}
