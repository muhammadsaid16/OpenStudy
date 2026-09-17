"use client";

// ─── Card image UI (Contract 7 consumer boundary) ────────────────
// Review faces render <CardImage rec={...}/>; editors manage drafts with
// <CardImagePicker/>. All blob→URL lifecycle lives here so pages never
// call URL.createObjectURL themselves.

import { useEffect, useRef, useState } from "react";
import { ImagePlus, X } from "lucide-react";
import type { CardImageRec } from "@/lib/db";
import { useCardImageUrl, isSupportedImage } from "@/lib/card-images";

/** The review-face renderer. Renders nothing when there is no image. */
export function CardImage({
  rec,
  className = "",
  maxWidth = 340,
}: {
  rec: CardImageRec | null | undefined;
  className?: string;
  maxWidth?: number;
}) {
  const url = useCardImageUrl(rec);
  if (!rec || !url) return null;
  return (
    <img
      src={url}
      alt={rec.name}
      style={{ maxWidth }}
      className={`mx-auto max-h-56 w-auto rounded-xl border border-border/60 object-contain ${className}`}
      draggable={false}
    />
  );
}

/** Object-URL preview for a not-yet-saved File (create/edit drafts). */
export function useFileUrl(file: File | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!file) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- object-URL lifecycle must live in the effect; the null reset is part of it
      setUrl(null);
      return;
    }
    const u = URL.createObjectURL(file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);
  return url;
}

/**
 * Controlled draft picker. The parent owns the File state so the draft
 * survives modal re-renders and applies only when the parent saves.
 * Removal is instant (like wallpaper delete); picking a file is cancel-safe.
 */
export function CardImagePicker({
  file,
  onFile,
  label,
}: {
  file: File | null;
  onFile: (f: File | null) => void;
  label: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");
  const url = useFileUrl(file);
  return (
    <div className="flex items-center gap-2">
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0] ?? null;
          e.target.value = ""; // allow re-picking the same file
          if (!f) return;
          if (!isSupportedImage(f)) {
            setError("JPG/PNG/WebP/GIF/AVIF · max 8 MB");
            return;
          }
          setError("");
          onFile(f);
        }}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-muted-fg transition-colors hover:border-accent/60 hover:text-accent"
      >
        <ImagePlus size={12} />
        {label}
      </button>
      {file && (
        <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-muted-fg">
          {url && <img src={url} alt="" className="h-7 w-7 rounded object-cover" />}
          <span className="max-w-[9rem] truncate normal-case">{file.name}</span>
          <button type="button" aria-label="Remove image" onClick={() => onFile(null)} className="text-muted-fg hover:text-danger">
            <X size={12} />
          </button>
        </span>
      )}
      {error && <span className="text-[10px] font-bold text-danger">{error}</span>}
    </div>
  );
}
