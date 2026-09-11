"use client";

import { useCallback, useEffect, useRef } from "react";

/**
 * Persists a Set<string> of pending deletes in localStorage so a refresh
 * before the undo toast commits keeps the item hidden. Used by bundles
 * and deck (subjects) pages — was duplicated verbatim in both.
 */
export function usePendingDeletes(storageKey: string) {
  const pendingRef = useRef<Set<string>>(new Set());

  // hydrate once
  if (typeof window !== "undefined" && pendingRef.current.size === 0) {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr)) pendingRef.current = new Set(arr.filter((x: unknown) => typeof x === "string"));
      }
    } catch {}
  }

  const persist = useCallback(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify([...pendingRef.current]));
    } catch {}
  }, [storageKey]);

  const add = useCallback((id: string) => {
    pendingRef.current.add(id);
    persist();
  }, [persist]);

  const remove = useCallback((id: string) => {
    pendingRef.current.delete(id);
    persist();
  }, [persist]);

  const has = useCallback((id: string) => pendingRef.current.has(id), []);
  const getAll = useCallback(() => [...pendingRef.current], []);
  const size = () => pendingRef.current.size;

  // Commit orphaned pending deletes on mount if the toast timer was lost (refresh mid-undo)
  const useCommitOrphans = (commit: (ids: string[]) => Promise<void>) => {
    useEffect(() => {
      if (pendingRef.current.size === 0) return;
      const ids = [...pendingRef.current];
      commit(ids).finally(() => {
        ids.forEach((id) => pendingRef.current.delete(id));
        persist();
      });
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
  };

  return { pendingRef: pendingRef.current, add, remove, has, getAll, size, persist, useCommitOrphans };
}
