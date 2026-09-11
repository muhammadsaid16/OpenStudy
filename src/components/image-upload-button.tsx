"use client";

import { useT } from "@/lib/i18n";

import { useRef } from "react";
import { ImagePlus } from "lucide-react";
import { showToast } from "@/components/toast";

/**
 * Image upload button for flashcard front/back fields.
 * Converts the selected image to a base64 data URL and calls `onImage` with
 * the markdown image tag: `![description](data:image/...)`
 */
export function ImageUploadButton({
  onImage,
  label,
  labelKey = "ui.add_image",
}: {
  onImage: (markdownImage: string) => void;
  label?: string;
  labelKey?: string;
}) {
  const t = useT();
  const inputRef = useRef<HTMLInputElement>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Only accept image files
    if (!file.type.startsWith("image/")) {
      showToast("Please select an image file", "warning");
      return;
    }

    // Max 2MB to keep card content manageable
    if (file.size > 2 * 1024 * 1024) {
      showToast("Image too large — max 2MB", "warning");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const md = `![${file.name}](${dataUrl})`;
      onImage(md);
    };
    reader.readAsDataURL(file);

    // Reset so the same file can be selected again
    e.target.value = "";
  };

  return (
    <>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="inline-flex items-center gap-1.5 rounded-full border border-border px-2 py-1 text-[10px] font-bold uppercase tracking-widest text-muted-fg transition-colors hover:border-accent hover:text-accent hover:bg-accent-soft"
      >
        <ImagePlus size={12} />
        {label ?? t(labelKey)}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleChange}
      />
    </>
  );
}
