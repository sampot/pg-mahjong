/**
 * Taiwan 16-tile scoring (additive 台 + exclusions).
 */

import { isHonor, isSuitTile, tileDef } from "./tiles.js";
import { isZhengHua, pointsFromTai } from "./ruleset.js";
import { findWinningPartition, isSingleWait } from "./partition.js";

/**
 * @typedef {{ id: number, key: string }} Tile
 * @typedef {{ type: 'chi'|'pong'|'kong', tiles: Tile[], concealed: boolean }} Meld
 * @typedef {import('./ruleset.js').Ruleset} Ruleset
 * @typedef {{
 *   ruleset: Ruleset,
 *   dealer: number,
 *   dealerStreak: number,
 *   roundWind: number,
 *   seats: { melds: Meld[], flowers: Tile[] }[],
 * }} ScoreState
 */

/**
 * Seat wind index 0=東… relative to dealer.
 * @param {ScoreState} state
 * @param {number} seat
 */
export function seatWind(state, seat) {
  return (seat - state.dealer + 4) % 4;
}

/**
 * @param {ScoreState} state
 * @param {number} winner
 * @param {Tile[]} hand including win tile
 * @param {boolean} selfDraw
 * @param {{
 *   robKong?: boolean,
 *   fromKong?: boolean,
 *   fromFlower?: boolean,
 *   lastDiscardWin?: boolean,
 *   lastDrawWin?: boolean,
 *   baXian?: boolean,
 *   qiangYi?: boolean,
 *   winKey?: string,
 * }} [meta]
 */
export function scoreWin(state, winner, hand, selfDraw, meta = {}) {
  const rules = state.ruleset;
  const melds = state.seats[winner].melds;
  const part =
    meta.baXian || meta.qiangYi
      ? null
      : findWinningPartition(melds, hand);
  if (!part && !meta.baXian && !meta.qiangYi) return null;

  /** @type {string[]} */
  const details = [];
  let tai = 0;

  const add = (n, label) => {
    if (n <= 0) return;
    tai += n;
    details.push(`${label} ${n}`);
  };

  if (meta.baXian) add(8, "八仙過海");
  if (meta.qiangYi) add(8, "七搶一");

  if (winner === state.dealer && !meta.qiangYi) {
    if (rules.pullZhuang) {
      const n = state.dealerStreak;
      add(2 * n + 1, n > 0 ? `莊連拉(連${n})` : "莊家");
    } else {
      add(1, "莊家");
      if (state.dealerStreak > 0) add(state.dealerStreak, "連莊");
    }
  }

  const brokeMenqing = melds.some(
    (m) =>
      m.type === "chi" ||
      m.type === "pong" ||
      (m.type === "kong" && !m.concealed),
  );
  const menqing = !brokeMenqing;

  if (!meta.baXian && !meta.qiangYi) {
    if (selfDraw && menqing) {
      add(3, "門清自摸不求人");
    } else {
      if (selfDraw) add(1, "自摸");
      if (menqing) add(1, "門清");
    }
  }

  if (meta.robKong) add(1, "搶槓");
  if ((meta.fromKong || meta.fromFlower) && selfDraw) add(1, "槓上開花");
  if (meta.lastDrawWin && selfDraw) add(1, "海底撈月");
  if (meta.lastDiscardWin && !selfDraw) add(1, "河底撈魚");

  if (part) {
    const allSets = [
      ...melds.map((m) =>
        m.type === "chi" ? `chow:${m.tiles[0].key}` : `pung:${m.tiles[0].key}`,
      ),
      ...part.sets,
    ];

    const isPengPeng = allSets.every((s) => s.startsWith("pung:"));
    const allKeys = [
      ...hand.map((t) => t.key),
      ...melds.flatMap((m) => m.tiles.map((t) => t.key)),
    ];
    const suits = new Set(
      allKeys.filter((k) => isSuitTile(k)).map((k) => tileDef(k).suit),
    );
    const hasHonor = allKeys.some((k) => isHonor(k));
    const onlyHonors = allKeys.every((k) => isHonor(k));

    if (
      melds.length >= 4 &&
      !selfDraw &&
      melds.every((m) => !m.concealed) &&
      hand.length === 2
    ) {
      add(2, "全求人");
    }

    let anKe = 0;
    for (const m of melds) {
      if (m.type === "kong" && m.concealed) anKe += 1;
      if (m.type === "pong" && m.concealed) anKe += 1;
    }
    for (const s of part.sets) {
      if (s.startsWith("pung:")) anKe += 1;
    }
    if (anKe >= 5) add(8, "五暗刻");
    else if (anKe >= 4) add(5, "四暗刻");
    else if (anKe >= 3) add(2, "三暗刻");

    if (isPengPeng) add(4, "碰碰胡");

    if (onlyHonors) add(8, "字一色");
    else if (suits.size === 1 && !hasHonor) add(8, "清一色");
    else if (suits.size === 1 && hasHonor) add(4, "混一色");

    const dragonPungs = [];
    const windPungs = [];
    for (const set of allSets) {
      if (!set.startsWith("pung:")) continue;
      const key = set.slice(5);
      const d = tileDef(key);
      if (d.suit === "dragon") dragonPungs.push(key);
      if (d.suit === "wind") windPungs.push(d.rank);
    }
    const pairDef = part.pairs ? tileDef(part.pairs) : null;

    if (dragonPungs.length === 3) {
      add(8, "大三元");
    } else if (dragonPungs.length === 2 && pairDef?.suit === "dragon") {
      add(4, "小三元");
    } else {
      for (const key of dragonPungs) {
        add(1, `三元刻(${tileDef(key).label})`);
      }
    }

    if (windPungs.length === 4) {
      add(16, "大四喜");
    } else if (windPungs.length === 3 && pairDef?.suit === "wind") {
      add(8, "小四喜");
      for (const rank of windPungs) {
        if (rank === state.roundWind) add(1, "圈風刻");
        if (rank === seatWind(state, winner)) add(1, "門風刻");
      }
    } else {
      for (const rank of windPungs) {
        if (rank === state.roundWind) add(1, "圈風刻");
        if (rank === seatWind(state, winner)) add(1, "門風刻");
      }
    }

    const winKey =
      meta.winKey ||
      (hand.length ? hand[hand.length - 1].key : null);
    if (winKey && isSingleWait(melds, hand, winKey)) {
      add(1, "獨聽");
    }

    const noHonorNoFlower =
      !hasHonor && state.seats[winner].flowers.length === 0;
    const allChow = allSets.every((s) => s.startsWith("chow:"));
    if (
      !selfDraw &&
      menqing &&
      noHonorNoFlower &&
      allChow &&
      !details.some((d) => d.startsWith("獨聽"))
    ) {
      const mi = details.findIndex((d) => d.startsWith("門清"));
      if (mi >= 0) {
        const n = Number(details[mi].split(" ").pop());
        tai -= n;
        details.splice(mi, 1);
      }
      add(2, "平胡");
    }
  }

  if (!meta.baXian && !meta.qiangYi) {
    const flowers = state.seats[winner].flowers;
    if (rules.flowerMode === "any") {
      if (flowers.length) add(flowers.length, "花牌");
    } else {
      const sw = seatWind(state, winner);
      let zheng = 0;
      for (const f of flowers) {
        if (isZhengHua(sw, f.key)) zheng += 1;
      }
      if (zheng) add(zheng, "正花");
    }
    const seasons = flowers.filter((f) => f.key.startsWith("season_"));
    const gents = flowers.filter((f) => f.key.startsWith("flower_"));
    if (seasons.length === 4 || gents.length === 4) add(2, "花槓");
  }

  let gateTai = tai;
  if (rules.minTaiExcludesDealerStreakFlowers) {
    gateTai = details.reduce((n, line) => {
      const skip =
        line.startsWith("莊") ||
        line.startsWith("連莊") ||
        line.startsWith("正花") ||
        line.startsWith("花牌") ||
        line.startsWith("花槓");
      if (!skip) return n;
      const parts = line.split(" ");
      return n - Number(parts[parts.length - 1] || 0);
    }, tai);
  }

  if (rules.minTai > 0 && gateTai < rules.minTai) {
    return null;
  }

  const points = pointsFromTai(rules, tai);
  return { tai, details, points, partition: part };
}

/**
 * @param {ScoreState} state
 * @param {number} winner
 * @param {number | null} from
 * @param {boolean} selfDraw
 * @param {{ tai: number, points: number }} scored
 * @param {{ baXian?: boolean }} [meta]
 */
export function buildPayments(state, winner, from, selfDraw, scored, meta = {}) {
  const rules = state.ruleset;
  const payments = [0, 0, 0, 0];

  const dealerExtra = () => {
    if (rules.pullZhuang) return 2 * state.dealerStreak + 1;
    return 1 + (state.dealerStreak > 0 ? state.dealerStreak : 0);
  };

  if (selfDraw || meta.baXian) {
    for (let i = 0; i < 4; i++) {
      if (i === winner) continue;
      let payTai = scored.tai;
      if (i === state.dealer && winner !== state.dealer) {
        payTai += dealerExtra();
      }
      const pay = pointsFromTai(rules, payTai);
      payments[i] = -pay;
      payments[winner] += pay;
    }
  } else if (from != null) {
    let payTai = scored.tai;
    if (from === state.dealer && winner !== state.dealer) {
      payTai += dealerExtra();
    }
    const pay = pointsFromTai(rules, payTai);
    payments[from] = -pay;
    payments[winner] = pay;
  }
  return payments;
}
