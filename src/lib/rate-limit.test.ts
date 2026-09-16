import { describe, expect, it, vi, afterEach } from "vitest";
import { rateLimit, clientIp } from "@/lib/rate-limit";

function reqWith(headers: Record<string, string> = {}) {
  return new Request("http://localhost/api/test", { headers });
}

describe("rateLimit", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("allows exactly `max` requests inside the window, then blocks", () => {
    const key = "test:allow";
    for (let i = 0; i < 3; i++) {
      expect(rateLimit(key, 3, 60_000).ok).toBe(true);
    }
    const blocked = rateLimit(key, 3, 60_000);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterMs).toBeGreaterThan(0);
  });

  it("reports a retry delay no longer than the window", () => {
    const key = "test:retry";
    rateLimit(key, 1, 5_000);
    const blocked = rateLimit(key, 1, 5_000);
    expect(blocked.retryAfterMs).toBeLessThanOrEqual(5_000);
  });

  it("starts a fresh window once the old one expires", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    const key = "test:expire";
    expect(rateLimit(key, 1, 1_000).ok).toBe(true);
    expect(rateLimit(key, 1, 1_000).ok).toBe(false);
    vi.setSystemTime(new Date("2026-01-01T00:00:02Z"));
    expect(rateLimit(key, 1, 1_000).ok).toBe(true);
  });

  it("counts each key independently", () => {
    expect(rateLimit("test:key-a", 1, 60_000).ok).toBe(true);
    expect(rateLimit("test:key-a", 1, 60_000).ok).toBe(false);
    expect(rateLimit("test:key-b", 1, 60_000).ok).toBe(true);
  });
});

describe("clientIp", () => {
  it("prefers the platform's own header over x-forwarded-for", () => {
    expect(
      clientIp(reqWith({ "cf-connecting-ip": "203.0.113.7", "x-forwarded-for": "9.9.9.9" }))
    ).toBe("203.0.113.7");
    expect(
      clientIp(reqWith({ "x-real-ip": "203.0.113.8", "x-forwarded-for": "9.9.9.9" }))
    ).toBe("203.0.113.8");
  });

  it("takes the last x-forwarded-for hop, not the caller-supplied first", () => {
    // A spoofed leftmost value must not become the rate-limit identity.
    expect(clientIp(reqWith({ "x-forwarded-for": "1.2.3.4, 203.0.113.9" }))).toBe("203.0.113.9");
  });

  it("handles a single-hop x-forwarded-for", () => {
    expect(clientIp(reqWith({ "x-forwarded-for": "203.0.113.10" }))).toBe("203.0.113.10");
  });

  it("ignores blank x-forwarded-for entries", () => {
    expect(clientIp(reqWith({ "x-forwarded-for": " , 203.0.113.11 , " }))).toBe("203.0.113.11");
  });

  it("falls back to a shared sentinel when nothing identifies the caller", () => {
    expect(clientIp(reqWith())).toBe("unknown");
  });
});
