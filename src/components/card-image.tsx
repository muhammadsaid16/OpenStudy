"use client";

// ─── Card image UI (Contract 7 consumer boundary) ────────────────
// Review faces render <CardImage rec={...}/>; editors manage drafts with
// <CardImagePicker/>. All blob→URL lifecycle lives here so pages never
// call URL.createObjectURL themselves.

import { useEffect, useRef, useState } from "react";
import { ImagePlus, X } from "lucide-react";
import type { CardImageRec } from "@/lib/db";
import { useCardImageUrl, isSupportedImage } from "@/lib/card-images";
import { useT } from "@/lib/i18n";

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
 *
 * `saved` is the image already stored for this side: it previews alongside the
 * draft so an edit reads as "here is what's there, here is what you're adding",
 * and it can be removed on its own.
 *
 * Paste: the wrapper is focusable and accepts a pasted image, so a screenshot
 * from anywhere can land on a card without saving it to disk first.
 */
export function CardImagePicker({
  file,
  onFile,
  label,
  saved,
  onRemoveSaved,
}: {
  file: File | null;
  onFile: (f: File | null) => void;
  label: string;
  saved?: CardImageRec | null;
  onRemoveSaved?: () => void;
}) {
  const t = useT();
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");
  const url = useFileUrl(file);
  const savedUrl = useCardImageUrl(saved);

  const accept = (f: File | null | undefined) => {
    if (!f) return;
    if (!isSupportedImage(f)) {
      setError("JPG/PNG/WebP/GIF/AVIF · max 8 MB");
      return;
    }
    setError("");
    onFile(f);
  };

  return (
    <div
      tabIndex={0}
      onPaste={(e) => {
        const item = Array.from(e.clipboardData?.items ?? []).find((i) => i.type.startsWith("image/"));
        const blob = item?.getAsFile() ?? null;
        if (!blob) return;
        e.preventDefault();
        accept(new File([blob], blob.name || `pasted.${blob.type.split("/")[1] ?? "png"}`, { type: blob.type }));
      }}
      className="flex flex-wrap items-center gap-2 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0] ?? null;
          e.target.value = ""; // allow re-picking the same file
          accept(f);
        }}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-muted-fg transition-colors hover:border-primary/60 hover:text-primary"
      >
        <ImagePlus size={12} />
        {label}
      </button>
      <span className="hidden text-[10px] uppercase tracking-widest text-muted-fg/60 sm:inline">
        {t("img.pasteHint")}
      </span>
      {saved && !file && (
        <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-muted-fg">
          {savedUrl && <img src={savedUrl} alt="" className="h-7 w-7 rounded object-cover" />}
          <span className="max-w-[9rem] truncate normal-case">{saved.name}</span>
          {onRemoveSaved && (
            <button type="button" aria-label={t("img.remove")} onClick={onRemoveSaved} className="text-muted-fg hover:text-danger">
              <X size={12} />
            </button>
          )}
        </span>
      )}
      {file && (
        <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-primary">
          {url && <img src={url} alt="" className="h-7 w-7 rounded object-cover" />}
          <span className="max-w-[9rem] truncate normal-case">{file.name}</span>
          <button type="button" aria-label={t("img.remove")} onClick={() => onFile(null)} className="text-muted-fg hover:text-danger">
            <X size={12} />
          </button>
        </span>
      )}
      {error && <span className="text-[10px] font-bold text-danger">{error}</span>}
    </div>
  );
}
