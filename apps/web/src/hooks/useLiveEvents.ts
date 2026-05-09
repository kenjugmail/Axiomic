import { useEffect, useRef } from "react";
import type { LiveEvent } from "@axiomic/types";

// Single shared WebSocket per page-load. Multiple components that
// want to listen for live events all register subscriptions; the
// connection itself is opened lazily on first subscribe and torn
// down when the last subscriber unmounts.
//
// Reliability: we keep the FULL subscription record (proxy + per-mount
// channels) in `subscriptions`, not just the handlers. On every WS
// open — including reconnects after a transient disconnect — we
// replay every active subscription's channel set so the server sees
// the right view of who's listening to what. Without this replay, a
// component that mounted before a transient WS disconnect would
// silently stop receiving its events when the socket came back.

type Handler = (event: LiveEvent) => void;

interface Subscription {
  proxy: Handler;
  articleSlugs: string[];
  draftChannels: DraftChannel[];
}

let socket: WebSocket | null = null;
const subscriptions = new Set<Subscription>();
let lastClosedAt = 0;

function sendSubscriptionFrames(ws: WebSocket, sub: Subscription): void {
  if (ws.readyState !== WebSocket.OPEN) return;
  for (const slug of sub.articleSlugs) {
    try {
      ws.send(JSON.stringify({ type: "subscribe_article", slug }));
    } catch {
      // ignore
    }
  }
  for (const ch of sub.draftChannels) {
    try {
      ws.send(
        JSON.stringify({
          type: "subscribe_draft",
          kind: ch.kind,
          targetId: ch.targetId,
        }),
      );
    } catch {
      // ignore
    }
  }
}

function ensureSocket(): WebSocket | null {
  if (typeof window === "undefined") return null;
  if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
    return socket;
  }
  // Don't reconnect-storm if the server is down.
  if (Date.now() - lastClosedAt < 1000) return null;
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  const url = `${proto}//${window.location.host}/api/v1/ws`;
  try {
    const ws = new WebSocket(url);
    socket = ws;
    ws.onopen = () => {
      // Replay every active subscription against the freshly-opened
      // socket so reconnects don't silently drop prior subscribers.
      for (const sub of subscriptions) sendSubscriptionFrames(ws, sub);
    };
    ws.onmessage = (e) => {
      let parsed: LiveEvent | null = null;
      try {
        parsed = JSON.parse(e.data) as LiveEvent;
      } catch {
        return;
      }
      for (const sub of subscriptions) {
        try {
          sub.proxy(parsed);
        } catch {
          // ignore handler errors
        }
      }
    };
    ws.onclose = () => {
      lastClosedAt = Date.now();
      socket = null;
    };
    ws.onerror = () => {
      // Let onclose handle teardown.
    };
    return ws;
  } catch {
    return null;
  }
}

export type DraftKind = "lesson" | "paper" | "capstone";

export interface DraftChannel {
  kind: DraftKind;
  targetId: string;
}

export interface UseLiveEventsOptions {
  // Articles to subscribe to. Sent as `subscribe_article` frames once
  // the socket opens.
  articleSlugs?: string[];
  // Sprint 40 — draft collab channels. Each ({kind, targetId}) sends
  // a `subscribe_draft` frame once the socket opens; the server fans
  // out `draft_update` / `draft_published` / `draft_presence` events
  // to all subscribers.
  draftChannels?: DraftChannel[];
  onEvent: Handler;
}

export function useLiveEvents({
  articleSlugs = [],
  draftChannels = [],
  onEvent,
}: UseLiveEventsOptions): void {
  // Hold the latest handler in a ref so the effect-cleanup uses the
  // identity we registered; consumers don't need to memoize.
  const handlerRef = useRef<Handler>(onEvent);
  handlerRef.current = onEvent;

  useEffect(() => {
    const proxy: Handler = (e) => handlerRef.current(e);
    const sub: Subscription = { proxy, articleSlugs, draftChannels };
    subscriptions.add(sub);

    const ws = ensureSocket();
    // If the socket is already open, send our subscription frames now.
    // Otherwise the global onopen handler will replay every active
    // subscription (including ours) when the connection completes.
    if (ws && ws.readyState === WebSocket.OPEN) sendSubscriptionFrames(ws, sub);

    return () => {
      subscriptions.delete(sub);
      if (subscriptions.size === 0 && socket && socket.readyState === WebSocket.OPEN) {
        socket.close();
        socket = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [articleSlugs.join("|"), draftChannels.map((d) => `${d.kind}:${d.targetId}`).join("|")]);
}
