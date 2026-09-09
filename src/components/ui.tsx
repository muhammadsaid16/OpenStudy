"use client";

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
   OPENSTUDY v2 UI PRIMITIVES — "Aurora Glass"
   Glass surfaces, generous radii, token-driven color only.
   ════════════════════════════════════════════════════════════════ */

// ─── Button (pill radius, shine sweep) ────────────────────────────
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
          "inline-flex items-center justify-center gap-2 font-semibold tracking-tight transition-all duration-200",
          "rounded-full",
          "disabled:pointer-events-none disabled:opacity-50",
          "active:scale-95",
          "relative overflow-hidden",
          "before:absolute before:inset-0 before:-translate-x-full before:bg-white/10 before:transition-transform before:duration-300 hover:before:translate-x-0",
          {
            "bg-accent text-accent-fg hover:shadow-[0_0_32px_-8px_var(--color-accent)]":
              variant === "primary",
            "border border-glass-border bg-glass text-fg backdrop-blur-md hover:bg-accent-soft hover:border-accent/20":
              variant === "secondary",
            "text-muted-fg hover:text-accent":
              variant === "ghost",
            "border border-danger/40 bg-danger/10 text-danger hover:bg-danger hover:text-on-color":
              variant === "danger",
          },
          {
            "h-9 px-4 text-xs": size === "sm",
            "h-11 px-6 text-sm": size === "md",
            "h-13 px-8 text-base": size === "lg",
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
  return (
    <div
      className={cn(
        "glass rounded-2xl p-6 transition-all duration-300",
        hover &&
          "cursor-pointer group hover:-translate-y-1 hover:scale-[1.01] hover:border-accent/40 hover:glow-accent",
        glow && "border-accent/30 shadow-[0_0_48px_-16px_var(--color-accent-soft,var(--color-accent))]",
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
          "bg-muted/80 text-muted-fg": variant === "default",
          "bg-grow/10 text-grow": variant === "success",
          "bg-warning/10 text-warning": variant === "warning",
          "bg-danger/10 text-danger": variant === "danger",
          "bg-flow/10 text-flow": variant === "flow",
          "bg-accent-soft text-accent": variant === "accent",
        },
        className
      )}
    >
      {children}
    </span>
  );
}

// ─── Input (glass-inset well) ────────────────────────────────────
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
            "glass-inset flex h-12 w-full rounded-xl px-4 py-2 text-base font-medium tracking-tight",
            "text-fg placeholder:text-muted-fg/60",
            "border-border focus:outline-none",
            "transition-colors duration-200",
            error && "border-danger",
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
          "glass-inset flex w-full rounded-xl px-4 py-3 text-base font-medium tracking-tight",
          "text-fg placeholder:text-muted-fg/60",
          "border-border focus:outline-none resize-none",
          "transition-colors duration-200",
          error && "border-danger",
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
  // SSR-safe "are we in the browser" probe without useEffect+setState
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );
  // Focus-trap refs: dialog shell (for programmatic focus fallback) and
  // the element that had focus when the modal opened (restored on close).
  const dialogRef = useRef<HTMLDivElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  // Autofocus first focusable on open, remember the trigger, restore on close.
  useEffect(() => {
    if (!open) return;
    restoreFocusRef.current = document.activeElement as HTMLElement | null;
    // Focus first field/button inside the dialog after the portal mounts.
    // rAF: the portal content isn't in the DOM yet during this effect pass.
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
      // Heuristic #9 (error recovery): return the user exactly where they
      // were — the trigger keeps its place in the tab order.
      restoreFocusRef.current?.focus?.();
    };
  }, [open]);

  // Escape closes (universal close affordance, WCAG 2.1.2) + Tab trap.
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
        className="absolute inset-0 bg-black/70 backdrop-blur-md animate-[rise_0.2s_ease-out]"
        onClick={onClose}
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className="modal-pop rise-in relative w-full max-w-md rounded-3xl border border-glass-border bg-bg-raised p-6 shadow-2xl ring-1 ring-white/5"
      >
        <div className="mb-5 flex items-center justify-between">
          <h2 className="font-display text-xl font-bold tracking-tight">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-full p-2 text-muted-fg transition-colors hover:bg-accent-soft hover:text-accent"
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
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-accent-soft text-accent">
        {icon}
      </div>
      <h3 className="font-display mb-2 text-2xl font-bold tracking-tight">{title}</h3>
      <p className="mb-8 max-w-sm text-sm text-muted-fg">{description}</p>
      {action}
    </div>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton rounded-xl", className)} />;
}

// ─── RingProgress (anime.js-driven SVG progress ring) ─────────────
// Animates stroke-dashoffset on mount / value change via anime.js.
// Pure data-viz: no state, no re-render churn.
interface RingProgressProps {
  /** 0..100 */
  value: number;
  size?: number;
  stroke?: number;
  /** gradient start/end colors; default accent→flow */
  fromColor?: string;
  toColor?: string;
  trackColor?: string;
  children?: React.ReactNode;
  className?: string;
  label?: string; // aria-label summary
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
    let cleanup: (() => void) | undefined;
    let cancelled = false;
    import("animejs")
      .then((mod) => {
        if (cancelled) return;
        const { animate, eases } = mod as typeof import("animejs");
        // anime.js v4: params and tween options live in ONE object
        animate(el, {
          strokeDashoffset: [c, c - (c * clamped) / 100],
          duration: 1400,
          ease: eases.outExpo,
        });
      })
      .catch(() => {
        // anime.js failed to load — set the final value directly
        if (!cancelled && el) {
          el.style.strokeDashoffset = String(c - (c * clamped) / 100);
        }
      });
    return () => {
      cancelled = true;
      cleanup?.();
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
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={trackColor}
          strokeWidth={stroke}
        />
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
