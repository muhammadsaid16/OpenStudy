"use client";

import { useT } from "@/lib/i18n";
import { useCallback, useEffect, useState } from "react";
import { Bell, X } from "lucide-react";
import { Button } from "./ui";
import { useNotificationScheduler } from "@/hooks/useNotificationScheduler";

const PRESETS: Array<{ label: string; minutes: number }> = [
  { label: "15 MIN", minutes: 15 },
  { label: "1 HR", minutes: 60 },
  { label: "4 HRS", minutes: 240 },
];

function fmtCountdown(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function RemindMeControl({ dueCount }: { dueCount: number }) {
  const t = useT();
  const { requestPermission, schedule, cancel } = useNotificationScheduler();
  const [open, setOpen] = useState(false);
  const [remindAt, setRemindAt] = useState<Date | null>(null);
  const [now, setNow] = useState(0);
  const [error, setError] = useState("");

  // Tick the countdown every second when armed
  useEffect(() => {
    if (!remindAt) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [remindAt]);

  // useCallback so react-hooks/purity treats this as an event-handler body,
  // not render scope (Date.now() is legal here — it's a click handler).
  const arm = useCallback(
    async (minutes: number) => {
      setError("");
      const perm = await requestPermission();
      if (perm !== "granted") {
        setError("NOTIFICATIONS BLOCKED — ENABLE IN BROWSER SETTINGS.");
        return;
      }
      const startedAt = Date.now();
      setNow(startedAt); // seed the countdown before the first tick
      const when = new Date(startedAt + minutes * 60 * 1000);
      schedule(when, t("ui.time_to_review"), `${dueCount} card${dueCount === 1 ? "" : "s"} due in OpenStudy.`);
      setRemindAt(when);
      setOpen(false);
    },
    [requestPermission, schedule, dueCount]
  );

  const cancel_ = () => {
    cancel();
    setRemindAt(null);
  };

  if (remindAt) {
    const remaining = remindAt.getTime() - now;
    if (remaining <= 0) {
      // The notification already fired (or was throttled) — clear state
      return (
        <div className="flex items-center justify-center gap-2 rounded-full border border-success/30 bg-success/10 px-3 py-1.5">
          <Bell size={11} className="text-success" />
          <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-success">{t("ui.reminder_sent")}</span>
          <button
            type="button"
            onClick={() => setRemindAt(null)}
            className="text-success hover:text-accent"
            aria-label={t("ui.dismiss")}
          >
            <X size={11} />
          </button>
        </div>
      );
    }
    return (
      <div className="flex items-center justify-center gap-2 rounded-full border border-accent/30 bg-accent-soft px-3 py-1.5">
        <Bell size={11} className="text-accent" />
        <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-accent-fg">
          REMINDING IN {fmtCountdown(remaining)}
        </span>
        <button
          type="button"
          onClick={cancel_}
          className="text-accent-fg hover:text-accent"
          aria-label={t("ui.cancel_reminder")}
        >
          <X size={11} />
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-1.5">
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-full border border-glass-border bg-glass px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-fg backdrop-blur-md transition-colors hover:border-accent hover:text-accent"
        >
          <Bell size={11} />{t("ui.remind_me")}</button>
      ) : (
        <div className="flex flex-wrap items-center justify-center gap-1.5">
          {PRESETS.map((p) => (
            <Button
              key={p.minutes}
              size="sm"
              variant="secondary"
              onClick={() => arm(p.minutes)}
            >
              {p.label}
            </Button>
          ))}
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-full p-1.5 text-muted-fg hover:bg-accent-soft hover:text-accent"
            aria-label={t("common.cancel")}
          >
            <X size={11} />
          </button>
        </div>
      )}
      {error && (
        <p className="text-[10px] uppercase tracking-widest text-danger">{error}</p>
      )}
    </div>
  );
}
