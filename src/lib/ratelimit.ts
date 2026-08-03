// A tiny in-memory IP rate limiter: a spend ceiling and abuse guard (PRD 6.3).
// Fixed-window per IP, pure JS so it runs anywhere. On multi-instance deploys
// this is best-effort per instance; that is fine for the "slow down" ceiling.

interface Window {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Window>();

const DEFAULT_LIMIT = 12;
const DEFAULT_WINDOW_MS = 60_000;

export function rateLimit(
  ip: string,
  opts: { limit?: number; windowMs?: number } = {}
): { ok: boolean; retryAfterMs: number } {
  const limit = opts.limit ?? DEFAULT_LIMIT;
  const windowMs = opts.windowMs ?? DEFAULT_WINDOW_MS;
  const now = Date.now();

  const existing = buckets.get(ip);
  if (!existing || existing.resetAt <= now) {
    buckets.set(ip, { count: 1, resetAt: now + windowMs });
    maybeSweep(now);
    return { ok: true, retryAfterMs: 0 };
  }

  if (existing.count >= limit) {
    return { ok: false, retryAfterMs: Math.max(0, existing.resetAt - now) };
  }

  existing.count += 1;
  return { ok: true, retryAfterMs: 0 };
}

// Opportunistically drop expired buckets so the Map can't grow unbounded under
// a stream of unique IPs.
let lastSweep = 0;
function maybeSweep(now: number): void {
  if (now - lastSweep < DEFAULT_WINDOW_MS) return;
  lastSweep = now;
  for (const [ip, win] of buckets) {
    if (win.resetAt <= now) buckets.delete(ip);
  }
}
