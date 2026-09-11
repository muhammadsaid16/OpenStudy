// Simple in-memory per-IP rate limit for server routes (6.4).
// For serverless, this covers a single instance; pair with Vercel/WAF for fleet-wide.

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

export function clientIp(req: Request): string {
  const h = (req.headers as Headers).get?.("x-forwarded-for") || "";
  if (h) return h.split(",")[0].trim();
  const cf = (req.headers as Headers).get?.("x-real-ip");
  if (cf) return cf;
  return "0.0.0.0";
}

// Prune old buckets occasionally
if (typeof setInterval !== "undefined") {
  setInterval(() => {
    const now = Date.now();
    for (const [k, v] of buckets) if (now > v.resetAt) buckets.delete(k);
  }, 60_000).unref?.();
}
