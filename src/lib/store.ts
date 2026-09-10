"use client";

import { create } from "zustand";

// ─── App State ────────────────────────────────────────────────────
export type ThemeName =
  | "aurora" | "midnight" | "nebula" | "matrix" | "ember" | "rosewood"
  | "cyberpunk" | "arctic" | "sandstone" | "mono" | "light" | "paper";

const THEME_FALLBACK: ThemeName = "aurora";

/** Map a stored (possibly legacy v1) theme name to a valid v2 theme. */
export function normalizeTheme(t: string | undefined | null): ThemeName {
  const legacy: Record<string, ThemeName> = {
    onyx: "mono",
    void: "midnight",
    emerald: "matrix",
    magma: "ember",
    grape: "nebula",
  };
  const all: ThemeName[] = [
    "aurora", "midnight", "nebula", "matrix", "ember", "rosewood",
    "cyberpunk", "arctic", "sandstone", "mono", "light", "paper",
  ];
  if (!t) return THEME_FALLBACK;
  if (legacy[t]) return legacy[t];
  return (all as string[]).includes(t) ? (t as ThemeName) : THEME_FALLBACK;
}

interface AppState {
  sidebarOpen: boolean;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;

  activeSubjectId: string | null;
  setActiveSubject: (id: string | null) => void;

  searchQuery: string;
  setSearchQuery: (q: string) => void;

  // Theme
  theme: ThemeName;
  setTheme: (t: ThemeName) => void;

  // UI prefs
  reducedMotion: boolean;
  setReducedMotion: (v: boolean) => void;

  // Language (UI direction): en = LTR English, ar = RTL Arabic
  lang: "en" | "ar";
  setLang: (l: "en" | "ar") => void;

  // Hydrate persisted prefs from localStorage AFTER mount (post-hydration) so
  // the first client render always matches the server render. Reading
  // localStorage at module scope made sidebarOpen/theme differ between server
  // and client, causing a hydration mismatch that regenerated the tree and
  // re-triggered the "script tag" warning in RootLayout.
  hydrateFromStorage: () => void;

  // Timer state for study sessions
  timerRunning: boolean;
  timerSeconds: number;
  timerSubjectId: string | null;
  timerTopicId: string | null;
  startTimer: (subjectId?: string, topicId?: string) => void;
  stopTimer: () => { seconds: number; subjectId: string | null; topicId: string | null };
  tickTimer: () => void;
}

const STORAGE_KEY = "study-prefs";

function loadPrefs(): Partial<Pick<AppState, "theme" | "reducedMotion" | "sidebarOpen" | "lang">> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

// NOTE: do NOT read localStorage at module scope. The store must initialize
// with server-safe defaults so SSR and the first client render match exactly.
// Persisted values are applied post-mount via hydrateFromStorage().

export const useAppStore = create<AppState>((set, get) => ({
  sidebarOpen: true,
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),

  activeSubjectId: null,
  setActiveSubject: (id) => set({ activeSubjectId: id }),

  searchQuery: "",
  setSearchQuery: (q) => set({ searchQuery: q }),

  theme: "aurora",
  setTheme: (t) => {
    if (typeof document !== "undefined") {
      document.documentElement.setAttribute("data-theme", t);
    }
    const prev = get();
    persist({ theme: t, reducedMotion: prev.reducedMotion, sidebarOpen: prev.sidebarOpen });
    set({ theme: t });
  },

  reducedMotion: false,
  setReducedMotion: (v) => {
    const prev = get();
    persist({ theme: prev.theme, reducedMotion: v, sidebarOpen: prev.sidebarOpen });
    set({ reducedMotion: v });
  },

  lang: "en",
  setLang: (l) => {
    if (typeof document !== "undefined") {
      document.documentElement.setAttribute("dir", l === "ar" ? "rtl" : "ltr");
      document.documentElement.setAttribute("lang", l);
    }
    const prev = get();
    persist({ theme: prev.theme, reducedMotion: prev.reducedMotion, sidebarOpen: prev.sidebarOpen, lang: l });
    set({ lang: l });
  },

  hydrateFromStorage: () => {
    const prefs = loadPrefs();
    const patch: Partial<AppState> = {};
    if (typeof prefs.sidebarOpen === "boolean") patch.sidebarOpen = prefs.sidebarOpen;
    if (typeof prefs.reducedMotion === "boolean") patch.reducedMotion = prefs.reducedMotion;
    if (prefs.theme) {
      patch.theme = normalizeTheme(prefs.theme);
      if (typeof document !== "undefined") {
        document.documentElement.setAttribute("data-theme", patch.theme);
      }
    }
    if (prefs.lang === "ar" || prefs.lang === "en") {
      patch.lang = prefs.lang;
      if (typeof document !== "undefined") {
        document.documentElement.setAttribute("dir", prefs.lang === "ar" ? "rtl" : "ltr");
        document.documentElement.setAttribute("lang", prefs.lang);
      }
    }
    if (Object.keys(patch).length > 0) set(patch);
  },

  timerRunning: false,
  timerSeconds: 0,
  timerSubjectId: null,
  timerTopicId: null,

  startTimer: (subjectId, topicId) =>
    set({
      timerRunning: true,
      timerSeconds: 0,
      timerSubjectId: subjectId ?? null,
      timerTopicId: topicId ?? null,
    }),

  stopTimer: () => {
    const { timerSeconds, timerSubjectId, timerTopicId } = get();
    set({
      timerRunning: false,
      timerSeconds: 0,
      timerSubjectId: null,
      timerTopicId: null,
    });
    return { seconds: timerSeconds, subjectId: timerSubjectId, topicId: timerTopicId };
  },

  tickTimer: () => set((s) => ({ timerSeconds: s.timerSeconds + 1 })),
}));

function persist(p: object) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
  } catch {
    /* ignore */
  }
}
