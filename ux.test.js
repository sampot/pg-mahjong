import { describe, expect, it } from "vitest";
import {
  actionBarPlan,
  handBackLayout,
  nextTileTap,
  shouldCompactChrome,
  shouldResumeAiAfterAutoToggle,
  turnHintText,
  unseenCount,
  waitSummaries,
} from "./ux.js";

describe("tile tap flow", () => {
  it("selects an unselected tile", () => {
    expect(nextTileTap(null, 7)).toEqual({ type: "select", tileId: 7 });
  });

  it("discards a tile when it is tapped again", () => {
    expect(nextTileTap(7, 7)).toEqual({ type: "discard", tileId: 7 });
  });

  it("moves selection when another tile is tapped", () => {
    expect(nextTileTap(7, 9)).toEqual({ type: "select", tileId: 9 });
  });
});

describe("compact game chrome", () => {
  it("compacts during active play and claims", () => {
    expect(shouldCompactChrome("playing")).toBe(true);
    expect(shouldCompactChrome("claim")).toBe(true);
  });

  it("keeps the full landing and result chrome", () => {
    expect(shouldCompactChrome("idle")).toBe(false);
    expect(shouldCompactChrome("ended")).toBe(false);
  });
});

describe("autoplay toggle", () => {
  it("resumes the AI loop even when cancelling 託管", () => {
    // Cancelling used to clearAi() without scheduleAi(), freezing opponent
    // discards / claim passes so the human never received the next draw.
    expect(shouldResumeAiAfterAutoToggle(false)).toBe(true);
    expect(shouldResumeAiAfterAutoToggle(true)).toBe(true);
  });
});

/** @param {Partial<Parameters<typeof actionBarPlan>[0]>} patch */
function plan(patch) {
  return actionBarPlan({
    phase: "playing",
    autoPlay: false,
    isPlayerTurn: true,
    mustDiscard: true,
    claimKinds: [],
    claimDone: false,
    robKong: false,
    canHuSelf: false,
    canAnKong: false,
    canJiaKong: false,
    selectedLabel: null,
    ...patch,
  });
}

describe("action bar plan", () => {
  it("stays hidden when the player has nothing to do", () => {
    expect(plan({ mustDiscard: false }).visible).toBe(false);
    expect(plan({ phase: "idle" }).visible).toBe(false);
    expect(plan({ isPlayerTurn: false }).visible).toBe(false);
  });

  it("stays hidden while the AI plays for the player", () => {
    expect(plan({ autoPlay: true }).visible).toBe(false);
    expect(
      plan({ autoPlay: true, phase: "claim", claimKinds: ["pong"] }).visible,
    ).toBe(false);
  });

  it("keeps the discard bar hidden so the table keeps the height", () => {
    expect(plan({}).visible).toBe(false);
    expect(plan({}).buttons).toEqual([]);
    expect(plan({ selectedLabel: "五萬" }).visible).toBe(false);
  });

  it("shows only specials on the player's discard turn — never a 打出 button", () => {
    expect(plan({ canHuSelf: true, canAnKong: true }).buttons).toEqual([
      "hu",
      "ankong",
    ]);
    expect(plan({ canJiaKong: true }).buttons).toEqual(["jiakong"]);
    expect(plan({ canHuSelf: true }).prompt).toBe("可自摸");
  });

  it("orders claims by mahjong priority and demotes pass", () => {
    expect(
      plan({ phase: "claim", claimKinds: ["chi", "pong", "hu", "kong"] })
        .buttons,
    ).toEqual(["hu", "kong", "pong", "chi", "pass"]);
  });

  it("hides the bar once the claim is answered", () => {
    expect(
      plan({ phase: "claim", claimKinds: ["pong"], claimDone: true }).visible,
    ).toBe(false);
  });

  it("names the claim window", () => {
    expect(plan({ phase: "claim", claimKinds: ["pong"] }).prompt).toBe("輪你叫牌");
    expect(
      plan({ phase: "claim", claimKinds: ["hu"], robKong: true }).prompt,
    ).toBe("可搶槓");
  });
});

describe("turn hint", () => {
  it("reads the player's own turn", () => {
    expect(
      turnHintText({ phase: "playing", turn: 0, mustDiscard: true, seatName: "你" }),
    ).toBe("點牌再點打出");
    expect(
      turnHintText({
        phase: "playing",
        turn: 0,
        mustDiscard: true,
        seatName: "你",
        hasDrawn: false,
      }),
    ).toBe("請打牌");
    expect(
      turnHintText({ phase: "playing", turn: 0, mustDiscard: false, seatName: "你" }),
    ).toBe("你摸牌");
  });

  it("names the seat in play", () => {
    expect(
      turnHintText({ phase: "playing", turn: 2, mustDiscard: true, seatName: "阿北" }),
    ).toBe("阿北 的回合");
  });

  it("marks claim and end windows", () => {
    expect(
      turnHintText({ phase: "claim", turn: 1, mustDiscard: false, seatName: "小梅" }),
    ).toBe("叫牌中");
    expect(
      turnHintText({ phase: "ended", turn: 1, mustDiscard: false, seatName: "小梅" }),
    ).toBe("本局結束");
    expect(
      turnHintText({ phase: "idle", turn: 0, mustDiscard: false, seatName: "你" }),
    ).toBe("");
  });
});

describe("unseen tile counts", () => {
  it("counts the copies still out of sight", () => {
    expect(unseenCount("man1", [])).toBe(4);
    expect(unseenCount("man1", ["man1", "man1", "pin2"])).toBe(2);
  });

  it("never reports a negative remainder", () => {
    expect(unseenCount("man1", ["man1", "man1", "man1", "man1", "man1"])).toBe(0);
  });

  it("treats flowers as single copies", () => {
    expect(unseenCount("flower_plum", [])).toBe(1);
    expect(unseenCount("season_spring", ["season_spring"])).toBe(0);
  });
});

describe("wait summaries", () => {
  it("pairs each wait with its remaining copies", () => {
    expect(waitSummaries(["man1", "pin3"], ["man1", "man1"])).toEqual([
      { key: "man1", remaining: 2 },
      { key: "pin3", remaining: 4 },
    ]);
  });

  it("keeps dead waits visible with zero left", () => {
    expect(
      waitSummaries(["man1"], ["man1", "man1", "man1", "man1"]),
    ).toEqual([{ key: "man1", remaining: 0 }]);
  });
});

describe("opponent concealed hand", () => {
  it("shows one back per concealed tile", () => {
    expect(handBackLayout(16, false)).toEqual({ backs: 16, drawn: false });
  });

  it("splits the freshly drawn tile out of the wall of backs", () => {
    expect(handBackLayout(16, true)).toEqual({ backs: 16, drawn: true });
    expect(handBackLayout(0, false)).toEqual({ backs: 0, drawn: false });
  });
});
