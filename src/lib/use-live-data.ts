"use client";

// ─── Realtime data hook ────────────────────────────────────────
// Offline-first realtime: fetch once on mount, then re-fetch on ANY
// Dexie table mutation — including cross-tab (Dexie propagates 'changes'
// events between same-origin tabs). Zero server.
//
// Why not useLiveQuery? On hard loads (SSR hydration) its first emit can
// race React hydration and never render — the page stayed on PageLoader
// forever. This wrapper does the same live reactivity with plain state:
//   • mount → querier() once
//   • db.on('changes') → querier() again (local + cross-tab mutations)
//   • visibilitychange → re-fetch when returning to the tab
//     (catches mutations made while Dexie events were missed)
//
// deps: like useEffect deps — pass values the querier closes over.

import { useEffect, useRef, useState } from "react";
import { db } from "@/lib/db";

export function useLiveData<T>(querier: () => Promise<T> | T, deps: unknown[] = []): T | undefined {
  const [value, setValue] = useState<T | undefined>(undefined);
  // keep the latest querier in a ref so the change listener always calls the fresh one
  const querierRef = useRef(querier);
  querierRef.current = querier;
  const seq = useRef(0);

  useEffect(() => {
    let alive = true;

    const run = async () => {
      const id = ++seq.current;
      try {
        const next = await querierRef.current();
        if (alive && id === seq.current) setValue(next);
      } catch {
        // querier errors leave the previous value; page keeps its own error UI
      }
    };

    run();

    const onChange = () => run();
    // "changes" is a valid Dexie event; the TS overload list just doesn't include it.
    (db.on as unknown as { on: (ev: string, fn: () => void) => void }).on("changes", onChange);

    const onVis = () => {
      if (document.visibilityState === "visible") run();
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      alive = false;
      (db.on("changes") as unknown as { unsubscribe: (fn: () => void) => void }).unsubscribe(onChange);
      document.removeEventListener("visibilitychange", onVis);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return value;
}
