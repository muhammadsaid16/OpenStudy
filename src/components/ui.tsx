"use client";

import { useT, isTranslationKey } from "@/lib/i18n";

import { cn } from "@/lib/utils";
import {
  forwardRef,
  useEffect,
  useId,
  useRef,
  useSyncExternalStore,
  type ButtonHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
} from "react";
import { createPortal } from "react-dom";
import { Loader2, X } from "lucide-react";

/* ════════════════════════════════════════════════════════════════
   OPENSTUDY UI PRIMITIVES — "Quiet Intelligence v2"
   4-level elevation, border-based depth, semantic color roles.
   Primary = focus/CTA, Secondary = success, Tertiary = alert.
   ════════════════════════════════════════════════════════════════ */

// ─── Button ───────────────────────────────────────────────────────
interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "danger" | "success";
  size?: "sm" | "md" | "lg" | "icon";
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", loading = false, disabled, children, ...props }, ref) => {
    const t = useT();
    const resolvedChildren =
      typeof children === "string" && isTranslationKey(children) ? t(children) : children;

    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        className={cn(
          "inline-flex items-center justify-center gap-2 font-semibold tracking-tight transition-all duration-150",
          "rounded-lg",
          "disabled:pointer-events-none disabled:opacity-50",
          "active:scale-[0.98]",
          {
            "bg-primary-container text-on-primary-container shadow-[0_1px_2px_rgb(0_0_0/0.3)] hover:brightness-110":
              variant === "primary",
            "border border-border bg-surface text-fg hover:border-primary/40 hover:bg-surface-hover":
              variant === "secondary",
            "text-muted-fg hover:text-primary hover:bg-surface-hover":
              variant === "ghost",
            "border border-error/40 bg-error/10 text-error hover:bg-error hover:text-on-color":
              variant === "danger",
            "border border-secondary/40 bg-secondary/10 text-secondary hover:bg-secondary hover:text-on-color":
              variant === "success",
          },
          {
            "h-9 px-3.5 text-xs": size === "sm",
            "h-10 px-5 text-sm": size === "md",
            "h-11 px-6 text-sm": size === "lg",
            "h-10 w-10 p-0": size === "icon",
          },
          className
        )}
        {...props}
      >
        {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
        {children}
      </button>
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
        "glass rounded-lg p-5 transition-all duration-200",
        hover &&
          "cursor-pointer group hover:-translate-y-0.5 hover:border-primary/30",
        glow && "border-primary/25",
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
          "bg-secondary/12 text-secondary": variant === "success",
          "bg-tertiary/12 text-tertiary": variant === "warning",
          "bg-error/12 text-error": variant === "danger",
          "bg-primary/12 text-primary": variant === "flow",
          "bg-primary-container/15 text-primary": variant === "accent",
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
  ({ className, label, error, placeholder, ...props }, ref) => {
    const t = useT();
    const resolvedLabel = label && isTranslationKey(label) ? t(label) : label;
    const resolvedPlaceholder = placeholder && isTranslationKey(placeholder) ? t(placeholder) : placeholder;

    return (
      <div className="space-y-1.5">
        {resolvedLabel && (
          <label className="text-xs font-semibold uppercase tracking-widest text-muted-fg">
            {resolvedLabel}
          </label>
        )}
        <input
          ref={ref}
          placeholder={resolvedPlaceholder}
          className={cn(
            "glass-inset flex h-11 w-full rounded-lg px-3.5 py-2 text-sm font-medium tracking-tight",
            "text-fg placeholder:text-muted-fg/60",
            "focus:outline-none focus:border-primary/50",
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

export function Textarea({ className, label, error, placeholder, ...props }: TextareaProps) {
  const t = useT();
  const resolvedLabel = label && isTranslationKey(label) ? t(label) : label;
  const resolvedPlaceholder = placeholder && isTranslationKey(placeholder) ? t(placeholder) : placeholder;

  return (
    <div className="space-y-1.5">
      {resolvedLabel && (
        <label className="text-xs font-semibold uppercase tracking-widest text-muted-fg">
          {resolvedLabel}
        </label>
      )}
      <textarea
        placeholder={resolvedPlaceholder}
        className={cn(
          "glass-inset flex w-full rounded-lg px-3.5 py-3 text-sm font-medium tracking-tight",
          "text-fg placeholder:text-muted-fg/60",
          "focus:outline-none focus:border-primary/50 resize-none",
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
  maxWidth?: string;
  className?: string;
}

export function Modal({
  open,
  onClose,
  title,
  children,
  maxWidth = "max-w-lg",
  className = "",
}: ModalProps) {
  const t = useT();
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

  const resolvedTitle = isTranslationKey(title) ? t(title) : title;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-[rise_0.2s_ease-out]"
        onClick={onClose}
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={resolvedTitle}
        tabIndex={-1}
        className={`modal-pop relative w-full ${maxWidth} max-h-[85vh] flex flex-col rounded-2xl border border-border-strong glass-raised shadow-2xl overflow-hidden my-auto ${className}`}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-border/40 shrink-0">
          <h2 className="text-lg font-bold tracking-tight">{resolvedTitle}</h2>
          <button
            onClick={onClose}
            aria-label={t("common.close")}
            className="rounded-lg p-1.5 text-muted-fg transition-colors hover:bg-surface-hover hover:text-fg"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
        <div className="overflow-y-auto px-6 py-4 flex-1">
          {children}
        </div>
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
      <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-xl bg-primary-container/15 text-primary">
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
  children?: ReactNode;
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

// ─── Select ───────────────────────────────────────────────────────
// Native <select> styled to match Input. Options come as data
// ({ value, label }) or as children for grouped/advanced cases.
// The chevron is decorative — the real control is the native select.
interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "children"> {
  label?: string;
  error?: string;
  options?: SelectOption[];
  children?: ReactNode;
  placeholder?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, label, error, options, children, placeholder, id, ...props }, ref) => {
    const autoId = useId();
    const selectId = id ?? autoId;
    return (
      <div className="space-y-1.5">
        {label && (
          <label htmlFor={selectId} className="text-xs font-semibold uppercase tracking-widest text-muted-fg">
            {label}
          </label>
        )}
        <div className="relative">
          <select
            ref={ref}
            id={selectId}
            className={cn(
              "glass-inset h-11 w-full appearance-none rounded-lg ps-3.5 pe-9 text-sm font-medium tracking-tight",
              "text-fg",
              "focus:outline-none focus:border-primary/50",
              "transition-colors duration-150",
              "disabled:cursor-not-allowed disabled:opacity-50",
              error && "!border-danger",
              className
            )}
            {...props}
          >
            {placeholder && (
              <option value="" disabled>
                {placeholder}
              </option>
            )}
            {options?.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
            {children}
          </select>
          <svg
            aria-hidden
            viewBox="0 0 20 20"
            className="pointer-events-none absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-fg"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M6 8l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        {error && <p className="text-xs text-danger">{error}</p>}
      </div>
    );
  }
);
Select.displayName = "Select";

// ─── Switch ───────────────────────────────────────────────────────
// Accessible toggle. Renders a real checkbox for forms + AT; the
// visual track is sibling-decorated from :checked so no state is
// duplicated in JS.
interface SwitchProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> {
  label?: string;
}

export const Switch = forwardRef<HTMLInputElement, SwitchProps>(
  ({ className, label, id, ...props }, ref) => {
    const autoId = useId();
    const switchId = id ?? autoId;
    return (
      <div className={cn("flex items-center justify-between gap-4", className)}>
        {label && (
          <label htmlFor={switchId} className="text-sm font-medium text-fg">
            {label}
          </label>
        )}
        <span className="relative inline-flex">
          <input ref={ref} id={switchId} type="checkbox" role="switch" className="peer sr-only" {...props} />
          {/* track */}
          <span
            aria-hidden
            className={cn(
              "h-6 w-11 rounded-full border border-border bg-surface transition-colors duration-200",
              "peer-checked:border-primary/50 peer-checked:bg-primary-container/20",
              "peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-primary",
              "peer-disabled:opacity-50"
            )}
          />
          {/* knob */}
          <span
            aria-hidden
            className={cn(
              "absolute start-1 top-1 h-4 w-4 rounded-full bg-muted-fg transition-all duration-200",
              "peer-checked:start-6 peer-checked:bg-primary"
            )}
          />
        </span>
      </div>
    );
  }
);
Switch.displayName = "Switch";

// ─── IconButton ───────────────────────────────────────────────────
// Icon-only action. aria-label REQUIRED (enforced by TypeScript) —
// an icon button without a name is invisible to screen readers.
interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  variant?: "ghost" | "secondary" | "danger";
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ className, label, variant = "ghost", children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        aria-label={label}
        title={label}
        className={cn(
          "inline-flex h-9 w-9 items-center justify-center rounded-lg transition-colors duration-150",
          "active:scale-[0.96]",
          "disabled:pointer-events-none disabled:opacity-50",
          {
            "text-muted-fg hover:bg-surface-hover hover:text-fg": variant === "ghost",
            "border border-border bg-surface text-fg hover:border-primary/40 hover:bg-surface-hover":
              variant === "secondary",
            "text-error hover:bg-error/10": variant === "danger",
          },
          className
        )}
        {...props}
      >
        {children}
      </button>
    );
  }
);
IconButton.displayName = "IconButton";

// ─── Spinner ──────────────────────────────────────────────────────
// Inline busy indicator. Panel-level loading uses LoadingState
// (skeletons) instead — spinner only where something small waits.
export function Spinner({ className, size = 16 }: { className?: string; size?: number }) {
  return (
    <Loader2
      className={cn("animate-spin text-muted-fg", className)}
      style={{ width: size, height: size }}
      aria-hidden
    />
  );
}

// ─── Kbd ──────────────────────────────────────────────────────────
// Keyboard hint chip. Use inside buttons, menu rows, palette results.
export function Kbd({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <kbd
      dir="ltr"
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center rounded border border-border bg-surface px-1",
        "font-mono text-[10px] font-medium leading-none text-muted-fg",
        className
      )}
    >
      {children}
    </kbd>
  );
}

// ─── Table ────────────────────────────────────────────────────────
// Consistent data table: surface frame, sticky-feel header, row hover.
// Compose as <Table><THead>…</THead><TBody>…</TBody></Table>.
function tableCell(className?: string) {
  return cn("px-4 py-3 text-start align-middle", className);
}

export function Table({ className, children, ...props }: React.TableHTMLAttributes<HTMLTableElement>) {
  return (
    <div className="glass overflow-x-auto rounded-xl">
      <table className={cn("w-full border-collapse text-sm", className)} {...props}>
        {children}
      </table>
    </div>
  );
}

export function THead({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <thead
      className={cn(
        "border-b border-border text-[10px] font-bold uppercase tracking-widest text-muted-fg",
        className
      )}
      {...props}
    />
  );
}

export function TBody({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={cn("divide-y divide-border", className)} {...props} />;
}

export function TR({ className, ...props }: React.HTMLAttributes<HTMLTableRowElement>) {
  return <tr className={cn("transition-colors hover:bg-surface-hover/50", className)} {...props} />;
}

export function TH({ className, ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return <th scope="col" className={cn(tableCell(className), "py-3 font-bold")} {...props} />;
}

export function TD({ className, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={tableCell(className)} {...props} />;
}

// ─── ConfirmDialog ────────────────────────────────────────────────
// Standard destructive-action confirmation, built on Modal + Button.
// The confirm button takes variant="danger" unless told otherwise;
// Escape / backdrop click both cancel.
interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmVariant?: "danger" | "primary";
  loading?: boolean;
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel,
  cancelLabel,
  confirmVariant = "danger",
  loading = false,
}: ConfirmDialogProps) {
  const t = useT();
  return (
    <Modal open={open} onClose={onClose} title={title}>
      <p className="mb-6 text-sm leading-relaxed text-muted-fg">{description}</p>
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose} disabled={loading}>
          {cancelLabel ?? t("common.cancel")}
        </Button>
        <Button variant={confirmVariant} onClick={onConfirm} loading={loading}>
          {confirmLabel ?? t("common.confirm")}
        </Button>
      </div>
    </Modal>
  );
}
