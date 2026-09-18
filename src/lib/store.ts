"use client";

import { create } from "zustand";
import { DEFAULT_THEME, normalizeTheme, type ThemeName } from "@/lib/themes";
import { UI_OPACITY_DEFAULT, clampUiOpacity } from "@/lib/ui-opacity";

// The theme catalogue and its legacy-name mapping live in @/lib/themes so the
// pre-hydration script in layout.tsx can share them. Re-exported here so
// existing `from "@/lib/store"` imports keep working.
export type { ThemeName };
export { normalizeTheme };

export type WallpaperType = "none" | "static" | "live" | "custom" | "upload";

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

  // Wallpapers (Optional: Live, Static, Custom)
  wallpaperType: WallpaperType;
  wallpaperId: string;
  wallpaperOpacity: number;
  wallpaperBlur: number;
  /** Clockwise, in degrees. Only 0 / 90 / 180 / 270 are meaningful. */
  wallpaperRotation: number;
  setWallpaper: (type: WallpaperType, id?: string) => void;
  setWallpaperOpacity: (opacity: number) => void;
  setWallpaperBlur: (blur: number) => void;
  setWallpaperRotation: (deg: number) => void;

  // Interface opacity — how far the app's own surfaces step back to let the
  // wallpaper through. 1 = fully opaque (the original look).
  uiOpacity: number;
  setUiOpacity: (opacity: number) => void;

  // UI prefs
  reducedMotion: boolean;
  setReducedMotion: (v: boolean) => void;

  // Language (UI direction): en = LTR English, ar = RTL Arabic
  lang: "en" | "ar";
  setLang: (l: "en" | "ar") => void;

  // ── Study OS: planner settings + daily targets ──
  // Planner capacity in minutes, or null to keep deriving it from the user's
  // real sessions (the planner's original, honest default).
  plannerDailyMinutes: number | null;
  setPlannerDailyMinutes: (minutes: number | null) => void;
  plannerHorizonDays: number;
  setPlannerHorizonDays: (days: number) => void;
  /** Weekdays (0 = Sunday … 6 = Saturday) the plan may spend work on. */
  plannerStudyDays: number[];
  setPlannerStudyDays: (days: number[]) => void;
  /** Daily targets the dashboard measures today against. */
  goalCardsPerDay: number;
  setGoalCardsPerDay: (n: number) => void;
  goalMinutesPerDay: number;
  setGoalMinutesPerDay: (n: number) => void;

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

interface PersistedPrefs {
  theme?: ThemeName;
  reducedMotion?: boolean;
  sidebarOpen?: boolean;
  lang?: "en" | "ar";
  wallpaperType?: WallpaperType;
  wallpaperId?: string;
  wallpaperOpacity?: number;
  wallpaperBlur?: number;
  wallpaperRotation?: number;
  uiOpacity?: number;
  plannerDailyMinutes?: number | null;
  plannerHorizonDays?: number;
  plannerStudyDays?: number[];
  goalCardsPerDay?: number;
  goalMinutesPerDay?: number;
}

// Bounds live next to the store so a hand-edited localStorage value cannot put
// the planner into a state its own tests never see.
export const PLANNER_HORIZON_MIN = 7;
export const PLANNER_HORIZON_MAX = 60;
export const PLANNER_CAPACITY_MIN = 10;
export const PLANNER_CAPACITY_MAX = 240;

function clampHorizon(days: number): number {
  return Math.max(PLANNER_HORIZON_MIN, Math.min(PLANNER_HORIZON_MAX, Math.round(days)));
}
function clampPlannerMinutes(minutes: number): number {
  return Math.max(PLANNER_CAPACITY_MIN, Math.min(PLANNER_CAPACITY_MAX, Math.round(minutes)));
}
/** Weekdays, deduped and sorted; an empty choice means "every day". */
function normalizeStudyDays(days: number[]): number[] {
  const clean = [...new Set(days.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort((a, b) => a - b);
  return clean.length > 0 ? clean : [0, 1, 2, 3, 4, 5, 6];
}

function loadPrefs(): PersistedPrefs {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function persistAll(s: AppState) {
  persist({
    theme: s.theme,
    reducedMotion: s.reducedMotion,
    sidebarOpen: s.sidebarOpen,
    lang: s.lang,
    wallpaperType: s.wallpaperType,
    wallpaperId: s.wallpaperId,
    wallpaperOpacity: s.wallpaperOpacity,
    wallpaperBlur: s.wallpaperBlur,
    wallpaperRotation: s.wallpaperRotation,
    uiOpacity: s.uiOpacity,
    plannerDailyMinutes: s.plannerDailyMinutes,
    plannerHorizonDays: s.plannerHorizonDays,
    plannerStudyDays: s.plannerStudyDays,
    goalCardsPerDay: s.goalCardsPerDay,
    goalMinutesPerDay: s.goalMinutesPerDay,
  });
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

  theme: DEFAULT_THEME,
  setTheme: (t) => {
    if (typeof document !== "undefined") {
      document.documentElement.setAttribute("data-theme", t);
    }
    set({ theme: t });
    persistAll({ ...get(), theme: t });
  },

  wallpaperType: "none",
  wallpaperId: "aurora",
  wallpaperOpacity: 0.7,
  wallpaperBlur: 0,
  wallpaperRotation: 0,
  setWallpaper: (type, id = "aurora") => {
    set({ wallpaperType: type, wallpaperId: id });
    persistAll({ ...get(), wallpaperType: type, wallpaperId: id });
  },
  setWallpaperOpacity: (opacity) => {
    const v = Math.min(1, Math.max(0.05, opacity));
    set({ wallpaperOpacity: v });
    persistAll({ ...get(), wallpaperOpacity: v });
  },
  setWallpaperBlur: (blur) => {
    const v = Math.min(30, Math.max(0, blur));
    set({ wallpaperBlur: v });
    persistAll({ ...get(), wallpaperBlur: v });
  },
  setWallpaperRotation: (deg) => {
    // Normalise into 0..359, then snap to the nearest quarter turn. A dragged
    // or typed value like 450 or -90 still lands on a meaningful angle.
    const v = ((Math.round(deg / 90) * 90) % 360 + 360) % 360;
    set({ wallpaperRotation: v });
    persistAll({ ...get(), wallpaperRotation: v });
  },

  uiOpacity: UI_OPACITY_DEFAULT,
  setUiOpacity: (opacity) => {
    const v = clampUiOpacity(opacity);
    set({ uiOpacity: v });
    persistAll({ ...get(), uiOpacity: v });
  },

  reducedMotion: false,
  setReducedMotion: (v) => {
    set({ reducedMotion: v });
    persistAll({ ...get(), reducedMotion: v });
  },

  lang: "en",
  setLang: (l) => {
    if (typeof document !== "undefined") {
      document.documentElement.setAttribute("dir", l === "ar" ? "rtl" : "ltr");
      document.documentElement.setAttribute("lang", l);
    }
    set({ lang: l });
    persistAll({ ...get(), lang: l });
  },

  plannerDailyMinutes: null,
  setPlannerDailyMinutes: (minutes) => {
    const v = minutes == null ? null : clampPlannerMinutes(minutes);
    set({ plannerDailyMinutes: v });
    persistAll({ ...get(), plannerDailyMinutes: v });
  },
  plannerHorizonDays: 14,
  setPlannerHorizonDays: (days) => {
    const v = clampHorizon(days);
    set({ plannerHorizonDays: v });
    persistAll({ ...get(), plannerHorizonDays: v });
  },
  plannerStudyDays: [0, 1, 2, 3, 4, 5, 6],
  setPlannerStudyDays: (days) => {
    const v = normalizeStudyDays(days);
    set({ plannerStudyDays: v });
    persistAll({ ...get(), plannerStudyDays: v });
  },
  goalCardsPerDay: 30,
  setGoalCardsPerDay: (n) => {
    const v = Math.max(1, Math.min(1000, Math.round(n || 1)));
    set({ goalCardsPerDay: v });
    persistAll({ ...get(), goalCardsPerDay: v });
  },
  goalMinutesPerDay: 60,
  setGoalMinutesPerDay: (n) => {
    const v = Math.max(5, Math.min(1440, Math.round(n || 5)));
    set({ goalMinutesPerDay: v });
    persistAll({ ...get(), goalMinutesPerDay: v });
  },

  hydrateFromStorage: () => {
    const prefs = loadPrefs();
    const patch: Partial<AppState> = {};
    if (typeof prefs.sidebarOpen === "boolean") patch.sidebarOpen = prefs.sidebarOpen;
    if (typeof prefs.reducedMotion === "boolean") patch.reducedMotion = prefs.reducedMotion;
    if (prefs.wallpaperType) patch.wallpaperType = prefs.wallpaperType;
    if (prefs.wallpaperId) patch.wallpaperId = prefs.wallpaperId;
    if (typeof prefs.wallpaperOpacity === "number") patch.wallpaperOpacity = prefs.wallpaperOpacity;
    if (typeof prefs.wallpaperBlur === "number") patch.wallpaperBlur = prefs.wallpaperBlur;
    if (typeof prefs.wallpaperRotation === "number") patch.wallpaperRotation = ((Math.round(prefs.wallpaperRotation / 90) * 90) % 360 + 360) % 360;
    if (typeof prefs.uiOpacity === "number") patch.uiOpacity = clampUiOpacity(prefs.uiOpacity);
    if (prefs.plannerDailyMinutes === null) patch.plannerDailyMinutes = null;
    else if (typeof prefs.plannerDailyMinutes === "number") patch.plannerDailyMinutes = clampPlannerMinutes(prefs.plannerDailyMinutes);
    if (typeof prefs.plannerHorizonDays === "number") patch.plannerHorizonDays = clampHorizon(prefs.plannerHorizonDays);
    if (Array.isArray(prefs.plannerStudyDays)) patch.plannerStudyDays = normalizeStudyDays(prefs.plannerStudyDays);
    if (typeof prefs.goalCardsPerDay === "number") patch.goalCardsPerDay = Math.max(1, Math.min(1000, Math.round(prefs.goalCardsPerDay)));
    if (typeof prefs.goalMinutesPerDay === "number") patch.goalMinutesPerDay = Math.max(5, Math.min(1440, Math.round(prefs.goalMinutesPerDay)));
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
