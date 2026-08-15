import { describe, expect, it } from "vitest";
import { applyAction, createInitialState, canHuOnDiscard } from "./game.js";
import { scoreWin, buildPayments } from "./score.js";
import { waitingKeys } from "./partition.js";
import { sortTiles } from "./tiles.js";

let id = 20000;
const T = (key) => ({ id: id++, key });

describe("guo shui", () => {
  it("blocks hu after passing a winning discard until 過手", () => {
    let s = createInitialState({ minTai: 0 });
    s.phase = "claim";
    const tile = T("haku");
    s.claim = {
      tile,
      from: 2,
      mode: "discard",
      passes: [false, false, true, false],
      pending: [null, null, null, null],
    };
    s.lastDiscard = { tile, from: 2 };
    s.seats[0].hand = sortTiles([
      T("man1"), T("man2"), T("man3"),
      T("man4"), T("man5"), T("man6"),
      T("pin1"), T("pin2"), T("pin3"),
      T("pin4"), T("pin5"), T("pin6"),
      T("sou1"), T("sou2"), T("sou3"),
      T("haku"),
    ]);
    expect(canHuOnDiscard(s, 0)).toBe(true);
    s = applyAction(s, { type: "pass_claim", seat: 0 });
    expect(s.guoShui[0]).toBe(true);
    // Same claim still open for others — player already passed
    s.claim = {
      tile: T("haku"),
      from: 3,
      mode: "discard",
      passes: [false, false, false, true],
      pending: [null, null, null, null],
    };
    s.seats[0].hand = sortTiles([
      T("man1"), T("man2"), T("man3"),
      T("man4"), T("man5"), T("man6"),
      T("pin1"), T("pin2"), T("pin3"),
      T("pin4"), T("pin5"), T("pin6"),
      T("sou1"), T("sou2"), T("sou3"),
      T("haku"),
    ]);
    s.guoShui = [true, false, false, false];
    expect(canHuOnDiscard(s, 0)).toBe(false);
  });
});

describe("waitingKeys", () => {
  it("finds pair wait", () => {
    const hand = sortTiles([
      T("man1"), T("man2"), T("man3"),
      T("man4"), T("man5"), T("man6"),
      T("pin1"), T("pin2"), T("pin3"),
      T("pin4"), T("pin5"), T("pin6"),
      T("sou1"), T("sou2"), T("sou3"),
      T("haku"),
    ]);
    expect(waitingKeys([], hand)).toContain("haku");
  });
});

describe("payments", () => {
  it("tsumo charges three seats", () => {
    const state = createInitialState({ basePoints: 1, taiValue: 1 });
    state.dealer = 1;
    const scored = { tai: 3, points: 4 };
    const pay = buildPayments(state, 0, null, true, scored);
    expect(pay[0]).toBeGreaterThan(0);
    expect(pay.filter((p) => p < 0).length).toBe(3);
  });

  it("大四喜 does not also list 門風 when all winds pung", () => {
    const state = createInitialState();
    state.dealer = 0;
    state.roundWind = 0;
    const hand = sortTiles([
      T("ton"), T("ton"), T("ton"),
      T("nan"), T("nan"), T("nan"),
      T("shaa"), T("shaa"), T("shaa"),
      T("pei"), T("pei"), T("pei"),
      T("haku"), T("haku"), T("haku"),
      T("chun"), T("chun"),
    ]);
    const sc = scoreWin(state, 0, hand, true, { winKey: "chun" });
    expect(sc).toBeTruthy();
    expect(sc.details.some((d) => d.startsWith("大四喜"))).toBe(true);
    expect(sc.details.some((d) => d.startsWith("門風") || d.startsWith("圈風"))).toBe(
      false,
    );
  });
});
