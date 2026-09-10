"use client";

import { useEffect } from "react";

/**
 * Vercel Speed Insights injects web-vitals that can throw
 *   TypeError: Cannot read properties of undefined (reading 'startTime')
 *   at reportAllChanges
 * Not app code — external telemetry. Filter just that one throw.
 */
export function VitalsGuard() {
  useEffect(() => {
    const isNoise = (msg: string) =>
      msg.includes("startTime") && (msg.includes("reportAllChanges") || msg.includes("web-vitals"));

    const onError = (e: ErrorEvent) => {
      const msg = String(e.message ?? "");
      const stack = String((e.error as Error | undefined)?.stack ?? "");
      if (isNoise(msg) || isNoise(stack)) e.preventDefault();
    };
    const onRejection = (e: PromiseRejectionEvent) => {
      const msg = String((e.reason as Error)?.message ?? e.reason ?? "");
      const stack = String((e.reason as Error)?.stack ?? "");
      if (isNoise(msg) || isNoise(stack)) e.preventDefault();
    };

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);
  return null;
}
