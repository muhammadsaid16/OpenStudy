"use client";

import { useT } from "@/lib/i18n";

import { cn } from "@/lib/utils";
import {
  forwardRef,
  useEffect,
  useRef,
  useSyncExternalStore,
  type ButtonHTMLAttributes,
} from "react";
import { createPortal } from "react-dom";

/* ════════════════════════════════════════════════════════════════
   OPENSTUDY UI PRIMITIVES — "Quietly Premium"
   Flat surfaces, 1px borders, restrained radius, no glass shine.
   ════════════════════════════════════════════════════════════════ */

// ─── Button ───────────────────────────────────────────────────────
interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center gap-2 font-semibold tracking-tight transition-all duration-150",
          "rounded-lg",
          "disabled:pointer-events-none disabled:opacity-50",
          "active:scale-[0.98]",
          {
            "bg-accent text-accent-fg shadow-[0_1px_2px_rgb(0_0_0/0.3)] hover:brightness-110":
              variant === "primary",
            "border border-border bg-surface text-fg hover:border-accent/40 hover:bg-surface-hover":
              variant === "secondary",
            "text-muted-fg hover:text-accent hover:bg-surface-hover":
              variant === "ghost",
            "border border-danger/40 bg-danger/10 text-danger hover:bg-danger hover:text-on-color":
              variant === "danger",
          },
          {
            "h-9 px-3.5 text-xs": size === "sm",
            "h-10 px-5 text-sm": size === "md",
            "h-11 px-6 text-sm": size === "lg",
          },
          className
        )}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

// ─── Card ────────────────────────────────────────────────────────
interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  hover?: boolean;
  glow?: boolean;
}

export function Card({ className, hover, glow, ...props }: CardProps) {
  const t = useT();
  return (
    <div
      className={cn(
        "glass rounded-xl p-5 transition-all duration-200",
        hover &&
          "cursor-pointer group hover:-translate-y-0.5 hover:border-accent/30",
        glow && "border-accent/25",
        className
      )}
      {...props}
    />
  );
}

// ─── Badge ────────────────────────────────────────────────────────
interface BadgeProps {
  children: React.ReactNode;
  variant?: "default" | "success" | "warning" | "danger" | "flow" | "accent";
  className?: string;
}

export function Badge({ children, variant = "default", className }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-widest",
        {
          "bg-muted text-muted-fg": variant === "default",
          "bg-grow/12 text-grow": variant === "success",
          "bg-warning/12 text-warning": variant === "warning",
          "bg-danger/12 text-danger": variant === "danger",
          "bg-flow/12 text-flow": variant === "flow",
          "bg-accent-soft text-accent": variant === "accent",
        },
        className
      )}
    >
      {children}
    </span>
  );
}

// ─── Input ────────────────────────────────────────────────────────
interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, ...props }, ref) => {
    return (
      <div className="space-y-1.5">
        {label && (
          <label className="text-xs font-semibold uppercase tracking-widest text-muted-fg">
            {label}
          </label>
        )}
        <input
          ref={ref}
          className={cn(
            "glass-inset flex h-11 w-full rounded-lg px-3.5 py-2 text-sm font-medium tracking-tight",
            "text-fg placeholder:text-muted-fg/60",
            "focus:outline-none focus:border-accent/50",
            "transition-colors duration-150",
            error && "!border border-danger",
            className
          )}
          {...props}
        />
        {error && <p className="text-xs text-danger">{error}</p>}
      </div>
    );
  }
);
Input.displayName = "Input";

// ─── Textarea ─────────────────────────────────────────────────────
interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
}

export function Textarea({ className, label, error, ...props }: TextareaProps) {
  return (
    <div className="space-y-1.5">
      {label && (
        <label className="text-xs font-semibold uppercase tracking-widest text-muted-fg">
          {label}
        </label>
      )}
      <textarea
        className={cn(
          "glass-inset flex w-full rounded-lg px-3.5 py-3 text-sm font-medium tracking-tight",
          "text-fg placeholder:text-muted-fg/60",
          "focus:outline-none focus:border-accent/50 resize-none",
          "transition-colors duration-150",
          error && "!border border-danger",
          className
        )}
        {...props}
      />
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}

// ─── Modal ────────────────────────────────────────────────────────
interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

export function Modal({ open, onClose, title, children }: ModalProps) {
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );
  const dialogRef = useRef<HTMLDivElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    restoreFocusRef.current = document.activeElement as HTMLElement | null;
    const raf = requestAnimationFrame(() => {
      const dialog = dialogRef.current;
      if (!dialog) return;
      const focusables = dialog.querySelectorAll<HTMLElement>(
        'input, textarea, select, button, [href], [tabindex]:not([tabindex="-1"])'
      );
      (focusables[0] ?? dialog).focus();
    });
    return () => {
      cancelAnimationFrame(raf);
      restoreFocusRef.current?.focus?.();
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key === "Tab") {
        const dialog = dialogRef.current;
        if (!dialog) return;
        const focusables = Array.from(
          dialog.querySelectorAll<HTMLElement>(
            'input, textarea, select, button, [href], [tabindex]:not([tabindex="-1"])'
          )
        ).filter((el) => !el.hasAttribute("disabled"));
        if (focusables.length === 0) {
          e.preventDefault();
          return;
        }
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        const active = document.activeElement as HTMLElement | null;
        if (e.shiftKey && (active === first || !dialog.contains(active))) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && (active === last || !dialog.contains(active))) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [open, onClose]);

  if (!open || !mounted || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-[rise_0.2s_ease-out]"
        onClick={onClose}
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className="modal-pop relative w-full max-w-md rounded-2xl border border-border-strong glass-raised p-6 shadow-2xl"
      >
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-xl font-bold tracking-tight">{title}</h2>
          <button
            onClick={onClose}
            aria-label={"common.close"}
            className="rounded-lg p-2 text-muted-fg transition-colors hover:bg-surface-hover hover:text-fg"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body
  );
}

// ─── Empty State ──────────────────────────────────────────────────
interface EmptyStateProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border px-6 py-20 text-center">
      <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-xl bg-accent-soft text-accent">
        {icon}
      </div>
      <h3 className="text-lg font-bold tracking-tight text-fg">{title}</h3>
      <p className="mb-6 mt-1.5 max-w-sm text-sm leading-relaxed text-muted-fg">
        {description}
      </p>
      {action}
    </div>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton rounded-lg", className)} />;
}

// ─── RingProgress (anime.js-driven SVG progress ring) ─────────────
interface RingProgressProps {
  value: number;
  size?: number;
  stroke?: number;
  fromColor?: string;
  toColor?: string;
  trackColor?: string;
  children?: React.ReactNode;
  className?: string;
  label?: string;
}

export function RingProgress({
  value,
  size = 120,
  stroke = 10,
  fromColor = "var(--color-accent)",
  toColor = "var(--color-flow)",
  trackColor = "var(--color-muted)",
  children,
  className,
  label,
}: RingProgressProps) {
  const circleRef = useRef<SVGCircleElement>(null);
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(100, value));

  useEffect(() => {
    const el = circleRef.current;
    if (!el) return;
    let cancelled = false;
    import("animejs")
      .then((mod) => {
        if (cancelled) return;
        const { animate, eases } = mod as typeof import("animejs");
        animate(el, {
          strokeDashoffset: [c, c - (c * clamped) / 100],
          duration: 1400,
          ease: eases.outExpo,
        });
      })
      .catch(() => {
        if (!cancelled && el) {
          el.style.strokeDashoffset = String(c - (c * clamped) / 100);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [clamped, c]);

  return (
    <div
      role="img"
      aria-label={label ?? `${Math.round(clamped)} percent complete`}
      className={cn("relative inline-flex items-center justify-center", className)}
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} className="-rotate-90">
        <defs>
          <linearGradient id={`ring-${size}-${stroke}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={fromColor} />
            <stop offset="100%" stopColor={toColor} />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={trackColor} strokeWidth={stroke} />
        <circle
          ref={circleRef}
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={`url(#ring-${size}-${stroke})`}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        {children}
      </div>
    </div>
  );
}
