/**
 * Configurable Taiwan 16-tile house rules.
 * @typedef {'zheng'|'any'} FlowerMode
 * @typedef {{
 *   deadWallSize: number,
 *   minTai: number,
 *   minTaiExcludesDealerStreakFlowers: boolean,
 *   keepDealerOnDraw: boolean,
 *   pullZhuang: boolean,
 *   allowRobKong: boolean,
 *   qiangYi: boolean,
 *   baXian: boolean,
 *   flowerMode: FlowerMode,
 *   basePoints: number,
 *   taiValue: number,
 *   taiCap: number,
 *   kongBeatsPong: boolean,
 *   multiHu: boolean,
 *   guoShuiJiaKongClears: boolean,
 * }} Ruleset
 */

/** @type {Ruleset} */
export const DEFAULT_RULESET = {
  deadWallSize: 16,
  minTai: 0,
  minTaiExcludesDealerStreakFlowers: true,
  keepDealerOnDraw: true,
  pullZhuang: true,
  allowRobKong: true,
  qiangYi: false,
  baXian: true,
  flowerMode: "zheng",
  basePoints: 1,
  taiValue: 1,
  taiCap: 16,
  kongBeatsPong: false,
  multiHu: false,
  guoShuiJiaKongClears: true,
};

/**
 * @param {Partial<Ruleset>} [partial]
 * @returns {Ruleset}
 */
export function mergeRuleset(partial = {}) {
  return { ...DEFAULT_RULESET, ...partial };
}

/**
 * Seat wind 0=東… → matching flower ranks (春/梅=0, 夏/蘭=1, …).
 * @param {number} seatWindIndex
 * @param {string} flowerKey
 */
export function isZhengHua(seatWindIndex, flowerKey) {
  const map = {
    flower_plum: 0,
    season_spring: 0,
    flower_orchid: 1,
    season_summer: 1,
    flower_chrys: 2,
    season_autumn: 2,
    flower_bamboo: 3,
    season_winter: 3,
  };
  return map[flowerKey] === seatWindIndex;
}

/**
 * @param {Ruleset} rules
 * @param {number} tai
 */
export function pointsFromTai(rules, tai) {
  const capped = Math.min(Math.max(0, tai), rules.taiCap);
  return rules.basePoints + capped * rules.taiValue;
}
