/**
 * Taiwan 16-tile mahjong rules (configurable house rules).
 * Mutations go through applyAction.
 */

import {
  makeWall,
  isFlower,
  isSuitTile,
  sortTiles,
  tileDef,
  WIND_KEYS,
  WIND_LABELS,
} from "./tiles.js";
import { mergeRuleset } from "./ruleset.js";
import { findWinningPartition, waitingKeys } from "./partition.js";
import { scoreWin, buildPayments, seatWind } from "./score.js";
import { replaceAllFlowersPure } from "./flowers.js";

/**
 * @typedef {{ id: number, key: string }} Tile
 * @typedef {{ type: 'chi'|'pong'|'kong', tiles: Tile[], concealed: boolean }} Meld
 * @typedef {{
 *   hand: Tile[],
 *   melds: Meld[],
 *   flowers: Tile[],
 *   discards: Tile[],
 * }} Seat
 * @typedef {{
 *   phase: 'idle'|'playing'|'claim'|'ended',
 *   ruleset: import('./ruleset.js').Ruleset,
 *   wall: Tile[],
 *   deadWall: Tile[],
 *   seats: Seat[],
 *   dealer: number,
 *   roundWind: number,
 *   turn: number,
 *   mustDiscard: boolean,
 *   drawnTile: Tile | null,
 *   lastDiscard: { tile: Tile, from: number } | null,
 *   claim: null | {
 *     tile: Tile,
 *     from: number,
 *     mode: 'discard'|'rob_kong',
 *     passes: boolean[],
 *     pending: (null | ClaimIntent)[],
 *   },
 *   guoShui: boolean[],
 *   lastDrawKind: 'normal'|'kong'|'flower'|null,
 *   liveBeforeDraw: number,
 *   scores: number[],
 *   dealerStreak: number,
 *   result: null | WinResult | { kind: 'draw' },
 *   message: string,
 *   lastError: string | null,
 * }} GameState
 * @typedef {{ kind: 'hu'|'kong'|'pong'|'chi', chiTiles?: Tile[] }} ClaimIntent
 * @typedef {{
 *   kind: 'win',
 *   winner: number,
 *   from: number | null,
 *   selfDraw: boolean,
 *   tai: number,
 *   details: string[],
 *   points: number,
 *   payments: number[],
 * }} WinResult
 */

export const PLAYER = 0;
export { seatWind, findWinningPartition, waitingKeys };
export { WIND_KEYS };

/** @returns {GameState} */
export function createInitialState(rulesetPartial = {}) {
  return {
    phase: "idle",
    ruleset: mergeRuleset(rulesetPartial),
    wall: [],
    deadWall: [],
    seats: emptySeats(),
    dealer: 0,
    roundWind: 0,
    turn: 0,
    mustDiscard: false,
    drawnTile: null,
    lastDiscard: null,
    claim: null,
    guoShui: [false, false, false, false],
    lastDrawKind: null,
    liveBeforeDraw: 0,
    scores: [0, 0, 0, 0],
    dealerStreak: 0,
    result: null,
    message: "點「開局」開始。十六張台灣麻將。",
    lastError: null,
  };
}

function emptySeats() {
  return [0, 1, 2, 3].map(() => ({
    hand: /** @type {Tile[]} */ ([]),
    melds: /** @type {Meld[]} */ ([]),
    flowers: /** @type {Tile[]} */ ([]),
    discards: /** @type {Tile[]} */ ([]),
  }));
}

/**
 * @param {GameState} state
 * @param {number} seat
 */
export function seatWindLabel(state, seat) {
  return WIND_LABELS[seatWind(state, seat)];
}

/**
 * @param {GameState} state
 * @param {number} seat
 * @returns {Tile[]}
 */
export function concealedTiles(state, seat) {
  const hand = state.seats[seat].hand;
  if (seat === state.turn && state.drawnTile) {
    return [...hand, state.drawnTile];
  }
  return hand;
}

/**
 * @param {GameState} state
 * @param {{ type: string, [k: string]: any }} action
 * @returns {GameState}
 */
export function applyAction(state, action) {
  switch (action.type) {
    case "set_ruleset":
      if (state.phase !== "idle") return state;
      return {
        ...state,
        ruleset: mergeRuleset({ ...state.ruleset, ...action.ruleset }),
        message: "家規已更新。",
        lastError: null,
      };
    case "deal":
      return deal(state);
    case "discard":
      return discard(state, action.seat, action.tileId);
    case "pass_claim":
      return passClaim(state, action.seat);
    case "claim":
      return submitClaim(state, action.seat, action.intent);
    case "ankong":
      return anKong(state, action.seat, action.key);
    case "jiakong":
      return jiaKong(state, action.seat, action.tileId);
    case "hu_self":
      return trySelfDrawHu(state, action.seat);
    case "hu_claim":
      return submitClaim(state, action.seat, { kind: "hu" });
    case "flower_hu":
      return tryFlowerHu(state, action.seat);
    default:
      return state;
  }
}

/**
 * @param {GameState} state
 */
function deal(state) {
  if (state.phase !== "idle") {
    return { ...state, lastError: "請先結束目前結果再開局。" };
  }
  const full = shuffle(makeWall());
  const seats = emptySeats();
  for (let r = 0; r < 16; r++) {
    for (let s = 0; s < 4; s++) {
      const t = full.pop();
      if (t) seats[s].hand.push(t);
    }
  }
  for (const seat of seats) seat.hand = sortTiles(seat.hand);

  const deadSize = Math.min(state.ruleset.deadWallSize, full.length);
  const deadWall = full.splice(0, deadSize);
  const wall = full;

  /** @type {GameState} */
  let next = {
    ...state,
    phase: "playing",
    wall,
    deadWall,
    seats,
    turn: state.dealer,
    mustDiscard: false,
    drawnTile: null,
    lastDiscard: null,
    claim: null,
    guoShui: [false, false, false, false],
    lastDrawKind: null,
    liveBeforeDraw: wall.length,
    result: null,
    message: "補花中…",
    lastError: null,
  };
  next = replaceAllFlowersPure(next, takeSupplement);
  next = drawForTurn(next, "normal");
  if (next.phase === "ended") return next;
  next.message = `${seatWindLabel(next, next.turn)}家摸牌，請打牌。`;
  return next;
}

/**
 * Draw supplement for flower/kong from dead wall (fallback to live if empty).
 * @param {GameState} state
 */
function takeSupplement(state) {
  const deadWall = [...state.deadWall];
  const wall = [...state.wall];
  let tile = null;
  if (deadWall.length) tile = deadWall.pop() || null;
  else if (wall.length) tile = wall.pop() || null;
  return { tile, deadWall, wall };
}

/**
 * Normal draw from live wall.
 * @param {GameState} state
 */
function takeLive(state) {
  const wall = [...state.wall];
  const tile = wall.length ? wall.pop() || null : null;
  return { tile, wall, deadWall: state.deadWall };
}

/**
 * @param {GameState} state
 * @param {'normal'|'kong'|'flower'} kind
 */
function drawForTurn(state, kind = "normal") {
  const liveBefore = state.wall.length;
  if (kind === "normal" && !state.wall.length) {
    return endDraw(state);
  }

  let tile = null;
  let wall = state.wall;
  let deadWall = state.deadWall;

  if (kind === "normal") {
    const got = takeLive(state);
    tile = got.tile;
    wall = got.wall;
  } else {
    const got = takeSupplement(state);
    tile = got.tile;
    wall = got.wall;
    deadWall = got.deadWall;
    if (!tile) {
      // Kong declared but no tile to replace — end as draw after kong formed
      return endDraw({ ...state, wall, deadWall });
    }
  }

  if (!tile) return endDraw({ ...state, wall, deadWall });

  const flowers = [...state.seats[state.turn].flowers];
  let drawKind = kind;
  while (tile && isFlower(tile.key)) {
    flowers.push(tile);
    drawKind = "flower";
    const more = takeSupplement({ ...state, wall, deadWall });
    wall = more.wall;
    deadWall = more.deadWall;
    tile = more.tile;
    if (!tile) {
      // Flower exposed, no replacement — discard from existing hand
      const seats = state.seats.map((seat, i) =>
        i === state.turn ? { ...seat, flowers } : seat,
      );
      return {
        ...state,
        wall,
        deadWall,
        seats,
        mustDiscard: true,
        drawnTile: null,
        lastDrawKind: "flower",
        liveBeforeDraw: liveBefore,
        message: `${seatWindLabel(state, state.turn)}家補花（無牌可補）`,
      };
    }
  }

  // 七搶一 check when someone else might steal — handled when flower is first exposed mid-game
  const seats = state.seats.map((seat, i) =>
    i === state.turn ? { ...seat, flowers } : seat,
  );

  let next = {
    ...state,
    wall,
    deadWall,
    seats,
    mustDiscard: true,
    drawnTile: tile,
    lastDrawKind: drawKind,
    liveBeforeDraw: liveBefore,
  };

  // 八仙過海: 8 flowers after replacements
  if (
    state.ruleset.baXian &&
    seats[state.turn].flowers.length >= 8
  ) {
    return declareWin(next, state.turn, null, true, { baXian: true });
  }

  return next;
}

/**
 * Mid-game: when a seat exposes a new flower, others with 7 may 七搶一.
 * Called from draw flower path — for simplicity check after flowers update in drawForTurn.
 * Full 七搶一: when seat B draws a flower and A has 7, A can claim. Implemented in claim after flower draw via dedicated check in app — engine helper:
 */

/**
 * @param {GameState} state
 * @param {number} seat
 * @param {number} tileId
 */
function discard(state, seat, tileId) {
  if (state.phase !== "playing") {
    return { ...state, lastError: "現在不能打牌。" };
  }
  if (state.turn !== seat || !state.mustDiscard) {
    return { ...state, lastError: "還沒輪到你打牌。" };
  }

  const drawn = state.drawnTile;
  const fromDrawn = drawn && drawn.id === tileId;
  const fromHand = state.seats[seat].hand.find((t) => t.id === tileId);
  const tile = fromDrawn ? drawn : fromHand;
  if (!tile) {
    return { ...state, lastError: "請先選一張牌。" };
  }
  if (isFlower(tile.key)) {
    return { ...state, lastError: "花牌不能打出。" };
  }

  /** @type {Tile[]} */
  let hand;
  if (fromDrawn) {
    hand = state.seats[seat].hand;
  } else {
    hand = state.seats[seat].hand.filter((t) => t.id !== tileId);
    if (drawn) {
      if (isFlower(drawn.key)) {
        // safety: never fold flower into hand
        return {
          ...state,
          lastError: "尚有未補完的花牌狀態異常。",
        };
      }
      hand = sortTiles([...hand, drawn]);
    }
  }

  // 過水 clear on 過手: discard after drawing a non-winning tile
  let guoShui = [...state.guoShui];
  if (guoShui[seat] && drawn && !isFlower(drawn.key)) {
    const withDraw = sortTiles([...state.seats[seat].hand, drawn]);
    const drawWasWin = Boolean(
      findWinningPartition(state.seats[seat].melds, withDraw),
    );
    if (!drawWasWin) guoShui[seat] = false;
  } else if (guoShui[seat] && !drawn) {
    // discard-only turn (after pung/chi) — treat as 過手
    guoShui[seat] = false;
  }

  const seats = state.seats.map((s, i) =>
    i === seat
      ? { ...s, hand: sortTiles(hand), discards: [...s.discards, tile] }
      : s,
  );

  /** @type {GameState} */
  let next = {
    ...state,
    seats,
    mustDiscard: false,
    drawnTile: null,
    lastDiscard: { tile, from: seat },
    phase: "claim",
    claim: {
      tile,
      from: seat,
      mode: "discard",
      passes: [false, false, false, false],
      pending: [null, null, null, null],
    },
    guoShui,
    message: `${seatWindLabel(state, seat)}家打出 ${tileDef(tile.key).label}`,
    lastError: null,
  };
  next.claim.passes[seat] = true;
  return resolveClaimsIfReady(next);
}

/**
 * @param {GameState} state
 * @param {number} seat
 * @param {ClaimIntent} intent
 */
function submitClaim(state, seat, intent) {
  if (state.phase !== "claim" || !state.claim) return state;
  if (seat === state.claim.from) return state;
  if (state.claim.passes[seat] || state.claim.pending[seat]) return state;

  if (state.claim.mode === "rob_kong") {
    if (intent.kind !== "hu") return state;
    if (!canHuOnRobKong(state, seat)) return state;
  } else if (intent.kind === "hu") {
    if (!canHuOnDiscard(state, seat)) return state;
  } else if (intent.kind === "pong") {
    if (!canPong(state, seat)) return state;
  } else if (intent.kind === "kong") {
    if (!canMingKong(state, seat)) return state;
  } else if (intent.kind === "chi") {
    if (!canChi(state, seat) || !intent.chiTiles?.length) return state;
    if (!isValidChi(state, seat, intent.chiTiles)) return state;
  } else return state;

  const pending = [...state.claim.pending];
  pending[seat] = intent;
  const next = { ...state, claim: { ...state.claim, pending }, lastError: null };
  return resolveClaimsIfReady(next);
}

/**
 * @param {GameState} state
 * @param {number} seat
 */
function passClaim(state, seat) {
  if (state.phase !== "claim" || !state.claim) return state;
  if (seat === state.claim.from) return state;

  // 過水: had hu and passed
  let guoShui = [...state.guoShui];
  if (state.claim.mode === "discard") {
    const t = state.claim.tile;
    const hand = sortTiles([...state.seats[seat].hand, t]);
    if (findWinningPartition(state.seats[seat].melds, hand)) {
      guoShui[seat] = true;
    }
  }

  const passes = [...state.claim.passes];
  passes[seat] = true;
  const next = {
    ...state,
    guoShui,
    claim: { ...state.claim, passes },
    lastError: null,
  };
  return resolveClaimsIfReady(next);
}

/**
 * @param {GameState} state
 */
function resolveClaimsIfReady(state) {
  const claim = state.claim;
  if (!claim) return state;

  const passes = [...claim.passes];
  const pending = [...claim.pending];
  for (let s = 0; s < 4; s++) {
    if (s === claim.from || passes[s] || pending[s]) continue;
    const options = legalClaims(state, s);
    if (!options.length) passes[s] = true;
  }

  const answered = [0, 1, 2, 3].every(
    (s) => s === claim.from || passes[s] || pending[s],
  );
  if (!answered) {
    return { ...state, claim: { ...claim, passes, pending } };
  }

  /** @type {{ seat: number, intent: ClaimIntent, rank: number }[]} */
  const bids = [];
  for (let s = 0; s < 4; s++) {
    const intent = pending[s];
    if (!intent) continue;
    bids.push({
      seat: s,
      intent,
      rank: claimRank(intent.kind, state.ruleset),
    });
  }

  if (!bids.length) {
    if (claim.mode === "rob_kong") {
      return finishJiaKongSupplement(state);
    }
    return advanceAfterPass(state);
  }

  bids.sort((a, b) => {
    if (b.rank !== a.rank) return b.rank - a.rank;
    const da = (a.seat - claim.from + 4) % 4;
    const db = (b.seat - claim.from + 4) % 4;
    return da - db;
  });

  if (!state.ruleset.multiHu) {
    const win = bids[0];
    if (win.intent.kind === "hu") {
      const lastDiscardWin =
        claim.mode === "discard" && state.wall.length === 0;
      return declareWin(state, win.seat, claim.from, false, {
        robKong: claim.mode === "rob_kong",
        lastDiscardWin,
        winKey: claim.tile.key,
      });
    }
    if (win.intent.kind === "kong") return takeMingKong(state, win.seat);
    if (win.intent.kind === "pong") return takePong(state, win.seat);
    if (win.intent.kind === "chi") {
      return takeChi(state, win.seat, win.intent.chiTiles || []);
    }
  }

  return advanceAfterPass(state);
}

function claimRank(kind, ruleset) {
  if (kind === "hu") return 3;
  if (kind === "kong") return ruleset.kongBeatsPong ? 2.5 : 2;
  if (kind === "pong") return 2;
  if (kind === "chi") return 1;
  return 0;
}

/**
 * @param {GameState} state
 */
function advanceAfterPass(state) {
  const nextTurn = (state.lastDiscard.from + 1) % 4;
  let next = {
    ...state,
    phase: "playing",
    claim: null,
    turn: nextTurn,
    mustDiscard: false,
    message: `${seatWindLabel(state, nextTurn)}家摸牌`,
  };
  next = drawForTurn(next, "normal");
  return next;
}

/**
 * @param {GameState} state
 * @param {number} seat
 */
function takePong(state, seat) {
  const claim = state.claim;
  if (!claim) return state;
  const key = claim.tile.key;
  const hand = [...state.seats[seat].hand];
  const used = takeN(hand, key, 2);
  if (!used) return advanceAfterPass(state);
  const meld = {
    type: /** @type {const} */ ("pong"),
    tiles: [...used, claim.tile],
    concealed: false,
  };
  const seats = state.seats.map((s, i) => {
    if (i === seat) {
      return { ...s, hand: sortTiles(hand), melds: [...s.melds, meld] };
    }
    if (i === claim.from) {
      return { ...s, discards: s.discards.filter((t) => t.id !== claim.tile.id) };
    }
    return s;
  });
  return {
    ...state,
    seats,
    phase: "playing",
    claim: null,
    lastDiscard: null,
    turn: seat,
    mustDiscard: true,
    drawnTile: null,
    lastDrawKind: null,
    message: `${seatWindLabel(state, seat)}家碰`,
  };
}

/**
 * @param {GameState} state
 * @param {number} seat
 */
function takeMingKong(state, seat) {
  const claim = state.claim;
  if (!claim) return state;
  const key = claim.tile.key;
  const hand = [...state.seats[seat].hand];
  const used = takeN(hand, key, 3);
  if (!used) return advanceAfterPass(state);
  const meld = {
    type: /** @type {const} */ ("kong"),
    tiles: [...used, claim.tile],
    concealed: false,
  };
  const seats = state.seats.map((s, i) => {
    if (i === seat) {
      return { ...s, hand: sortTiles(hand), melds: [...s.melds, meld] };
    }
    if (i === claim.from) {
      return { ...s, discards: s.discards.filter((t) => t.id !== claim.tile.id) };
    }
    return s;
  });
  let next = {
    ...state,
    seats,
    phase: "playing",
    claim: null,
    lastDiscard: null,
    turn: seat,
    mustDiscard: false,
    message: `${seatWindLabel(state, seat)}家槓，補牌`,
  };
  next = drawForTurn(next, "kong");
  return next;
}

/**
 * @param {GameState} state
 * @param {number} seat
 * @param {Tile[]} chiTiles
 */
function takeChi(state, seat, chiTiles) {
  const claim = state.claim;
  if (!claim) return state;
  if ((claim.from + 1) % 4 !== seat) return advanceAfterPass(state);
  const hand = [...state.seats[seat].hand];
  for (const ct of chiTiles) {
    const idx = hand.findIndex((t) => t.id === ct.id);
    if (idx < 0) return advanceAfterPass(state);
    hand.splice(idx, 1);
  }
  const meld = {
    type: /** @type {const} */ ("chi"),
    tiles: sortTiles([...chiTiles, claim.tile]),
    concealed: false,
  };
  const seats = state.seats.map((s, i) => {
    if (i === seat) {
      return { ...s, hand: sortTiles(hand), melds: [...s.melds, meld] };
    }
    if (i === claim.from) {
      return { ...s, discards: s.discards.filter((t) => t.id !== claim.tile.id) };
    }
    return s;
  });
  return {
    ...state,
    seats,
    phase: "playing",
    claim: null,
    lastDiscard: null,
    turn: seat,
    mustDiscard: true,
    drawnTile: null,
    message: `${seatWindLabel(state, seat)}家吃`,
  };
}

/**
 * @param {GameState} state
 * @param {number} seat
 * @param {string} key
 */
function anKong(state, seat, key) {
  if (state.phase !== "playing" || state.turn !== seat || !state.mustDiscard) {
    return state;
  }
  const pool = [...concealedTiles(state, seat)];
  const used = takeN(pool, key, 4);
  if (!used) return state;
  const usedIds = new Set(used.map((t) => t.id));
  const hand = state.seats[seat].hand.filter((t) => !usedIds.has(t.id));
  const drawnKept =
    state.drawnTile && !usedIds.has(state.drawnTile.id)
      ? state.drawnTile
      : null;
  const merged = drawnKept ? sortTiles([...hand, drawnKept]) : sortTiles(hand);
  const meld = {
    type: /** @type {const} */ ("kong"),
    tiles: used,
    concealed: true,
  };
  const seats = state.seats.map((s, i) =>
    i === seat ? { ...s, hand: merged, melds: [...s.melds, meld] } : s,
  );
  let next = {
    ...state,
    seats,
    drawnTile: null,
    mustDiscard: false,
    message: `${seatWindLabel(state, seat)}家暗槓，補牌`,
    lastError: null,
  };
  next = drawForTurn(next, "kong");
  return next;
}

/**
 * @param {GameState} state
 * @param {number} seat
 * @param {number} tileId
 */
function jiaKong(state, seat, tileId) {
  if (state.phase !== "playing" || state.turn !== seat || !state.mustDiscard) {
    return state;
  }
  const fromDrawn = state.drawnTile?.id === tileId;
  const tile = fromDrawn
    ? state.drawnTile
    : state.seats[seat].hand.find((t) => t.id === tileId);
  if (!tile) return state;
  const meldIdx = state.seats[seat].melds.findIndex(
    (m) => m.type === "pong" && m.tiles[0].key === tile.key,
  );
  if (meldIdx < 0) return state;

  let hand = fromDrawn
    ? [...state.seats[seat].hand]
    : state.seats[seat].hand.filter((t) => t.id !== tileId);
  if (!fromDrawn && state.drawnTile) {
    if (isFlower(state.drawnTile.key)) return state;
    hand = sortTiles([...hand, state.drawnTile]);
  }
  const melds = state.seats[seat].melds.map((m, i) =>
    i === meldIdx
      ? {
          type: /** @type {const} */ ("kong"),
          tiles: [...m.tiles, tile],
          concealed: false,
        }
      : m,
  );
  const seats = state.seats.map((s, i) =>
    i === seat ? { ...s, hand: sortTiles(hand), melds } : s,
  );

  let guoShui = [...state.guoShui];
  if (state.ruleset.guoShuiJiaKongClears) guoShui[seat] = false;

  /** @type {GameState} */
  let next = {
    ...state,
    seats,
    drawnTile: null,
    mustDiscard: false,
    guoShui,
    message: `${seatWindLabel(state, seat)}家加槓`,
    lastError: null,
  };

  if (state.ruleset.allowRobKong) {
    next = {
      ...next,
      phase: "claim",
      claim: {
        tile,
        from: seat,
        mode: "rob_kong",
        passes: [false, false, false, false],
        pending: [null, null, null, null],
      },
      lastDiscard: { tile, from: seat },
    };
    next.claim.passes[seat] = true;
    return resolveClaimsIfReady(next);
  }

  return finishJiaKongSupplement(next);
}

/**
 * @param {GameState} state
 */
function finishJiaKongSupplement(state) {
  let next = {
    ...state,
    phase: "playing",
    claim: null,
    turn: state.claim?.from ?? state.turn,
    mustDiscard: false,
    message: `${seatWindLabel(state, state.claim?.from ?? state.turn)}家加槓，補牌`,
  };
  next = drawForTurn(next, "kong");
  return next;
}

/**
 * @param {GameState} state
 * @param {number} winner
 * @param {number | null} from
 * @param {boolean} selfDraw
 * @param {object} [meta]
 */
export function declareWin(state, winner, from, selfDraw, meta = {}) {
  const winTile = selfDraw
    ? state.drawnTile
    : state.claim?.tile || state.lastDiscard?.tile || null;
  const hand = selfDraw
    ? concealedTiles(state, winner)
    : sortTiles(
        [...state.seats[winner].hand, winTile].filter(Boolean),
      );

  const winMeta = {
    ...meta,
    winKey: winTile?.key,
    fromKong: selfDraw && state.lastDrawKind === "kong",
    fromFlower: selfDraw && state.lastDrawKind === "flower",
    lastDrawWin: selfDraw && state.liveBeforeDraw === 1,
  };

  const scored = scoreWin(state, winner, hand, selfDraw, winMeta);
  if (!scored) {
    if (!selfDraw && state.phase === "claim") {
      return passClaim(state, winner);
    }
    return { ...state, lastError: "未達起胡台數或牌型不正確。" };
  }

  const payments = buildPayments(
    state,
    winner,
    from,
    selfDraw,
    scored,
    meta,
  );
  const scores = state.scores.map((v, i) => v + payments[i]);

  let dealer = state.dealer;
  let dealerStreak = state.dealerStreak;
  let roundWind = state.roundWind;
  if (winner === state.dealer) {
    dealerStreak += 1;
  } else {
    dealer = (state.dealer + 1) % 4;
    dealerStreak = 0;
    if (dealer === 0) {
      roundWind = (roundWind + 1) % 4;
    }
  }

  /** @type {WinResult} */
  const result = {
    kind: "win",
    winner,
    from,
    selfDraw: selfDraw || Boolean(meta.baXian),
    tai: scored.tai,
    details: scored.details,
    points: scored.points,
    payments,
  };

  return {
    ...state,
    phase: "ended",
    claim: null,
    mustDiscard: false,
    drawnTile: null,
    scores,
    dealer,
    dealerStreak,
    roundWind,
    result,
    message: `${seatWindLabel(state, winner)}家胡了！${scored.tai} 台`,
    lastError: null,
  };
}

/**
 * @param {GameState} state
 * @param {number} seat
 */
export function trySelfDrawHu(state, seat) {
  if (state.phase !== "playing" || state.turn !== seat || !state.mustDiscard) {
    return state;
  }
  if (state.guoShui[seat]) {
    return { ...state, lastError: "過水中，不能胡。" };
  }
  if (!canHuSelf(state, seat)) return state;
  return declareWin(state, seat, null, true, {});
}

/**
 * @param {GameState} state
 * @param {number} seat
 */
function tryFlowerHu(state, seat) {
  if (!state.ruleset.baXian) return state;
  if (state.seats[seat].flowers.length < 8) return state;
  if (state.phase !== "playing" || state.turn !== seat) return state;
  return declareWin(state, seat, null, true, { baXian: true });
}

/**
 * @param {GameState} state
 */
function endDraw(state) {
  let dealer = state.dealer;
  let dealerStreak = state.dealerStreak;
  let roundWind = state.roundWind;
  if (state.ruleset.keepDealerOnDraw) {
    dealerStreak += 1;
  } else {
    dealer = (state.dealer + 1) % 4;
    dealerStreak = 0;
    if (dealer === 0) roundWind = (roundWind + 1) % 4;
  }
  return {
    ...state,
    phase: "ended",
    result: { kind: "draw" },
    mustDiscard: false,
    drawnTile: null,
    claim: null,
    message: "流局（臭莊）",
    dealer,
    dealerStreak,
    roundWind,
    lastError: null,
  };
}

/* ─── Legality ─── */

/**
 * @param {GameState} state
 * @param {number} seat
 */
export function legalClaims(state, seat) {
  if (state.phase !== "claim" || !state.claim || seat === state.claim.from) {
    return [];
  }
  /** @type {{ kind: string, chiOptions?: Tile[][] }[]} */
  const opts = [];
  if (state.claim.mode === "rob_kong") {
    if (canHuOnRobKong(state, seat)) opts.push({ kind: "hu" });
    return opts;
  }
  if (canHuOnDiscard(state, seat)) opts.push({ kind: "hu" });
  if (canMingKong(state, seat)) opts.push({ kind: "kong" });
  if (canPong(state, seat)) opts.push({ kind: "pong" });
  if (canChi(state, seat)) {
    const chiOptions = listChiOptions(state, seat);
    if (chiOptions.length) opts.push({ kind: "chi", chiOptions });
  }
  return opts;
}

/**
 * @param {GameState} state
 * @param {number} seat
 */
export function canPong(state, seat) {
  const t = state.claim?.tile;
  if (!t || isFlower(t.key)) return false;
  return countKey(state.seats[seat].hand, t.key) >= 2;
}

/**
 * @param {GameState} state
 * @param {number} seat
 */
export function canMingKong(state, seat) {
  const t = state.claim?.tile;
  if (!t || isFlower(t.key)) return false;
  return countKey(state.seats[seat].hand, t.key) >= 3;
}

/**
 * @param {GameState} state
 * @param {number} seat
 */
export function canChi(state, seat) {
  if (!state.claim || state.claim.mode !== "discard") return false;
  if ((state.claim.from + 1) % 4 !== seat) return false;
  return listChiOptions(state, seat).length > 0;
}

/**
 * @param {GameState} state
 * @param {number} seat
 */
export function listChiOptions(state, seat) {
  const t = state.claim?.tile;
  if (!t || !isSuitTile(t.key)) return [];
  const d = tileDef(t.key);
  const hand = state.seats[seat].hand;
  /** @type {Tile[][]} */
  const options = [];
  const needPairs = [
    [d.rank - 2, d.rank - 1],
    [d.rank - 1, d.rank + 1],
    [d.rank + 1, d.rank + 2],
  ];
  for (const [a, b] of needPairs) {
    if (a < 1 || b > 9) continue;
    const ka = `${d.suit}${a}`;
    const kb = `${d.suit}${b}`;
    const ta = hand.find((x) => x.key === ka);
    const tb = hand.find((x) => x.key === kb && x.id !== ta?.id);
    if (ta && tb) options.push([ta, tb]);
  }
  return options;
}

/**
 * @param {GameState} state
 * @param {number} seat
 * @param {Tile[]} chiTiles
 */
function isValidChi(state, seat, chiTiles) {
  const opts = listChiOptions(state, seat);
  const ids = new Set(chiTiles.map((t) => t.id));
  return opts.some(
    (o) => o.length === 2 && o.every((t) => ids.has(t.id)) && ids.size === 2,
  );
}

/**
 * @param {GameState} state
 * @param {number} seat
 */
export function canHuOnDiscard(state, seat) {
  if (state.guoShui[seat]) return false;
  const t = state.claim?.tile;
  if (!t) return false;
  const hand = sortTiles([...state.seats[seat].hand, t]);
  if (!findWinningPartition(state.seats[seat].melds, hand)) return false;
  const scored = scoreWin(state, seat, hand, false, {
    winKey: t.key,
    lastDiscardWin: state.wall.length === 0,
  });
  return Boolean(scored);
}

/**
 * @param {GameState} state
 * @param {number} seat
 */
export function canHuOnRobKong(state, seat) {
  if (state.guoShui[seat]) return false;
  const t = state.claim?.tile;
  if (!t) return false;
  const hand = sortTiles([...state.seats[seat].hand, t]);
  if (!findWinningPartition(state.seats[seat].melds, hand)) return false;
  const scored = scoreWin(state, seat, hand, false, {
    robKong: true,
    winKey: t.key,
  });
  return Boolean(scored);
}

/**
 * @param {GameState} state
 * @param {number} seat
 */
export function canHuSelf(state, seat) {
  if (state.guoShui[seat]) return false;
  const hand = concealedTiles(state, seat);
  if (!findWinningPartition(state.seats[seat].melds, hand)) return false;
  const scored = scoreWin(state, seat, hand, true, {
    fromKong: state.lastDrawKind === "kong",
    fromFlower: state.lastDrawKind === "flower",
    lastDrawWin: state.liveBeforeDraw === 1,
    winKey: state.drawnTile?.key,
  });
  return Boolean(scored);
}

/**
 * @param {GameState} state
 * @param {number} seat
 */
export function anKongKeys(state, seat) {
  /** @type {string[]} */
  const keys = [];
  const counts = countMap(concealedTiles(state, seat));
  for (const [k, n] of counts) {
    if (n >= 4 && !isFlower(k)) keys.push(k);
  }
  return keys;
}

/**
 * @param {GameState} state
 * @param {number} seat
 */
export function jiaKongTileIds(state, seat) {
  /** @type {number[]} */
  const ids = [];
  for (const t of concealedTiles(state, seat)) {
    if (
      state.seats[seat].melds.some(
        (m) => m.type === "pong" && m.tiles[0].key === t.key,
      )
    ) {
      ids.push(t.id);
    }
  }
  return ids;
}

/**
 * Live wall remaining (for UI).
 * @param {GameState} state
 */
export function liveWallCount(state) {
  return state.wall.length;
}

/* ─── Utils ─── */

/**
 * @template T
 * @param {T[]} arr
 */
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * @param {Tile[]} hand
 * @param {string} key
 */
function countKey(hand, key) {
  return hand.reduce((n, t) => n + (t.key === key ? 1 : 0), 0);
}

/**
 * @param {Tile[]} hand
 */
function countMap(hand) {
  /** @type {Map<string, number>} */
  const m = new Map();
  for (const t of hand) m.set(t.key, (m.get(t.key) || 0) + 1);
  return m;
}

/**
 * @param {Tile[]} hand
 * @param {string} key
 * @param {number} n
 */
function takeN(hand, key, n) {
  /** @type {Tile[]} */
  const taken = [];
  for (let i = hand.length - 1; i >= 0 && taken.length < n; i--) {
    if (hand[i].key === key) {
      taken.push(hand[i]);
      hand.splice(i, 1);
    }
  }
  if (taken.length < n) {
    hand.push(...taken);
    return null;
  }
  return taken;
}
