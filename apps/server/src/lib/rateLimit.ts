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

export function checkRateLimit(
  key: string,
  max: number,
  windowMs: number,
): boolean {
  const now = Date.now();
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
