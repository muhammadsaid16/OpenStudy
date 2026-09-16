import { describe, expect, it, beforeEach } from "vitest";
import { useAppStore } from "@/lib/store";
import { UI_OPACITY_DEFAULT, UI_OPACITY_MIN } from "@/lib/ui-opacity";

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
