"use client";

import { useT } from "@/lib/i18n";
import {
  BookOpen,
  Brain,
  Calculator,
  Atom,
  Code,
  Palette,
  Music,
  Globe,
  Heart,
  Star,
  Zap,
  Target,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

export const SUBJECT_ICONS: Record<string, LucideIcon> = {
  "book-open": BookOpen,
  brain: Brain,
  calculator: Calculator,
  atom: Atom,
  code: Code,
  palette: Palette,
  music: Music,
  globe: Globe,
  heart: Heart,
  star: Star,
  zap: Zap,
  target: Target,
};

export const SUBJECT_ICON_NAMES = Object.keys(SUBJECT_ICONS);

export function SubjectIconPicker({
  value,
  onChange,
  className,
}: {
  value: string;
  onChange: (name: string) => void;
  className?: string;
}) {
  const t = useT();
  return (
    <div className={cn("space-y-2", className)}>
      <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-muted-fg">{t("ui.icon")}</p>
      <div className="grid grid-cols-6 gap-1.5">
        {SUBJECT_ICON_NAMES.map((name) => {
          const Icon = SUBJECT_ICONS[name]!;
          const active = name === value;
          return (
            <button
              key={name}
              type="button"
              onClick={() => onChange(name)}
              aria-label={`Icon: ${name}`}
              aria-pressed={active}
              className={cn(
                "flex aspect-square items-center justify-center rounded-xl border transition-all",
                active
                  ? "border-accent bg-accent-soft text-accent"
                  : "border-border bg-bg text-muted-fg hover:border-accent hover:text-accent hover:bg-accent-soft"
              )}
            >
              <Icon size={18} />
            </button>
          );
        })}
      </div>
    </div>
  );
}
