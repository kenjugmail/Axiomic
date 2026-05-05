// Consume an SSE token stream produced by the AI routes. Each event is
// `data: {"token": "..."} | {"error": "..."} | [DONE]`. The caller
// receives tokens as they arrive plus a final settled value.

export interface StreamTokensOptions {
  url: string;
  body: any;
  onToken: (token: string, accumulated: string) => void;
  signal?: AbortSignal;
}

export async function streamTokens({
  url,
  body,
  onToken,
  signal,
}: StreamTokensOptions): Promise<{ ok: boolean; text: string; error?: string }> {
  const res = await fetch(url, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok || !res.body) {
    let error = "Stream failed";
    try {
      const j = await res.json();
      if (j?.error) error = j.error;
    } catch {}
    return { ok: false, text: "", error };
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let acc = "";
  let streamError: string | undefined;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const payload = line.slice(6);
      if (payload === "[DONE]") continue;
      try {
        const parsed = JSON.parse(payload);
        if (parsed.token) {
          acc += parsed.token;
          onToken(parsed.token, acc);
        } else if (parsed.error) {
          streamError = parsed.error;
        }
      } catch {
        // ignore malformed events
      }
    }
  }
  return streamError
    ? { ok: false, text: acc, error: streamError }
    : { ok: true, text: acc };
}
