import { create } from "zustand";
import { persist } from "zustand/middleware";

// Persisted so refresh keeps the music. The iframe itself is stateless;
// we just restore the last embed URL and show the mini-player again.
// Volume is 0-1; sent to the iframe via postMessage when changed.
interface SpotifyState {
  url: string | null;
  webUrl: string | null;
  title: string | null;
  isPlaying: boolean;
  expanded: boolean;
  volume: number;
  setTrack: (url: string, webUrl: string, title: string) => void;
  setPlaying: (v: boolean) => void;
  togglePlaying: () => void;
  setExpanded: (v: boolean) => void;
  setVolume: (v: number) => void;
  clear: () => void;
}

export const useSpotify = create<SpotifyState>()(
  persist(
    (set) => ({
      url: null,
      webUrl: null,
      title: null,
      isPlaying: false,
      expanded: true,
      volume: 0.8,
      setTrack: (url, webUrl, title) => set({ url, webUrl, title, isPlaying: true, expanded: true }),
      setPlaying: (v) => set({ isPlaying: v }),
      togglePlaying: () => set((s) => ({ isPlaying: !s.isPlaying })),
      setExpanded: (v) => set({ expanded: v }),
      setVolume: (v) => set({ volume: Math.min(1, Math.max(0, v)) }),
      clear: () => set({ url: null, webUrl: null, title: null, isPlaying: false, expanded: false }),
    }),
    { name: "openstudy:spotify", partialize: (s) => ({ url: s.url, webUrl: s.webUrl, title: s.title, volume: s.volume }) }
  )
);
