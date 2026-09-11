"use client";

import { useT } from "@/lib/i18n";

import { useEffect } from "react";

/* Registers the OpenStudy service worker after hydration.
   Production only — dev SW caching breaks HMR. */
export function SwRegister() {
  const t = useT();
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    const onLoad = () => {
      navigator.serviceWorker.register("/sw.js").catch((err) => {
        console.warn(t("ui.sw_registration_failed"), err);
      });
    };
    if (document.readyState === "complete") onLoad();
    else {
      window.addEventListener("load", onLoad);
      return () => window.removeEventListener("load", onLoad);
    }
  }, []);
  return null;
}
