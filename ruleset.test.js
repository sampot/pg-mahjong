import { describe, expect, it } from "vitest";
import {
  mergeRuleset,
  DEFAULT_RULESET,
  pointsFromTai,
  isZhengHua,
} from "./ruleset.js";

describe("ruleset", () => {
  it("merges partial over defaults", () => {
    const r = mergeRuleset({ minTai: 3, qiangYi: true });
    expect(r.minTai).toBe(3);
    expect(r.qiangYi).toBe(true);
    expect(r.deadWallSize).toBe(DEFAULT_RULESET.deadWallSize);
    expect(r.baXian).toBe(true);
  });

  it("scores points as base + tai * taiValue with cap", () => {
    const r = mergeRuleset({ basePoints: 50, taiValue: 10, taiCap: 8 });
    expect(pointsFromTai(r, 4)).toBe(90);
    expect(pointsFromTai(r, 99)).toBe(50 + 8 * 10);
  });

  it("matches 正花 to seat wind", () => {
    expect(isZhengHua(0, "flower_plum")).toBe(true);
    expect(isZhengHua(0, "season_spring")).toBe(true);
    expect(isZhengHua(1, "flower_plum")).toBe(false);
    expect(isZhengHua(3, "season_winter")).toBe(true);
  });
});
