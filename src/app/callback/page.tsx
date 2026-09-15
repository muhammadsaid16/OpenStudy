"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useT } from "@/lib/i18n";
import {
  finishSpotifyAuth,
  fetchSpotifyProfile,
  persistProduct,
} from "@/lib/spotify-auth";
import { Loader2, AlertTriangle, CheckCircle2 } from "lucide-react";

// OAuth redirect target. Reads the authorization code Spotify appended to
// the URL, exchanges it for tokens (via lib/spotify-auth), persists them
// to IndexedDB, then bounces back to the Focus Zone (dashboard "/").
function CallbackInner() {
  const t = useT();
  const router = useRouter();
  const params = useSearchParams();
  const [phase, setPhase] = useState<"working" | "done" | "error">("working");
  const [message, setMessage] = useState<string>("");

  useEffect(() => {
    const code = params.get("code");
    const state = params.get("state");
    const oauthError = params.get("error");

    let active = true;
    (async () => {
      try {
        if (oauthError) throw new Error(`Spotify denied access: ${oauthError}`);
        if (!code) throw new Error("Missing authorization code from Spotify");

        const returnTo = await finishSpotifyAuth(code, state);

        // Best-effort: learn account type so the player picks the right mode.
        try {
          const profile = await fetchSpotifyProfile();
          await persistProduct(profile.product);
        } catch {
          /* non-fatal — the player re-checks on mount */
        }

        if (!active) return;
        setPhase("done");
        setMessage("Connected. Redirecting you back…");
        router.replace(returnTo || "/");
      } catch (e) {
        if (!active) return;
        setPhase("error");
        setMessage(e instanceof Error ? e.message : "Unknown error");
      }
    })();

    return () => {
      active = false;
    };
  }, [params, router]);

  return (
    <div className="mx-auto flex min-h-dvh max-w-md items-center justify-center p-6">
      <div className="glass w-full rounded-2xl border border-border p-8 text-center">
        {phase === "error" ? (
          <AlertTriangle className="mx-auto mb-4 text-danger" size={32} aria-hidden />
        ) : phase === "done" ? (
          <CheckCircle2 className="mx-auto mb-4 text-grow" size={32} aria-hidden />
        ) : (
          <Loader2 className="mx-auto mb-4 animate-spin text-accent" size={32} aria-hidden />
        )}
        <h1 className="text-lg font-bold tracking-tight text-fg">
          {phase === "error" ? t("spotify.connectionFailed") : t("spotify.connectingTitle")}
        </h1>
        <p className="mt-2 text-xs uppercase tracking-widest text-muted-fg">{message}</p>
        {phase === "error" && (
          <button
            onClick={() => router.replace("/")}
            className="mt-6 rounded-full border border-border bg-transparent px-5 py-2 text-sm font-medium text-fg transition-colors hover:border-accent hover:text-accent"
          >
            {t("common.back")}
          </button>
        )}
      </div>
    </div>
  );
}

export default function CallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto flex min-h-dvh max-w-md items-center justify-center p-6">
          <div className="glass w-full rounded-2xl border border-border p-8 text-center">
            <Loader2 className="mx-auto mb-4 animate-spin text-accent" size={32} aria-hidden />
            <p className="text-xs uppercase tracking-widest text-muted-fg">Loading…</p>
          </div>
        </div>
      }
    >
      <CallbackInner />
    </Suspense>
  );
}
