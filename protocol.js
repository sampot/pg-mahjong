/**
 * Invite seam for future mahjong.v1 — no networking in this build.
 *
 * Hosts may later wire Platform Invite by:
 * 1. advertising PROTOCOL_ID on the catalog entry
 * 2. syncing serializeState snapshots + applyAction envelopes
 *
 * All table mutations already go through game.applyAction / trySelfDrawHu.
 */

export const PROTOCOL_ID = "mahjong.v1";
export const PROTOCOL_API_VERSION = "1";

/**
 * @param {import('./game.js').GameState} state
 */
export function serializeState(state) {
  return JSON.parse(JSON.stringify(state));
}

/**
 * @param {import('./game.js').GameState} state
 * @param {{ type: string, [k: string]: any }} action
 * @param {(s: import('./game.js').GameState, a: any) => import('./game.js').GameState} apply
 */
export function applyRemoteAction(state, action, apply) {
  return apply(state, action);
}
