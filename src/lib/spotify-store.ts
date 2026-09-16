import { create } from "zustand";
import { persist } from "zustand/middleware";

// Persisted so refresh keeps the music. The iframe itself is stateless;
// we just restore the last embed URL and show the mini-player again.
// Volume is 0-1; sent to the iframe via postMessage when changed.
// previewUrl is for iTunes 30s previews (no Spotify embed) — mini-player
// shows an audio player instead of an iframe when this is set.
interface SpotifyState {
  url: string | null;
  previewUrl: string | null;
  webUrl: string | null;
  title: string | null;
  image: string | null;
  isPlaying: boolean;
  expanded: boolean;
  volume: number;
  setTrack: (url: string, webUrl: string, title: string, image?: string | null) => void;
  setPreview: (previewUrl: string, title: string, webUrl: string, image?: string | null) => void;
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
      previewUrl: null,
      webUrl: null,
      title: null,
      image: null,
      isPlaying: false,
      expanded: true,
      volume: 0.8,
      setTrack: (url, webUrl, title, image = null) => set({ url, webUrl, title, image, previewUrl: null, isPlaying: true, expanded: true }),
      setPreview: (previewUrl, title, webUrl, image = null) => set({ url: null, previewUrl, title, webUrl, image, isPlaying: true, expanded: true }),
      setPlaying: (v) => set({ isPlaying: v }),
      togglePlaying: () => set((s) => ({ isPlaying: !s.isPlaying })),
      setExpanded: (v) => set({ expanded: v }),
      setVolume: (v) => set({ volume: Math.min(1, Math.max(0, v)) }),
      clear: () => set({ url: null, webUrl: null, title: null, image: null, previewUrl: null, isPlaying: false, expanded: false }),
    }),
    { name: "openstudy:spotify", partialize: (s) => ({ url: s.url, webUrl: s.webUrl, title: s.title, image: s.image, volume: s.volume }) }
  )
);
