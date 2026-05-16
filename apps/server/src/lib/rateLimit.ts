// Simple in-memory rate limiter shared across routes that hit the AI
// provider or other expensive paths. Process-local — fine for the
// single-host deploy targets; a multi-instance deploy would swap this
// for a Redis-backed counter.
//
// rateLimitIdentity() builds the key from the caller. Auth'd users
// bucket by user id (stable, can't be spoofed). Anonymous callers
// trust a parsed x-forwarded-for chain combined with a user-agent
// hash so a single attacker can't trivially rotate just the IP
// header to bypass the limit. This isn't a defense against a
// botnet — it's a deterrent against casual abuse of public AI
// endpoints, which is the realistic threat model.

export const rateLimits = new Map<
  string,
  { count: number; resetAt: number; rejected: number }
>();

// Phase 36 — bound memory. Expired entries are inert (an expired
// entry is treated as fresh below) but were never removed, so a
// long-running process accumulated keys forever (notably anon
// `ip:*` keys via X-Forwarded-For rotation). Sweep opportunistically
// — amortized O(1): only every Nth call, or eagerly once the map
// grows large. Pure cleanup; no behavior change.
let callsSinceSweep = 0;
const SWEEP_EVERY = 1000;
const SWEEP_SIZE_THRESHOLD = 10_000;

function sweepExpired(now: number): void {
  for (const [k, v] of rateLimits) {
    if (now > v.resetAt) rateLimits.delete(k);
  }
}

export function checkRateLimit(
  key: string,
  max: number,
  windowMs: number,
): boolean {
  const now = Date.now();
  if (
    ++callsSinceSweep >= SWEEP_EVERY ||
    rateLimits.size > SWEEP_SIZE_THRESHOLD
  ) {
    callsSinceSweep = 0;
    sweepExpired(now);
  }
  const entry = rateLimits.get(key);
  if (!entry || now > entry.resetAt) {
    rateLimits.set(key, { count: 1, resetAt: now + windowMs, rejected: 0 });
    return true;
  }
  if (entry.count >= max) {
    entry.rejected++;
    return false;
  }
  entry.count++;
  return true;
}

interface HeaderReader {
  req: { header: (name: string) => string | undefined };
}

export function rateLimitIdentity(c: HeaderReader, userId?: string): string {
  if (userId) return `u:${userId}`;
  const xff = c.req.header("x-forwarded-for");
  const firstIp = xff ? xff.split(",")[0]?.trim() : "";
  const ua = c.req.header("user-agent") ?? "";
  let uaHash = 0;
  for (let i = 0; i < ua.length; i++) {
    uaHash = ((uaHash << 5) - uaHash + ua.charCodeAt(i)) | 0;
  }
  if (firstIp) return `ip:${firstIp}:${uaHash}`;
  return "anonymous";
}
