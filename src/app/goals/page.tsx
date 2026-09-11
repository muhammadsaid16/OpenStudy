"use client";

// /goals — advanced kanban todo for future goals.
// Two horizons (LONG-TERM / REGULAR), three status columns
// (BACKLOG → IN PROGRESS → DONE), HTML5 drag-and-drop on desktop +
// explicit move buttons for touch, milestone checklists with progress.
// Aurora Glass: semantic tokens only (accent/flow/grow/danger) so all
// 12 themes apply automatically.

import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import { useT } from "@/lib/i18n";
import { motion } from "framer-motion";
import {
  getGoals,
  getAllMilestones,
  getSubjects,
  moveGoal,
  deleteGoal,
  createGoal,
  createMilestone,
  toggleMilestone,
  deleteMilestone,
} from "@/app/actions";
import type {
  GoalRec,
  MilestoneRec,
  GoalStatus,
  GoalHorizon,
  SubjectRec,
} from "@/lib/db";
import { RevealHeading } from "@/components/reveal-heading";
import { ScrambleSubtitle } from "@/components/scramble-subtitle";
import { Button, Badge, Card, Modal, EmptyState, Skeleton } from "@/components/ui";
import { GoalModal } from "@/components/goal-modal";
import { showToast } from "@/components/toast";
import { cn } from "@/lib/utils";
import { useLiveData } from "@/lib/use-live-data";
import {
  Target,
  Plus,
  Calendar,
  Trash2,
  Pencil,
  ListTodo,
  Rocket,
  Repeat,
  CheckSquare,
  Square,
  ChevronRight,
  ChevronLeft,
  Download,
  Upload,
} from "lucide-react";

// ─── Module-constant motion config (re-render replay pitfall) ─────
const CARD_TRANSITION = { type: "spring", stiffness: 320, damping: 28 } as const;
const CARD_VARIANTS = {
  hidden: { opacity: 0, y: 14 },
  show: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { ...CARD_TRANSITION, delay: Math.min(i * 0.04, 0.4) },
  }),
};

const COLUMNS: { id: GoalStatus; labelKey: string; hint: string; dot: string }[] = [
  { id: "backlog", labelKey: "goals.col.backlog", hint: "Someday / not started", dot: "bg-muted-fg" },
  { id: "in_progress", labelKey: "goals.col.inProgress", hint: "Actively working on", dot: "bg-flow" },
  { id: "done", labelKey: "goals.col.done", hint: "Achieved", dot: "bg-grow" },
];

const PREV_STATUS: Partial<Record<GoalStatus, GoalStatus>> = {
  in_progress: "backlog",
  done: "in_progress",
};
const NEXT_STATUS: Partial<Record<GoalStatus, GoalStatus>> = {
  backlog: "in_progress",
  in_progress: "done",
};

type HorizonFilter = "all" | GoalHorizon;

function isOverdue(g: GoalRec, nowMs: number): boolean {
  if (!g.dueDate || g.status === "done") return false;
  const due = new Date(g.dueDate);
  due.setHours(23, 59, 59, 999);
  return due.getTime() < nowMs;
}

function formatDue(d: Date): string {
  const dt = new Date(d);
  return dt.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}

export default function GoalsPage() {
  const t = useT();
  const [goals, setGoals] = useState<GoalRec[]>([]);
  const [milestones, setMilestones] = useState<MilestoneRec[]>([]);
  const [subjects, setSubjects] = useState<SubjectRec[]>([]);
  const [filter, setFilter] = useState<HorizonFilter>("all");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingGoal, setEditingGoal] = useState<GoalRec | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<GoalRec | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [newStep, setNewStep] = useState("");
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropHint, setDropHint] = useState<{ col: GoalStatus; index: number } | null>(null);
  const [loaded, setLoaded] = useState(false);
  // wall clock — captured once in the mount effect (react-hooks/purity bans Date.now() in render)
  const [nowMs, setNowMs] = useState(0);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    const [g, m, s] = await Promise.all([getGoals(), getAllMilestones(), getSubjects()]);
    setGoals(g);
    setMilestones(m);
    setSubjects(s);
    setLoaded(true);
  }, []);

  // Realtime: goals/milestones/subjects re-fetch on ANY change.
  const live = useLiveData(() => Promise.all([getGoals(), getAllMilestones(), getSubjects()]), []);
  useEffect(() => {
    if (!live) return;
    const [g, m, s] = live;
    setGoals(g);
    setMilestones(m);
    setSubjects(s);
    setLoaded(true);
  }, [live]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNowMs(Date.now());
  }, []);

  // Derived — declared before any effect that reads them.
  const visible = useMemo(
    () => goals.filter((g) => filter === "all" || g.horizon === filter),
    [goals, filter]
  );
  const byColumn = useMemo(() => {
    const map: Record<GoalStatus, GoalRec[]> = { backlog: [], in_progress: [], done: [] };
    for (const g of visible) map[g.status].push(g);
    for (const k of Object.keys(map) as GoalStatus[]) map[k].sort((a, b) => a.order - b.order);
    return map;
  }, [visible]);
  const stats = useMemo(
    () => ({
      total: goals.length,
      active: goals.filter((g) => g.status === "in_progress").length,
      done: goals.filter((g) => g.status === "done").length,
      overdue: goals.filter((g) => isOverdue(g, nowMs)).length,
    }),
    [goals, nowMs]
  );

  // ─── Drag & drop (desktop) ───────────────────────────────────────
  const onDragStart = (e: React.DragEvent, id: string) => {
    setDragId(id);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", id);
  };
  const onDragOverSlot = (e: React.DragEvent, col: GoalStatus, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDropHint((prev) => (prev?.col === col && prev.index === index ? prev : { col, index }));
  };
  const onDropSlot = async (e: React.DragEvent, col: GoalStatus, index: number) => {
    e.preventDefault();
    const id = e.dataTransfer.getData("text/plain") || dragId;
    setDragId(null);
    setDropHint(null);
    if (!id) return;
    await moveGoal(id, col, index);
    await refresh();
  };
  const onDragEnd = () => {
    setDragId(null);
    setDropHint(null);
  };

  // ─── Touch / keyboard fallback ───────────────────────────────────
  const moveByButton = async (g: GoalRec, dir: "prev" | "next") => {
    const target = dir === "prev" ? PREV_STATUS[g.status] : NEXT_STATUS[g.status];
    if (!target) return;
    await moveGoal(g.id, target, 0);
    await refresh();
  };

  // ─── Milestones ────────────────────────────────────────────────────
  const addStep = async (goalId: string) => {
    if (!newStep.trim()) return;
    await createMilestone(goalId, newStep.trim());
    setNewStep("");
    await refresh();
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    await deleteGoal(deleteTarget.id);
    setDeleteTarget(null);
    await refresh();
  };

  const subjectOf = (id?: string | null) => subjects.find((s) => s.id === id);

  // ─── Export / Import ────────────────────────────────────────
  const csvEsc = (v: string) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  function splitCsvLine(line: string, delimiter: string): string[] {
    const cells: string[] = [];
    let cur = ""; let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"') { if (line[i+1] === '"') { cur+='"'; i++; } else inQuotes=false; } else cur+=ch;
      } else {
        if (ch === '"') inQuotes=true;
        else if (ch === delimiter) { cells.push(cur); cur=""; }
        else cur+=ch;
      }
    }
    cells.push(cur);
    return cells.map((c)=>c.trim());
  }

  const exportGoalsAsJson = async () => {
    setExportMenuOpen(false);
    try {
      const [allGoals, allMs] = await Promise.all([getGoals(), getAllMilestones()]);
      const payload = { goals: allGoals, milestones: allMs };
      const json = JSON.stringify(payload, null, 2);
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = "goals.json"; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(url),1000);
      showToast(`Exported ${allGoals.length} goals`, "success");
    } catch(e){ console.error(e); showToast("Export failed","danger"); }
  };

  const exportGoalsAsCsv = async () => {
    setExportMenuOpen(false);
    try {
      const [allGoals, allMilestones] = await Promise.all([getGoals(), getAllMilestones()]);
      const header = ["title","description","horizon","status","dueDate","milestoneTitles"];
      const rows = (allGoals as any[]).map((g)=>{
        const milestoneTitles = (allMilestones as any[]).filter((m)=>m.goalId===g.id).map((m)=>m.title).join(";");
        return [csvEsc(g.title), csvEsc(g.description ?? ""), csvEsc(g.horizon ?? "regular"), csvEsc(String(g.status ?? "backlog").toUpperCase()), csvEsc(g.dueDate ? new Date(g.dueDate).toISOString().slice(0,10) : ""), csvEsc(milestoneTitles)].join(",");
      });
      const csv = [header.join(","), ...rows].join("\n");
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = "goals.csv"; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(url),1000);
      showToast(`Exported ${rows.length} goals`, "success");
    } catch(e){ console.error(e); showToast("Export failed","danger"); }
  };

  const handleGoalsImport = async (file: File) => {
    setImporting(true);
    try {
      const text = await file.text();
      const trimmed = text.trim();
      if (!trimmed) { showToast("File is empty","warning"); return; }
      let goalItems: any[] = [];
      let msItems: any[] = [];
      const isJson = file.name.endsWith(".json") || trimmed.startsWith("[") || trimmed.startsWith("{");
      if (isJson) {
        try {
          const parsed = JSON.parse(trimmed);
          if (Array.isArray(parsed)) goalItems = parsed;
          else if (Array.isArray(parsed.goals)) { goalItems = parsed.goals; msItems = parsed.milestones ?? []; }
          else if (parsed.title) goalItems = [parsed];
          else { showToast("Invalid JSON format","danger"); return; }
        } catch {
          if (file.name.endsWith(".json")) { showToast("Invalid JSON file","danger"); return; }
        }
      }
      if (!goalItems.length) {
        const lines = trimmed.split("\n").map((l)=>l.replace(/\r$/,"")).filter((l)=>l.trim());
        if (!lines.length) { showToast("No valid rows","warning"); return; }
        const firstCells = splitCsvLine(lines[0], lines[0].includes("\t") ? "\t" : ",");
        const lower = firstCells.map((c)=>c.toLowerCase().trim());
        const hasHeader = lower.includes("title") || lower.includes("description") || lower.includes("horizon");
        const headerMap: Record<string,number> = {};
        let start=0;
        if (hasHeader) { lower.forEach((h,i)=>{ headerMap[h]=i; }); start=1; }
        else { headerMap["title"]=0; headerMap["description"]=1; headerMap["horizon"]=2; headerMap["status"]=3; headerMap["duedate"]=4; }
        for (let i=start;i<lines.length;i++) {
          const delim = lines[i].includes("\t") ? "\t" : ",";
          const cells = splitCsvLine(lines[i], delim);
          const get=(k:string)=>{ const idx=headerMap[k]; return idx!==undefined&&idx<cells.length?cells[idx]:""; };
          const title=(get("title")||cells[0]||"").trim();
          if(!title) continue;
          goalItems.push({ title, description: get("description")||"", horizon: get("horizon")||"regular", status: get("status")||"backlog", dueDate: get("duedate")||get("due_date")||"" });
        }
      }
      if (!goalItems.length && !msItems.length) { showToast("No valid goals found","warning"); return; }
      // Map titles to created goal ids for milestone linking
      const titleToId = new Map<string,string>();
      let ok=0, skipped=0;
      for (const raw of goalItems) {
        const title=String(raw.title??raw.name??"").trim();
        if(!title){ skipped++; continue; }
        const horizon: GoalHorizon = raw.horizon==="long" ? "long" : "regular";
        const dueDate = raw.dueDate ? new Date(raw.dueDate) : null;
        const validDue = dueDate && !isNaN(dueDate.getTime()) ? dueDate : null;
        const status: GoalStatus = raw.status==="in_progress"||raw.status==="done"||raw.status==="backlog" ? raw.status : "backlog" as GoalStatus;
        try {
          const g = await createGoal({ title, description: String(raw.description??"").trim()||undefined, horizon, dueDate: validDue, repeat: raw.repeat ?? null, subjectId: raw.subjectId ?? null, color: raw.color ?? null });
          titleToId.set(title, g.id);
          // move to status if not backlog
          if (status !== "backlog") { try { await moveGoal(g.id, status, 999); } catch {} }
          ok++;
        } catch { skipped++; }
      }
      // Import milestones (after goals so goalIds exist)
      let msOk=0;
      const allMsToCreate = msItems.length ? msItems : goalItems.flatMap((g:any)=> (g.milestones??[]).map((m:any)=> ({...m, goalTitle: g.title, goalId: g.id })));
      for (const m of allMsToCreate) {
        const mTitle=String(m.title??m.name??"").trim();
        if(!mTitle) continue;
        let goalId = m.goalId ?? (m.goalTitle ? titleToId.get(String(m.goalTitle)) : undefined);
        // fallback: if no mapping, attach to first created goal or skip
        if(!goalId && titleToId.size) goalId = [...titleToId.values()][0];
        if(!goalId) continue;
        try { await createMilestone(goalId, mTitle); if(m.done) { /* milestones are created undone; leave as is */ } msOk++; } catch {}
      }
      await refresh();
      if(ok) showToast(`Imported ${ok} goals${msOk?` + ${msOk} milestones`:""}${skipped?`, ${skipped} skipped`:""}`, "success");
      else showToast("No goals imported","warning");
    } catch(e){ console.error(e); showToast("Import failed: invalid file","danger"); }
    finally { setImporting(false); if(importInputRef.current) importInputRef.current.value=""; }
  };

  return (
    <div className="p-8 lg:p-12">
      {/* Header */}
      <div className="mb-10">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <RevealHeading text={t("goals.title")} className="text-5xl lg:text-8xl" />
            <ScrambleSubtitle
              text={t("goals.subtitle")}
              className="mt-4 text-sm text-muted-fg uppercase tracking-widest"
            />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative">
              <button
                onClick={() => setExportMenuOpen((o) => !o)}
                className="flex h-10 items-center gap-2 rounded-full border border-border bg-bg px-3 text-xs font-bold uppercase tracking-widest text-muted-fg transition-colors hover:border-accent hover:text-accent hover:bg-accent-soft"
              >
                <Download size={14} />
                Export
              </button>
              {exportMenuOpen && (
                <>
                  <button className="fixed inset-0 z-10" onClick={() => setExportMenuOpen(false)} aria-label="Close export menu" />
                  <div className="absolute end-0 mt-2 w-44 overflow-hidden rounded-2xl border border-border bg-bg p-1 shadow-2xl z-20">
                    <button onClick={exportGoalsAsJson} className="flex w-full items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold tracking-wide text-fg hover:bg-accent-soft hover:text-accent text-start">
                      <Download size={14} /> JSON
                    </button>
                    <button onClick={exportGoalsAsCsv} className="flex w-full items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold tracking-wide text-fg hover:bg-accent-soft hover:text-accent text-start">
                      <Download size={14} /> CSV
                    </button>
                  </div>
                </>
              )}
            </div>
            <button
              onClick={() => importInputRef.current?.click()}
              disabled={importing}
              className="flex h-10 items-center gap-2 rounded-full border border-border bg-bg px-3 text-xs font-bold uppercase tracking-widest text-muted-fg transition-colors hover:border-accent hover:text-accent hover:bg-accent-soft disabled:opacity-50"
            >
              <Upload size={14} />
              {importing ? "Importing..." : "Import"}
            </button>
            <input
              ref={importInputRef}
              type="file"
              accept=".json,.csv,.tsv,.txt,application/json,text/csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleGoalsImport(f);
              }}
            />
            <Button
              onClick={() => {
                setEditingGoal(null);
                setModalOpen(true);
              }}
            >
              <Plus size={16} />
              New goal
            </Button>
          </div>
        </div>
      </div>

      {/* Stats row */}
      <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {(
          [
            { label: t("goals.col.total"), value: stats.total, tone: "" },
            { label: t("goals.col.active"), value: stats.active, tone: "text-flow" },
            { label: t("goals.col.done"), value: stats.done, tone: "text-grow" },
            { label: "Overdue", value: stats.overdue, tone: stats.overdue > 0 ? "text-danger" : "" },
          ] as const
        ).map((s) => (
          <div key={s.label} className="glass rounded-2xl p-4">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-fg">
              {s.label}
            </p>
            <p className={cn("font-display mt-1 text-3xl font-bold tabular-nums", s.tone)}>
              {s.value}
            </p>
          </div>
        ))}
      </div>

      {/* Horizon filter */}
      <div className="mb-8 flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-full border border-glass-border bg-glass p-1">
          {(
            [
              { id: "all", label: t("goals.col.all"), icon: ListTodo },
              { id: "long", label: "Long-term", icon: Rocket },
              { id: "regular", label: "Todo", icon: ListTodo },
            ] as const
          ).map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setFilter(id)}
              className={cn(
                "relative flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-bold transition-colors",
                filter === id ? "text-accent-fg" : "text-muted-fg hover:text-accent"
              )}
            >
              {filter === id && (
                <motion.span
                  layoutId="goal-filter-pill"
                  className="absolute inset-0 rounded-full bg-accent"
                  transition={CARD_TRANSITION}
                />
              )}
              <span className="relative z-10 flex items-center gap-1.5">
                {Icon && <Icon size={12} />}
                {label}
              </span>
            </button>
          ))}
        </div>
        <p className="font-mono text-xs tabular-nums text-muted-fg">
          {visible.length} / {goals.length} goals
        </p>
      </div>

      {/* Board */}
      {!loaded ? (
        <>
          <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="glass rounded-2xl p-4">
                <Skeleton className="h-2.5 w-12" />
                <Skeleton className="mt-2 h-8 w-10" />
              </div>
            ))}
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {Array.from({ length: 3 }).map((_, ci) => (
              <div key={ci} className="glass min-h-[200px] rounded-2xl p-3">
                <div className="mb-3 flex items-center gap-2 px-1">
                  <Skeleton className="h-2 w-2 rounded-full" />
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-4 w-6 rounded-full" />
                </div>
                <div className="space-y-2">
                  {Array.from({ length: 3 }).map((__, i) => (
                    <div key={i} className="rounded-2xl border border-border p-4">
                      <Skeleton className="h-3 w-16 rounded-full" />
                      <Skeleton className="mt-2 h-4 w-3/4" />
                      <Skeleton className="mt-2 h-3 w-1/2" />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>
      ) : goals.length === 0 ? (
        <EmptyState
          icon={<Target size={48} />}
          title={t("goals.emptyTitle")}
          description={t("goals.emptyDesc")}
          action={
            <Button
              onClick={() => {
                setEditingGoal(null);
                setModalOpen(true);
              }}
            >
              <Plus size={16} />
              {t("goals.createFirstBtn")}
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-3">
          {COLUMNS.map((col) => {
            const cards = byColumn[col.id];
            return (
              <div key={col.id} className="glass min-h-[200px] rounded-2xl p-3">
                {/* Column header */}
                <div className="mb-3 flex items-center gap-2 px-1">
                  <span className={cn("h-1.5 w-1.5 rounded-full", col.dot)} />
                  <span className="text-[11px] font-bold uppercase tracking-widest text-muted-fg">
                    {t(col.labelKey)}
                  </span>
                  <span className="rounded-full bg-muted px-2 py-0.5 font-mono text-[10px] tabular-nums text-muted-fg">
                    {cards.length}
                  </span>
                  <span className="ms-auto hidden text-[10px] text-muted-fg lg:block">
                    {col.hint}
                  </span>
                </div>

                {/* Drop slot 0 */}
                <DropSlot
                  active={dropHint?.col === col.id && dropHint.index === 0}
                  onDragOver={(e) => onDragOverSlot(e, col.id, 0)}
                  onDrop={(e) => onDropSlot(e, col.id, 0)}
                />

                {cards.map((g, i) => {
                  const ms = milestones.filter((m) => m.goalId === g.id);
                  const doneMs = ms.filter((m) => m.done).length;
                  const overdue = isOverdue(g, nowMs);
                  const subj = subjectOf(g.subjectId);
                  const expanded = expandedId === g.id;
                  return (
                    <div key={g.id}>
                      <motion.div
                        custom={i}
                        variants={CARD_VARIANTS}
                        initial="hidden"
                        animate="show"
                      >
                        <Card
                          hover
                          data-goal-id={g.id}
                          className={cn(
                            "group relative cursor-grab p-4",
                            dragId === g.id && "opacity-40"
                          )}
                          draggable
                          onDragStart={(e) => onDragStart(e, g.id)}
                          onDragEnd={onDragEnd}
                        >
                          {/* Hover actions — always visible on touch, keyboard-reachable via focus */}
                          <div className="absolute top-3 end-3 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100 max-md:opacity-100">
                            <button
                              aria-label={t("goals.editGoal")}
                              onClick={() => {
                                setEditingGoal(g);
                                setModalOpen(true);
                              }}
                              className="flex h-7 w-7 items-center justify-center rounded-full border border-glass-border bg-glass text-muted-fg transition-colors hover:text-accent"
                            >
                              <Pencil size={12} />
                            </button>
                            <button
                              aria-label={t("goals.deleteGoal")}
                              onClick={() => setDeleteTarget(g)}
                              className="flex h-7 w-7 items-center justify-center rounded-full border border-glass-border bg-glass text-muted-fg transition-colors hover:text-danger"
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>

                          {/* Horizon badge */}
                          {g.horizon === "long" ? (
                            <Badge variant="accent">
                              <Rocket size={10} /> Long-term
                            </Badge>
                          ) : (
                            <Badge variant="flow">
                              <ListTodo size={10} /> Todo
                            </Badge>
                          )}

                          <h3 className="mt-2 pe-14 font-semibold tracking-tight text-fg">
                            {g.title}
                          </h3>
                          {g.description && (
                            <p className="mt-1 line-clamp-2 text-sm text-muted-fg">
                              {g.description}
                            </p>
                          )}

                          {/* Meta row */}
                          <div className="mt-3 flex flex-wrap items-center gap-2">
                            {g.dueDate && (
                              <span
                                className={cn(
                                  "inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 font-mono text-[10px] tabular-nums text-muted-fg",
                                  overdue && "border-danger/40 text-danger"
                                )}
                              >
                                <Calendar size={10} />
                                {overdue ? `Overdue · ${formatDue(g.dueDate)}` : formatDue(g.dueDate)}
                              </span>
                            )}
                            {g.repeat && (
                              <span className="inline-flex items-center gap-1 rounded-full border border-flow/40 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-flow">
                                <Repeat size={10} />
                                {g.repeat}
                              </span>
                            )}
                            {subj && (
                              <span className="inline-flex items-center gap-1.5 rounded-full border border-border px-2 py-0.5 text-[10px] text-muted-fg">
                                <span
                                  className="h-1.5 w-1.5 rounded-full"
                                  style={{ background: subj.color }}
                                />
                                {subj.name}
                              </span>
                            )}
                          </div>

                          {/* Milestone progress */}
                          {ms.length > 0 && (
                            <div className="mt-3">
                              <div className="h-1 overflow-hidden rounded-full bg-muted">
                                <div
                                  className="h-full rounded-full bg-flow transition-all"
                                  style={{ width: `${(doneMs / ms.length) * 100}%` }}
                                />
                              </div>
                              <p className="mt-1 font-mono text-[10px] tabular-nums text-muted-fg">
                                {doneMs}/{ms.length} steps
                              </p>
                            </div>
                          )}

                          {/* Footer row: expand + move buttons */}
                          <div className="mt-3 flex items-center justify-between gap-2">
                            <button
                              onClick={() => setExpandedId(expanded ? null : g.id)}
                              className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-muted-fg transition-colors hover:text-accent"
                            >
                              <ChevronRight
                                size={12}
                                className={cn("transition-transform", expanded && "rotate-90")}
                              />
                              Steps
                            </button>
                            <div className="flex gap-1 opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100 max-md:opacity-100">
                              {PREV_STATUS[g.status] && (
                                <button
                                  type="button"
                                  aria-label={t("goals.movePrev")}
                                  onClick={() => moveByButton(g, "prev")}
                                  className="flex h-6 w-6 items-center justify-center rounded-full border border-glass-border bg-glass text-muted-fg transition-colors hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                                >
                                  <ChevronLeft size={12} />
                                </button>
                              )}
                              {NEXT_STATUS[g.status] && (
                                <button
                                  type="button"
                                  aria-label={t("goals.moveNext")}
                                  onClick={() => moveByButton(g, "next")}
                                  className="flex h-6 w-6 items-center justify-center rounded-full border border-glass-border bg-glass text-muted-fg transition-colors hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                                >
                                  <ChevronRight size={12} />
                                </button>
                              )}
                            </div>
                          </div>

                          {/* Milestone checklist */}
                          {expanded && (
                            <div className="mt-3 space-y-1.5 border-t border-border pt-3">
                              {ms.length === 0 ? (
                                <p className="py-1 text-xs text-muted-fg">No steps yet — add one below.</p>
                              ) : (
                                ms.map((m) => (
                                <div key={m.id} className="group/ms flex items-center gap-2">
                                  <button
                                    type="button"
                                    aria-label={m.done ? "Mark step not done" : "Mark step done"}
                                    onClick={async () => {
                                      await toggleMilestone(m.id, !m.done);
                                      await refresh();
                                    }}
                                    className={cn(
                                      "shrink-0 transition-colors",
                                      m.done ? "text-flow" : "text-muted-fg hover:text-accent"
                                    )}
                                  >
                                    {m.done ? <CheckSquare size={14} /> : <Square size={14} />}
                                  </button>
                                  <span
                                    className={cn(
                                      "flex-1 text-sm",
                                      m.done ? "text-muted-fg line-through" : "text-fg"
                                    )}
                                  >
                                    {m.title}
                                  </span>
                                  <button
                                    type="button"
                                    aria-label="Delete step"
                                    onClick={async () => {
                                      await deleteMilestone(m.id);
                                      await refresh();
                                    }}
                                    className="shrink-0 rounded-full p-1 text-muted-fg opacity-0 transition-opacity group-hover/ms:opacity-100 focus-visible:opacity-100 max-md:opacity-100 hover:text-danger"
                                  >
                                    <Trash2 size={12} />
                                  </button>
                                </div>
                              ))
                              )}
                              <input
                                placeholder={t("modal.addStep")}
                                aria-label="Add a step"
                                value={newStep}
                                onChange={(e) => setNewStep(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") addStep(g.id);
                                }}
                                className="w-full rounded-xl border border-transparent bg-transparent px-1 py-1 text-sm text-fg placeholder:text-muted-fg/60 focus:outline-none"
                              />
                            </div>
                          )}
                        </Card>
                      </motion.div>

                      {/* Drop slot after each card */}
                      <DropSlot
                        active={dropHint?.col === col.id && dropHint.index === i + 1}
                        onDragOver={(e) => onDragOverSlot(e, col.id, i + 1)}
                        onDrop={(e) => onDropSlot(e, col.id, i + 1)}
                      />
                    </div>
                  );
                })}

                {cards.length === 0 && (
                  <p className="px-1 py-6 text-center text-xs text-muted-fg">
                    {filter !== "all" ? "Nothing here for this filter" : "Drop goals here"}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Modals */}
      <GoalModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        goal={editingGoal}
        subjects={subjects}
        onSaved={refresh}
      />
      <Modal
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        title={t("modal.deleteGoal")}
      >
        <p className="text-sm text-muted-fg">
          “{deleteTarget?.title}” and all of its steps will be removed permanently.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setDeleteTarget(null)}>{t("common.cancel")}</Button>
          <Button variant="danger" onClick={confirmDelete}>
            <Trash2 size={14} />
            Delete goal
          </Button>
        </div>
      </Modal>
    </div>
  );
}

// ─── Drop slot between cards ───────────────────────────────────────
function DropSlot({
  active,
  onDragOver,
  onDrop,
}: {
  active: boolean;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
}) {
  return (
    <div
      data-drop-slot
      onDragOver={onDragOver}
      onDrop={onDrop}
      className={cn(
        "rounded-xl transition-all duration-150",
        active
          ? "my-1 h-10 rounded-xl border border-dashed border-flow/60 bg-flow/5"
          : "h-2"
      )}
    />
  );
}
