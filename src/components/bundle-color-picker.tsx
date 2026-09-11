"use client";

import { useT } from "@/lib/i18n";

import { BUNDLE_COLORS } from "@/lib/bundle-colors";
import { cn } from "@/lib/utils";

// Aurora Glass swatch picker — circular glass-bordered swatches, accent
// ring on selection, scale on hover. Matches the goal-modal swatch style.
// Palette stays hex (not CSS vars) because bundle/subject colors are
// consumed with hex-alpha suffixes (`${color}1f`) and readableOn()
// luminance math across the app.
export function BundleColorPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (c: string) => void;
}) {
  const t = useT();
  const selected = (value || "").toUpperCase();
  const isCustom = !!value && !BUNDLE_COLORS.some((c) => c.toUpperCase() === selected);

  return (
    <div className="space-y-3">
      <label className="text-xs font-bold uppercase tracking-widest text-muted-fg">
        Color
      </label>
      <div className="flex flex-wrap items-center gap-2">
        {BUNDLE_COLORS.map((c) => {
          const active = selected === c.toUpperCase();
          return (
            <button
              key={c}
              type="button"
              onClick={() => onChange(c)}
              aria-label={`Color ${c}`}
              title={c}
              className={cn(
                "h-7 w-7 rounded-full border border-glass-border transition-transform hover:scale-110",
                active && "ring-2 ring-accent ring-offset-2 ring-offset-bg-raised"
              )}
              style={{ background: c }}
            />
          );
        })}

        {/* Custom color — rainbow affordance, shows the picked color when active */}
        <label
          title={t("common.customColor")}
          aria-label=t("common.customColor")
          className={cn(
            "relative h-7 w-7 cursor-pointer rounded-full border border-glass-border transition-transform hover:scale-110",
            isCustom && "ring-2 ring-accent ring-offset-2 ring-offset-bg-raised"
          )}
          style={{
            background: isCustom
              ? value
              : "conic-gradient(from 0deg, #f43f5e, #f59e0b, #eab308, #22c55e, #06b6d4, #6366f1, #a855f7, #f43f5e)",
          }}
        >
          <input
            type="color"
            value={isCustom ? value : "#DFE104"}
            onChange={(e) => onChange(e.target.value.toUpperCase())}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          />
        </label>
      </div>
    </div>
  );
}
