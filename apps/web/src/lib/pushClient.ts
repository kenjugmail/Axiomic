// S107a — Web Push client helper.
//
// Tiny wrapper around the browser's PushManager so the settings
// toggle stays focused on UX, not the b64url-key dance. Returns
// a boolean (or throws on hard errors) so the caller can update
// state directly.

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

export interface PushState {
  supported: boolean;
  // Null when server hasn't been configured with VAPID keys.
  vapidPublicKey: string | null;
  // The current PushSubscription, or null when not subscribed.
  subscription: PushSubscription | null;
}

export async function readPushState(): Promise<PushState> {
  const supported =
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window;
  if (!supported) {
    return { supported: false, vapidPublicKey: null, subscription: null };
  }
  let key: string | null = null;
  try {
    const r = await fetch("/api/v1/push/vapid-public-key", { credentials: "include" });
    if (r.ok) {
      const d = (await r.json()) as { key: string | null };
      key = d.key;
    }
  } catch {
    // ignore — settings page will show "not configured"
  }
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  return { supported, vapidPublicKey: key, subscription: sub };
}

// Subscribes the user. Pulls + caches the subscription on the
// server. Throws if VAPID isn't configured or the user denies the
// permission prompt.
export async function subscribePush(vapidPublicKey: string): Promise<PushSubscription> {
  const reg = await navigator.serviceWorker.ready;
  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error("Notification permission denied");
  }
  // applicationServerKey accepts string | BufferSource. The
  // Uint8Array we get back from urlBase64ToUint8Array has the right
  // bytes but TS narrows it via generic to `Uint8Array<ArrayBufferLike>`
  // which TS5 considers narrower than `BufferSource`. Cast to the
  // underlying ArrayBuffer to satisfy the lib types.
  const keyBytes = urlBase64ToUint8Array(vapidPublicKey);
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: keyBytes.buffer as ArrayBuffer,
  });
  // The keys are returned as ArrayBuffers; convert to b64url
  // strings so JSON round-trips cleanly.
  const p256dh = sub.getKey("p256dh");
  const auth = sub.getKey("auth");
  if (!p256dh || !auth) throw new Error("Subscription missing keys");
  await fetch("/api/v1/push/subscribe", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      endpoint: sub.endpoint,
      p256dhKey: arrayBufferToBase64Url(p256dh),
      authKey: arrayBufferToBase64Url(auth),
      userAgent: navigator.userAgent,
    }),
  });
  return sub;
}

export async function unsubscribePush(sub: PushSubscription): Promise<void> {
  await fetch("/api/v1/push/unsubscribe", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint: sub.endpoint }),
  });
  await sub.unsubscribe();
}

function arrayBufferToBase64Url(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return window
    .btoa(bin)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}
