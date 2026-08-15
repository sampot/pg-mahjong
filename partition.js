/**
 * Winning-hand partition: 5 melds + pair (concealed portion).
 */

import { isSuitTile, tileDef } from "./tiles.js";

/**
 * @typedef {{ type: 'chi'|'pong'|'kong', tiles: { key: string }[], concealed: boolean }} Meld
 * @typedef {{ key: string, id?: number }} Tile
 */

/**
 * @param {Meld[]} melds
 * @param {Tile[]} hand including win tile
 * @returns {null | { pairs: string, sets: string[] }}
 */
export function findWinningPartition(melds, hand) {
  const needSets = 5 - melds.length;
  if (needSets < 0) return null;
  const keys = hand.map((t) => t.key).sort();
  if (keys.length !== needSets * 3 + 2) return null;
  return tryPartition(keys, needSets, true);
}

/**
 * @param {string[]} keys sorted multiset
 * @param {number} setsLeft
 * @param {boolean} needPair
 * @returns {null | { pairs: string, sets: string[] }}
 */
function tryPartition(keys, setsLeft, needPair) {
  if (keys.length === 0) {
    return setsLeft === 0 && !needPair ? { pairs: "", sets: [] } : null;
  }
  if (needPair) {
    for (let i = 0; i < keys.length - 1; i++) {
      if (keys[i] !== keys[i + 1]) continue;
      if (i > 0 && keys[i] === keys[i - 1]) continue;
      const rest = keys.slice(0, i).concat(keys.slice(i + 2));
      const sub = tryPartition(rest, setsLeft, false);
      if (sub) return { pairs: keys[i], sets: sub.sets };
    }
    return null;
  }
  // pung
  if (keys.length >= 3 && keys[0] === keys[1] && keys[1] === keys[2]) {
    const rest = keys.slice(3);
    const sub = tryPartition(rest, setsLeft - 1, false);
    if (sub) return { pairs: sub.pairs, sets: [`pung:${keys[0]}`, ...sub.sets] };
  }
  // chow — try even when pung also possible (backtrack)
  if (isSuitTile(keys[0])) {
    const d = tileDef(keys[0]);
    const k2 = `${d.suit}${d.rank + 1}`;
    const k3 = `${d.suit}${d.rank + 2}`;
    const copy = keys.slice();
    const i0 = 0;
    const i2 = copy.indexOf(k2, 1);
    if (i2 > 0) {
      const i3 = copy.indexOf(k3, 1);
      if (i3 > 0) {
        const next = copy.filter((_, i) => i !== i0 && i !== i2 && i !== i3);
        const sub = tryPartition(next, setsLeft - 1, false);
        if (sub) {
          return { pairs: sub.pairs, sets: [`chow:${keys[0]}`, ...sub.sets] };
        }
      }
    }
  }
  // If pung path failed above we already returned; if pung matched but sub failed, try only chow was attempted.
  // When first three are pung-able but chow also needed — we tried pung first. Backtrack: if pung sub failed, fall through to fail unless chow worked.
  if (keys.length >= 3 && keys[0] === keys[1] && keys[1] === keys[2]) {
    // pung already tried; nothing more
  }
  return null;
}

/**
 * Keys that complete a win from a 16-tile (or shorter with melds) waiting hand.
 * @param {Meld[]} melds
 * @param {Tile[]} hand without the winning tile
 * @returns {string[]}
 */
export function waitingKeys(melds, hand) {
  const base = hand.map((t) => t.key);
  /** @type {Set<string>} */
  const candidates = new Set(base);
  for (const k of base) {
    if (!isSuitTile(k)) continue;
    const d = tileDef(k);
    for (const o of [-2, -1, 1, 2]) {
      const r = d.rank + o;
      if (r >= 1 && r <= 9) candidates.add(`${d.suit}${r}`);
    }
  }
  for (const k of [
    "ton",
    "nan",
    "shaa",
    "pei",
    "haku",
    "hatsu",
    "chun",
  ]) {
    candidates.add(k);
  }
  /** @type {string[]} */
  const waits = [];
  for (const k of candidates) {
    const tiles = base.concat([k]).map((key, id) => ({ id, key }));
    if (findWinningPartition(melds, tiles)) waits.push(k);
  }
  return waits;
}

/**
 * @param {Meld[]} melds
 * @param {Tile[]} handWithWin
 * @param {string} winKey
 */
export function isSingleWait(melds, handWithWin, winKey) {
  const keys = handWithWin.map((t) => t.key);
  const idx = keys.lastIndexOf(winKey);
  if (idx < 0) return false;
  const without = keys
    .slice(0, idx)
    .concat(keys.slice(idx + 1))
    .map((key, id) => ({ id, key }));
  const waits = waitingKeys(melds, without);
  return waits.length === 1 && waits[0] === winKey;
}
