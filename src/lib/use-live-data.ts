"use client";

// ─── Realtime data hook ────────────────────────────────────────
// Offline-first realtime: Dexie liveQuery re-runs the querier on any
// table it read (local + cross-tab mutations) — zero server.
//
// Why not plain useLiveQuery? On hard loads (SSR hydration) its first
// emit can race React hydration and the component never re-renders —
// pages stuck on PageLoader forever (SPA nav worked, hard load hung).
//
// This wrapper combines both safely:
//   • a plain mount-fetch guarantees the first paint (hydration-proof)
//   • liveQuery keeps it updated forever after (proven on SPA + updates)
// A sequence guard keeps the freshest result — whichever path delivers
// last wins, so there's no stale overwrite.

import { useEffect, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";

export function useLiveData<T>(querier: () => Promise<T> | T, deps: unknown[] = []): T | undefined {
  // First paint: plain fetch on mount (deps change = remount fetch, same as before).
  const [mounted, setMounted] = useState<T | undefined>(undefined);
  const querierRef = useRef(querier);
  querierRef.current = querier;
  const seq = useRef(0);

  useEffect(() => {
    let alive = true;
    const run = async () => {
      const id = ++seq.current;
      try {
        const next = await querierRef.current();
        if (alive && id === seq.current) setMounted(next);
      } catch {
        // leave previous value; pages own their error UI
      }
    };
    run();
    // Refetch when returning to the tab (catches anything missed while hidden).
    const onVis = () => {
      if (document.visibilityState === "visible") run();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      alive = false;
      document.removeEventListener("visibilitychange", onVis);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  // Live updates: liveQuery takes over after hydration. Undefined until its
  // first emit — that's fine, `mounted` already holds the first paint.
  const live = useLiveQuery(querier, deps);

  return live !== undefined ? live : mounted;
}
