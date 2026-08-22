import { describe, expect, it } from "vitest";
import {
  deriveChromeState,
  shouldShowSoloControls,
} from "./ui-state.js";

describe("shouldShowSoloControls", () => {
  it("hides solo deal／reset on room surface even before online seat", () => {
    expect(
      shouldShowSoloControls({ shellSurface: "room", online: false }),
    ).toBe(false);
  });

  it("hides solo controls once online on any surface", () => {
    expect(
      shouldShowSoloControls({ shellSurface: "solo", online: true }),
    ).toBe(false);
  });

  it("allows solo controls only for solo surface offline", () => {
    expect(
      shouldShowSoloControls({ shellSurface: "solo", online: false }),
    ).toBe(true);
  });
});

describe("deriveChromeState", () => {
  it("keeps solo idle chrome before deal", () => {
    expect(
      deriveChromeState({ mode: "solo", status: "idle", gamePhase: "idle" }),
    ).toEqual({
      layout: "setup",
      phase: "idle",
      showSetup: true,
      showRules: true,
    });
  });

  it("hides setup while solo playing or claiming", () => {
    expect(
      deriveChromeState({ mode: "solo", status: "playing", gamePhase: "playing" }),
    ).toEqual({
      layout: "match",
      phase: "playing",
      showSetup: false,
      showRules: false,
    });
    expect(
      deriveChromeState({ mode: "solo", status: "claim", gamePhase: "claim" }),
    ).toEqual({
      layout: "match",
      phase: "claim",
      showSetup: false,
      showRules: false,
    });
  });

  it("keeps online waiting／ready in setup", () => {
    for (const status of ["waiting", "ready"]) {
      expect(deriveChromeState({ mode: "online", status })).toMatchObject({
        layout: "setup",
        phase: status,
        showSetup: true,
        showRules: true,
      });
    }
  });

  it("hides setup during online active play", () => {
    expect(deriveChromeState({ mode: "online", status: "active" })).toEqual({
      layout: "match",
      phase: "active",
      showSetup: false,
      showRules: false,
    });
  });
});
