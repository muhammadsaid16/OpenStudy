"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { BookOpen, Brain, Clock, Layers, Sparkles, StickyNote, Target, Zap } from "lucide-react";
import Link from "next/link";
import { Card, CountUp, StudyAllDueButton } from "@/components/dashboard-parts";
import { TopBar } from "@/components/topbar";
import { FocusZone } from "@/components/focus-zone";
import { DailyProgress } from "@/components/daily-progress";
import { WeeklyAnalytics } from "@/components/weekly-analytics";
import { DeadlineList } from "@/components/deadline-list";
import { ContinueStudying } from "@/components/continue-studying";
import { Upcoming } from "@/components/upcoming";
import { PageLoader } from "@/components/page-loader";
import { StatsHeatmap } from "@/components/stats-heatmap";
import { StatsStreakBadge } from "@/components/stats-streak-badge";
import { getDashboardStats, getTodayProgress, getWeeklyAnalytics, getGoals, getAllReviewLogs } from "./actions";
import type { ReviewLogRec } from "@/lib/db";
import { formatDuration } from "@/lib/utils";

type Stats = Awaited<ReturnType<typeof getDashboardStats>>;
type Weekly = Awaited<ReturnType<typeof getWeeklyAnalytics>>;
type Today = Awaited<ReturnType<typeof getTodayProgress>>;

const SPRING = { type: "spring" as const, stiffness: 260, damping: 20 };

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07, delayChildren: 0.05 } },
};

const item = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: SPRING },
};

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [weekly, setWeekly] = useState<Weekly | null>(null);
  const [today, setToday] = useState<Today | null>(null);
  const [goalCounts, setGoalCounts] = useState<{ active: number; total: number } | null>(null);
  const [reviewLogs, setReviewLogs] = useState<ReviewLogRec[]>([]);
  // Spec §1: full goal list for the UPCOMING card (dueDate + subject).
  const [goals, setGoals] = useState<Awaited<ReturnType<typeof getGoals>>>([]);

  useEffect(() => {
    getDashboardStats().then(setStats);
    getWeeklyAnalytics().then(setWeekly);
    getTodayProgress().then(setToday);
    getAllReviewLogs().then(setReviewLogs);
    getGoals().then(setGoals);
    getGoals().then((goals) =>
      setGoalCounts({
        active: goals.filter((g) => g.status === "in_progress").length,
        total: goals.length,
      })
    );
  }, []);

  if (!stats) {
    return <PageLoader variant="dashboard" titleW="w-56" />;
  }

  const todayData = today ?? { cardsReviewedToday: 0, minutesToday: 0, streakDays: 0 };

  return (
    <div className="p-6 lg:p-10">
      <TopBar dueCards={stats.dueCards} />

      <motion.div variants={container} initial="hidden" animate="show">
        {stats.dueCards > 0 && (
          <motion.div variants={item} className="mb-6">
            <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-accent/40 bg-accent-soft px-6 py-4 animate-[pulse-border_2s_ease-in-out_infinite]">
              <div className="flex items-center gap-3">
                <Zap size={20} className="text-accent" aria-hidden />
                <p className="text-sm font-bold tracking-tight text-fg">
                  {stats.dueCards} card{stats.dueCards === 1 ? "" : "s"} ready for review —
                  keep the streak alive.
                </p>
              </div>
              <StudyAllDueButton />
            </div>
          </motion.div>
        )}

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
          {/* Left Column */}
          <div className="space-y-6 lg:col-span-2">
            <motion.div variants={item}>
              <FocusZone />
            </motion.div>
            <motion.div variants={item}>
              {/* Spec §1: resume path for the most recent session */}
              <ContinueStudying
                target={
                  stats.recentSessions.length > 0
                    ? {
                        title:
                          stats.recentSessions[0].title ||
                          stats.recentSessions[0].subject?.name ||
                          "Last session",
                        subjectName: stats.recentSessions[0].subject?.name ?? null,
                        subjectColor: stats.recentSessions[0].subject?.color ?? null,
                        minutes: stats.recentSessions[0].durationMin,
                        when: "recent",
                      }
                    : null
                }
              />
            </motion.div>
            <motion.div variants={item}>
              <DeadlineList deadlines={weekly?.deadlines ?? []} />
            </motion.div>
            <motion.div variants={item}>
              {/* Spec §1 UPCOMING: goal due dates */}
              <Upcoming
                items={goals.map((g) => ({
                  id: g.id,
                  title: g.title,
                  dueDate: g.dueDate ?? new Date(0),
                  status: g.status,
                  subjectName: null,
                  subjectColor: null,
                }))}
              />
            </motion.div>
            {stats.subjectBreakdown.length > 0 && (
              <motion.div variants={item}>
                <p className="mb-4 text-xs font-bold uppercase tracking-widest text-muted-fg">
                  Subjects
                </p>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {stats.subjectBreakdown.slice(0, 4).map((s) => (
                    <Link key={s.id} href="/subjects" aria-label={`Open ${s.name}`}>
                      <Card hover className="relative overflow-hidden !p-5">
                        <span
                          className="absolute inset-y-0 left-0 w-1"
                          style={{ backgroundColor: s.color }}
                          aria-hidden
                        />
                        <p className="truncate pl-2 font-semibold tracking-tight">{s.name}</p>
                        <p className="mt-2 pl-2 font-mono text-xs tabular-nums text-muted-fg">
                          {s.cardCount} cards ·{" "}
                          {s.dueCount > 0 ? (
                            <span className="font-bold text-accent">{s.dueCount} due</span>
                          ) : (
                            "clear"
                          )}
                        </p>
                      </Card>
                    </Link>
                  ))}
                </div>
              </motion.div>
            )}
            <motion.div variants={item}>
              <p className="mb-4 text-xs font-bold uppercase tracking-widest text-muted-fg">
                Recent Sessions
              </p>
              {stats.recentSessions.length === 0 ? (
                <Card className="py-12 text-center">
                  <Sparkles size={28} aria-hidden className="mx-auto mb-3 text-accent" />
                  <p className="text-sm text-muted-fg">
                    No sessions yet — start your first Focus Zone timer above.
                  </p>
                </Card>
              ) : (
                <div className="glass divide-y divide-border overflow-hidden rounded-3xl">
                  {stats.recentSessions.map((session) => (
                    <div
                      key={session.id}
                      className="group flex items-center justify-between gap-4 px-6 py-4 transition-colors hover:bg-glass-hover"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <span
                          className="h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{ backgroundColor: session.subject?.color ?? "#64748B" }}
                          aria-hidden
                        />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold tracking-tight">
                            {session.title}
                          </p>
                          <p className="text-[11px] uppercase tracking-widest text-muted-fg">
                            {session.subject?.name ?? "General"}
                          </p>
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-3">
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-widest ${
                            session.completed
                              ? "bg-grow/10 text-grow"
                              : "bg-flow/10 text-flow"
                          }`}
                        >
                          {session.completed ? "Done" : "Active"}
                        </span>
                        <span className="font-mono text-xs tabular-nums text-muted-fg">
                          {formatDuration(session.durationMin)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          </div>

          {/* Right Column */}
          <div className="space-y-6 lg:col-span-3">
            <motion.div variants={item}>
              <DailyProgress
                data={{
                  cardsReviewed: todayData.cardsReviewedToday,
                  cardsGoal: 30,
                  minutesToday: todayData.minutesToday,
                  minutesGoal: 60,
                  streakDays: todayData.streakDays,
                }}
              />
            </motion.div>
            <motion.div variants={item} className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {[
                {
                  label: "Subjects",
                  value: stats.totalSubjects,
                  icon: BookOpen,
                  // Empty state = next action (audit 3.1): each stat card
                  // becomes a step in the setup checklist, not a dead zero.
                  emptyCta: "+ Add subject",
                  emptyHref: "/subjects",
                },
                {
                  label: "Topics",
                  value: stats.totalTopics,
                  icon: Layers,
                  emptyCta: "Create a topic",
                  emptyHref: "/subjects",
                },
                {
                  label: "Cards",
                  value: stats.totalFlashcards,
                  icon: Brain,
                  emptyCta: "Make flashcards",
                  emptyHref: "/flashcards",
                },
                {
                  label: "Study time",
                  value: stats.totalMinutes > 0 ? formatDuration(stats.totalMinutes) : "0m",
                  icon: Clock,
                  // Value is a string once non-zero; show CTA only when truly empty.
                  emptyCta: "Start studying →",
                  emptyHref: "/sessions",
                },
              ].map((s) => {
                const isEmpty =
                  typeof s.value === "number" ? s.value === 0 : s.value === "0m";
                return isEmpty ? (
                  <Link key={s.label} href={s.emptyHref}>
                    <Card hover className="flex h-full flex-col gap-3 p-5 !p-5">
                      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent-soft text-accent">
                        <s.icon size={17} aria-hidden />
                      </span>
                      <span className="font-mono text-xl font-bold tabular-nums leading-none lg:text-2xl">
                        0
                      </span>
                      <span className="text-xs font-bold tracking-tight text-accent">
                        {s.emptyCta}
                      </span>
                    </Card>
                  </Link>
                ) : (
                  <Card key={s.label} hover className="flex h-full flex-col gap-3 p-5 !p-5">
                    <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent-soft text-accent">
                      <s.icon size={17} aria-hidden />
                    </span>
                    <span className="font-mono text-xl font-bold tabular-nums leading-none lg:text-2xl">
                      {typeof s.value === "number" ? <CountUp value={s.value} /> : s.value}
                    </span>
                    <span className="text-[10px] font-bold uppercase tracking-widest text-muted-fg">
                      {s.label}
                    </span>
                  </Card>
                );
              })}
            </motion.div>
            <motion.div variants={item}>
              {weekly && <WeeklyAnalytics data={weekly.weekDays} />}
            </motion.div>
            <motion.div variants={item}>
              <Card className="space-y-4 !p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold tracking-tight">Review activity</p>
                    <p className="text-[11px] uppercase tracking-widest text-muted-fg">
                      Daily review log · last 26 weeks
                    </p>
                  </div>
                  <StatsStreakBadge reviews={reviewLogs} />
                </div>
                <StatsHeatmap reviews={reviewLogs} weeks={26} />
              </Card>
            </motion.div>
            <motion.div variants={item}>
                            <Link href="/goals" aria-label="Open goals board">
                <Card hover className="flex flex-wrap items-center justify-between gap-4 !p-5">
                  <div className="flex items-center gap-3">
                    <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent-soft text-accent">
                      <Target size={17} aria-hidden />
                    </span>
                    <div>
                      <p className="font-semibold tracking-tight">Goals</p>
                      <p className="text-[11px] uppercase tracking-widest text-muted-fg">
                        Long-term vision · kanban board
                      </p>
                    </div>
                  </div>
                  <span className="font-mono text-xs tabular-nums text-muted-fg">
                    {goalCounts
                      ? goalCounts.total === 0
                        ? "Start planning →"
                        : `${goalCounts.active} active · ${goalCounts.total} total`
                      : "…"}
                  </span>
                </Card>
              </Link>
            </motion.div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

// keep unused imports honest
void StickyNote;
