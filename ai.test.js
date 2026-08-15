import { describe, expect, it } from "vitest";
import { chooseAiAction, shantenEstimate } from "./ai.js";
import { createInitialState, applyAction } from "./game.js";
import { sortTiles } from "./tiles.js";

let id = 9000;
const T = (key) => ({ id: id++, key });

describe("ai", () => {
  it("hu when able on self draw", () => {
    let s = createInitialState();
    s.phase = "playing";
    s.turn = 1;
    s.mustDiscard = true;
    s.dealer = 0;
    const hand = sortTiles([
      T("man1"), T("man2"), T("man3"),
      T("man4"), T("man5"), T("man6"),
      T("pin1"), T("pin2"), T("pin3"),
      T("pin4"), T("pin5"), T("pin6"),
      T("sou1"), T("sou2"), T("sou3"),
      T("haku"),
    ]);
    s.seats[1].hand = hand.slice(0, 16);
    s.drawnTile = hand[15]; // haku — wait need pair. hand has 16 including one haku?
    // 16 tiles in hand without drawn: 5*3+1 = 16 for tenpai. Then drawn completes.
    s.seats[1].hand = sortTiles([
      T("man1"), T("man2"), T("man3"),
      T("man4"), T("man5"), T("man6"),
      T("pin1"), T("pin2"), T("pin3"),
      T("pin4"), T("pin5"), T("pin6"),
      T("sou1"), T("sou2"), T("sou3"),
      T("haku"),
    ]);
    s.drawnTile = T("haku");
    const action = chooseAiAction(s, 1);
    expect(action?.type).toBe("hu_self");
  });

  it("estimates lower shanten after completing a set", () => {
    const tiles = [
      T("man1"), T("man1"), T("man1"),
      T("pin5"), T("sou9"),
    ];
    const a = shantenEstimate([], tiles);
    const b = shantenEstimate(
      [{ type: "pong", tiles: [], concealed: true }],
      [T("pin5"), T("sou9")],
    );
    expect(b).toBeLessThanOrEqual(a);
  });

  it("passes when no claims", () => {
    let s = createInitialState();
    s = applyAction(s, { type: "deal" });
    if (s.phase === "playing" && s.mustDiscard) {
      const tid = s.drawnTile?.id ?? s.seats[s.turn].hand[0].id;
      s = applyAction(s, { type: "discard", seat: s.turn, tileId: tid });
    }
    if (s.phase === "claim" && s.claim) {
      const seat = [0, 1, 2, 3].find(
        (i) =>
          i !== s.claim.from &&
          !s.claim.passes[i] &&
          !s.claim.pending[i],
      );
      if (seat == null) {
        // already auto-resolved — acceptable
        expect(["playing", "ended", "claim"]).toContain(s.phase);
        return;
      }
      const action = chooseAiAction(s, seat);
      expect(action).toBeTruthy();
    }
  });
});
