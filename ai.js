/**
 * Heuristic AI for Taiwan mahjong (discard + claim).
 */

import {
  anKongKeys,
  canHuSelf,
  jiaKongTileIds,
  legalClaims,
} from "./game.js";
import { isHonor, isSuitTile, tileDef } from "./tiles.js";

/**
 * @param {import('./game.js').GameState} state
 * @param {number} seat
 * @returns {{ type: string, [k: string]: any } | null}
 */
export function chooseAiAction(state, seat) {
  if (state.phase === "claim" && state.claim) {
    return chooseClaim(state, seat);
  }
  if (state.phase === "playing" && state.turn === seat && state.mustDiscard) {
    return chooseDiscardTurn(state, seat);
  }
  return null;
}

/**
 * @param {import('./game.js').GameState} state
 * @param {number} seat
 */
function chooseClaim(state, seat) {
  if (seat === state.claim?.from) return null;
  if (state.claim?.passes[seat] || state.claim?.pending[seat]) return null;

  const opts = legalClaims(state, seat);
  if (!opts.length) {
    return { type: "pass_claim", seat };
  }
  if (opts.some((o) => o.kind === "hu")) {
    return { type: "hu_claim", seat };
  }
  // Kong / pong if we already have a pair / triple (shaped)
  if (opts.some((o) => o.kind === "kong")) {
    return { type: "claim", seat, intent: { kind: "kong" } };
  }
  if (opts.some((o) => o.kind === "pong")) {
    const key = state.claim.tile.key;
    const handKeys = state.seats[seat].hand.map((t) => t.key);
    const isolated = isolationScore(handKeys, key) > 2;
    if (!isolated || Math.random() < 0.55) {
      return { type: "claim", seat, intent: { kind: "pong" } };
    }
  }
  const chi = opts.find((o) => o.kind === "chi");
  if (chi?.chiOptions?.length && Math.random() < 0.35) {
    const pick = chi.chiOptions[0];
    return { type: "claim", seat, intent: { kind: "chi", chiTiles: pick } };
  }
  return { type: "pass_claim", seat };
}

/**
 * @param {import('./game.js').GameState} state
 * @param {number} seat
 */
function chooseDiscardTurn(state, seat) {
  if (canHuSelf(state, seat)) {
    return { type: "hu_self", seat };
  }
  const aks = anKongKeys(state, seat);
  if (aks.length) {
    return { type: "ankong", seat, key: aks[0] };
  }
  const jids = jiaKongTileIds(state, seat);
  if (jids.length && Math.random() < 0.7) {
    return { type: "jiakong", seat, tileId: jids[0] };
  }

  const hand = state.seats[seat].hand;
  let best = hand[0];
  let bestScore = -1e9;
  for (const t of hand) {
    const score = discardScore(hand, t);
    if (score > bestScore) {
      bestScore = score;
      best = t;
    }
  }
  return { type: "discard", seat, tileId: best.id };
}

/**
 * Higher = prefer discard.
 * @param {{ key: string }[]} hand
 * @param {{ key: string, id: number }} tile
 */
function discardScore(hand, tile) {
  const keys = hand.map((t) => t.key);
  let score = isolationScore(keys, tile.key);
  if (isHonor(tile.key)) score += 1.5;
  // keep pair/triplet
  const n = keys.filter((k) => k === tile.key).length;
  if (n >= 3) score -= 8;
  if (n === 2) score -= 4;
  // keep near chow
  if (isSuitTile(tile.key)) {
    const d = tileDef(tile.key);
    for (const off of [-2, -1, 1, 2]) {
      const k = `${d.suit}${d.rank + off}`;
      if (keys.includes(k)) score -= 1.2;
    }
  }
  return score + Math.random() * 0.2;
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
