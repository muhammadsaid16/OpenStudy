import { create } from "zustand";

// Shared Spotify state so the audio iframe (mounted once in the root
// layout) survives client-side navigation between tabs, and the spinning
// vinyl + controls stay in sync everywhere.
interface SpotifyState {
  url: string | null; // embed url (the single audio source)
  webUrl: string | null; // open.spotify.com link
  title: string | null;
  isPlaying: boolean; // drives the vinyl spin (visual)
  expanded: boolean; // show the full embed vs compact bar
  setTrack: (url: string, webUrl: string, title: string) => void;
  setPlaying: (v: boolean) => void;
  togglePlaying: () => void;
  setExpanded: (v: boolean) => void;
  clear: () => void;
}

export const useSpotify = create<SpotifyState>((set) => ({
  url: null,
  webUrl: null,
  title: null,
  isPlaying: false,
  expanded: true,
  setTrack: (url, webUrl, title) =>
    set({ url, webUrl, title, isPlaying: true, expanded: true }),
  setPlaying: (v) => set({ isPlaying: v }),
  togglePlaying: () => set((s) => ({ isPlaying: !s.isPlaying })),
  setExpanded: (v) => set({ expanded: v }),
  clear: () =>
    set({ url: null, webUrl: null, title: null, isPlaying: false, expanded: false }),
}));
