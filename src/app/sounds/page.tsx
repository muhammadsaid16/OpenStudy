"use client";

// ─── Sounds tab ─────────────────────────────────────────────────────
// Zero-auth Sounds playback via the official iframe embed. No API key,
// no Premium, no OAuth — paste a public Spotify link and it plays in the
// background (global audio source) while you browse other tabs. A spinning
// vinyl rides along in the persistent mini-player.
import { Headphones } from "lucide-react";
import { useT } from "@/lib/i18n";
import { SpotifyEmbedPicker } from "@/components/spotify-embed";

export default function SpotifyPage() {
  const t = useT();
  return (
    <main className="mx-auto w-full max-w-5xl px-5 py-8">
      <header className="mb-6 flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-accent-soft text-accent">
          <Headphones size={20} aria-hidden />
        </span>
        <div>
          <h1 className="text-lg font-bold text-fg">{t("nav.spotify")}</h1>
          <p className="text-xs text-muted-fg">{t("spotify.embedHint")}</p>
        </div>
      </header>

      <SpotifyEmbedPicker />

      <p className="mt-4 text-center text-xs text-muted-fg">{t("spotify.embedFree")}</p>
    </main>
  );
}
