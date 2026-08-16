import { isFlower } from "./tiles.js";

/** Claim buttons follow mahjong precedence; 略過 always sits last. */
const CLAIM_ORDER = ["hu", "kong", "pong", "chi"];

/**
 * Resolve the two-tap discard gesture without coupling it to the DOM.
 * @param {number | null} selectedId
 * @param {number} tileId
 */
export function nextTileTap(selectedId, tileId) {
  return selectedId === tileId
    ? { type: "discard", tileId }
    : { type: "select", tileId };
}

/**
 * @param {string} phase
 */
export function shouldCompactChrome(phase) {
  return phase === "playing" || phase === "claim";
}

/**
 * After toggling 託管, always re-enter the AI scheduler.
 * Turning autoplay OFF must still resume opponent turns / claim resolution —
 * otherwise clearAi() freezes the table and the human never gets the next draw.
 * scheduleAi itself no-ops when the human owns the decision.
 * @param {boolean} _autoPlayEnabled
 */
export function shouldResumeAiAfterAutoToggle(_autoPlayEnabled) {
  return true;
}

/**
 * Decide what the bottom bar offers, in what order, and what it says.
 * Only legal actions are listed so the bar never shows dead buttons.
 * @param {{
 *   phase: string,
 *   autoPlay: boolean,
 *   isPlayerTurn: boolean,
 *   mustDiscard: boolean,
 *   claimKinds: string[],
 *   claimDone: boolean,
 *   robKong: boolean,
 *   canHuSelf: boolean,
 *   canAnKong: boolean,
 *   canJiaKong: boolean,
 *   selectedLabel: string | null,
 * }} input
 * @returns {{ visible: boolean, prompt: string, buttons: string[] }}
 */
export function actionBarPlan(input) {
  if (input.autoPlay) return { visible: false, prompt: "", buttons: [] };

  if (input.phase === "claim") {
    if (input.claimDone) return { visible: false, prompt: "", buttons: [] };
    const buttons = CLAIM_ORDER.filter((kind) => input.claimKinds.includes(kind));
    if (!buttons.length) return { visible: false, prompt: "", buttons: [] };
    buttons.push("pass");
    return {
      visible: true,
      prompt: input.robKong ? "可搶槓" : "輪你叫牌",
      buttons,
    };
  }

  if (input.phase === "playing" && input.isPlayerTurn && input.mustDiscard) {
    /** @type {string[]} */
    const buttons = [];
    if (input.canHuSelf) buttons.push("hu");
    if (input.canAnKong) buttons.push("ankong");
    if (input.canJiaKong) buttons.push("jiakong");
    // Discard is two-tap on the tile — never a bottom 打出, so the felt keeps the height.
    if (!buttons.length) return { visible: false, prompt: "", buttons: [] };
    return {
      visible: true,
      prompt: input.canHuSelf ? "可自摸" : "可槓",
      buttons,
    };
  }

  return { visible: false, prompt: "", buttons: [] };
}

/**
 * One short line for the middle of the felt: whose move it is right now.
 * @param {{
 *   phase: string,
 *   turn: number,
 *   mustDiscard: boolean,
 *   seatName: string,
 *   playerSeat?: number,
 *   hasDrawn?: boolean,
 * }} input
 */
export function turnHintText(input) {
  const playerSeat = input.playerSeat ?? 0;
  if (input.phase === "claim") return "叫牌中";
  if (input.phase === "ended") return "本局結束";
  if (input.phase !== "playing") return "";
  if (input.turn === playerSeat) {
    if (!input.mustDiscard) return "你摸牌";
    // After 碰／吃 there is no draw — say so instead of implying a 新牌 slot.
    if (input.hasDrawn === false) return "請打牌";
    return "點牌再點打出";
  }
  return `${input.seatName} 的回合`;
}

/**
 * Copies of a tile nobody can see yet (wall plus concealed hands).
 * @param {string} key
 * @param {string[]} seenKeys
 */
export function unseenCount(key, seenKeys) {
  const copies = isFlower(key) ? 1 : 4;
  let seen = 0;
  for (const k of seenKeys) {
    if (k === key) seen++;
  }
  return Math.max(0, copies - seen);
}

/**
 * @param {string[]} waitKeys
 * @param {string[]} seenKeys
 * @returns {{ key: string, remaining: number }[]}
 */
export function waitSummaries(waitKeys, seenKeys) {
  return waitKeys.map((key) => ({ key, remaining: unseenCount(key, seenKeys) }));
}

/**
 * Opponent hands read as tile backs; the freshly drawn tile sits apart.
 * @param {number} handLength
 * @param {boolean} hasDrawn
 */
export function handBackLayout(handLength, hasDrawn) {
  return { backs: Math.max(0, handLength), drawn: Boolean(hasDrawn) };
}
