/**
 * Heuristic AI with shanten-ish discard scoring for Taiwan mahjong.
 */

import {
  anKongKeys,
  canHuSelf,
  jiaKongTileIds,
  legalClaims,
  concealedTiles,
  waitingKeys,
} from "./game.js";
import { findWinningPartition } from "./partition.js";
import { isHonor, isSuitTile, tileDef } from "./tiles.js";

/**
 * @param {import('./game.js').GameState} state
 * @param {number} seat
 * @param {{ difficulty?: 'easy'|'standard' }} [opts]
 * @returns {{ type: string, [k: string]: any } | null}
 */
export function chooseAiAction(state, seat, opts = {}) {
  const difficulty = opts.difficulty || "standard";
  if (state.phase === "claim" && state.claim) {
    return chooseClaim(state, seat, difficulty);
  }
  if (state.phase === "playing" && state.turn === seat && state.mustDiscard) {
    return chooseDiscardTurn(state, seat, difficulty);
  }
  return null;
}

/**
 * @param {import('./game.js').GameState} state
 * @param {number} seat
 * @param {string} difficulty
 */
function chooseClaim(state, seat, difficulty) {
  if (seat === state.claim?.from) return null;
  if (state.claim?.passes[seat] || state.claim?.pending[seat]) return null;

  const opts = legalClaims(state, seat);
  if (!opts.length) {
    return { type: "pass_claim", seat };
  }
  if (opts.some((o) => o.kind === "hu")) {
    return { type: "hu_claim", seat };
  }
  if (state.claim.mode === "rob_kong") {
    return { type: "pass_claim", seat };
  }
  if (opts.some((o) => o.kind === "kong")) {
    return { type: "claim", seat, intent: { kind: "kong" } };
  }
  if (opts.some((o) => o.kind === "pong")) {
    const key = state.claim.tile.key;
    const before = shantenEstimate(state.seats[seat].melds, state.seats[seat].hand);
    const hand = state.seats[seat].hand.filter((t) => t.key !== key).slice();
    // remove two of key
    let removed = 0;
    const filtered = [];
    for (const t of state.seats[seat].hand) {
      if (t.key === key && removed < 2) {
        removed += 1;
        continue;
      }
      filtered.push(t);
    }
    const after = shantenEstimate(
      [...state.seats[seat].melds, { type: "pong", tiles: [], concealed: false }],
      filtered,
    );
    const improve = after < before;
    const p = difficulty === "easy" ? 0.45 : 0.7;
    if (improve || Math.random() < p * 0.3) {
      return { type: "claim", seat, intent: { kind: "pong" } };
    }
  }
  const chi = opts.find((o) => o.kind === "chi");
  if (chi?.chiOptions?.length) {
    const p = difficulty === "easy" ? 0.25 : 0.4;
    if (Math.random() < p) {
      return {
        type: "claim",
        seat,
        intent: { kind: "chi", chiTiles: chi.chiOptions[0] },
      };
    }
  }
  return { type: "pass_claim", seat };
}

/**
 * @param {import('./game.js').GameState} state
 * @param {number} seat
 * @param {string} difficulty
 */
function chooseDiscardTurn(state, seat, difficulty) {
  if (canHuSelf(state, seat)) {
    return { type: "hu_self", seat };
  }
  if (
    state.ruleset.baXian &&
    state.seats[seat].flowers.length >= 8
  ) {
    return { type: "flower_hu", seat };
  }
  const aks = anKongKeys(state, seat);
  if (aks.length) {
    return { type: "ankong", seat, key: aks[0] };
  }
  const jids = jiaKongTileIds(state, seat);
  if (jids.length && Math.random() < (difficulty === "easy" ? 0.5 : 0.75)) {
    return { type: "jiakong", seat, tileId: jids[0] };
  }

  const hand = state.seats[seat].hand;
  const pool = state.drawnTile ? [...hand, state.drawnTile] : [...hand];
  let best = pool[0];
  let bestScore = -1e9;
  for (const t of pool) {
    const score = discardScore(state, seat, pool, t, difficulty);
    if (score > bestScore) {
      bestScore = score;
      best = t;
    }
  }
  return { type: "discard", seat, tileId: best.id };
}

/**
 * Higher = prefer discard.
 * @param {import('./game.js').GameState} state
 * @param {number} seat
 * @param {{ key: string, id: number }[]} pool
 * @param {{ key: string, id: number }} tile
 * @param {string} difficulty
 */
function discardScore(state, seat, pool, tile, difficulty) {
  const left = pool.filter((t) => t.id !== tile.id);
  const shBefore = shantenEstimate(state.seats[seat].melds, pool);
  const shAfter = shantenEstimate(state.seats[seat].melds, left);
  let score = (shBefore - shAfter) * 6;
  score += isolationScore(
    pool.map((t) => t.key),
    tile.key,
  );
  if (isHonor(tile.key)) score += 1.2;
  const n = pool.filter((t) => t.key === tile.key).length;
  if (n >= 3) score -= 8;
  if (n === 2) score -= 4;
  if (isSuitTile(tile.key)) {
    const d = tileDef(tile.key);
    for (const off of [-2, -1, 1, 2]) {
      const k = `${d.suit}${d.rank + off}`;
      if (pool.some((t) => t.key === k)) score -= 1.2;
    }
  }
  // Mild defense: avoid recent discards of others when standard
  if (difficulty === "standard") {
    for (let s = 0; s < 4; s++) {
      if (s === seat) continue;
      const recent = state.seats[s].discards.slice(-6);
      if (recent.some((t) => t.key === tile.key)) score -= 0.8;
    }
  }
  return score + Math.random() * (difficulty === "easy" ? 0.8 : 0.15);
}

/**
 * Rough shanten: 0 = tenpai, higher = further. Melds already count.
 * @param {import('./game.js').Meld[]} melds
 * @param {{ key: string }[]} tiles
 */
export function shantenEstimate(melds, tiles) {
  const needSets = 5 - melds.length;
  if (needSets < 0) return 8;
  const keys = tiles.map((t) => t.key).sort();
  if (keys.length === needSets * 3 + 1) {
    // waiting shape length (16 tiles with 0 melds = 16 = 5*3+1)
    const waits = waitingKeys(melds, tiles.map((t, id) => ({ id, key: t.key })));
    if (waits.length) return 0;
  }
  if (keys.length === needSets * 3 + 2) {
    if (findWinningPartition(melds, tiles.map((t, id) => ({ id, key: t.key })))) {
      return -1;
    }
  }
  // Count pairs / pungs / chow-ish groups roughly
  const counts = new Map();
  for (const k of keys) counts.set(k, (counts.get(k) || 0) + 1);
  let sets = 0;
  let pairs = 0;
  const used = new Map(counts);
  for (const [k, n] of used) {
    if (n >= 3) {
      sets += 1;
      used.set(k, n - 3);
    }
  }
  for (const [k, n] of used) {
    if (n >= 2) {
      pairs += 1;
      used.set(k, n - 2);
    }
  }
  // loose chow potential
  for (const [k, n] of used) {
    if (n < 1 || !isSuitTile(k)) continue;
    const d = tileDef(k);
    const k2 = `${d.suit}${d.rank + 1}`;
    const k3 = `${d.suit}${d.rank + 2}`;
    if ((used.get(k2) || 0) > 0 && (used.get(k3) || 0) > 0) {
      sets += 1;
      used.set(k, n - 1);
      used.set(k2, (used.get(k2) || 0) - 1);
      used.set(k3, (used.get(k3) || 0) - 1);
    }
  }
  const have = sets + Math.min(1, pairs) * 0.5;
  return Math.max(0, needSets - sets) + (pairs ? 0 : 1);
}

/**
 * @param {string[]} keys
 * @param {string} key
 */
function isolationScore(keys, key) {
  const others = keys.filter((k) => k !== key);
  if (isHonor(key)) {
    return others.includes(key) ? 0 : 3;
  }
  if (!isSuitTile(key)) return 2;
  const d = tileDef(key);
  let near = 0;
  for (const off of [-2, -1, 1, 2]) {
    const r = d.rank + off;
    if (r < 1 || r > 9) continue;
    if (others.includes(`${d.suit}${r}`)) near++;
  }
  return 3 - near;
}
