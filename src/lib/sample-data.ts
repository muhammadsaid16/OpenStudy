// ─── Sample Data Loader ─────────────────────────────────────────────
// Creates a curated starter deck ("Modern Web Architecture") so new users
// can immediately test Flashcard review, Pomodoro, and Analytics without
// entering any data manually.
//
// Idempotent: checks for existing subjects before inserting.

import { db, uid } from "@/lib/db";

export async function loadSampleData(): Promise<{ created: boolean; subjectName: string }> {
  // Guard: don't overwrite an existing library.
  const existing = await db.subjects.count();
  if (existing > 0) return { created: false, subjectName: "" };

  const now = new Date();
  const subjectId = uid();
  const topic1Id = uid();
  const topic2Id = uid();
  const bundleId = uid();

  // ─── Subject ──────────────────────────────────────────────────────
  await db.subjects.add({
    id: subjectId,
    name: "Modern Web Architecture",
    description: "Core concepts of modern web development — React, Next.js, browser APIs, and offline-first patterns.",
    color: "#4f46e5",
    icon: "🌐",
    createdAt: now,
    updatedAt: now,
  });

  // ─── Topics ───────────────────────────────────────────────────────
  await db.topics.bulkAdd([
    {
      id: topic1Id,
      subjectId,
      name: "React & Next.js",
      description: "Component model, Server Components, routing, and data fetching.",
      order: 0,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: topic2Id,
      subjectId,
      name: "Browser Storage & Offline",
      description: "IndexedDB, localStorage, Service Workers, and offline-first architecture.",
      order: 1,
      createdAt: now,
      updatedAt: now,
    },
  ]);

  // ─── Bundle ───────────────────────────────────────────────────────
  await db.bundles.add({
    id: bundleId,
    name: "Web Arch Flashcards",
    description: "Starter deck covering React, Next.js, and browser storage fundamentals.",
    color: "#4f46e5",
    createdAt: now,
    updatedAt: now,
  });

  // ─── Flashcards ───────────────────────────────────────────────────
  const baseCard = {
    subjectId,
    bundleId,
    easeFactor: 2.5,
    intervalDays: 0,
    nextReview: now,
    lastReview: null,
    reviewCount: 0,
    consecutiveAgain: 0,
    isLeech: false,
    difficulty: 1,
    kind: "basic" as const,
    choices: null,
    frontDescription: null,
    backDescription: null,
    description: null,
    createdAt: now,
    updatedAt: now,
  };

  const flashcards = [
    // React & Next.js
    { topicId: topic1Id, front: "What is a React Server Component?", back: "A component that renders on the server only — no JS bundle sent to the browser, enabling data fetching at the component level without waterfalls.", description: "Introduced in React 18 / Next.js 13+" },
    { topicId: topic1Id, front: "What is the App Router in Next.js?", back: "A file-system-based router using the `app/` directory, supporting Layouts, Loading UI, Server Actions, and React Server Components by default." },
    { topicId: topic1Id, front: "Difference between `use client` and `use server`?", back: "`use client` marks a module boundary: everything below is a Client Component (interactive, uses hooks/browser APIs). `use server` marks Server Actions callable from client code." },
    { topicId: topic1Id, front: "What is hydration in React?", back: "The process where React attaches event listeners to server-rendered HTML on the client, making it interactive without re-rendering the full DOM." },
    { topicId: topic1Id, front: "What problem does Suspense solve?", back: "Declarative loading states — a component wrapped in `<Suspense fallback={...}>` shows the fallback while its async children are loading, enabling streaming SSR.", description: "Also enables concurrent rendering" },
    { topicId: topic1Id, front: "What is Incremental Static Regeneration (ISR)?", back: "Regenerating static pages in the background on a timer or on-demand, serving stale content immediately while updating in the background (stale-while-revalidate)." },
    // Browser Storage & Offline
    { topicId: topic2Id, front: "What is IndexedDB?", back: "A low-level browser API for storing large amounts of structured data (including files/blobs). Asynchronous, transactional, and supports indexes." },
    { topicId: topic2Id, front: "localStorage vs IndexedDB — key differences?", back: "localStorage: synchronous, ~5MB, strings only. IndexedDB: async, gigabytes, any JS value, supports indexes and transactions. IndexedDB is preferred for large/complex data." },
    { topicId: topic2Id, front: "What is a Service Worker?", back: "A script running in the background (separate thread) that intercepts network requests, enabling offline caching, push notifications, and background sync." },
    { topicId: topic2Id, front: "What does `Cache-Control: stale-while-revalidate` mean?", back: "Serve a cached (possibly stale) response immediately, then fetch a fresh response in the background for the next request. Balances freshness with performance." },
    { topicId: topic2Id, front: "What is the Cache API?", back: "A browser API for storing request/response pairs. Used by Service Workers to cache assets and API responses for offline access." },
    { topicId: topic2Id, front: "What is a local-first app?", back: "An app where all data lives on the user's device first. Changes sync to the cloud in the background. Provides instant responsiveness, offline capability, and data ownership." },
  ].map((c) => ({
    ...baseCard,
    id: uid(),
    topicId: c.topicId,
    front: c.front,
    back: c.back,
    description: (c as { description?: string }).description ?? null,
  }));

  await db.flashcards.bulkAdd(flashcards);

  // ─── Sample note ──────────────────────────────────────────────────
  await db.notes.add({
    id: uid(),
    topicId: topic1Id,
    title: "React Server Components Explained",
    content: `# React Server Components

Server Components run **only on the server** — their code is never sent to the browser. This means:

- Zero bundle impact: heavy dependencies (like markdown parsers, ORM clients) stay server-side.
- Direct data access: you can query databases, read files, or call APIs directly in the component.
- No state or effects: they can't use hooks like useState or useEffect.

## When to use Client Components
Add \`"use client"\` at the top of a file when you need:
- Event handlers (onClick, onChange)
- State (useState, useReducer)
- Browser APIs (localStorage, window, navigator)
- Real-time updates (useEffect)

## The golden rule
Keep as much as possible as Server Components. Push \`"use client"\` to the leaves of the component tree — the interactive parts — not the root.`,
    isPinned: true,
    createdAt: now,
    updatedAt: now,
  });

  // ─── Sample study session (gives streak + heatmap a head start) ──
  const sessionDate = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000); // yesterday
  await db.studySessions.add({
    id: uid(),
    subjectId,
    topicId: topic1Id,
    title: "Intro to Web Architecture",
    durationMin: 25,
    completed: true,
    startedAt: sessionDate,
    endedAt: new Date(sessionDate.getTime() + 25 * 60 * 1000),
    notes: null,
    goalId: null,
    taskId: null,
    examId: null,
    activity: null,
  });

  return { created: true, subjectName: "Modern Web Architecture" };
}
