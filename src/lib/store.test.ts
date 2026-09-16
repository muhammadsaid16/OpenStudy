import { describe, expect, it, beforeEach } from "vitest";
import { useAppStore } from "@/lib/store";
import { UI_OPACITY_DEFAULT, UI_OPACITY_MIN } from "@/lib/ui-opacity";

describe("store wallpaperRotation", () => {
  beforeEach(() => {
    useAppStore.setState({ wallpaperRotation: 0 });
  });

  it("defaults to upright", () => {
    expect(useAppStore.getState().wallpaperRotation).toBe(0);
  });

  it("stores the four quarter turns as given", () => {
    for (const deg of [0, 90, 180, 270]) {
      useAppStore.getState().setWallpaperRotation(deg);
      expect(useAppStore.getState().wallpaperRotation).toBe(deg);
    }
  });

  it("wraps values past a full turn", () => {
    useAppStore.getState().setWallpaperRotation(450);
    expect(useAppStore.getState().wallpaperRotation).toBe(90);
  });

  it("normalises a negative angle", () => {
    useAppStore.getState().setWallpaperRotation(-90);
    expect(useAppStore.getState().wallpaperRotation).toBe(270);
  });

  it("snaps a drifted value to the nearest quarter turn", () => {
    useAppStore.getState().setWallpaperRotation(88);
    expect(useAppStore.getState().wallpaperRotation).toBe(90);
  });
});

describe("store uiOpacity", () => {
  beforeEach(() => {
    useAppStore.setState({ uiOpacity: UI_OPACITY_DEFAULT });
  });

  it("defaults to fully opaque", () => {
    expect(useAppStore.getState().uiOpacity).toBe(UI_OPACITY_DEFAULT);
  });

  it("clamps below the floor, the way a slider drag would feed it", () => {
    useAppStore.getState().setUiOpacity(0.1);
    expect(useAppStore.getState().uiOpacity).toBe(UI_OPACITY_MIN);
  });

  it("stores in-range values as given", () => {
    useAppStore.getState().setUiOpacity(0.8);
    expect(useAppStore.getState().uiOpacity).toBeCloseTo(0.8);
  });

  it("round-trips back to fully opaque", () => {
    useAppStore.getState().setUiOpacity(0.6);
    useAppStore.getState().setUiOpacity(1);
    expect(useAppStore.getState().uiOpacity).toBe(1);
  });
});
