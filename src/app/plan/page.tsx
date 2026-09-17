"use client";

// ─── /plan — Study Planner (Agent 6) ─────────────────────────────
// Renders the distributed daily plan (Contract 4 PlannerDay[]) with
// weakness-first practice, exam markers, and task management. Planning
// logic lives in lib/planner.ts; this page only assembles inputs and
// renders.

import { useEffect, useState } from "react";
import { useT } from "@/lib/i18n";
import { getPlannerData, createTask, moveTask, deleteTask } from "@/app/actions";
import { buildPlan } from "@/lib/planner";
import type { PlannerDay } from "@/lib/contracts";
import type { ExamRec, TaskRec } from "@/lib/db";
import type { WeaknessSignal } from "@/lib/contracts";
import { Button, Modal, Input, Skeleton } from "@/components/ui";
import { cn } from "@/lib/utils";
import { CalendarDays, CircleDot, Clock, Flame, Plus, Trash2, TrendingDown, TrendingUp, Zap } from "lucide-react";

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function PlanPage() {
  const t = useT();
  const [data, setData] = useState<Awaited<ReturnType<typeof getPlannerData>> | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [estimate, setEstimate] = useState("20");
  const [creating, setCreating] = useState(false);

  const reload = async () => {
    const d = await getPlannerData();
    setData(d);
  };

  useEffect(() => {
    reload();
  }, []);

  const create = async () => {
    if (!title.trim()) return;
    setCreating(true);
    try {
      await createTask({
        title: title.trim(),
        dueDate: dueDate ? new Date(`${dueDate}T12:00:00`) : null,
        estimateMin: parseInt(estimate) || null,
      });
      setTitle("");
      setDueDate("");
      setEstimate("20");
      setModalOpen(false);
      await reload();
    } finally {
      setCreating(false);
    }
  };

  if (!data) return <Skeleton className="h-[420px] w-full" />;

  const plan = buildPlan({
    cards: data.cards,
    tasks: data.tasks,
    weakness: data.weakness,
    exams: data.exams.map((e) => ({ title: e.title, dueDate: e.startedAt as Date | string | null, status: e.status })),
    sessions: data.sessions.map((s) => ({ startedAt: s.startedAt, durationMin: s.durationMin })),
  });

  // Exam markers: in-progress exams act as study targets on their start day.
  const examDates = new Map<string, string[]>();
  for (const e of data.exams as ExamRec[]) {
    if (e.status !== "in_progress") continue;
    const key = localDateKey(new Date(e.startedAt));
    examDates.set(key, [...(examDates.get(key) ?? []), e.title]);
  }

  return (
    <div className="page-gutter cq">
      {/* Header — standard v2 page header (eyebrow → title → subtitle) */}
      <div className="mb-10">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-fg/70">{t("nav.focus")}</p>
        <h1 className="mt-1.5 text-3xl font-bold tracking-tight text-fg lg:text-[34px] lg:leading-tight">{t("page.plan")}</h1>
        <p className="mt-2 text-sm text-muted-fg">{t("page.plan.subtitle")}</p>
      </div>        <div className="grid gap-4 sm:grid-cols-4">
        <StatCard icon={<Clock size={15} />} label={t("plan.capacity")} value={`${plan.capacityPerDay}m`} hint={t("plan.capacity_hint")} />
        <StatCard icon={<Zap size={15} />} label={t("plan.review")} value={`${plan.totals.reviewMinutes}m`} hint={t("plan.review_hint")} />
        <StatCard icon={<Flame size={15} />} label={t("plan.practice")} value={`${plan.totals.practiceMinutes}m`} hint={t("plan.practice_hint")} />
        <StatCard icon={<CircleDot size={15} />} label={t("plan.tasks")} value={`${plan.totals.taskMinutes}m`} hint={t("plan.tasks_hint")} />
      </div>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-bold uppercase tracking-widest text-muted-fg">{t("plan.horizon")}</p>
          <Button size="sm" variant="ghost" onClick={() => setModalOpen(true)}><Plus size={14} />{t("plan.add_task")}</Button>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-7">
          {plan.days.map((d) => (
            <PlanDayCard key={d.date} day={d} exams={examDates.get(d.date) ?? []} />
          ))}
        </div>
        {plan.overloadDay && (
          <p className="rounded-xl border border-warning/40 bg-tertiary/10 px-4 py-2 text-xs font-bold text-tertiary">
            {t("plan.overloaded").replace("{date}", plan.overloadDay)}
          </p>
        )}
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="glass space-y-3 rounded-2xl p-6">
          <p className="text-xs font-bold uppercase tracking-widest text-muted-fg">{t("plan.weak_topics")}</p>
          {data.weakness.length === 0 && <p className="text-sm text-muted-fg">{t("plan.no_weakness")}</p>}
          {data.weakness.map((w) => (
            <WeakRow key={`${w.topicId}-${w.label}`} w={w} />
          ))}
        </div>

        <div className="glass space-y-3 rounded-2xl p-6">
          <p className="text-xs font-bold uppercase tracking-widest text-muted-fg">{t("plan.open_tasks")}</p>
          {data.tasks.filter((x) => x.status !== "done").length === 0 && (
            <p className="text-sm text-muted-fg">{t("plan.no_tasks")}</p>
          )}
          {data.tasks.filter((x) => x.status !== "done").map((task) => (
            <div key={task.id} className="flex items-center justify-between rounded-xl border border-border px-3 py-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-bold tracking-tight">{task.title}</p>
                <p className="text-[10px] uppercase tracking-widest text-muted-fg">
                  {task.dueDate ? `${t("plan.due")} ${new Date(task.dueDate).toLocaleDateString()} · ` : ""}
                  {task.estimateMin ? `${task.estimateMin}m` : t("plan.no_estimate")}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button aria-label={t("plan.done")} onClick={() => moveTask(task.id, "done").then(reload)} className="text-muted-fg hover:text-success">
                  ✓
                </button>
                <button aria-label={t("plan.delete_task")} onClick={() => deleteTask(task.id).then(reload)} className="text-muted-fg hover:text-danger">
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={t("plan.add_task")}>
        <div className="space-y-4">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t("plan.task_title")} />
          <div className="grid grid-cols-2 gap-3">
            <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            <Input type="number" min={5} value={estimate} onChange={(e) => setEstimate(e.target.value)} />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="ghost" onClick={() => setModalOpen(false)}>{t("common.cancel")}</Button>
            <Button onClick={create} disabled={creating || !title.trim()}>{creating ? t("common.loading") : t("common.create")}</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function localDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function StatCard({ icon, label, value, hint }: { icon: React.ReactNode; label: string; value: string; hint: string }) {
  return (
    <div className="glass rounded-2xl p-4">
      <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-muted-fg">{icon}{label}</p>
      <p className="mt-1 text-2xl font-black tracking-tight">{value}</p>
      <p className="text-[10px] uppercase tracking-widest text-muted-fg/70">{hint}</p>
    </div>
  );
}

function PlanDayCard({ day, exams }: { day: PlannerDay; exams: string[] }) {
  const t = useT();
  const [y, m, d] = day.date.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  const total = day.totalMinutes;
  const intensity = total === 0 ? "bg-muted" : total < 20 ? "bg-success/40" : total < 45 ? "bg-success" : total < 75 ? "bg-tertiary" : "bg-danger";
  return (
    <div className={cn("glass space-y-1.5 rounded-xl p-3", exams.length > 0 && "border-primary")}>
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-fg">
          {DAY_LABELS[date.getDay()]} {d}
        </p>
        <span className={cn("h-2 w-2 rounded-full", intensity)} />
      </div>
      {day.dueCount > 0 && <p className="text-[11px] font-bold text-fg">{day.dueCount} {t("plan.due_cards")}</p>}
      {day.practiceMinutes > 0 && <p className="text-[11px] text-primary">+{day.practiceMinutes}m {t("plan.practice_short")}</p>}
      {day.taskTitles.slice(0, 2).map((title) => (
        <p key={title} className="truncate text-[11px] text-muted-fg">· {title}</p>
      ))}
      {exams.map((x) => (
        <p key={x} className="truncate text-[11px] font-bold text-primary">★ {x}</p>
      ))}
    </div>
  );
}

function WeakRow({ w }: { w: WeaknessSignal }) {
  const t = useT();
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-border px-3 py-2">
      <div className="min-w-0">
        <p className="truncate text-sm font-bold tracking-tight">{w.label}</p>
        <p className="truncate text-[10px] uppercase tracking-widest text-muted-fg">{w.evidence}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {w.trend === "improving" ? <TrendingUp size={14} className="text-success" /> : w.trend === "worsening" ? <TrendingDown size={14} className="text-danger" /> : null}
        <span className={cn(
          "rounded-full px-2 py-0.5 text-[10px] font-black",
          w.score >= 60 ? "bg-danger/15 text-danger" : w.score >= 35 ? "bg-tertiary/15 text-tertiary" : "bg-success/15 text-success"
        )}>
          {w.score}
        </span>
      </div>
    </div>
  );
}
