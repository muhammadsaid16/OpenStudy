// Simple in-memory per-IP rate limit for server routes (6.4).
// For serverless, this covers a single instance; pair with a WAF for
// fleet-wide enforcement. Unit-tested in rate-limit.test.ts.

const buckets = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(key: string, max: number, windowMs: number): { ok: boolean; retryAfterMs: number } {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || now > b.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfterMs: 0 };
  }
  if (b.count < max) {
    b.count++;
    return { ok: true, retryAfterMs: 0 };
  }
  return { ok: false, retryAfterMs: b.resetAt - now };
}

/**
 * Best-effort caller identity for rate limiting.
 *
 * `x-forwarded-for` is client-appendable, so its first entry is whatever the
 * caller chose to send. Reading that verbatim meant any caller could mint a
 * fresh quota by rotating the value, which made the per-IP cap on the AI
 * routes decorative. Prefer a header the platform sets, then the *last* hop
 * (appended by the nearest proxy), and only then give up.
 *
 * This assumes a trusted proxy in front of the app that overwrites these
 * headers. Without one, every value here is caller-controlled and no in-app
 * scheme can fix it.
 *
 * Returns "unknown" when the request carries nothing to distinguish it. Those
 * callers share one bucket on purpose: a per-request random key would disable
 * limiting entirely for anyone who simply strips their headers.
 */
export function clientIp(req: Request): string {
  const headers = req.headers as Headers | undefined;
  const h = (name: string) => headers?.get?.(name)?.trim() || "";

  const platform = h("cf-connecting-ip") || h("x-real-ip");
  if (platform) return platform;

  const xff = h("x-forwarded-for");
  if (xff) {
    const hops = xff.split(",").map((s) => s.trim()).filter(Boolean);
    if (hops.length > 0) return hops[hops.length - 1];
  }

  return "unknown";
}

// Prune old buckets occasionally
if (typeof setInterval !== "undefined") {
  setInterval(() => {
    const now = Date.now();
    for (const [k, v] of buckets) if (now > v.resetAt) buckets.delete(k);
  }, 60_000).unref?.();
}
