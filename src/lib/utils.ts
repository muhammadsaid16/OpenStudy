import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { formatDate as _formatDate, formatDuration as _formatDuration, formatRelative as _formatRelative } from "./format";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const formatDate = _formatDate;
export const formatDuration = _formatDuration;
export const formatRelative = _formatRelative;

// Pick a readable text color (black or white) for an arbitrary user-chosen
// background color — whichever yields the higher WCAG contrast ratio.
export function readableOn(hex: string): string {
  const h = (hex || "").replace("#", "");
  if (h.length < 6) return "#09090b";
  const chan = (i: number) => {
    const c = parseInt(h.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  const lum = 0.2126 * chan(0) + 0.7152 * chan(2) + 0.0722 * chan(4);
  const contrastWhite = 1.05 / (lum + 0.05);
  const contrastBlack = (lum + 0.05) / 0.05;
  return contrastBlack >= contrastWhite ? "#09090b" : "#ffffff";
}

// SM-2 lives only in reviewFlashcardWithLog (src/app/actions.ts) — the
// duplicate here had drifted (no 365-day cap) and was never called.
