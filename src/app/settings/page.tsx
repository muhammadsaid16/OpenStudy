"use client";

import { useState, useRef } from "react";
import { useT } from "@/lib/i18n";
import { InstallAppButton } from "@/components/install-app-button";
import { useAppStore } from "@/lib/store";
import { THEMES } from "@/lib/themes";
import { UI_OPACITY_MAX, UI_OPACITY_MIN } from "@/lib/ui-opacity";
import { LIVE_WALLPAPERS, STATIC_WALLPAPERS } from "@/components/wallpaper-host";
import { Button } from "@/components/ui";
import { cn } from "@/lib/utils";
import { exportAllData, importAllData } from "@/app/actions";
import { showToast } from "@/components/toast";
import { Download, Upload, Check, AlertTriangle, Sparkles } from "lucide-react";

function Toggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between gap-4 rounded-2xl border border-border bg-bg p-5 text-start transition-colors hover:border-accent"
    >
      <div>
        <p className="text-sm font-bold tracking-tight text-fg">{label}</p>
        <p className="mt-1 text-xs text-muted-fg">{description}</p>
      </div>
      <span
        className={cn(
          "relative h-6 w-11 shrink-0 rounded-full border transition-colors",
          checked ? "border-accent bg-accent" : "border-border bg-muted"
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all",
            checked ? "start-[22px]" : "start-0.5"
          )}
        />
      </span>
    </button>
  );
}

export default function SettingsPage() {
  const t = useT();
  const theme = useAppStore((s) => s.theme);
  const lang = useAppStore((s) => s.lang);
  const setLang = useAppStore((s) => s.setLang);
  const setTheme = useAppStore((s) => s.setTheme);
  const wallpaperType = useAppStore((s) => s.wallpaperType);
  const wallpaperId = useAppStore((s) => s.wallpaperId);
  const wallpaperOpacity = useAppStore((s) => s.wallpaperOpacity);
  const wallpaperBlur = useAppStore((s) => s.wallpaperBlur);
  const setWallpaper = useAppStore((s) => s.setWallpaper);
  const setWallpaperOpacity = useAppStore((s) => s.setWallpaperOpacity);
  const setWallpaperBlur = useAppStore((s) => s.setWallpaperBlur);
  const reducedMotion = useAppStore((s) => s.reducedMotion);
  const setReducedMotion = useAppStore((s) => s.setReducedMotion);
  const uiOpacity = useAppStore((s) => s.uiOpacity);
  const setUiOpacity = useAppStore((s) => s.setUiOpacity);
  const [exportStatus, setExportStatus] = useState<"idle" | "exporting">("idle");
  const [importStatus, setImportStatus] = useState<"idle" | "importing" | "confirm" | "success" | "error">("idle");
  const [importMessage, setImportMessage] = useState("");
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleExport = async () => {
    setExportStatus("exporting");
    try {
      const json = await exportAllData();
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `openstudy-backup-${new Date().toISOString().split("T")[0]}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      console.error("Export failed", e);
      showToast(t("fc.exportFailed"), "danger");
    } finally {
      setExportStatus("idle");
    }
  };

  // Spec (data safety): picking a file stages it and shows an explicit
  // confirmation — "Existing data may be replaced" — before the import
  // actually runs. No destructive action on a single click.
  const stageImport = (file: File) => {
    setPendingFile(file);
    setImportStatus("confirm");
    setImportMessage("");
  };

  const runImport = async () => {
    if (!pendingFile) return;
    setImportStatus("importing");
    setImportMessage("");
    try {
      const text = await pendingFile.text();
      const result = await importAllData(text);
      setImportStatus("success");
      setImportMessage(`Imported: ${result.imported}`);
      setPendingFile(null);
    } catch (e) {
      setImportStatus("error");
      setImportMessage(e instanceof Error ? e.message : String(e));
      setPendingFile(null);
    }
  };

  return (
    <div className="page-gutter cq">
      <div className="mb-8">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-fg/70">{t("nav.system")}</p>
        <h1 className="mt-1.5 text-3xl font-bold tracking-tight text-fg lg:text-[34px] lg:leading-tight">{t("page.settings")}</h1>
        <p className="mt-2 text-sm text-muted-fg">{t("page.settings.subtitle")}</p>
      </div>

      {/* Appearance — spec §8: theme picker stays (product identity) but
          lives under a clear section heading with Interface prefs. */}
      <section className="mb-12">
        <h2 className="mb-1 text-lg font-bold tracking-tight text-fg">{t("settings.appearance")}</h2>
        {/* Language (UI + direction): English LTR / العربية RTL */}
        <div className="mb-6 mt-3 rounded-2xl border border-border bg-bg-raised/60 p-4">
          <p className="mb-2 text-xs font-bold uppercase tracking-widest text-muted-fg">{t("settings.language")}</p>
          <div className="inline-flex rounded-full border border-glass-border bg-glass p-1" role="group" aria-label={t("settings.language")}>
            <button
              onClick={() => setLang("en")}
              aria-pressed={lang === "en"}
              className={`relative flex-1 rounded-full px-4 py-2 text-xs font-bold transition-colors ${lang === "en" ? "bg-accent text-accent-fg" : "text-muted-fg hover:text-accent"}`}
            >{t("settings.english")}</button>
            <button
              onClick={() => setLang("ar")}
              aria-pressed={lang === "ar"}
              className={`relative flex-1 rounded-full px-4 py-2 text-xs font-bold transition-colors ${lang === "ar" ? "bg-accent text-accent-fg" : "text-muted-fg hover:text-accent"}`}
            >
              العربية
            </button>
          </div>
          <p className="mt-2 text-[11px] text-muted-fg">{t("settings.arabicHint")}</p>
          <div className="mt-3">
            <InstallAppButton />
          </div>
        </div>
        <p className="mb-4 text-xs text-muted-fg">{t("settings.themeHint")}</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {THEMES.map((th) => {
            const active = theme === th.id;
            return (
              <button
                key={th.id}
                onClick={() => setTheme(th.id)}
                aria-pressed={active}
                aria-label={`Use ${th.nameKey ? t(th.nameKey) : th.name} theme`}
                className={cn(
                  "group flex flex-col gap-3 rounded-2xl border p-3 transition-all",
                  active ? "border-accent ring-2 ring-accent ring-offset-1 ring-offset-bg" : "border-border hover:border-accent"
                )}
                style={{ background: th.bg }}
              >
                <div className="flex items-center justify-between">
                  <span
                    className="h-8 w-8 rounded-full border"
                    style={{ background: th.accent, borderColor: th.fg }}
                  />
                  {active && (
                    <Check
                      className="h-4 w-4 shrink-0"
                      strokeWidth={3}
                      aria-hidden
                      style={{ color: th.fg }}
                    />
                  )}
                </div>
                <span
                  className="text-xs font-bold uppercase tracking-widest"
                  style={{ color: th.fg }}
                >
                  {th.nameKey ? t(th.nameKey) : th.name}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* Wallpapers (Optional: Live, Static, Custom) */}
      <section className="mb-12">
        <div className="mb-4">
          <h2 className="text-lg font-bold tracking-tight text-fg">{t("settings.wallpapers")}</h2>
          <p className="mt-1 text-xs text-muted-fg">{t("settings.wallpapersHint")}</p>
        </div>

        <div className="space-y-6 rounded-2xl border border-border bg-bg-raised/60 p-5">
          {/* Wallpaper Type Switcher */}
          <div className="flex flex-wrap gap-2">
            {[
              { type: "none" as const, label: t("settings.wpNone") },
              { type: "live" as const, label: t("settings.wpLive") },
              { type: "static" as const, label: t("settings.wpStatic") },
              { type: "custom" as const, label: t("settings.wpCustom") },
            ].map((tab) => {
              const active = wallpaperType === tab.type;
              return (
                <button
                  key={tab.type}
                  onClick={() => setWallpaper(tab.type, tab.type === "live" ? "aurora" : tab.type === "static" ? "deep-space" : wallpaperId)}
                  className={cn(
                    "rounded-xl px-4 py-2 text-xs font-bold transition-all",
                    active ? "bg-accent text-accent-fg shadow-sm" : "border border-border bg-bg text-muted-fg hover:text-fg"
                  )}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* Live Wallpapers — locally drawn canvas presets, no network */}
          {wallpaperType === "live" && (
            <div className="space-y-5">
              {/* Canvas Presets */}
              <div>
                <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-muted-fg">Canvas Animations</p>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {LIVE_WALLPAPERS.map((wp) => {
                    const active = wallpaperId === wp.id;
                    return (
                      <button
                        key={wp.id}
                        onClick={() => setWallpaper("live", wp.id)}
                        className={cn(
                          "flex flex-col gap-2 rounded-xl border p-3 text-start transition-all",
                          active ? "border-accent bg-accent-soft/30 ring-2 ring-accent" : "border-border bg-bg hover:border-accent"
                        )}
                      >
                        <div className="flex items-center justify-between">
                          <Sparkles size={16} className={active ? "text-accent" : "text-muted-fg"} />
                          {active && <Check size={14} className="text-accent" />}
                        </div>
                        <div>
                          <p className="text-xs font-bold text-fg">{wp.name}</p>
                          <p className="text-[10px] text-muted-fg">{wp.desc}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Bundled backgrounds — local files in /public/bgs, no network call */}
          {wallpaperType === "static" && (
            <div className="space-y-4">
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-fg">
                {STATIC_WALLPAPERS.length} Backgrounds
              </p>
              <div className="max-h-[60vh] overflow-y-auto pr-1">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {STATIC_WALLPAPERS.map((item) => {
                    const active = wallpaperId === item.id;
                    return (
                      <button
                        key={item.id}
                        onClick={() => setWallpaper("static", item.id)}
                        className={cn(
                          "group relative h-28 overflow-hidden rounded-xl border text-start transition-all",
                          active ? "border-accent ring-2 ring-accent" : "border-border hover:border-accent"
                        )}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={item.src} alt="" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110" />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-80" />
                        <span className="absolute bottom-1.5 left-2 max-w-[85%] truncate text-[10px] font-bold text-white drop-shadow">{item.name}</span>
                        {active && (
                          <span className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-accent text-accent-fg shadow">
                            <Check size={12} strokeWidth={3} />
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Custom URL Input */}
          {wallpaperType === "custom" && (
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-widest text-muted-fg">Custom Wallpaper Image or Video URL</label>
              <input
                type="url"
                value={wallpaperId}
                onChange={(e) => setWallpaper("custom", e.target.value)}
                placeholder="Paste image/GIF/video URL (e.g. https://...)"
                className="h-10 w-full rounded-xl border border-border bg-bg px-3 text-xs text-fg placeholder:text-muted-fg focus:border-accent focus:outline-none"
              />
            </div>
          )}

          {/* Adjustments: Opacity & Blur Sliders */}
          {wallpaperType !== "none" && (
            <div className="space-y-4 border-t border-border pt-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs font-semibold text-fg">
                    <span>{t("settings.wpOpacity")}</span>
                    <span>{Math.round(wallpaperOpacity * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min={0.1}
                    max={1.0}
                    step={0.05}
                    value={wallpaperOpacity}
                    onChange={(e) => setWallpaperOpacity(parseFloat(e.target.value))}
                    className="h-1.5 w-full accent-[var(--color-accent)]"
                  />
                </div>

                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs font-semibold text-fg">
                    <span>{t("settings.wpBlur")}</span>
                    <span>{wallpaperBlur}px</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={20}
                    step={1}
                    value={wallpaperBlur}
                    onChange={(e) => setWallpaperBlur(parseInt(e.target.value, 10))}
                    className="h-1.5 w-full accent-[var(--color-accent)]"
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Interface — preferences under Appearance per spec IA */}
      <section className="max-w-2xl space-y-3">
        <h2 className="mb-4 text-lg font-bold tracking-tight text-fg">{t("settings.interface")}</h2>
        {/* Interface opacity — how far the app's surfaces step back for the
            wallpaper. Not gated on wallpaperType: it is a general appearance
            preference, and hiding it until a wallpaper exists would make it
            undiscoverable. */}
        <div className="rounded-2xl border border-border bg-bg p-5">
          <div className="flex justify-between text-xs font-semibold text-fg">
            <span>{t("settings.uiOpacity")}</span>
            <span>{Math.round(uiOpacity * 100)}%</span>
          </div>
          <p className="mt-1 text-xs text-muted-fg">{t("settings.uiOpacityHint")}</p>
          <input
            type="range"
            min={UI_OPACITY_MIN}
            max={UI_OPACITY_MAX}
            step={0.05}
            value={uiOpacity}
            onChange={(e) => setUiOpacity(parseFloat(e.target.value))}
            aria-label={t("settings.uiOpacity")}
            className="mt-3 h-1.5 w-full accent-[var(--color-accent)]"
          />
        </div>
        <Toggle
          label={t("settings.reducedMotion")}
          description={t("settings.reducedMotionHint")}
          checked={reducedMotion}
          onChange={setReducedMotion}
        />
      </section>

      {/* Data — spec §8: clear, calm, destructive-safe */}
      <section className="mt-12 max-w-2xl space-y-4">
        <h2 className="mb-4 text-lg font-bold tracking-tight text-fg">{t("settings.data")}</h2>
        <div className="space-y-3">
          <div className="rounded-2xl border border-border bg-bg p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-bold tracking-tight text-fg">{t("settings.exportData")}</p>
                <p className="mt-1 text-xs text-muted-fg">{t("settings.exportDataHint")}</p>
              </div>
              <Button size="sm" onClick={handleExport} disabled={exportStatus === "exporting"}>
                <Download size={14} />
                {exportStatus === "exporting" ? t("settings.exporting") : t("settings.exportDataBtn")}
              </Button>
            </div>
          </div>
          <div className="rounded-2xl border border-border bg-bg p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-bold tracking-tight text-fg">{t("settings.importBackup")}</p>
                <p className="mt-1 text-xs text-muted-fg">{t("settings.importBackupHint")}</p>
              </div>
              <Button size="sm" variant="secondary" onClick={() => fileInputRef.current?.click()} disabled={importStatus === "importing"}>
                <Upload size={14} />
                {importStatus === "importing" ? t("settings.importing") : t("settings.importDataBtn")}
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json,application/json"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) stageImport(file);
                  e.target.value = "";
                }}
              />
            </div>
            {importStatus === "confirm" && pendingFile && (
              <div
                role="alertdialog"
                aria-label="Confirm import"
                className="mt-3 border border-warning/40 bg-warning/10 p-4"
              >
                <p className="text-sm font-bold tracking-tight text-fg">{t("settings.importConfirm")}</p>
                <p className="mt-1 text-xs text-muted-fg">
                  {t("settings.importConfirmHint")} {pendingFile.name}
                </p>
                <div className="mt-3 flex gap-2">
                  <Button size="sm" variant="danger" onClick={runImport}>
                    <Upload size={14} />
                    {t("settings.importBackup")}
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      setImportStatus("idle");
                      setPendingFile(null);
                    }}
                  >
                    {t("common.cancel")}
                  </Button>
                </div>
              </div>
            )}
            {importStatus === "success" && (
              <div className="mt-3 flex items-center gap-2 border border-success/40 bg-success/10 p-3 text-xs font-bold uppercase tracking-widest text-success">
                <Check size={14} /> {importMessage}
              </div>
            )}
            {importStatus === "error" && (
              <div className="mt-3 flex items-center gap-2 border border-danger/40 bg-danger/10 p-3 text-xs font-bold uppercase tracking-widest text-danger">
                <AlertTriangle size={14} /> {importMessage}
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
