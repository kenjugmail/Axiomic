import type { ServerWebSocket } from "bun";

// Per-user WebSocket fan-out. The `notify()` helper publishes to the
// recipient's bucket; per-article reaction updates publish to a
// `news:{slug}` bucket. Per-draft updates publish to a
// `draft:{kind}:{id}` bucket (Sprint 40).
//
// Sockets are stored as untyped to avoid leaking the WebSocketData
// shape across modules — the server bootstrap declares the shape.

type WS = ServerWebSocket<{ userId: string | null; subscriptions: Set<string> }>;

const userBuckets = new Map<string, Set<WS>>();
const articleBuckets = new Map<string, Set<WS>>();
// Sprint 40 — draft channels keyed by `${kind}:${targetId}`. kind is
// 'lesson' | 'paper' | 'capstone' so all three editing surfaces share
// one fan-out and a verifying helper can ignore the shape difference.
const draftBuckets = new Map<string, Set<WS>>();
// Phase 29B — collaborative review rooms keyed by
// `${kind}:${roomId}`. kind is 'reproduction' |
// 'capstone_submission'. Parallel to draftBuckets, never modifies
// it, so the draft collaboration path is untouched.
const roomBuckets = new Map<string, Set<WS>>();

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

export type DraftKind = "lesson" | "paper" | "capstone";

export function subscribeDraft(
  ws: WS,
  kind: DraftKind,
  targetId: string,
): void {
  const key = `${kind}:${targetId}`;
  let bucket = draftBuckets.get(key);
  if (!bucket) {
    bucket = new Set();
    draftBuckets.set(key, bucket);
  }
  bucket.add(ws);
  ws.data?.subscriptions.add(`draft:${key}`);
}

export type RoomKind =
  | "reproduction"
  | "capstone_submission"
  | "cohort_study"
  | "bounty_collaboration";

export function subscribeRoom(
  ws: WS,
  kind: RoomKind,
  roomId: string,
): void {
  const key = `${kind}:${roomId}`;
  let bucket = roomBuckets.get(key);
  if (!bucket) {
    bucket = new Set();
    roomBuckets.set(key, bucket);
  }
  bucket.add(ws);
  ws.data?.subscriptions.add(`room:${key}`);
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
    } else if (sub.startsWith("draft:")) {
      const key = sub.slice("draft:".length);
      const bucket = draftBuckets.get(key);
      if (bucket) {
        bucket.delete(ws);
        if (bucket.size === 0) draftBuckets.delete(key);
      }
    } else if (sub.startsWith("room:")) {
      const key = sub.slice("room:".length);
      const bucket = roomBuckets.get(key);
      if (bucket) {
        bucket.delete(ws);
        if (bucket.size === 0) roomBuckets.delete(key);
      }
    }
  }

  // Trigger presence broadcast on each draft/room channel the
  // socket left so peers see the leaving user disappear.
  for (const sub of ws.data?.subscriptions ?? []) {
    if (sub.startsWith("draft:")) {
      const [kind, targetId] = sub.slice("draft:".length).split(":") as [
        DraftKind,
        string,
      ];
      broadcastDraftPresence(kind, targetId);
    } else if (sub.startsWith("room:")) {
      const [kind, roomId] = sub.slice("room:".length).split(":") as [
        RoomKind,
        string,
      ];
      broadcastRoomPresence(kind, roomId);
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

export function publishToDraft(
  kind: DraftKind,
  targetId: string,
  payload: unknown,
): void {
  const bucket = draftBuckets.get(`${kind}:${targetId}`);
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

// Pluggable username resolver — set on server boot so liveBus can
// broadcast presence events with `{userId, username}` pairs without
// importing the DB layer (which would create a cycle).
type UsernameResolver = (
  userIds: string[],
) => Promise<Map<string, string>> | Map<string, string>;
let usernameResolver: UsernameResolver | null = null;
export function setUsernameResolver(fn: UsernameResolver): void {
  usernameResolver = fn;
}

// Sprint 40 — emit a `draft_presence` event with the current set of
// users connected to this draft channel. Called on subscribe +
// unsubscribe so the editor's presence chips stay current.
export async function broadcastDraftPresence(
  kind: DraftKind,
  targetId: string,
): Promise<void> {
  const bucket = draftBuckets.get(`${kind}:${targetId}`);
  if (!bucket) return;
  const userIds = new Set<string>();
  for (const ws of bucket) {
    if (ws.data?.userId) userIds.add(ws.data.userId);
  }
  const ids = [...userIds];
  let usernameMap = new Map<string, string>();
  if (usernameResolver && ids.length > 0) {
    try {
      const resolved = await usernameResolver(ids);
      usernameMap = resolved instanceof Map ? resolved : new Map();
    } catch {
      usernameMap = new Map();
    }
  }
  publishToDraft(kind, targetId, {
    type: "draft_presence",
    kind,
    targetId,
    userIds: ids,
    usernames: ids.map((id) => usernameMap.get(id) ?? "?"),
  });
}

// Phase 29B — review-room fan-out, mirroring the draft channel
// functions exactly (separate buckets, zero impact on drafts).
export function publishToRoom(
  kind: RoomKind,
  roomId: string,
  payload: unknown,
): void {
  const bucket = roomBuckets.get(`${kind}:${roomId}`);
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

export async function broadcastRoomPresence(
  kind: RoomKind,
  roomId: string,
): Promise<void> {
  const bucket = roomBuckets.get(`${kind}:${roomId}`);
  if (!bucket) return;
  const userIds = new Set<string>();
  for (const ws of bucket) {
    if (ws.data?.userId) userIds.add(ws.data.userId);
  }
  const ids = [...userIds];
  let usernameMap = new Map<string, string>();
  if (usernameResolver && ids.length > 0) {
    try {
      const resolved = await usernameResolver(ids);
      usernameMap = resolved instanceof Map ? resolved : new Map();
    } catch {
      usernameMap = new Map();
    }
  }
  publishToRoom(kind, roomId, {
    type: "room_presence",
    kind,
    roomId,
    userIds: ids,
    usernames: ids.map((id) => usernameMap.get(id) ?? "?"),
  });
}
