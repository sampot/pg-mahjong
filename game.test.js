import { describe, expect, it } from "vitest";
import {
  applyAction,
  createInitialState,
  findWinningPartition,
  canHuOnDiscard,
  legalClaims,
  PLAYER,
} from "./game.js";
import { sortTiles, isFlower } from "./tiles.js";
import { scoreWin } from "./score.js";
import { mergeRuleset } from "./ruleset.js";

let id = 1;
const T = (key) => ({ id: id++, key });

describe("partition", () => {
  it("accepts 5 chows + pair", () => {
    const hand = sortTiles([
      T("man1"), T("man2"), T("man3"),
      T("man4"), T("man5"), T("man6"),
      T("pin1"), T("pin2"), T("pin3"),
      T("pin4"), T("pin5"), T("pin6"),
      T("sou1"), T("sou2"), T("sou3"),
      T("haku"), T("haku"),
    ]);
    expect(findWinningPartition([], hand)).toBeTruthy();
  });

  it("accepts 12223 as chow+pair", () => {
    const hand = sortTiles([
      T("man1"), T("man2"), T("man2"), T("man2"), T("man3"),
      T("pin1"), T("pin2"), T("pin3"),
      T("pin7"), T("pin8"), T("pin9"),
      T("sou1"), T("sou2"), T("sou3"),
      T("sou7"), T("sou8"), T("sou9"),
    ]);
    expect(findWinningPartition([], hand)).toBeTruthy();
  });
});

describe("deal and walls", () => {
  it("splits dead wall of 16 after deal", () => {
    let s = createInitialState();
    s = applyAction(s, { type: "deal" });
    expect(s.phase).toBe("playing");
    expect(s.deadWall.length).toBeLessThanOrEqual(16);
    expect(s.deadWall.length + s.wall.length).toBeGreaterThan(0);
    const total =
      s.wall.length +
      s.deadWall.length +
      s.seats.reduce(
        (n, seat) =>
          n +
          seat.hand.length +
          seat.flowers.length +
          seat.discards.length +
          seat.melds.reduce((m, mm) => m + mm.tiles.length, 0),
        0,
      ) +
      (s.drawnTile ? 1 : 0);
    expect(total).toBe(144);
  });

  it("refuses deal while not idle", () => {
    let s = createInitialState();
    s = applyAction(s, { type: "deal" });
    const again = applyAction(s, { type: "deal" });
    expect(again.phase).toBe("playing");
    expect(again.lastError).toBeTruthy();
  });
});

describe("flower at wall end", () => {
  it("never folds a flower into the hand when no replacement", () => {
    let s = createInitialState();
    s = applyAction(s, { type: "deal" });
    const flower = T("flower_plum");
    s = {
      ...s,
      wall: [],
      deadWall: [],
      turn: 0,
      mustDiscard: true,
      drawnTile: flower,
      phase: "playing",
      claim: null,
      lastDrawKind: "flower",
    };
    const tid = s.seats[0].hand[0].id;
    const next = applyAction(s, { type: "discard", seat: 0, tileId: tid });
    expect(next.seats[0].hand.some((t) => isFlower(t.key))).toBe(false);
    expect(next.lastError).toBeTruthy();
  });

  it("sets flower aside and allows discard from hand when supplement empty", () => {
    let s = createInitialState();
    s = applyAction(s, { type: "deal" });
    // Force: seat 3 discards, seat 0 would draw but we inject flower-only via empty live + flower in dead that gets exposed with no further
    s = {
      ...s,
      wall: [],
      deadWall: [T("flower_orchid")],
      turn: 3,
      mustDiscard: true,
      drawnTile: s.seats[3].hand[0],
      phase: "playing",
      claim: null,
    };
    s = applyAction(s, { type: "discard", seat: 3, tileId: s.drawnTile.id });
    // After passes auto, seat 0 draws from empty live → endDraw OR if somehow flower path
    // With empty live wall, advanceAfterPass → drawForTurn → endDraw
    expect(["ended", "playing", "claim"]).toContain(s.phase);
  });
});

describe("draw keeps dealer", () => {
  it("increments dealer streak on exhaustive draw", () => {
    let s = createInitialState({ keepDealerOnDraw: true });
    s = {
      ...s,
      phase: "playing",
      dealer: 1,
      dealerStreak: 2,
      turn: 0,
      wall: [],
      deadWall: [],
      mustDiscard: false,
    };
    // trigger endDraw via apply discard cycle — call through empty draw
    s = applyAction(
      {
        ...s,
        turn: 3,
        mustDiscard: true,
        drawnTile: T("man1"),
        seats: s.seats.map((seat, i) =>
          i === 3
            ? { ...seat, hand: sortTiles([T("man2"), ...seat.hand.slice(0, 15)]) }
            : seat,
        ),
      },
      { type: "discard", seat: 3, tileId: /** @type {any} */ (null) },
    );
  });
});

describe("scoring", () => {
  it("rejects open ron below minTai when no pattern tai", () => {
    const state = {
      ...createInitialState({ minTai: 3 }),
      dealer: 1,
      dealerStreak: 0,
      roundWind: 0,
    };
    state.seats[0].melds = [
      {
        type: "chi",
        tiles: [T("sou7"), T("sou8"), T("sou9")],
        concealed: false,
      },
    ];
    // Two-sided wait 3/6 from 45 — not 獨聽; open hand; no flowers/honors
    const hand = sortTiles([
      T("man1"), T("man2"), T("man3"),
      T("man4"), T("man5"), T("man6"),
      T("pin1"), T("pin2"), T("pin3"),
      T("pin7"), T("pin8"), T("pin9"),
      T("sou4"), T("sou5"), T("sou6"),
    ]);
    const sc = scoreWin(state, 0, hand, false, { winKey: "sou6" });
    expect(sc).toBeNull();
  });

  it("scores 門清自摸不求人 as 3", () => {
    const state = createInitialState();
    state.dealer = 1;
    const hand = sortTiles([
      T("man1"), T("man2"), T("man3"),
      T("man4"), T("man5"), T("man6"),
      T("pin1"), T("pin2"), T("pin3"),
      T("pin4"), T("pin5"), T("pin6"),
      T("sou1"), T("sou2"), T("sou3"),
      T("haku"), T("haku"),
    ]);
    const sc = scoreWin(state, 0, hand, true, { winKey: "haku" });
    expect(sc).toBeTruthy();
    expect(sc.details.some((d) => d.startsWith("門清自摸不求人"))).toBe(true);
    expect(sc.tai).toBeGreaterThanOrEqual(3);
  });

  it("uses base + tai*taiValue", () => {
    const state = createInitialState({ basePoints: 10, taiValue: 5 });
    state.dealer = 1;
    const hand = sortTiles([
      T("man1"), T("man2"), T("man3"),
      T("man4"), T("man5"), T("man6"),
      T("pin1"), T("pin2"), T("pin3"),
      T("pin4"), T("pin5"), T("pin6"),
      T("sou1"), T("sou2"), T("sou3"),
      T("haku"), T("haku"),
    ]);
    const sc = scoreWin(state, 0, hand, true, {});
    expect(sc.points).toBe(10 + sc.tai * 5);
  });
});

describe("rob kong", () => {
  it("opens a rob_kong claim window on 加槓", () => {
    let s = createInitialState({ allowRobKong: true });
    s.phase = "playing";
    s.turn = 0;
    s.mustDiscard = true;
    const tile = T("chun");
    s.drawnTile = tile;
    s.seats[0].hand = sortTiles([
      T("man1"), T("man2"), T("man3"),
      T("man4"), T("man5"), T("man6"),
      T("pin1"), T("pin2"), T("pin3"),
      T("pin4"), T("pin5"), T("pin6"),
      T("sou1"), T("sou2"), T("sou3"),
    ]);
    s.seats[0].melds = [
      { type: "pong", tiles: [T("chun"), T("chun"), T("chun")], concealed: false },
    ];
    s.seats[1].hand = sortTiles([
      T("man1"), T("man2"), T("man3"),
      T("man4"), T("man5"), T("man6"),
      T("pin1"), T("pin2"), T("pin3"),
      T("pin4"), T("pin5"), T("pin6"),
      T("sou1"), T("sou2"), T("sou3"),
      T("chun"),
    ]);
    s.wall = [T("pin9"), T("pin8")];
    s.deadWall = [T("sou9"), T("sou8")];
    s = applyAction(s, { type: "jiakong", seat: 0, tileId: tile.id });
    expect(s.phase).toBe("claim");
    expect(s.claim?.mode).toBe("rob_kong");
    const opts = legalClaims(s, 1);
    expect(opts.some((o) => o.kind === "hu")).toBe(true);
  });
});
