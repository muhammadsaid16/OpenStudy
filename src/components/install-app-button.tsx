"use client";

import { useT } from "@/lib/i18n";

import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui";

// ─── PWA install button ────────────────────────────────────────
// The manifest + service worker make OpenStudy installable, but the
// browser never surfaces a prompt unless we listen for
// beforeinstallprompt and show a button. iOS Safari doesn't fire it —
// there we show a hint instead.
type BIPEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export function InstallAppButton() {
  const t = useT();
  const [deferred, setDeferred] = useState<BIPEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BIPEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferred(null);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    // iOS detection: no beforeinstallprompt there
    const ua = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const standalone = window.matchMedia("(display-mode: standalone)").matches;
    setIsIOS(ua && !standalone);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (installed) return null;

  const install = async () => {
    if (!deferred) return;
    await deferred.prompt();
    const choice = await deferred.userChoice;
    if (choice.outcome === "accepted") setInstalled(true);
    setDeferred(null);
  };

  if (deferred) {
    return (
      <Button size="sm" onClick={install}>
        <Download size={14} />
        Install app
      </Button>
    );
  }
  if (isIOS) {
    return (
      <p className="text-xs text-muted-fg">
        Install from Safari: Share <span aria-hidden>⎋</span> → “Add to Home Screen”.
      </p>
    );
  }
  return null;
}
