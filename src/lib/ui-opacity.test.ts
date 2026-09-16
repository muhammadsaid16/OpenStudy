import { describe, expect, it } from "vitest";
import {
  UI_OPACITY_MIN,
  UI_OPACITY_MAX,
  UI_OPACITY_DEFAULT,
  clampUiOpacity,
} from "@/lib/ui-opacity";

describe("clampUiOpacity", () => {
  it("leaves in-range values untouched", () => {
    expect(clampUiOpacity(1)).toBe(1);
    expect(clampUiOpacity(0.8)).toBeCloseTo(0.8);
    expect(clampUiOpacity(UI_OPACITY_MIN)).toBe(UI_OPACITY_MIN);
  });

  it("clamps below the accessibility floor", () => {
    // The floor exists so text over a bright wallpaper keeps clearing AA.
    expect(clampUiOpacity(0)).toBe(UI_OPACITY_MIN);
    expect(clampUiOpacity(-3)).toBe(UI_OPACITY_MIN);
    expect(clampUiOpacity(0.1)).toBe(UI_OPACITY_MIN);
  });

  it("clamps above fully opaque", () => {
    expect(clampUiOpacity(2)).toBe(UI_OPACITY_MAX);
    expect(clampUiOpacity(Infinity)).toBe(UI_OPACITY_DEFAULT);
  });

  it("falls back to the default for non-numeric input", () => {
    expect(clampUiOpacity(NaN)).toBe(UI_OPACITY_DEFAULT);
    expect(clampUiOpacity(Number("nope"))).toBe(UI_OPACITY_DEFAULT);
  });

  it("defaults to fully opaque, so themes render unchanged", () => {
    expect(UI_OPACITY_DEFAULT).toBe(1);
  });
});
