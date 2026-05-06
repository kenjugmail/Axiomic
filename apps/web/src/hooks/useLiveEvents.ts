import { useEffect, useRef } from "react";
import type { LiveEvent } from "@axiomic/types";

// Single shared WebSocket per page-load. Multiple components that
// want to listen for live events all attach onMessage handlers; the
// connection itself is opened lazily on first subscribe and torn
// down when the last subscriber unmounts.

type Handler = (event: LiveEvent) => void;

let socket: WebSocket | null = null;
const handlers = new Set<Handler>();
let lastClosedAt = 0;

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
    ws.onmessage = (e) => {
      let parsed: LiveEvent | null = null;
      try {
        parsed = JSON.parse(e.data) as LiveEvent;
      } catch {
        return;
      }
      for (const h of handlers) {
        try {
          h(parsed);
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

export interface UseLiveEventsOptions {
  // Articles to subscribe to. Sent as `subscribe_article` frames once
  // the socket opens.
  articleSlugs?: string[];
  onEvent: Handler;
}

export function useLiveEvents({ articleSlugs = [], onEvent }: UseLiveEventsOptions): void {
  // Hold the latest handler in a ref so the effect-cleanup uses the
  // identity we registered; consumers don't need to memoize.
  const handlerRef = useRef<Handler>(onEvent);
  handlerRef.current = onEvent;

  useEffect(() => {
    const proxy: Handler = (e) => handlerRef.current(e);
    handlers.add(proxy);
    const ws = ensureSocket();
    const subscribe = () => {
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      for (const slug of articleSlugs) {
        try {
          ws.send(JSON.stringify({ type: "subscribe_article", slug }));
        } catch {
          // ignore
        }
      }
    };
    if (ws) {
      if (ws.readyState === WebSocket.OPEN) subscribe();
      else ws.addEventListener("open", subscribe, { once: true });
    }
    return () => {
      handlers.delete(proxy);
      if (handlers.size === 0 && socket && socket.readyState === WebSocket.OPEN) {
        socket.close();
        socket = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [articleSlugs.join("|")]);
}
