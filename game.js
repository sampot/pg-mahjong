/**
 * Taiwan 16-tile mahjong rules (simplified scoring).
 * All mutations go through applyAction for future mahjong.v1 Invite.
 */

import {
  makeWall,
  isFlower,
  isHonor,
  isSuitTile,
  sortTiles,
  tileDef,
  WIND_KEYS,
  WIND_LABELS,
} from "./tiles.js";

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
 *   wall: Tile[],
 *   seats: Seat[],
 *   dealer: number,
 *   roundWind: number,
 *   turn: number,
 *   mustDiscard: boolean,
 *   drawnTile: Tile | null,
 *   lastDiscard: { tile: Tile, from: number } | null,
 *   claim: null | {
 *     tile: Tile,
 *  from: number,
 *     passes: boolean[],
 *     pending: (null | ClaimIntent)[],
 *   },
 *   scores: number[],
 *   dealerStreak: number,
 *   result: null | WinResult | { kind: 'draw' },
 *   message: string,
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
export const BASE_POINTS = 1;

/** @returns {GameState} */
export function createInitialState() {
  return {
    phase: "idle",
    wall: [],
    seats: emptySeats(),
    dealer: 0,
    roundWind: 0,
    turn: 0,
    mustDiscard: false,
    drawnTile: null,
    lastDiscard: null,
    claim: null,
    scores: [0, 0, 0, 0],
    dealerStreak: 0,
    result: null,
    message: "點「開局」開始。十六張台規簡化版。",
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
 * Seat wind index 0=東… for seat relative to dealer.
 * @param {GameState} state
 * @param {number} seat
 */
export function seatWind(state, seat) {
  return (seat - state.dealer + 4) % 4;
}

/**
 * @param {GameState} state
 * @param {number} seat
 */
export function seatWindLabel(state, seat) {
  return WIND_LABELS[seatWind(state, seat)];
}

/**
 * Concealed tiles for a seat (hand + separate drawn tile when it is their turn).
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
    default:
      return state;
  }
}

/**
 * @param {GameState} state
 */
function deal(state) {
  if (state.phase === "playing" || state.phase === "claim") return state;
  const wall = shuffle(makeWall());
  const seats = emptySeats();
  for (let r = 0; r < 16; r++) {
    for (let s = 0; s < 4; s++) {
      const t = wall.pop();
      if (t) seats[s].hand.push(t);
    }
  }
  for (const seat of seats) seat.hand = sortTiles(seat.hand);

  /** @type {GameState} */
  let next = {
    ...state,
    phase: "playing",
    wall,
    seats,
    turn: state.dealer,
    mustDiscard: false,
    drawnTile: null,
    lastDiscard: null,
    claim: null,
    result: null,
    message: "補花中…",
  };
  next = replaceAllFlowers(next);
  next = drawForTurn(next);
  next.message = `${seatWindLabel(next, next.turn)}家摸牌，請打牌。`;
  return next;
}

/**
 * @param {GameState} state
 */
function replaceAllFlowers(state) {
  let s = state;
  let guard = 0;
  while (guard++ < 80) {
    let any = false;
    for (let i = 0; i < 4; i++) {
      const flower = s.seats[i].hand.find((t) => isFlower(t.key));
      if (!flower) continue;
      any = true;
      if (!s.wall.length) {
        // no replacement — move flower out and leave short hand
        const seats = s.seats.map((seat, idx) =>
          idx === i
            ? {
                ...seat,
                hand: seat.hand.filter((t) => t.id !== flower.id),
                flowers: [...seat.flowers, flower],
              }
            : seat,
        );
        s = { ...s, seats };
        continue;
      }
      const wall = [...s.wall];
      const hand = s.seats[i].hand.filter((t) => t.id !== flower.id);
      const flowers = [...s.seats[i].flowers, flower];
      let repl = null;
      while (wall.length) {
        const t = wall.pop();
        if (!t) break;
        if (isFlower(t.key)) {
          flowers.push(t);
          continue;
        }
        repl = t;
        break;
      }
      const seats = s.seats.map((seat, idx) =>
        idx === i
          ? {
              ...seat,
              hand: sortTiles(repl ? [...hand, repl] : hand),
              flowers,
            }
          : seat,
      );
      s = { ...s, wall, seats };
    }
    if (!any) break;
  }
  return s;
}

/**
 * After draw, auto-set aside flowers and draw replacements.
 * @param {GameState} state
 */
function drawForTurn(state) {
  if (!state.wall.length) {
    return endDraw(state);
  }
  let s = { ...state };
  /** @type {Tile | null} */
  let drawn = s.wall.pop() || null;
  if (!drawn) return endDraw(s);

  // Keep drawn tile out of the sorted hand; only flower-replace the draw.
  const flowers = [...s.seats[s.turn].flowers];
  const wall = [...s.wall];
  while (drawn && isFlower(drawn.key) && wall.length) {
    flowers.push(drawn);
    let repl = null;
    while (wall.length) {
      const t = wall.pop();
      if (!t) break;
      if (isFlower(t.key)) {
        flowers.push(t);
        continue;
      }
      repl = t;
      break;
    }
    drawn = repl;
  }

  const seats = s.seats.map((seat, i) =>
    i === s.turn ? { ...seat, flowers } : seat,
  );
  return {
    ...s,
    wall,
    seats,
    mustDiscard: true,
    drawnTile: drawn,
  };
}

/**
 * @param {GameState} state
 * @param {number} seat
 * @param {number} tileId
 */
function discard(state, seat, tileId) {
  if (state.phase !== "playing") return state;
  if (state.turn !== seat || !state.mustDiscard) return state;

  const drawn = state.drawnTile;
  const fromDrawn = drawn && drawn.id === tileId;
  const fromHand = state.seats[seat].hand.find((t) => t.id === tileId);
  const tile = fromDrawn ? drawn : fromHand;
  if (!tile || isFlower(tile.key)) return state;

  /** @type {Tile[]} */
  let hand;
  if (fromDrawn) {
    // Discard the tsumo tile; sorted hand stays as-is.
    hand = state.seats[seat].hand;
  } else {
    // Discard from hand; fold the drawn tile into the hand.
    hand = state.seats[seat].hand.filter((t) => t.id !== tileId);
    if (drawn) hand = sortTiles([...hand, drawn]);
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
      passes: [false, false, false, false],
      pending: [null, null, null, null],
    },
    message: `${seatWindLabel(state, seat)}家打出 ${tileDef(tile.key).label}`,
  };
  // Discarder cannot claim; auto-pass
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

  if (intent.kind === "hu") {
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
  const next = { ...state, claim: { ...state.claim, pending } };
  return resolveClaimsIfReady(next);
}

/**
 * @param {GameState} state
 * @param {number} seat
 */
function passClaim(state, seat) {
  if (state.phase !== "claim" || !state.claim) return state;
  if (seat === state.claim.from) return state;
  const passes = [...state.claim.passes];
  passes[seat] = true;
  const next = { ...state, claim: { ...state.claim, passes } };
  return resolveClaimsIfReady(next);
}

/**
 * @param {GameState} state
 */
function resolveClaimsIfReady(state) {
  const claim = state.claim;
  if (!claim) return state;

  // Auto-pass seats that have no legal claim and haven't answered
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

  // Pick highest priority claim
  /** @type {{ seat: number, intent: ClaimIntent, rank: number }[]} */
  const bids = [];
  for (let s = 0; s < 4; s++) {
    const intent = pending[s];
    if (!intent) continue;
    bids.push({ seat: s, intent, rank: claimRank(intent.kind) });
  }
  if (!bids.length) {
    return advanceAfterPass(state);
  }
  bids.sort((a, b) => {
    if (b.rank !== a.rank) return b.rank - a.rank;
    // closer to discarder (next first)
    const da = (a.seat - claim.from + 4) % 4;
    const db = (b.seat - claim.from + 4) % 4;
    return da - db;
  });
  const win = bids[0];
  if (win.intent.kind === "hu") {
    return declareWin(state, win.seat, claim.from, false);
  }
  if (win.intent.kind === "kong") {
    return takeMingKong(state, win.seat);
  }
  if (win.intent.kind === "pong") {
    return takePong(state, win.seat);
  }
  if (win.intent.kind === "chi") {
    return takeChi(state, win.seat, win.intent.chiTiles || []);
  }
  return advanceAfterPass(state);
}

function claimRank(kind) {
  if (kind === "hu") return 3;
  if (kind === "kong" || kind === "pong") return 2;
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
  next = drawForTurn(next);
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
  next = drawForTurn(next);
  return next;
}

/**
 * @param {GameState} state
 * @param {number} seat
 * @param {Tile[]} chiTiles two tiles from hand
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
  // Any leftover drawn tile folds into hand before the kong supplement draw.
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
  };
  next = drawForTurn(next);
  return next;
}

/**
 * Upgrade pong to kong with 4th tile from hand.
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
  // Fold leftover drawn tile into hand before the supplement draw.
  if (!fromDrawn && state.drawnTile) {
    hand = sortTiles([...hand, state.drawnTile]);
  }
  const melds = state.seats[seat].melds.map((m, i) =>
    i === meldIdx
      ? { type: /** @type {const} */ ("kong"), tiles: [...m.tiles, tile], concealed: false }
      : m,
  );
  const seats = state.seats.map((s, i) =>
    i === seat ? { ...s, hand: sortTiles(hand), melds } : s,
  );
  let next = {
    ...state,
    seats,
    drawnTile: null,
    mustDiscard: false,
    message: `${seatWindLabel(state, seat)}家加槓，補牌`,
  };
  next = drawForTurn(next);
  return next;
}

/**
 * @param {GameState} state
 * @param {number} winner
 * @param {number | null} from discarder or null if self-draw
 * @param {boolean} selfDraw
 */
export function declareWin(state, winner, from, selfDraw) {
  const winTile = selfDraw
    ? null
    : state.claim?.tile || state.lastDiscard?.tile || null;
  const hand = selfDraw
    ? concealedTiles(state, winner)
    : sortTiles([...state.seats[winner].hand, winTile].filter(Boolean));

  const scored = scoreWin(state, winner, hand, selfDraw);
  if (!scored) {
    // illegal hu attempt — treat as pass if claim
    if (!selfDraw && state.phase === "claim") {
      return passClaim(state, winner);
    }
    return state;
  }

  const payments = [0, 0, 0, 0];
  if (selfDraw) {
    for (let i = 0; i < 4; i++) {
      if (i === winner) continue;
      payments[i] = -scored.points;
      payments[winner] += scored.points;
    }
  } else if (from != null) {
    payments[from] = -scored.points;
    payments[winner] = scored.points;
  }

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
      // completed circuit — advance round wind lightly
      roundWind = (roundWind + 1) % 4;
    }
  }

  /** @type {WinResult} */
  const result = {
    kind: "win",
    winner,
    from,
    selfDraw,
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
  };
}

/**
 * Try self-draw hu for current seat (call from UI when hand wins after draw).
 * @param {GameState} state
 * @param {number} seat
 */
export function trySelfDrawHu(state, seat) {
  if (state.phase !== "playing" || state.turn !== seat || !state.mustDiscard) {
    return state;
  }
  if (!canHuSelf(state, seat)) return state;
  return declareWin(state, seat, null, true);
}

/**
 * @param {GameState} state
 */
function endDraw(state) {
  return {
    ...state,
    phase: "ended",
    result: { kind: "draw" },
    mustDiscard: false,
    drawnTile: null,
    claim: null,
    message: "流局（牌山用盡）",
    dealer: (state.dealer + 1) % 4,
    dealerStreak: 0,
  };
}

/* ─── Legality helpers ─── */

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
  if (!state.claim) return false;
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
  const t = state.claim?.tile;
  if (!t) return false;
  const hand = sortTiles([...state.seats[seat].hand, t]);
  return Boolean(findWinningPartition(state.seats[seat].melds, hand));
}

/**
 * @param {GameState} state
 * @param {number} seat
 */
export function canHuSelf(state, seat) {
  return Boolean(
    findWinningPartition(state.seats[seat].melds, concealedTiles(state, seat)),
  );
}

/**
 * Keys that can be an-konged.
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
 * Hand tile ids that can jia-kong.
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

/* ─── Win / score ─── */

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
  // chow
  if (isSuitTile(keys[0])) {
    const d = tileDef(keys[0]);
    const k2 = `${d.suit}${d.rank + 1}`;
    const k3 = `${d.suit}${d.rank + 2}`;
    const i2 = keys.indexOf(k2);
    const i3 = keys.indexOf(k3);
    if (i2 > 0 && i3 > 0) {
      const rest = keys.filter((_, i) => i !== 0 && i !== i2 && i !== i3);
      // rebuild carefully
      const copy = keys.slice();
      copy.splice(i3, 1);
      const i2b = copy.indexOf(k2);
      copy.splice(i2b, 1);
      copy.splice(0, 1);
      const sub = tryPartition(copy, setsLeft - 1, false);
      if (sub) {
        return {
          pairs: sub.pairs,
          sets: [`chow:${keys[0]}`, ...sub.sets],
        };
      }
    }
  }
  return null;
}

/**
 * @param {GameState} state
 * @param {number} winner
 * @param {Tile[]} hand
 * @param {boolean} selfDraw
 */
export function scoreWin(state, winner, hand, selfDraw) {
  const melds = state.seats[winner].melds;
  const part = findWinningPartition(melds, hand);
  if (!part) return null;

  /** @type {string[]} */
  const details = [];
  let tai = 0;

  if (winner === state.dealer) {
    tai += 1;
    details.push("莊家 1");
  }
  if (state.dealerStreak > 0 && winner === state.dealer) {
    // streak before this win already on dealer; +1 per prior consecutive
    tai += state.dealerStreak;
    details.push(`連莊 ${state.dealerStreak}`);
  }
  if (selfDraw) {
    tai += 1;
    details.push("自摸 1");
  }
  // 門清: no chi/pong/ming-kong (an-kong ok)
  const brokeMenqing = melds.some(
    (m) => m.type === "chi" || m.type === "pong" || (m.type === "kong" && !m.concealed),
  );
  if (!brokeMenqing) {
    tai += 1;
    details.push("門清 1");
  }

  const allSets = [
    ...melds.map((m) =>
      m.type === "chi" ? `chow:${m.tiles[0].key}` : `pung:${m.tiles[0].key}`,
    ),
    ...part.sets,
  ];
  const isPengPeng = allSets.every((s) => s.startsWith("pung:"));
  if (isPengPeng) {
    tai += 1;
    details.push("碰碰胡 1");
  }

  const allKeys = [
    ...hand.map((t) => t.key),
    ...melds.flatMap((m) => m.tiles.map((t) => t.key)),
  ];
  const suits = new Set(
    allKeys.filter((k) => isSuitTile(k)).map((k) => tileDef(k).suit),
  );
  const hasHonor = allKeys.some((k) => isHonor(k));
  if (suits.size === 1 && !hasHonor) {
    tai += 3;
    details.push("清一色 3");
  } else if (suits.size === 1 && hasHonor) {
    tai += 2;
    details.push("混一色 2");
  }

  for (const set of allSets) {
    if (!set.startsWith("pung:")) continue;
    const key = set.slice(5);
    const d = tileDef(key);
    if (d.suit === "dragon") {
      tai += 1;
      details.push(`三元刻(${d.label}) 1`);
    }
    if (d.suit === "wind") {
      if (d.rank === state.roundWind) {
        tai += 1;
        details.push(`圈風刻 1`);
      }
      if (d.rank === seatWind(state, winner)) {
        tai += 1;
        details.push(`門風刻 1`);
      }
    }
  }

  const flowerCount = state.seats[winner].flowers.length;
  if (flowerCount) {
    tai += flowerCount;
    details.push(`花牌 ${flowerCount}`);
  }

  if (tai < 1) {
    tai = 1;
    details.push("基本 1");
  }

  const points = BASE_POINTS * 2 ** Math.min(tai, 8);
  return { tai, details, points, partition: part };
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
 * Remove n tiles of key from hand (mutates). Returns taken or null.
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

export { WIND_KEYS };
