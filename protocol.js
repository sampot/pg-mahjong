/** mahjong.v1 — shared protocol constants (UI + functions.js). */

export const MAHJONG_PROTOCOL_ID = "mahjong.v1";
export const MAHJONG_PROTOCOL_API_VERSION = "1";
/** Four distinct seats — host is booth host / seat 0. */
export const MAHJONG_ROLES = ["host", "p2", "p3", "p4"];
export const MAHJONG_ROLE_LIMITS = { host: 1, p2: 1, p3: 1, p4: 1 };
export const MAHJONG_JOIN_POLICY = "invite_only";
export const MAHJONG_STATE_KEY = "session:mahjong:v1";
export const MAHJONG_CATALOG_ID = "pg-mahjong";
export const MAHJONG_SOURCE = "sampot/pg-mahjong";
export const MAHJONG_SEAT_NAMES = ["主持", "席二", "席三", "席四"];

/** @deprecated use MAHJONG_PROTOCOL_ID */
export const PROTOCOL_ID = MAHJONG_PROTOCOL_ID;
/** @deprecated use MAHJONG_PROTOCOL_API_VERSION */
export const PROTOCOL_API_VERSION = MAHJONG_PROTOCOL_API_VERSION;

/** @param {string} role */
export function roleToSeat(role) {
  const i = MAHJONG_ROLES.indexOf(role);
  return i >= 0 ? i : -1;
}

/** @param {number} seat */
export function seatToRole(seat) {
  return MAHJONG_ROLES[seat] ?? null;
}

/** Full protocol object for invites / session meta. */
export function mahjongProtocolSpec() {
  return {
    protocolId: MAHJONG_PROTOCOL_ID,
    apiVersion: MAHJONG_PROTOCOL_API_VERSION,
    roles: [...MAHJONG_ROLES],
    roleLimits: { ...MAHJONG_ROLE_LIMITS },
    joinPolicy: MAHJONG_JOIN_POLICY,
    capabilities: ["deal", "reset", "set_ruleset", "sync"],
    acts: [
      {
        type: "deal",
        roles: ["host"],
        payload: { note: "滿席後發牌開局" },
      },
      {
        type: "reset",
        roles: ["host"],
        payload: { note: "終局後再來一局（需仍滿席）" },
      },
      {
        type: "set_ruleset",
        roles: ["host"],
        payload: { ruleset: "object" },
      },
      {
        type: "discard",
        roles: [...MAHJONG_ROLES],
        payload: { seat: "number", tileId: "number" },
      },
      {
        type: "pass_claim",
        roles: [...MAHJONG_ROLES],
        payload: { seat: "number" },
      },
      {
        type: "claim",
        roles: [...MAHJONG_ROLES],
        payload: { seat: "number", intent: "object" },
      },
      {
        type: "ankong",
        roles: [...MAHJONG_ROLES],
        payload: { seat: "number", key: "string" },
      },
      {
        type: "jiakong",
        roles: [...MAHJONG_ROLES],
        payload: { seat: "number", tileId: "number" },
      },
      {
        type: "hu_self",
        roles: [...MAHJONG_ROLES],
        payload: { seat: "number" },
      },
      {
        type: "hu_claim",
        roles: [...MAHJONG_ROLES],
        payload: { seat: "number" },
      },
    ],
  };
}

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
