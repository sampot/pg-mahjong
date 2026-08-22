import { describe, expect, it } from "vitest";
import { readPgSurface } from "./shellSurface.js";

describe("readPgSurface", () => {
  it("reads query pg_surface=room", () => {
    const loc = { search: "?v=1&pg_surface=room" };
    expect(readPgSurface({ querySelector: () => null }, loc)).toBe("room");
  });

  it("reads meta pg:surface when query absent", () => {
    const doc = {
      querySelector: (sel) =>
        sel === 'meta[name="pg:surface"]'
          ? { getAttribute: () => "room" }
          : null,
    };
    expect(readPgSurface(doc, { search: "" })).toBe("room");
  });

  it("defaults to solo", () => {
    expect(readPgSurface({ querySelector: () => null }, { search: "" })).toBe(
      "solo",
    );
  });
});
