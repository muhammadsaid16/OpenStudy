"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useT } from "@/lib/i18n";
import { useAppStore } from "@/lib/store";
import { useLiveData } from "@/lib/use-live-data";
import { getStudySessions, getSubjects } from "@/app/actions";
import { usePomodoro } from "@/lib/pomodoro";
import { RevealHeading } from "@/components/reveal-heading";
import { ScrambleSubtitle } from "@/components/scramble-subtitle";
import {
  getStudyTimeStats,
  formatHMS,
  formatHuman,
  rangeBounds,
  type RangeKey,
  type StudySessionLike,
} from "@/lib/review-stats";
import { ChevronLeft, ChevronRight, Clock, Play, Settings2 } from "lucide-react";
import { cn } from "@/lib/utils";

type SessionRow = Awaited<ReturnType<typeof getStudySessions>>[number];
type SubjectRow = Awaited<ReturnType<typeof getSubjects>>[number];

function Donut({
  totalSeconds,
  breakdown,
  label,
}: {
  totalSeconds: number;
  breakdown: { percentage: number; color: string; name: string }[];
  label: string;
}) {
  const reducedMotion = useAppStore((s) => s.reducedMotion);
  const R = 72,
    C = 88,
    STROKE = 18;
  const circ = 2 * Math.PI * R;
  // segment geometry — running offset via reduce (no mutable reassign, eslint-clean)
  const segments = breakdown.slice(0, 12).map((b, i, arr) => {
    const prior = arr.slice(0, i).reduce((acc, x) => acc + (x.percentage / 100) * circ, 0);
    const len = (b.percentage / 100) * circ;
    return { ...b, dash: `${Math.max(0, len - 1)} ${circ}`, offset: prior };
  });
  return (
    <div className="relative mx-auto flex h-[220px] w-[220px] items-center justify-center sm:h-[260px] sm:w-[260px]">
      <svg viewBox={`0 0 ${C * 2} ${C * 2}`} className="absolute inset-0 h-full w-full -rotate-90" role="img" aria-hidden>
        <circle cx={C} cy={C} r={R} fill="none" stroke="var(--color-muted)" strokeWidth={STROKE} opacity={0.5} />
        {segments.map((s, i) => (
          <circle
            key={i}
            cx={C}
            cy={C}
            r={R}
            fill="none"
            stroke={s.color}
            strokeWidth={STROKE}
            strokeLinecap="round"
            strokeDasharray={s.dash}
            strokeDashoffset={-s.offset}
            style={{ transition: reducedMotion ? undefined : "stroke-dasharray 600ms ease, stroke-dashoffset 600ms ease" }}
          />
        ))}
      </svg>
      <div className="relative z-10 text-center">
        <div className="font-mono text-2xl font-bold tracking-tight text-fg sm:text-3xl">{formatHMS(totalSeconds).slice(0, 5)}</div>
        <div className="text-[10px] font-bold uppercase tracking-widest text-muted-fg">{label}</div>
      </div>
    </div>
  );
}

export default function ReviewPage() {
  const t = useT();
  const lang = useAppStore((s) => s.lang);
  const pomo = usePomodoro();
  const [range, setRange] = useState<RangeKey>("week");
  const [anchor, setAnchor] = useState(() => new Date());

  const live = useLiveData(() => Promise.all([getStudySessions(1000), getSubjects()]), []);
  const sessions: SessionRow[] | undefined = live?.[0];
  const subjects: SubjectRow[] = useMemo(() => live?.[1] ?? [], [live]);

  const stats = useMemo(() => {
    if (!sessions) return null;
    return getStudyTimeStats(sessions as StudySessionLike[], range, anchor, subjects);
  }, [sessions, subjects, range, anchor]);

  const bounds = rangeBounds(range, anchor);

  const canNext = useMemo(() => {
    if (range === "all") return false;
    if (!bounds) return false;
    const next = new Date(anchor);
    if (range === "day") next.setDate(next.getDate() + 1);
    else if (range === "week") next.setDate(next.getDate() + 7);
    else next.setMonth(next.getMonth() + 1);
    const nb = rangeBounds(range, next);
    if (!nb) return false;
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    return nb.start.getTime() <= todayStart.getTime();
  }, [anchor, range, bounds]);

  function shift(dir: -1 | 1) {
    const n = new Date(anchor);
    if (range === "day") n.setDate(n.getDate() + dir);
    else if (range === "week") n.setDate(n.getDate() + dir * 7);
    else if (range === "month") n.setMonth(n.getMonth() + dir);
    setAnchor(n);
  }

  function periodLabel() {
    if (range === "all") return t("review.allTime");
    if (!bounds) return "";
    const locale = lang === "ar" ? "ar-EG" : "en-US";
    if (range === "day") return bounds.start.toLocaleDateString(locale, { month: "short", day: "numeric", year: "numeric" });
    if (range === "month") return bounds.start.toLocaleDateString(locale, { month: "long", year: "numeric" });
    const s = bounds.start.toLocaleDateString(locale, { month: "short", day: "numeric" });
    const e = bounds.end.toLocaleDateString(locale, { month: "short", day: "numeric" });
    return `${s} – ${e}`;
  }

  const isEmpty = stats != null && stats.totalSeconds === 0;

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <RevealHeading text={t("review.title")} className="text-2xl font-bold tracking-tight" />
          <ScrambleSubtitle text={t("review.subtitle")} className="text-sm text-muted-fg" />
        </div>
        <Link href="/settings" aria-label={t("nav.settings")} className="rounded-full p-2 text-muted-fg hover:bg-glass hover:text-fg">
          <Settings2 size={18} />
        </Link>
      </div>

      <div className="glass flex gap-1 rounded-full p-1" role="tablist" aria-label={t("review.subtitle")}>
        {(["day", "week", "month", "all"] as RangeKey[]).map((k) => (
          <button
            key={k}
            role="tab"
            aria-selected={range === k}
            onClick={() => setRange(k)}
            className={cn(
              "flex-1 rounded-full px-3 py-2 text-xs font-bold uppercase tracking-widest transition-colors",
              range === k ? "bg-accent text-accent-fg shadow" : "text-muted-fg hover:text-fg"
            )}
          >
            {t(`review.range.${k}`)}
          </button>
        ))}
      </div>

      <div className="mt-4 flex items-center justify-between">
        <button
          onClick={() => shift(-1)}
          disabled={range === "all"}
          aria-label={t("review.prev")}
          className="rounded-full p-2 text-muted-fg hover:bg-glass hover:text-fg disabled:opacity-30"
        >
          <ChevronLeft size={18} />
        </button>
        <span className="text-sm font-semibold tracking-tight" aria-live="polite">{periodLabel()}</span>
        <button
          onClick={() => shift(1)}
          disabled={!canNext}
          aria-label={t("review.next")}
          className="rounded-full p-2 text-muted-fg hover:bg-glass hover:text-fg disabled:opacity-30"
        >
          <ChevronRight size={18} />
        </button>
      </div>

      {pomo.active && (
        <div className="mt-4 flex items-center gap-3 rounded-2xl border border-accent/20 bg-accent-soft px-4 py-3">
          <span className="h-2 w-2 animate-pulse rounded-full bg-accent" />
          <span className="text-xs font-bold uppercase tracking-widest text-accent">{t("review.currentlyStudying")}</span>
          <span className="text-sm font-medium">{pomo.title || subjects.find((s) => s.id === pomo.subjectId)?.name || t("review.uncategorized")}</span>
          <span className="ms-auto font-mono text-sm">{formatHMS(pomo.workSeconds)}</span>
        </div>
      )}

      {!stats ? (
        <div className="mt-8 space-y-3 animate-pulse">
          <div className="mx-auto h-56 w-56 rounded-full bg-glass" />
          <div className="h-20 rounded-2xl bg-glass" />
        </div>
      ) : isEmpty ? (
        <div className="mt-10 rounded-2xl border border-border bg-glass p-8 text-center">
          <Clock className="mx-auto mb-3 text-muted-fg" />
          <p className="font-semibold">{t("review.empty")}</p>
          <p className="mt-1 text-sm text-muted-fg">{t("review.emptyHint")}</p>
          <Link href="/sessions" className="mt-4 inline-flex items-center gap-2 rounded-full bg-accent px-5 py-2 text-sm font-semibold text-accent-fg">
            <Play size={16} />
            {t("review.startSession")}
          </Link>
        </div>
      ) : (
        <>
          <div className="mt-6">
            <Donut totalSeconds={stats.totalSeconds} breakdown={stats.breakdown} label={t("review.totalTime")} />
            <p className="sr-only">
              {`${t("review.totalTime")}: ${formatHuman(stats.totalSeconds, lang)}. ${stats.breakdown
                .map((b) => `${b.name} ${b.percentage}%`)
                .join(". ")}.`}
            </p>
          </div>

          <div className="mt-6 divide-y divide-border overflow-hidden rounded-2xl border border-border bg-glass">
            {stats.breakdown.map((b) => {
              const subject = subjects.find((s) => s.id === b.id);
              const content = (
                <>
                  <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: b.color }} />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{b.name}</span>
                  <span className="text-xs text-muted-fg">{b.percentage}%</span>
                  <span className="font-mono text-sm font-semibold">{formatHMS(b.seconds)}</span>
                </>
              );
              return subject ? (
                <Link key={b.id} href="/subjects" className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-accent-soft">
                  {content}
                </Link>
              ) : (
                <div key={b.id} className="flex items-center gap-3 px-4 py-3">
                  {content}
                </div>
              );
            })}
          </div>

          {(range === "week" || range === "month") && stats.daily.length > 0 && (
            <div className="mt-6 rounded-2xl border border-border bg-glass p-4">
              <div className="mb-3 text-xs font-bold uppercase tracking-widest text-muted-fg">{t("review.dailyActivity")}</div>
              <div className="flex items-end gap-[3px]" style={{ height: 80 }}>
                {stats.daily.map((d) => {
                  const max = Math.max(1, ...stats.daily.map((x) => x.seconds));
                  const h = max ? (d.seconds / max) * 100 : 0;
                  return (
                    <div
                      key={d.date}
                      title={`${d.date} ${formatHuman(d.seconds, lang)}`}
                      className="flex-1 rounded-sm"
                      style={{
                        height: `${Math.max(d.seconds ? 4 : 2, h)}%`,
                        background: d.seconds ? "var(--color-accent)" : "var(--color-muted)",
                        opacity: d.seconds ? 0.9 : 0.4,
                      }}
                    />
                  );
                })}
              </div>
              <div className="mt-2 flex justify-between text-[10px] text-muted-fg/60">
                <span>{stats.daily[0]?.date.slice(5)}</span>
                <span>{stats.daily[stats.daily.length - 1]?.date.slice(5)}</span>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
