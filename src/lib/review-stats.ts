// Study time aggregation for /review — pure, testable, no Dexie dependency.
export type RangeKey = "day" | "week" | "month" | "all";

export interface StudySessionLike {
  id: string;
  subjectId?: string | null;
  topicId?: string | null;
  title: string;
  durationMin: number;
  startedAt: Date;
  endedAt?: Date | null;
}

export interface SubjectLite { id: string; name: string; color: string; }

export interface BreakdownItem {
  id: string; // subjectId or "unknown"
  name: string;
  color: string;
  seconds: number;
  percentage: number;
}

export interface StatsResult {
  totalSeconds: number;
  breakdown: BreakdownItem[];
  daily: { date: string; seconds: number }[];
}

// Palette for subjects — distinguishable across all 12 themes, token-aware fallback uses accent/flow/grow
const PALETTE = ["#FF7A72","#00E5FF","#10B981","#C084FC","#FCD34D","#FDA4AF","#7DD3FC","#F97316","#34D399","#A78BFA","#FB7185","#38BDF8"];

export function formatHMS(totalSeconds: number): string {
  if (totalSeconds <= 0) return "00:00:00";
  const h = Math.floor(totalSeconds/3600);
  const m = Math.floor((totalSeconds%3600)/60);
  const s = totalSeconds%60;
  return [h,m,s].map(v=>String(v).padStart(2,"0")).join(":");
}

export function formatHuman(totalSeconds: number, lang: "en"|"ar" = "en"): string {
  if (totalSeconds <= 0) return lang==="ar" ? "٠ دقيقة" : "0m";
  const h = Math.floor(totalSeconds/3600);
  const m = Math.floor((totalSeconds%3600)/60);
  if (h===0) return lang==="ar" ? `${m} دقيقة` : `${m}m`;
  if (m===0) return lang==="ar" ? `${h} ساعة` : `${h}h`;
  return lang==="ar" ? `${h} ساعة ${m} دقيقة` : `${h}h ${m}m`;
}

// Local-time boundaries
export function dayBounds(d: Date): { start: Date; end: Date } {
  const s = new Date(d); s.setHours(0,0,0,0);
  const e = new Date(d); e.setHours(23,59,59,999);
  return { start:s, end:e };
}
export function weekBounds(d: Date): { start: Date; end: Date } {
  // Monday-start week (app convention, en locale)
  const day = (d.getDay()+6)%7; // Mon=0
  const s = new Date(d); s.setHours(0,0,0,0); s.setDate(d.getDate()-day);
  const e = new Date(s); e.setDate(s.getDate()+6); e.setHours(23,59,59,999);
  return { start:s, end:e };
}
export function monthBounds(d: Date): { start: Date; end: Date } {
  const s = new Date(d.getFullYear(), d.getMonth(), 1, 0,0,0,0);
  const e = new Date(d.getFullYear(), d.getMonth()+1, 0, 23,59,59,999);
  return { start:s, end:e };
}
export function rangeBounds(range: RangeKey, anchor: Date): { start: Date; end: Date } | null {
  if (range==="all") return null;
  if (range==="day") return dayBounds(anchor);
  if (range==="week") return weekBounds(anchor);
  return monthBounds(anchor);
}

// Split a session that crosses midnight across days proportionally by wall time
function clipSessionToRange(s: StudySessionLike, rangeStart: Date|null, rangeEnd: Date|null): number {
  // duration in seconds from durationMin (source of truth) but clip by startedAt window
  const durSec = Math.max(0, Math.round((s.durationMin ?? 0)*60));
  if (durSec===0) return 0;
  // invalid
  if (!s.startedAt || isNaN(new Date(s.startedAt).getTime())) return 0;
  const sessStart = new Date(s.startedAt).getTime();
  // endedAt if present, else start+dur
  const sessEnd = s.endedAt ? new Date(s.endedAt).getTime() : sessStart + durSec*1000;
  if (sessEnd <= sessStart) return 0;
  if (!rangeStart || !rangeEnd) return durSec;
  const rs = rangeStart.getTime(); const re = rangeEnd.getTime();
  const overlapStart = Math.max(sessStart, rs);
  const overlapEnd = Math.min(sessEnd, re);
  if (overlapEnd <= overlapStart) return 0;
  const totalSpan = sessEnd - sessStart;
  const overlap = overlapEnd - overlapStart;
  // proportional allocation
  return Math.round(durSec * (overlap/totalSpan));
}

/** Local-time YYYY-MM-DD key — the same bucketing the day counts use. */
export function localDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function getStudyTimeStats(
  sessions: StudySessionLike[],
  range: RangeKey,
  anchor: Date,
  subjects: SubjectLite[]
): StatsResult {
  const bounds = rangeBounds(range, anchor);
  const rs = bounds?.start ?? null;
  const re = bounds?.end ?? null;

  // dedupe by id, drop invalid durations
  const seen = new Set<string>();
  const valid: { s: StudySessionLike; seconds: number }[] = [];
  for (const s of sessions) {
    if (!s.id || seen.has(s.id)) continue;
    seen.add(s.id);
    const sec = clipSessionToRange(s, rs, re);
    if (sec<=0) continue;
    valid.push({ s, seconds: sec });
  }

  const totalSeconds = valid.reduce((a,v)=>a+v.seconds,0);

  // breakdown by subject
  const map = new Map<string, { seconds:number; idx:number }>();
  for (const { s, seconds } of valid) {
    const key = s.subjectId ?? "__unknown__";
    const cur = map.get(key);
    if (cur) cur.seconds += seconds;
    else map.set(key, { seconds, idx: map.size });
  }

  const breakdown: BreakdownItem[] = [];
  let i=0;
  for (const [key, v] of map) {
    const subj = subjects.find(s=>s.id===key);
    breakdown.push({
      id: key,
      name: subj?.name ?? (key==="__unknown__" ? "Uncategorized" : "Deleted subject"),
      color: subj?.color ?? (key==="__unknown__" ? "#94A3B8" : PALETTE[i % PALETTE.length]),
      seconds: v.seconds,
      percentage: totalSeconds>0 ? Math.round((v.seconds/totalSeconds)*1000)/10 : 0,
    });
    i++;
  }
  breakdown.sort((a,b)=>b.seconds-a.seconds);

  // fix rounding to 100% — adjust largest
  if (breakdown.length>0 && totalSeconds>0) {
    const sum = breakdown.reduce((a,b)=>a+b.percentage,0);
    const diff = Math.round((100 - sum)*10)/10;
    if (Math.abs(diff) >= 0.1) breakdown[0].percentage = Math.round((breakdown[0].percentage+diff)*10)/10;
  }

  // daily buckets for chart
  const daily: { date:string; seconds:number }[] = [];
  if (range==="week" && bounds) {
    for(let d=new Date(bounds.start); d<=bounds.end; d.setDate(d.getDate()+1)){
      const db = dayBounds(new Date(d));
      // recompute with dedupe-aware but simple: use valid clipped per day
      // To avoid double counting dedupe issue, recompute from scratch per day
      let daySec=0;
      const daySeen=new Set<string>();
      for(const s of sessions){
        if(!s.id || daySeen.has(s.id)) continue;
        daySeen.add(s.id);
        daySec+=clipSessionToRange(s, db.start, db.end);
      }
      // Only count if intersects main range
      const inMain = db.start.getTime() <= re!.getTime() && db.end.getTime() >= rs!.getTime();
      // Local key, not toISOString(): the UTC date is a day behind the local
      // day in positive offsets (e.g. UTC+3), which shifted every label and
      // made adjacent local days share one.
      daily.push({ date: localDateKey(new Date(d)), seconds: inMain? daySec:0 });
    }
  } else if (range==="month" && bounds) {
    const daysInMonth = new Date(bounds.start.getFullYear(), bounds.start.getMonth()+1,0).getDate();
    for(let day=1; day<=daysInMonth; day++){
      const d=new Date(bounds.start.getFullYear(), bounds.start.getMonth(), day);
      const db=dayBounds(d);
      let daySec=0; const ds=new Set<string>();
      for(const s of sessions){ if(!s.id||ds.has(s.id)) continue; ds.add(s.id); daySec+=clipSessionToRange(s, db.start, db.end); }
      daily.push({ date: localDateKey(d), seconds: daySec });
    }
  } else if (range==="day" && bounds) {
    // Local key, same reason as the week/month branches above.
    daily.push({ date: localDateKey(bounds.start), seconds: totalSeconds });
  }

  return { totalSeconds, breakdown, daily };
}
