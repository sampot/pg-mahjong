import { describe, expect, it } from "vitest";
import { nextTileTap, shouldCompactChrome } from "./ux.js";

describe("tile tap flow", () => {
  it("selects an unselected tile", () => {
    expect(nextTileTap(null, 7)).toEqual({ type: "select", tileId: 7 });
  });

  it("discards a tile when it is tapped again", () => {
    expect(nextTileTap(7, 7)).toEqual({ type: "discard", tileId: 7 });
  });

  it("moves selection when another tile is tapped", () => {
    expect(nextTileTap(7, 9)).toEqual({ type: "select", tileId: 9 });
  });
});

describe("compact game chrome", () => {
  it("compacts during active play and claims", () => {
    expect(shouldCompactChrome("playing")).toBe(true);
    expect(shouldCompactChrome("claim")).toBe(true);
  });

  it("keeps the full landing and result chrome", () => {
    expect(shouldCompactChrome("idle")).toBe(false);
    expect(shouldCompactChrome("ended")).toBe(false);
  });
});
