"use client";

import { useState, useRef } from "react";
import { useAppStore, type ThemeName } from "@/lib/store";
import { RevealHeading } from "@/components/reveal-heading";
import { ScrambleSubtitle } from "@/components/scramble-subtitle";
import { Button } from "@/components/ui";
import { cn } from "@/lib/utils";
import { exportAllData, importAllData } from "@/app/actions";
import { Download, Upload, Check, AlertTriangle } from "lucide-react";

const THEMES: { id: ThemeName; name: string; bg: string; accent: string; fg: string }[] = [
  { id: "aurora", name: "Aurora", bg: "#0B0F17", accent: "#FF7A72", fg: "#E7EDF7" },
  { id: "midnight", name: "Midnight", bg: "#030712", accent: "#60A5FA", fg: "#E4EDFF" },
  { id: "nebula", name: "Nebula", bg: "#0D0716", accent: "#C084FC", fg: "#F2E9FF" },
  { id: "matrix", name: "Matrix", bg: "#02100B", accent: "#34D399", fg: "#E4FFF1" },
  { id: "ember", name: "Ember", bg: "#140808", accent: "#FB923C", fg: "#FFF0E7" },
  { id: "rosewood", name: "Rosewood", bg: "#12070C", accent: "#FB7185", fg: "#FFEAF1" },
  { id: "cyberpunk", name: "Cyberpunk", bg: "#0A0A12", accent: "#FCEE0A", fg: "#F2F2FF" },
  { id: "arctic", name: "Arctic", bg: "#07111E", accent: "#38BDF8", fg: "#E8F6FF" },
  { id: "sandstone", name: "Sandstone", bg: "#151210", accent: "#E8B45C", fg: "#F7EFE3" },
  { id: "mono", name: "Mono", bg: "#09090B", accent: "#FFFFFF", fg: "#FAFAFA" },
  { id: "light", name: "Light", bg: "#F1F5F9", accent: "#B91C1C", fg: "#0F172A" },
  { id: "paper", name: "Paper", bg: "#FAF7F2", accent: "#9A3412", fg: "#292018" },
];

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
      className="flex w-full items-center justify-between gap-4 rounded-2xl border border-border bg-bg p-5 text-left transition-colors hover:border-fg"
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
            checked ? "left-[22px]" : "left-0.5"
          )}
        />
      </span>
    </button>
  );
}

export default function SettingsPage() {
  const theme = useAppStore((s) => s.theme);
  const setTheme = useAppStore((s) => s.setTheme);
  const reducedMotion = useAppStore((s) => s.reducedMotion);
  const setReducedMotion = useAppStore((s) => s.setReducedMotion);
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
      alert("Export failed — see console");
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
    <div className="p-8 lg:p-12">
      <div className="mb-8">
        <RevealHeading text="SETTINGS" className="text-4xl lg:text-6xl" />
        <ScrambleSubtitle
          text="APPEARANCE & PREFERENCES"
          className="mt-2 text-sm text-muted-fg uppercase tracking-widest"
        />
      </div>

      {/* Appearance — spec §8: theme picker stays (product identity) but
          lives under a clear section heading with Interface prefs. */}
      <section className="mb-12">
        <h2 className="mb-1 text-lg font-bold tracking-tight text-fg">Appearance</h2>
        <p className="mb-4 text-xs text-muted-fg">Theme — pick the mood; it applies instantly.</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {THEMES.map((t) => {
            const active = theme === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTheme(t.id)}
                aria-pressed={active}
                aria-label={`Use ${t.name} theme`}
                className={cn(
                  "group flex flex-col gap-3 rounded-2xl border p-3 transition-all",
                  active ? "border-accent" : "border-border hover:border-fg"
                )}
                style={{ background: t.bg }}
              >
                <div className="flex items-center justify-between">
                  <span
                    className="h-8 w-8 rounded-full border"
                    style={{ background: t.accent, borderColor: t.fg }}
                  />
                  {active && (
                    <Check
                      className="h-4 w-4 shrink-0"
                      strokeWidth={3}
                      aria-hidden
                      style={{ color: t.fg }}
                    />
                  )}
                </div>
                <span
                  className="text-xs font-bold uppercase tracking-widest"
                  style={{ color: t.fg }}
                >
                  {t.name}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* Interface — preferences under Appearance per spec IA */}
      <section className="max-w-2xl space-y-3">
        <h2 className="mb-4 text-lg font-bold tracking-tight text-fg">Interface</h2>
        <Toggle
          label="Reduced motion"
          description="Minimize animations and transitions"
          checked={reducedMotion}
          onChange={setReducedMotion}
        />
      </section>

      {/* Data — spec §8: clear, calm, destructive-safe */}
      <section className="mt-12 max-w-2xl space-y-4">
        <h2 className="mb-4 text-lg font-bold tracking-tight text-fg">Data</h2>
        <div className="space-y-3">
          <div className="rounded-2xl border border-border bg-bg p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-bold tracking-tight text-fg">Export your data</p>
                <p className="mt-1 text-xs text-muted-fg">Download a full backup of subjects, notes, cards, and sessions.</p>
              </div>
              <Button size="sm" onClick={handleExport} disabled={exportStatus === "exporting"}>
                <Download size={14} />
                {exportStatus === "exporting" ? "Exporting…" : "Export data"}
              </Button>
            </div>
          </div>
          <div className="rounded-2xl border border-border bg-bg p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-bold tracking-tight text-fg">Import backup</p>
                <p className="mt-1 text-xs text-muted-fg">Restore from an OpenStudy backup file. Existing data may be replaced.</p>
              </div>
              <Button size="sm" variant="secondary" onClick={() => fileInputRef.current?.click()} disabled={importStatus === "importing"}>
                <Upload size={14} />
                {importStatus === "importing" ? "Importing…" : "Import data"}
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
                <p className="text-sm font-bold tracking-tight text-fg">Import backup?</p>
                <p className="mt-1 text-xs text-muted-fg">
                  Existing data may be replaced. File: {pendingFile.name}
                </p>
                <div className="mt-3 flex gap-2">
                  <Button size="sm" variant="danger" onClick={runImport}>
                    <Upload size={14} />
                    Import backup
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      setImportStatus("idle");
                      setPendingFile(null);
                    }}
                  >
                    Cancel
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
