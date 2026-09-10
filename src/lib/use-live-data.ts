"use client";

// ─── Realtime data hook ────────────────────────────────────────
// Wraps Dexie's useLiveQuery so every page re-runs its loader the moment
// ANY table it touched changes (same tab, another tab, import, review,
// StorageGuard restore…). Offline-first + Dexie observability = realtime
// with zero server.
//
// Usage:
//   const notes = useLiveData(() => getAllNotes());
//   // undefined while loading → keep existing PageLoader branches.
//
// deps: like useEffect deps — pass values the querier closes over.
import { useLiveQuery } from "dexie-react-hooks";

export function useLiveData<T>(querier: () => Promise<T> | T, deps: unknown[] = []): T | undefined {
  return useLiveQuery(querier, deps);
}
