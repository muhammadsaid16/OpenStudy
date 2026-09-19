"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useLiveData } from "@/lib/use-live-data";
import { getSubjects, getAllTopics as getTopics, getAllNotes as getNotes, getBundles, listExams as getExams } from "@/app/actions";
import { Card, Button } from "@/components/ui";
import { Search, ZoomIn, ZoomOut, RefreshCw, Network, BookOpen, FileText, Layers, FileQuestion, Filter } from "lucide-react";
import type { SubjectRec, TopicRec, NoteRec, BundleRec, ExamRec } from "@/lib/db";

export type GraphNodeType = "subject" | "topic" | "note" | "bundle" | "exam";

export interface GraphNode {
  id: string;
  label: string;
  type: GraphNodeType;
  color: string;
  radius: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  href?: string;
  meta?: string;
}

export interface GraphLink {
  source: string;
  target: string;
}

export function KnowledgeGraph() {
  const router = useRouter();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [filterType, setFilterType] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [hoveredNode, setHoveredNode] = useState<GraphNode | null>(null);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDraggingPan, setIsDraggingPan] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0 });

  const data = useLiveData(
    () => Promise.all([getSubjects(), getTopics(), getNotes(), getBundles(), getExams()]),
    []
  );

  const [subjects, topics, notes, bundles, exams] = data ?? [[], [], [], [], []];

  // Build raw node graph
  const { initialNodes, links } = useMemo(() => {
    const rawNodes: GraphNode[] = [];
    const rawLinks: GraphLink[] = [];

    const width = 800;
    const height = 600;

    // 1. Subjects
    (subjects as SubjectRec[]).forEach((s, idx) => {
      const angle = (idx / Math.max(1, subjects.length)) * Math.PI * 2;
      rawNodes.push({
        id: `subject-${s.id}`,
        label: s.name,
        type: "subject",
        color: s.color || "#6366f1",
        radius: 24,
        x: width / 2 + Math.cos(angle) * 180,
        y: height / 2 + Math.sin(angle) * 180,
        vx: 0,
        vy: 0,
        href: `/subjects`,
        meta: `Subject · ${s.description || "No description"}`,
      });
    });

    // 2. Topics
    (topics as TopicRec[]).forEach((t, idx) => {
      const parentSub = rawNodes.find((n) => n.id === `subject-${t.subjectId}`);
      const px = parentSub ? parentSub.x : width / 2;
      const py = parentSub ? parentSub.y : height / 2;

      rawNodes.push({
        id: `topic-${t.id}`,
        label: t.name,
        type: "topic",
        color: parentSub ? parentSub.color : "#a855f7",
        radius: 18,
        x: px + (Math.random() - 0.5) * 80,
        y: py + (Math.random() - 0.5) * 80,
        vx: 0,
        vy: 0,
        href: `/subjects`,
        meta: `Topic in ${parentSub ? parentSub.label : "Subject"}`,
      });

      if (parentSub) {
        rawLinks.push({ source: `subject-${t.subjectId}`, target: `topic-${t.id}` });
      }
    });

    // 3. Notes
    (notes as NoteRec[]).forEach((n) => {
      const parentTopic = n.topicId ? rawNodes.find((x) => x.id === `topic-${n.topicId}`) : null;
      const px = parentTopic ? parentTopic.x : width / 2 + (Math.random() - 0.5) * 250;
      const py = parentTopic ? parentTopic.y : height / 2 + (Math.random() - 0.5) * 250;

      rawNodes.push({
        id: `note-${n.id}`,
        label: n.title || "Untitled Note",
        type: "note",
        color: "#3b82f6",
        radius: 14,
        x: px + (Math.random() - 0.5) * 60,
        y: py + (Math.random() - 0.5) * 60,
        vx: 0,
        vy: 0,
        href: `/notes/${n.id}`,
        meta: `Note · ${n.isPinned ? "Pinned" : "Standard"}`,
      });

      if (parentTopic) {
        rawLinks.push({ source: parentTopic.id, target: `note-${n.id}` });
      }
    });

    // 4. Bundles
    (bundles as BundleRec[]).forEach((b) => {
      const parentTopic = b.topicId ? rawNodes.find((x) => x.id === `topic-${b.topicId}`) : null;
      const parentSub = b.subjectId ? rawNodes.find((x) => x.id === `subject-${b.subjectId}`) : null;
      const parent = parentTopic || parentSub;

      const px = parent ? parent.x : width / 2 + (Math.random() - 0.5) * 250;
      const py = parent ? parent.y : height / 2 + (Math.random() - 0.5) * 250;

      rawNodes.push({
        id: `bundle-${b.id}`,
        label: b.name,
        type: "bundle",
        color: b.color || "#8b5cf6",
        radius: 16,
        x: px + (Math.random() - 0.5) * 70,
        y: py + (Math.random() - 0.5) * 70,
        vx: 0,
        vy: 0,
        href: `/bundles/${b.id}/cards`,
        meta: `Flashcard Deck · ${b.description || "Deck"}`,
      });

      if (parent) {
        rawLinks.push({ source: parent.id, target: `bundle-${b.id}` });
      }
    });

    // 5. Exams
    (exams as ExamRec[]).forEach((e) => {
      rawNodes.push({
        id: `exam-${e.id}`,
        label: e.title || "Practice Exam",
        type: "exam",
        color: "#f59e0b",
        radius: 15,
        x: width / 2 + (Math.random() - 0.5) * 300,
        y: height / 2 + (Math.random() - 0.5) * 300,
        vx: 0,
        vy: 0,
        href: `/exam`,
        meta: `Exam · ${e.status} (${e.questionCount} Qs)`,
      });

      if (e.subjectIds && e.subjectIds.length > 0) {
        e.subjectIds.forEach((subId) => {
          rawLinks.push({ source: `subject-${subId}`, target: `exam-${e.id}` });
        });
      }
    });

    return { initialNodes: rawNodes, links: rawLinks };
  }, [subjects, topics, notes, bundles, exams]);

  const nodesRef = useRef<GraphNode[]>([]);

  useEffect(() => {
    nodesRef.current = initialNodes.map((n) => ({ ...n }));
  }, [initialNodes]);

  // Filter nodes
  const filteredNodeIds = useMemo(() => {
    return new Set(
      nodesRef.current
        .filter((n) => {
          const matchesType = filterType === "all" || n.type === filterType;
          const matchesSearch = !searchQuery || n.label.toLowerCase().includes(searchQuery.toLowerCase());
          return matchesType && matchesSearch;
        })
        .map((n) => n.id)
    );
  }, [filterType, searchQuery, initialNodes]);

  // Canvas simulation loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let animId: number;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const handleResize = () => {
      const rect = canvas.parentElement?.getBoundingClientRect();
      if (rect) {
        canvas.width = rect.width;
        canvas.height = rect.height || 600;
      }
    };
    handleResize();
    window.addEventListener("resize", handleResize);

    const stepSimulation = () => {
      const activeNodes = nodesRef.current;
      const width = canvas.width;
      const height = canvas.height;
      const center = { x: width / 2, y: height / 2 };

      // Apply forces
      for (let i = 0; i < activeNodes.length; i++) {
        const n1 = activeNodes[i];

        // Central gravity
        n1.vx += (center.x - n1.x) * 0.0005;
        n1.vy += (center.y - n1.y) * 0.0005;

        // Repulsion between all nodes
        for (let j = i + 1; j < activeNodes.length; j++) {
          const n2 = activeNodes[j];
          const dx = n2.x - n1.x;
          const dy = n2.y - n1.y;
          const distSq = dx * dx + dy * dy || 1;
          const dist = Math.sqrt(distSq);

          if (dist < 200) {
            const force = (200 - dist) / dist * 0.08;
            const fx = dx * force;
            const fy = dy * force;
            n1.vx -= fx;
            n1.vy -= fy;
            n2.vx += fx;
            n2.vy += fy;
          }
        }
      }

      // Link spring attraction
      links.forEach((link) => {
        const source = activeNodes.find((n) => n.id === link.source);
        const target = activeNodes.find((n) => n.id === link.target);
        if (source && target) {
          const dx = target.x - source.x;
          const dy = target.y - source.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const force = (dist - 100) * 0.002;
          source.vx += dx * force;
          source.vy += dy * force;
          target.vx -= dx * force;
          target.vy -= dy * force;
        }
      });

      // Update positions + friction damping
      activeNodes.forEach((n) => {
        n.vx *= 0.85;
        n.vy *= 0.85;
        n.x += n.vx;
        n.y += n.vy;
      });

      // Render
      ctx.clearRect(0, 0, width, height);

      ctx.save();
      ctx.translate(pan.x, pan.y);
      ctx.scale(zoom, zoom);

      // Draw links
      ctx.lineWidth = 1.5;
      links.forEach((link) => {
        const source = activeNodes.find((n) => n.id === link.source);
        const target = activeNodes.find((n) => n.id === link.target);
        if (source && target) {
          const sourceVisible = filteredNodeIds.has(source.id);
          const targetVisible = filteredNodeIds.has(target.id);
          const isHighlighted = sourceVisible && targetVisible;

          ctx.beginPath();
          ctx.moveTo(source.x, source.y);
          ctx.lineTo(target.x, target.y);
          ctx.strokeStyle = isHighlighted ? "rgba(99, 102, 241, 0.35)" : "rgba(100, 116, 139, 0.08)";
          ctx.stroke();
        }
      });

      // Draw nodes
      activeNodes.forEach((n) => {
        const isVisible = filteredNodeIds.has(n.id);
        const isHovered = hoveredNode?.id === n.id;
        const isSelected = selectedNode?.id === n.id;

        ctx.beginPath();
        ctx.arc(n.x, n.y, n.radius * (isHovered || isSelected ? 1.25 : 1), 0, Math.PI * 2);
        ctx.fillStyle = isVisible ? n.color : "rgba(100, 116, 139, 0.15)";
        ctx.shadowColor = n.color;
        ctx.shadowBlur = isHovered || isSelected ? 16 : 4;
        ctx.fill();
        ctx.shadowBlur = 0;

        if (isVisible) {
          ctx.lineWidth = isSelected ? 3 : 1.5;
          ctx.strokeStyle = isSelected ? "#ffffff" : "rgba(255, 255, 255, 0.4)";
          ctx.stroke();

          // Text label
          ctx.font = `${isHovered ? "bold " : ""}11px Inter, sans-serif`;
          ctx.fillStyle = "#f8fafc";
          ctx.textAlign = "center";
          ctx.fillText(n.label, n.x, n.y + n.radius + 14);
        }
      });

      ctx.restore();

      animId = requestAnimationFrame(stepSimulation);
    };

    stepSimulation();

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", handleResize);
    };
  }, [links, filteredNodeIds, hoveredNode, selectedNode, zoom, pan]);

  // Canvas Mouse events for Hover & Click & Drag Pan
  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const mouseX = (e.clientX - rect.left - pan.x) / zoom;
    const mouseY = (e.clientY - rect.top - pan.y) / zoom;

    if (isDraggingPan) {
      setPan({
        x: e.clientX - dragStartRef.current.x,
        y: e.clientY - dragStartRef.current.y,
      });
      return;
    }

    const hit = nodesRef.current.find((n) => {
      const dx = n.x - mouseX;
      const dy = n.y - mouseY;
      return Math.sqrt(dx * dx + dy * dy) <= n.radius + 4;
    });

    setHoveredNode(hit && filteredNodeIds.has(hit.id) ? hit : null);
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (hoveredNode) {
      setSelectedNode(hoveredNode);
    } else {
      setIsDraggingPan(true);
      dragStartRef.current = {
        x: e.clientX - pan.x,
        y: e.clientY - pan.y,
      };
    }
  };

  const handleMouseUp = () => {
    setIsDraggingPan(false);
  };

  const handleDoubleClick = () => {
    if (hoveredNode && hoveredNode.href) {
      router.push(hoveredNode.href);
    }
  };

  return (
    <div className="space-y-4">
      {/* Control bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-bg-raised/60 p-4">
        {/* Search */}
        <div className="relative min-w-[220px] flex-1">
          <Search size={16} className="absolute start-3 top-1/2 -translate-y-1/2 text-muted-fg" />
          <input
            type="text"
            placeholder="Search concepts, notes, subjects..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-full border border-border bg-bg ps-9 pe-4 py-1.5 text-xs font-medium text-fg focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>

        {/* Node type filters */}
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Graph filters">
          {[
            { id: "all", label: "All Nodes", icon: Network },
            { id: "subject", label: "Subjects", icon: BookOpen },
            { id: "topic", label: "Topics", icon: Filter },
            { id: "note", label: "Notes", icon: FileText },
            { id: "bundle", label: "Decks", icon: Layers },
            { id: "exam", label: "Exams", icon: FileQuestion },
          ].map((f) => {
            const Icon = f.icon;
            const active = filterType === f.id;
            return (
              <button
                key={f.id}
                onClick={() => setFilterType(f.id)}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold transition-colors ${
                  active
                    ? "bg-primary text-on-primary shadow-sm"
                    : "border border-border bg-bg text-muted-fg hover:text-fg"
                }`}
              >
                <Icon size={12} /> {f.label}
              </button>
            );
          })}
        </div>

        {/* Zoom controls */}
        <div className="flex items-center gap-1">
          <Button variant="secondary" size="sm" onClick={() => setZoom((z) => Math.min(2.5, z + 0.2))}>
            <ZoomIn size={14} />
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setZoom((z) => Math.max(0.4, z - 0.2))}>
            <ZoomOut size={14} />
          </Button>
          <Button variant="secondary" size="sm" onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}>
            <RefreshCw size={14} />
          </Button>
        </div>
      </div>

      {/* Main Canvas Viewport */}
      <div className="relative overflow-hidden rounded-2xl border border-border bg-bg shadow-inner h-[620px]">
        <canvas
          ref={canvasRef}
          onMouseMove={handleMouseMove}
          onMouseDown={handleMouseDown}
          onMouseUp={handleMouseUp}
          onDoubleClick={handleDoubleClick}
          className="h-full w-full cursor-grab active:cursor-grabbing"
        />

        {/* Legend Overlay */}
        <div className="absolute bottom-4 start-4 flex items-center gap-3 rounded-xl border border-border/80 bg-bg/90 p-2.5 backdrop-blur text-[10px] font-mono uppercase tracking-widest text-muted-fg">
          <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-indigo-500" /> Subject</span>
          <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-purple-500" /> Topic</span>
          <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-blue-500" /> Note</span>
          <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-violet-500" /> Deck</span>
          <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-amber-500" /> Exam</span>
        </div>

        {/* Node Hover / Selection Popup */}
        {(hoveredNode || selectedNode) && (
          <div className="absolute top-4 end-4 w-72 rounded-xl border border-border bg-bg/95 p-4 shadow-xl backdrop-blur transition-all">
            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-primary">
              <span className="h-2 w-2 rounded-full" style={{ background: (hoveredNode || selectedNode)?.color }} />
              {(hoveredNode || selectedNode)?.type}
            </div>
            <h3 className="mt-1 text-base font-bold text-fg">{(hoveredNode || selectedNode)?.label}</h3>
            <p className="mt-1 text-xs text-muted-fg">{(hoveredNode || selectedNode)?.meta}</p>

            {(hoveredNode || selectedNode)?.href && (
              <Button
                variant="primary"
                size="sm"
                className="mt-3 w-full"
                onClick={() => router.push((hoveredNode || selectedNode)!.href!)}
              >
                Open Resource
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
