import { describe, it, expect } from "vitest";
import { getStudyTimeStats, formatHMS } from "./review-stats";

function sess(id:string, start:Date, durMin:number, subjectId?:string|null){
  return { id, subjectId: subjectId ?? null, title:"t", durationMin: durMin, startedAt: start, endedAt: new Date(start.getTime()+durMin*60000) };
}
const subs=[{id:"s1",name:"Physics",color:"#ff0000"},{id:"s2",name:"Math",color:"#00ff00"}];

describe("review-stats",()=>{
  it("formatHMS",()=>{ expect(formatHMS(0)).toBe("00:00:00"); expect(formatHMS(3661)).toBe("01:01:01"); });
  it("day range",()=>{
    const d=new Date(2026,8,14,10,0,0);
    const sessions=[sess("1", new Date(2026,8,14,9,0,0), 60,"s1"), sess("2", new Date(2026,8,13,9,0,0),60,"s1")];
    const r=getStudyTimeStats(sessions,"day",d,subs);
    expect(r.totalSeconds).toBe(3600);
  });
  it("week/month/all",()=>{
    const anchor=new Date(2026,8,16); // Wed Sep 16, week Mon14-Sun20
    const s=[sess("1", new Date(2026,8,14,10,0,0),30,"s1"), sess("2", new Date(2026,8,16,10,0,0),30,"s2")];
    expect(getStudyTimeStats(s,"week",anchor,subs).totalSeconds).toBe(3600);
    expect(getStudyTimeStats(s,"month",anchor,subs).totalSeconds).toBe(3600);
    expect(getStudyTimeStats(s,"all",anchor,subs).totalSeconds).toBe(3600);
  });
  it("percentages sum 100",()=>{
    const d=new Date(2026,8,14,10,0,0);
    const sessions=[sess("1",d,60,"s1"),sess("2",d,30,"s2")];
    const r=getStudyTimeStats(sessions,"day",d,subs);
    const sum=r.breakdown.reduce((a,b)=>a+b.percentage,0);
    expect(Math.abs(sum-100)).toBeLessThan(0.2);
  });
  it("zero data",()=>{
    const r=getStudyTimeStats([],"day",new Date(),subs);
    expect(r.totalSeconds).toBe(0); expect(r.breakdown.length).toBe(0);
  });
  it("crosses midnight clipped",()=>{
    const start=new Date(2026,8,14,23,30,0);
    const s=[sess("1", start, 60,"s1")]; // 23:30-00:30
    const day14=new Date(2026,8,14,12,0,0);
    const r=getStudyTimeStats(s,"day",day14,subs);
    expect(r.totalSeconds).toBe(1800); // half
  });
  it("deleted subject",()=>{
    const d=new Date(2026,8,14,10,0,0);
    const r=getStudyTimeStats([sess("1",d,30,"deleted-id")],"day",d,subs);
    expect(r.breakdown[0].name).toMatch(/Deleted/);
  });
  it("duplicate id ignored",()=>{
    const d=new Date(2026,8,14,10,0,0);
    const s1=sess("dup",d,30,"s1");
    const s2=sess("dup",d,30,"s1");
    expect(getStudyTimeStats([s1,s2],"day",d,subs).totalSeconds).toBe(1800);
  });
  it("invalid duration ignored",()=>{
    const d=new Date(2026,8,14,10,0,0);
    const r=getStudyTimeStats([{id:"1",subjectId:"s1",title:"t",durationMin: -5, startedAt:d, endedAt:d}],"day",d,subs);
    expect(r.totalSeconds).toBe(0);
  });
});
