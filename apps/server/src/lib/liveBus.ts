import type { ServerWebSocket } from "bun";

// Per-user WebSocket fan-out. The `notify()` helper publishes to the
// recipient's bucket; per-article reaction updates publish to a
// `news:{slug}` bucket. Disconnects clean up after themselves.
//
// Sockets are stored as untyped to avoid leaking the WebSocketData
// shape across modules — the server bootstrap declares the shape.

type WS = ServerWebSocket<{ userId: string | null; subscriptions: Set<string> }>;

const userBuckets = new Map<string, Set<WS>>();
const articleBuckets = new Map<string, Set<WS>>();

export function attachUser(ws: WS, userId: string): void {
  if (!ws.data) {
    return;
  }
  ws.data.userId = userId;
  let bucket = userBuckets.get(userId);
  if (!bucket) {
    bucket = new Set();
    userBuckets.set(userId, bucket);
  }
  bucket.add(ws);
}

export function subscribeArticle(ws: WS, slug: string): void {
  let bucket = articleBuckets.get(slug);
  if (!bucket) {
    bucket = new Set();
    articleBuckets.set(slug, bucket);
  }
  bucket.add(ws);
  ws.data?.subscriptions.add(`news:${slug}`);
}

export function detach(ws: WS): void {
  const userId = ws.data?.userId;
  if (userId) {
    const bucket = userBuckets.get(userId);
    if (bucket) {
      bucket.delete(ws);
      if (bucket.size === 0) userBuckets.delete(userId);
    }
  }
  for (const sub of ws.data?.subscriptions ?? []) {
    if (sub.startsWith("news:")) {
      const slug = sub.slice("news:".length);
      const bucket = articleBuckets.get(slug);
      if (bucket) {
        bucket.delete(ws);
        if (bucket.size === 0) articleBuckets.delete(slug);
      }
    }
  }
}

export function publishToUser(userId: string, payload: unknown): void {
  const bucket = userBuckets.get(userId);
  if (!bucket) return;
  const json = JSON.stringify(payload);
  for (const ws of bucket) {
    try {
      ws.send(json);
    } catch {
      // socket may have closed between checks; ignore.
    }
  }
}

export function publishToArticle(slug: string, payload: unknown): void {
  const bucket = articleBuckets.get(slug);
  if (!bucket) return;
  const json = JSON.stringify(payload);
  for (const ws of bucket) {
    try {
      ws.send(json);
    } catch {
      // ignore
    }
  }
}
