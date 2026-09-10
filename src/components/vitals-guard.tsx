"use client";

import { useEffect } from "react";

/**
 * Vercel Speed Insights (/_vercel/speed-insights/script.js) injects a
 * web-vitals collector that on some Chrome builds throws
 *   TypeError: Cannot read properties of undefined (reading 'startTime')
 *   at reportAllChanges
 * inside a requestIdleCallback. It's a known race in the minified
 * web-vitals bundle when an observer fires with an empty/undefined entry.
 *
 * The app itself is fine — this is external telemetry. We swallow just
 * that one throw so it never surfaces in the console nor breaks UX.
 * Real app errors still log normally.
 */
export function VitalsGuard() {
  useEffect(() => {
    const isNoise = (msg: string) =>
      msg.includes("startTime") && (msg.includes("reportAllChanges") || msg.includes("web-vitals"));

    const onError = (e: ErrorEvent) => {
      const msg = String(e.message ?? "");
      const stack = String((e.error as Error | undefined)?.stack ?? "");
      if (isNoise(msg) || isNoise(stack)) {
        e.preventDefault();
        // silence — don't log
        return;
      }
    };
    const onRejection = (e: PromiseRejectionEvent) => {
      const msg = String((e.reason as Error)?.message ?? e.reason ?? "");
      const stack = String((e.reason as Error)?.stack ?? "");
      if (isNoise(msg) || isNoise(stack)) e.preventDefault();
    };

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);

    // Belt + suspenders: drop observer entries that have no startTime before
    // the vitals script ever sees them. Patched once, before the async
    // /_vercel/speed-insights/script.js executes.
    try {
      const PO = window.PerformanceObserver as unknown as {
        prototype: { observe: (opts: unknown) => void };
      } | undefined;
      if (PO?.prototype?.observe) {
        const orig = PO.prototype.observe;
        PO.prototype.observe = function (this: PerformanceObserver, opts: unknown) {
          // Wrap the callback at construction time instead — constructors are
          // already created. So we patch the constructor to filter entries.
          return orig.call(this, opts as never);
        };
        // Constructor-level filter: PerformanceObserver callback wrapper
        const OrigPO = window.PerformanceObserver;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (window as any).PerformanceObserver = function (
          this: PerformanceObserver,
          cb: PerformanceObserverCallback,
        ) {
          const wrapped: PerformanceObserverCallback = (list, obs) => {
            try {
              const entries = list.getEntries() as PerformanceEntry[];
              const bad = entries.some((en) => !en || typeof (en as unknown as { startTime?: unknown }).startTime !== "number");
              if (bad) {
                const clean = entries.filter((en) => en && typeof (en as unknown as { startTime?: unknown }).startTime === "number");
                if (clean.length === 0) return;
                // rebuild a minimal PerformanceObserverEntryList-like object
                const patched = { getEntries: () => clean } as unknown as PerformanceObserverEntryList;
                return cb(patched, obs);
              }
            } catch {
              // if anything goes wrong, fall through to original cb
            }
            return cb(list, obs);
          };
          return new OrigPO(wrapped);
        } as unknown as typeof PerformanceObserver;
        // copy statics
        Object.assign(window.PerformanceObserver, OrigPO);
        if ("supportedEntryTypes" in OrigPO) {
          Object.defineProperty(window.PerformanceObserver, "supportedEntryTypes", {
            get: () => (OrigPO as unknown as { supportedEntryTypes: string[] }).supportedEntryTypes,
          });
        }
      }
    } catch {
      /* ignore — patch is best-effort */
    }

    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);
  return null;
}
