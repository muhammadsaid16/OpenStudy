"use client";

import { useEffect, useMemo, useState } from "react";
import { useT } from "@/lib/i18n";
import { Card } from "@/components/ui";
import { RevealHeading } from "@/components/reveal-heading";
import { ScrambleSubtitle } from "@/components/scramble-subtitle";
import { PageLoader } from "@/components/page-loader";
import { StatsStreakBadge } from "@/components/stats-streak-badge";
import { StatsHeatmap } from "@/components/stats-heatmap";
import { RetentionCurve } from "@/components/retention-curve";
import { HardestCardsTable } from "@/components/hardest-cards-table";
import { ForecastCard, BundleMasteryTable } from "@/components/stats-forecast-mastery";
import { getAllReviewLogs, getBundles, getFlashcards, getStudySessions, getSubjects } from "@/app/actions";
import { computeStreak } from "@/lib/stats";
import { formatDuration } from "@/lib/utils";
import type { BundleRec, FlashcardRec, ReviewLogRec, StudySessionRec } from "@/lib/db";
import { Flame, Layers, Clock, Trophy, AlertTriangle, Activity, Timer } from "lucide-react";
import { useLiveData } from "@/lib/use-live-data";

type Period = "30" | "90" | "365" | "all";
const PERIODS: { key: Period; label: string; weeks: number }[] = [
  { key: "30", label: "30D", weeks: 5 },
  { key: "90", label: "90D", weeks: 13 },
  { key: "365", label: "1Y", weeks: 52 },
  { key: "all", label: t("stats.allPeriod"), weeks: 52 },
];

// ── helpers ───────────────────────────────────────────────────────
function kpiAccuracy(reviews: ReviewLogRec[]) {
  if (!reviews.length) return 0;
  const correct = reviews.filter((r) => (r.quality ?? 0) >= 3).length;
  return Math.round((correct / reviews.length) * 100);
}
function buildDailyBars(reviews: ReviewLogRec[], days: number) {
  const now = new Date(); now.setHours(0,0,0,0);
  const map = new Map<string, number>();
  for (const r of reviews) {
    const d = new Date(r.reviewedAt); d.setHours(0,0,0,0);
    const k = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    map.set(k, (map.get(k) ?? 0) + 1);
  }
  const out: { label: string; count: number; date: Date }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now); d.setDate(d.getDate() - i);
    const k = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    out.push({ date: d, count: map.get(k) ?? 0, label: d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) });
  }
  return out;
}
function buildHourly(reviews: ReviewLogRec[]) {
  const buckets = Array(24).fill(0) as number[];
  for (const r of reviews) buckets[new Date(r.reviewedAt).getHours()]++;
  return buckets;
}
function buildWeeklyVelocity(reviews: ReviewLogRec[], weeks: number = 12) {
  const now = new Date(); now.setHours(0,0,0,0);
  // start on Monday
  const dow = (now.getDay() + 6) % 7;
  const thisMonday = new Date(now); thisMonday.setDate(thisMonday.getDate() - dow);
  const out: { label: string; count: number }[] = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const start = new Date(thisMonday); start.setDate(start.getDate() - i * 7);
    const end = new Date(start); end.setDate(end.getDate() + 7);
    const count = reviews.filter(r => { const t = new Date(r.reviewedAt).getTime(); return t >= start.getTime() && t < end.getTime(); }).length;
    out.push({ label: start.toLocaleDateString(undefined, { month: "short", day: "numeric" }), count });
  }
  return out;
}

// ── tiny inline charts ──────────────────────────────────────────
function Bars({ data, max, color = "var(--color-accent)", h = 80 }: { data: number[]; max?: number; color?: string; h?: number }) {
  const m = max ?? Math.max(1, ...data);
  return (
    <div className="flex items-end gap-[2px]" style={{ height: h }}>
      {data.map((v, i) => (
        <div key={i} className="flex-1 rounded-sm transition-all" style={{ height: `${(v / m) * 100}%`, background: color, opacity: v === 0 ? 0.15 : 0.9, minHeight: v > 0 ? 3 : 2 }} title={`${v}`} />
      ))}
    </div>
  );
}
function HourlyBars({ buckets }: { buckets: number[] }) {
  const max = Math.max(1, ...buckets);
  return (
    <div className="space-y-2">
      <div className="flex items-end gap-[2px] h-[90px]">
        {buckets.map((v, i) => (
          <div key={i} className="flex flex-1 flex-col items-center gap-1">
            <div className="w-full rounded-sm transition-all" style={{ height: `${(v / max) * 80}px`, background: i >= 9 && i <= 17 ? "var(--color-accent)" : "var(--color-muted)", opacity: v === 0 ? 0.2 : 1, minHeight: v > 0 ? 3 : 2 }} title={`${i}:00 — ${v} reviews`} />
          </div>
        ))}
      </div>
      <div className="flex justify-between text-[9px] font-mono uppercase text-muted-fg/60">
        <span>0h</span><span>6h</span><span>12h</span><span>18h</span><span>23h</span>
      </div>
    </div>
  );
}

// ── page ─────────────────────────────────────────────────────────
export default function StatsPage() {
  const t = useT();
  const [reviews, setReviews] = useState<ReviewLogRec[] | null>(null);
  const [bundles, setBundles] = useState<BundleRec[] | null>(null);
  const [cards, setCards] = useState<FlashcardRec[] | null>(null);
  const [sessions, setSessions] = useState<StudySessionRec[] | null>(null);
  // id -> name, for resolving subject names in the insights cards.
  const [subjectNames, setSubjectNames] = useState<Map<string, string>>(new Map());
  const [period, setPeriod] = useState<Period>("365");
  // wall clock — captured once in the mount effect (react-hooks/purity bans Date.now() in render, even inside useMemo)
  const [nowMs, setNowMs] = useState(0);
  // Set when the storage read itself failed — distinguishes "no data yet"
  // from "couldn't load your data" (Heuristic #1, see catch below).
  const [loadFailed, setLoadFailed] = useState(false);

  const filteredReviews = useMemo(() => {
    if (!reviews) return [] as ReviewLogRec[];
    if (period === "all") return reviews;
    const days = period === "30" ? 30 : period === "90" ? 90 : 365;
    const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - days);
    return reviews.filter(r => new Date(r.reviewedAt) >= cutoff);
  }, [reviews, period]);

  const dueNow = useMemo(() => {
    if (!cards) return 0;
    return cards.filter(c => new Date(c.nextReview).getTime() <= nowMs).length;
  }, [cards, nowMs]);
  const avgPerDay = useMemo(() => {
    if (!reviews || reviews.length === 0) return 0;
    const first = new Date(reviews[0]?.reviewedAt ?? nowMs).getTime();
    const days = Math.max(1, Math.ceil((nowMs - first) / 86_400_000));
    return Math.round((reviews.length / days) * 10) / 10;
  }, [reviews, nowMs]);

  const weeksForHeatmap = PERIODS.find(p => p.key === period)!.weeks;

  // Realtime: every chart source re-fetches on ANY table change.
  const live = useLiveData(
    () => Promise.all([getAllReviewLogs(), getBundles(), getFlashcards(), getStudySessions(), getSubjects()]),
    []
  );
  useEffect(() => {
    if (!live) return;
    const [r, b, c, s, subs] = live;
    setNowMs(Date.now());
    setReviews(r);
    setBundles(b);
    setCards(c as unknown as FlashcardRec[]);
    setSessions(s as unknown as StudySessionRec[]);
    setSubjectNames(new Map(subs.map((x) => [x.id, x.name])));
  }, [live]);

  if (!reviews || !bundles || !cards || !sessions) {
    return <PageLoader variant="dashboard" titleW="w-48" />;
  }

  const acc = kpiAccuracy(reviews);
  const totalReviews = reviews.length;
  const totalHours = Math.round(sessions.reduce((a, s) => a + (s.durationMin ?? 0), 0) / 60 * 10) / 10;
  const streak = computeStreak(reviews);
  const mastered = cards.filter(c => (c.intervalDays ?? 0) >= 21).length;
  const leeches = cards.filter(c => c.isLeech).length;

  // Spec §7 actionable insights — derived from the FULL session list.
  // Best weekday by total focus minutes; most-studied subject by minutes.
  const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const bestDay = (() => {
    if (sessions.length === 0) return null;
    const byDay = new Array(7).fill(0);
    for (const s of sessions) byDay[new Date(s.startedAt).getDay()] += s.durationMin ?? 0;
    const idx = byDay.indexOf(Math.max(...byDay));
    if (byDay[idx] === 0) return null;
    const mins = byDay[idx];
    return {
      label: WEEKDAYS[idx],
      label2: mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60 ? `${mins % 60}m` : ""}`.trim() : `${mins}m`,
    };
  })();
  const topSubject = (() => {
    if (sessions.length === 0) return null;
    const bySubject = new Map<string, number>();
    for (const s of sessions) {
      const key = s.subjectId ?? "none";
      bySubject.set(key, (bySubject.get(key) ?? 0) + (s.durationMin ?? 0));
    }
    let topKey: string | null = null;
    let topMin = 0;
    for (const [k, m] of bySubject) {
      if (m > topMin) {
        topKey = k;
        topMin = m;
      }
    }
    if (!topKey || topMin === 0) return null;
    return {
      name:
        topKey === "none"
          ? "General sessions"
          : subjectNames.get(topKey) ?? "A subject",
      minutes: topMin,
    };
  })();

  const daily = buildDailyBars(reviews, 30);
  const hourly = buildHourly(reviews);
  const weekly = buildWeeklyVelocity(reviews, 12);

  return (
    <div className="p-6 lg:p-10">
      {loadFailed && (
        <div
          role="alert"
          className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-warning/40 bg-warning/10 px-5 py-3"
        >
          <p className="text-sm font-semibold text-fg">
            Couldn&apos;t load your stats — showing empty charts. Your data is still saved locally.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="rounded-full bg-warning/20 px-4 py-1.5 text-xs font-bold uppercase tracking-widest text-fg transition-colors hover:bg-warning/30"
          >
            Retry
          </button>
        </div>
      )}
      {/* header */}
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <RevealHeading text={t("stats.title")} className="text-4xl lg:text-6xl" />
          <ScrambleSubtitle text={t("stats.subtitle")} className="mt-2 text-sm text-muted-fg uppercase tracking-widest" />
        </div>
        <div className="flex items-center gap-3">
          <div className="flex rounded-full border border-border bg-bg-raised/60 p-1" role="group" aria-label={t("stats.periodLabel")}>
            {PERIODS.map(p => {
              const isEmpty = reviews.length === 0 && sessions.length === 0;
              const active = period === p.key;
              return (
                <button
                  key={p.key}
                  onClick={() => setPeriod(p.key)}
                  aria-pressed={active}
                  disabled={isEmpty}
                  className={`rounded-full px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest transition-colors ${active ? "bg-accent text-accent-fg" : "text-muted-fg hover:text-accent"} ${isEmpty ? "opacity-40 cursor-not-allowed hover:text-muted-fg" : ""}`}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
          <StatsStreakBadge reviews={reviews} />
        </div>
      </div>

      {/* KPI strip */}
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-6">
        {[
          { icon: Layers, label: t("stats.totalReviews"), value: totalReviews.toLocaleString(), sub: `${avgPerDay}/day`, color: "var(--color-accent)" },
          { icon: Trophy, label: t("stats.accuracy"), value: `${acc}%`, sub: `${reviews.filter(r => (r.quality ?? 0) >= 3).length} correct`, color: "var(--color-grow)" },
          { icon: Timer, label: t("dash.studyTime"), value: `${totalHours}h`, sub: `${sessions.length} sessions`, color: "var(--color-flow)" },
          { icon: Flame, label: t("stats.streakLabel"), value: `${streak} days`, sub: streak === 0 ? "start today" : "keep it up", color: "var(--color-accent)" },
          { icon: Activity, label: t("stats.masteredLabel"), value: `${mastered}`, sub: `${cards.length} cards`, color: "var(--color-grow)" },
          { icon: AlertTriangle, label: t("stats.dueLeeches"), value: `${dueNow}`, sub: `${leeches} leeches`, color: dueNow > 20 ? "var(--color-danger)" : "var(--color-warning)" },
        ].map(k => (
          <Card key={k.label} className="!p-4 flex flex-col gap-2">
            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-muted-fg"><k.icon size={12} style={{ color: k.color }} /> {k.label}</div>
            <div className="font-mono text-2xl font-bold tabular-nums tracking-tight">{k.value}</div>
            <div className="text-[11px] text-muted-fg">{k.sub}</div>
          </Card>
        ))}
      </div>

      {/* Actionable insights (spec §7): not vanity metrics — "best day"
          and "most studied subject" tell the user when/what actually
          works, derived from real session + review data. */}
      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Card className="!p-5">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-fg">{t("stats.bestDay")}</p>
          <p className="mt-1 font-display text-xl font-bold tracking-tight">
            {bestDay ? `${bestDay.label} — ${bestDay.label2}` : "No data yet"}
          </p>
          <p className="mt-1 text-xs text-muted-fg">
            {bestDay ? `Most focused weekday across ${sessions.length} sessions.` : "Start a session to find yours."}
          </p>
        </Card>
        <Card className="!p-5">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-fg">{t("stats.mostStudied")}</p>
          <p className="mt-1 font-display text-xl font-bold tracking-tight">
            {topSubject ? topSubject.name : "No data yet"}
          </p>
          <p className="mt-1 text-xs text-muted-fg">
            {topSubject
              ? `${formatDuration(topSubject.minutes)} focused — keep the streak on it.`
              : "Your subjects appear here as you study."}
          </p>
        </Card>
      </div>

      {/* Row: 30d bars + hourly */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 mb-6">
        <Card className="lg:col-span-8 !p-5">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <p className="font-semibold tracking-tight">Activity — last 30 days</p>
              <p className="text-[11px] uppercase tracking-widest text-muted-fg">Daily review count · {daily.reduce((a,d)=>a+d.count,0)} in 30d</p>
            </div>
            <span className="text-[10px] font-mono uppercase tracking-widest text-muted-fg">max {Math.max(...daily.map(d=>d.count))}/day</span>
          </div>
          {daily.every((d) => d.count === 0) ? (
            <div className="flex h-[110px] flex-col items-center justify-center rounded-xl border border-dashed border-border bg-muted/20">
              <p className="text-xs font-bold uppercase tracking-widest text-muted-fg">{t("stats.noActivity")}</p>
              <p className="mt-1 text-[11px] text-muted-fg">{t("stats.startReviewing")}</p>
            </div>
          ) : (
            <div className="flex items-end gap-[3px] h-[110px]">
              {daily.map((d, i) => {
                const max = Math.max(1, ...daily.map(x=>x.count));
                const hPx = Math.round((d.count / max) * 88) + (d.count>0?4:0);
                const isToday = i === daily.length - 1;
                return (
                  <div key={i} className="flex flex-1 flex-col justify-end items-center" style={{ height: 110 }}>
                    <div title={`${d.label}: ${d.count}`} className="w-full rounded-sm transition-all hover:opacity-80" style={{ height: `${hPx}px`, background: d.count === 0 ? "var(--color-muted)" : isToday ? "var(--color-accent)" : "var(--color-accent)", opacity: d.count === 0 ? 0.25 : 0.9 }} />
                  </div>
                );
              })}
            </div>
          )}
          <div className="mt-2 flex justify-between text-[9px] font-mono uppercase text-muted-fg/60">
            <span>{daily[0].label}</span><span>{daily[14].label}</span><span>{daily[29].label} (today)</span>
          </div>
          {/* weekly velocity mini */}
          <div className="mt-6 border-t border-border pt-4">
            <p className="mb-2 text-[11px] font-bold uppercase tracking-widest text-muted-fg">Weekly velocity — last 12 weeks</p>
            {weekly.every((w) => w.count === 0) ? (
              <div className="flex h-16 items-center justify-center rounded-xl border border-dashed border-border bg-muted/20 text-xs font-bold uppercase tracking-widest text-muted-fg">
                No weekly data yet
              </div>
            ) : (
              <Bars data={weekly.map(w=>w.count)} color="var(--color-flow)" h={64} />
            )}
            <div className="mt-1 flex justify-between text-[9px] font-mono uppercase text-muted-fg/60"><span>{weekly[0].label}</span><span>{weekly[weekly.length-1].label}</span></div>
          </div>
        </Card>

        <Card className="lg:col-span-4 !p-5">
          <p className="font-semibold tracking-tight">{t("stats.peakHours")}</p>
          <p className="mb-4 text-[11px] uppercase tracking-widest text-muted-fg">When you review · 24h distribution</p>
          <HourlyBars buckets={hourly} />
          <div className="mt-4 rounded-xl border border-border bg-muted/30 p-3 flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs"><Clock size={14} className="text-accent" /> Most active: <span className="font-mono font-bold">{hourly.indexOf(Math.max(...hourly))}:00</span></div>
            <span className="text-[10px] uppercase tracking-widest text-muted-fg">{Math.max(...hourly)} reviews</span>
          </div>
          <div className="mt-4 space-y-2">
            <p className="text-[11px] font-bold uppercase tracking-widest text-muted-fg">Quick stats</p>
            <div className="flex justify-between text-sm"><span className="text-muted-fg">Due now</span><span className={`font-mono font-bold ${dueNow > 0 ? "text-accent" : "text-muted-fg"}`}>{dueNow}</span></div>
            <div className="flex justify-between text-sm"><span className="text-muted-fg">{t("dash.tabs.cards")}</span><span className="font-mono font-bold">{cards.length}</span></div>
            <div className="flex justify-between text-sm"><span className="text-muted-fg">{t("common.bundles")}</span><span className="font-mono font-bold">{bundles.length}</span></div>
          </div>
        </Card>
      </div>

      {/* heatmap */}
      <Card className="mb-6 !p-5">
        <div className="mb-1 flex items-center justify-between">
          <p className="font-semibold tracking-tight">Year in review</p>
          <span className="text-[10px] font-mono uppercase tracking-widest text-muted-fg hidden sm:inline">Daily log · {period === "all" ? "52 weeks" : period === "365" ? "52 weeks" : period === "90" ? "13 weeks" : "5 weeks"}</span>
        </div>
        <p className="mb-4 text-[11px] uppercase tracking-widest text-muted-fg">Daily review log · filtered by period</p>
        <StatsHeatmap reviews={filteredReviews} weeks={weeksForHeatmap} />
      </Card>

      {/* retention + forecast */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card className="!p-5">
          <p className="mb-1 font-semibold tracking-tight">Retention curve</p>
          <p className="mb-3 text-[11px] uppercase tracking-widest text-muted-fg">Accuracy vs. days since first review · {filteredReviews.length} reviews</p>
          <RetentionCurve reviews={filteredReviews} />
        </Card>
        <Card className="!p-5">
          <p className="mb-1 font-semibold tracking-tight">Forecast</p>
          <p className="mb-3 text-[11px] uppercase tracking-widest text-muted-fg">Cards coming due (cumulative) · {cards.length} cards</p>
          <ForecastCard cards={cards} />
          <div className="mt-4 flex gap-2 text-[10px] font-mono uppercase tracking-widest">
            <span className="rounded-full bg-accent/10 px-2 py-1 text-accent">{dueNow} due now</span>
            {leeches > 0 && <span className="rounded-full bg-danger/10 px-2 py-1 text-danger">{leeches} leeches</span>}
            {mastered > 0 && <span className="rounded-full bg-success/10 px-2 py-1 text-success">{mastered} mastered (≥21d)</span>}
          </div>
        </Card>
      </div>

      <Card className="mt-6 !p-5">
        <div className="flex items-center justify-between mb-1">
          <p className="font-semibold tracking-tight">Per-bundle mastery</p>
          <span className="text-[10px] font-mono uppercase tracking-widest text-muted-fg">Weakest first · {bundles.length} bundles</span>
        </div>
        <p className="mb-3 text-[11px] uppercase tracking-widest text-muted-fg">Accuracy = correct / total reviews per bundle</p>
        <BundleMasteryTable cards={cards} bundles={bundles} reviews={filteredReviews} />
      </Card>

      <Card className="mt-6 !p-5">
        <div className="flex items-center gap-2 mb-1">
          <p className="font-semibold tracking-tight">Hardest cards</p>
          {leeches > 0 && <span className="rounded-full bg-danger px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-on-color">{leeches} leeches</span>}
        </div>
        <p className="mb-3 text-[11px] uppercase tracking-widest text-muted-fg">Lowest accuracy (min. 3 reviews) · filtered by period</p>
        <HardestCardsTable reviews={filteredReviews} cards={cards} bundles={bundles} />
      </Card>

      <p className="mt-6 text-center text-[10px] uppercase tracking-widest text-muted-fg/60">Period filter affects heatmap, retention, mastery & hardest — KPIs stay global</p>
    </div>
  );
}
