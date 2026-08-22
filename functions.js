/**
 * Host session domain for mahjong.v1 (4 seats; fog of hands).
 */

import { applyAction, createInitialState, liveWallCount } from "./game.js";
import {
  MAHJONG_JOIN_POLICY,
  MAHJONG_PROTOCOL_API_VERSION,
  MAHJONG_PROTOCOL_ID,
  MAHJONG_ROLE_LIMITS,
  MAHJONG_ROLES,
  MAHJONG_SEAT_NAMES,
  MAHJONG_STATE_KEY,
  mahjongProtocolSpec,
  roleToSeat,
} from "./protocol.js";

/**
 * @typedef {"waiting" | "ready" | "active" | "ended"} MatchStatus
 * @typedef {{ host: boolean, p2: boolean, p3: boolean, p4: boolean }} SeatedMap
 * @typedef {{
 *   sessionId: string | null;
 *   channelName: string | null;
 *   seq: number;
 *   status: MatchStatus;
 *   seated: SeatedMap;
 *   names: string[];
 *   game: import('./game.js').GameState;
 * }} MahjongStore
 */

function emptySeated() {
  return { host: false, p2: false, p3: false, p4: false };
}

/** @returns {MahjongStore} */
function emptyStore() {
  return {
    sessionId: null,
    channelName: null,
    seq: 0,
    status: "waiting",
    seated: emptySeated(),
    names: [...MAHJONG_SEAT_NAMES],
    game: createInitialState(),
  };
}

function cloneTile(t) {
  return { id: Number(t.id), key: String(t.key) };
}

function cloneTiles(tiles) {
  return (Array.isArray(tiles) ? tiles : []).map(cloneTile);
}

function cloneMelds(melds) {
  return (Array.isArray(melds) ? melds : []).map((m) => ({
    type: m.type,
    concealed: Boolean(m.concealed),
    tiles: cloneTiles(m.tiles),
  }));
}

function cloneSeats(seats) {
  return (Array.isArray(seats) ? seats : []).map((seat) => ({
    hand: cloneTiles(seat.hand),
    melds: cloneMelds(seat.melds),
    flowers: cloneTiles(seat.flowers),
    discards: cloneTiles(seat.discards),
  }));
}

/** @param {import('./game.js').GameState} game */
function cloneGame(game) {
  return {
    ...game,
    ruleset: { ...game.ruleset },
    wall: cloneTiles(game.wall),
    deadWall: cloneTiles(game.deadWall),
    seats: cloneSeats(game.seats),
    drawnTile: game.drawnTile ? cloneTile(game.drawnTile) : null,
    lastDiscard: game.lastDiscard
      ? { from: game.lastDiscard.from, tile: cloneTile(game.lastDiscard.tile) }
      : null,
    claim: game.claim
      ? {
          ...game.claim,
          tile: cloneTile(game.claim.tile),
          passes: [...game.claim.passes],
          pending: game.claim.pending.map((p) =>
            p ? { ...p, chiTiles: p.chiTiles ? cloneTiles(p.chiTiles) : undefined } : null,
          ),
        }
      : null,
    guoShui: [...game.guoShui],
    scores: [...game.scores],
    result: game.result ? JSON.parse(JSON.stringify(game.result)) : null,
  };
}

function seatedCount(seated) {
  let n = 0;
  for (const r of MAHJONG_ROLES) {
    if (seated?.[r]) n += 1;
  }
  return n;
}

function allSeated(seated) {
  return seatedCount(seated) === MAHJONG_ROLES.length;
}

/**
 * @param {unknown} raw
 * @returns {SeatedMap}
 */
function parseSeatedRoles(raw) {
  const out = emptySeated();
  if (!Array.isArray(raw)) return out;
  for (const item of raw) {
    const r = String(item || "").trim();
    if (MAHJONG_ROLES.includes(r)) out[r] = true;
  }
  return out;
}

/**
 * @param {Record<string, unknown>} body
 * @returns {SeatedMap}
 */
function parseSeatedFromBody(body) {
  if (Array.isArray(body.seatedRoles) && body.seatedRoles.length > 0) {
    return parseSeatedRoles(body.seatedRoles);
  }
  if (Array.isArray(body.seats) && body.seats.length > 0) {
    const roles = body.seats.map((s) =>
      s && typeof s === "object" ? String(s.role || "").trim() : "",
    );
    const out = parseSeatedRoles(roles);
    if (body.playerSeated && !out.host) out.host = true;
    return out;
  }
  if (body.playerSeated) {
    return { ...emptySeated(), host: true };
  }
  return emptySeated();
}

/**
 * @param {string[]} current
 * @param {unknown} seats
 * @returns {string[]}
 */
function namesFromSeats(current, seats) {
  const names =
    Array.isArray(current) && current.length === 4
      ? current.map((n) => String(n || ""))
      : [...MAHJONG_SEAT_NAMES];
  if (!Array.isArray(seats)) return names;
  for (const raw of seats) {
    if (!raw || typeof raw !== "object") continue;
    const role = String(raw.role || "").trim();
    const name = String(raw.displayName || raw.name || "").trim();
    const idx = MAHJONG_ROLES.indexOf(role);
    if (idx >= 0 && name) names[idx] = name;
  }
  return names;
}

/** @param {MahjongStore} store */
function publicNames(store) {
  return Array.isArray(store.names) && store.names.length === 4
    ? store.names.slice()
    : [...MAHJONG_SEAT_NAMES];
}

async function loadStore(env) {
  const raw = await env.KV.get(MAHJONG_STATE_KEY, "text");
  if (!raw) return emptyStore();
  try {
    const parsed = JSON.parse(raw);
    const seated = {
      ...emptySeated(),
      ...(parsed.seated && typeof parsed.seated === "object"
        ? parsed.seated
        : {}),
    };
    const base = createInitialState();
    const gameRaw = parsed.game && typeof parsed.game === "object" ? parsed.game : {};
    const game = cloneGame({
      ...base,
      ...gameRaw,
      ruleset: { ...base.ruleset, ...(gameRaw.ruleset || {}) },
      seats: cloneSeats(gameRaw.seats || base.seats),
      wall: cloneTiles(gameRaw.wall || []),
      deadWall: cloneTiles(gameRaw.deadWall || []),
    });
    return {
      sessionId: parsed.sessionId || null,
      channelName: parsed.channelName || null,
      seq: Number(parsed.seq) || 0,
      status: ["waiting", "ready", "active", "ended"].includes(parsed.status)
        ? parsed.status
        : "waiting",
      seated,
      names: (() => {
        const baseNames = [...MAHJONG_SEAT_NAMES];
        if (!Array.isArray(parsed.names)) return baseNames;
        for (let i = 0; i < 4; i++) {
          const n = String(parsed.names[i] || "").trim();
          if (n) baseNames[i] = n;
        }
        return baseNames;
      })(),
      game,
    };
  } catch {
    return emptyStore();
  }
}

async function saveStore(env, store) {
  await env.KV.put(
    MAHJONG_STATE_KEY,
    JSON.stringify({
      sessionId: store.sessionId,
      channelName: store.channelName,
      seq: store.seq,
      status: store.status,
      seated: store.seated,
      names: store.names,
      game: cloneGame(store.game),
    }),
  );
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function err(code, error, status = 400) {
  return json({ error, code }, status);
}

/**
 * @param {import('./game.js').GameState} game
 * @param {number} viewerSeat -1 for spectator / unknown
 */
function fogSeats(game, viewerSeat) {
  return game.seats.map((seat, i) => {
    if (viewerSeat >= 0 && i === viewerSeat) {
      return {
        hand: cloneTiles(seat.hand),
        melds: cloneMelds(seat.melds),
        flowers: cloneTiles(seat.flowers),
        discards: cloneTiles(seat.discards),
      };
    }
    return {
      hand: [],
      melds: cloneMelds(seat.melds),
      flowers: cloneTiles(seat.flowers),
      discards: cloneTiles(seat.discards),
    };
  });
}

/**
 * @param {MahjongStore} store
 * @param {string | null | undefined} viewerRole
 */
function viewForRole(store, viewerRole) {
  const game = store.game;
  const handCounts = [0, 1, 2, 3].map((i) => {
    const extra =
      game.turn === i && game.drawnTile && game.mustDiscard ? 1 : 0;
    return (game.seats[i]?.hand.length ?? 0) + extra;
  });
  const role = typeof viewerRole === "string" ? viewerRole.trim() : "";
  const seat = role && role !== "spectator" ? roleToSeat(role) : -1;
  const seats = fogSeats(game, role === "spectator" ? -1 : seat);
  const drawnTile =
    seat >= 0 && game.turn === seat && game.drawnTile
      ? cloneTile(game.drawnTile)
      : null;

  return {
    protocolId: MAHJONG_PROTOCOL_ID,
    apiVersion: MAHJONG_PROTOCOL_API_VERSION,
    sessionId: store.sessionId,
    channelName: store.channelName,
    seq: store.seq,
    status: store.status,
    seated: { ...store.seated },
    seatedCount: seatedCount(store.seated),
    role: role || null,
    seat,
    names: publicNames(store),
    roles: [...MAHJONG_ROLES],
    phase: game.phase,
    turn: game.turn,
    mustDiscard: game.mustDiscard,
    dealer: game.dealer,
    roundWind: game.roundWind,
    dealerStreak: game.dealerStreak,
    scores: [...game.scores],
    ruleset: { ...game.ruleset },
    wallCount: liveWallCount(game),
    seats,
    handCounts,
    drawnTile,
    lastDiscard: game.lastDiscard
      ? { from: game.lastDiscard.from, tile: cloneTile(game.lastDiscard.tile) }
      : null,
    claim: game.claim
      ? {
          tile: cloneTile(game.claim.tile),
          from: game.claim.from,
          mode: game.claim.mode,
          passes: [...game.claim.passes],
          pending: game.claim.pending.map((p) => (p ? { ...p } : null)),
        }
      : null,
    guoShui: [...game.guoShui],
    result: game.result ? JSON.parse(JSON.stringify(game.result)) : null,
    message: game.message,
    lastError: game.lastError,
  };
}

/** @param {MahjongStore} store @param {import('./game.js').GameState} game */
function syncSessionStatus(store, game) {
  if (game.phase === "playing" || game.phase === "claim") {
    store.status = "active";
  } else if (game.phase === "ended") {
    store.status = "ended";
  } else if (game.phase === "idle") {
    store.status = allSeated(store.seated) ? "ready" : "waiting";
  }
}

function hostUnavailable() {
  return err("host_unavailable", "此環境未提供 env.HOST（無法邀請對弈）", 503);
}

function mapHostError(e) {
  const code =
    e && typeof e === "object" && "code" in e
      ? String(e.code)
      : /not_provisioned|通行證|登入/i.test(String(e?.message || e))
        ? "not_provisioned"
        : "error";
  const status =
    code === "not_provisioned"
      ? 401
      : code === "host_unavailable" || code === "session_inactive"
        ? code === "session_inactive"
          ? 409
          : 503
        : 400;
  return err(code, e?.message || String(e), status);
}

async function handleOnlineHostApi(request, env, path, method) {
  const HOST = env?.HOST;
  if (!HOST) return hostUnavailable();

  try {
    if (path.endsWith("/api/online/open") && method === "POST") {
      const opened = await HOST.openSession();
      return json({
        ok: true,
        sessionId: opened.sessionId,
        channelName: opened.channelName,
        protocolId: opened.protocolId,
        apiVersion: opened.apiVersion,
        roles: opened.roles,
      });
    }

    if (path.endsWith("/api/online/close") && method === "POST") {
      await HOST.closeSession();
      await saveStore(env, emptyStore());
      return json({ ok: true });
    }

    if (path.endsWith("/api/online/status") && method === "GET") {
      const session = await HOST.getSession();
      const seats = (await HOST.listSeats()) || [];
      if (!session) {
        return json({ active: false, seats: [] });
      }
      return json({
        active: true,
        status: session.status || "open",
        sessionId: session.sessionId,
        channelName: session.channelName,
        protocolId: session.protocolId,
        apiVersion: session.apiVersion,
        roles: session.roles,
        seats,
      });
    }

    if (path.endsWith("/api/online/domain") && method === "POST") {
      const body = (await request.json().catch(() => null)) || {};
      const domainPath = String(body.path || "");
      if (!domainPath.includes("/api/session/")) {
        return err("forbidden", "僅允許轉發 /api/session/*", 403);
      }
      const result = await HOST.hostSessionFetch(domainPath, {
        method: body.method || "GET",
        headers: body.headers,
        body: body.body,
      });
      return json(result);
    }

    if (path.endsWith("/api/online/invite") && method === "POST") {
      const body = (await request.json().catch(() => ({}))) || {};
      const created = await HOST.createPlatformInvite({
        kind: body.kind,
        intent: body.intent,
        ttlMs: body.ttlMs,
        targetField: body.targetField,
      });
      return json(created);
    }

    if (path.endsWith("/api/online/invite/revoke") && method === "POST") {
      const body = (await request.json().catch(() => ({}))) || {};
      const inviteId = String(body.inviteId || "").trim();
      if (!inviteId) return err("bad_args", "缺少 inviteId", 400);
      await HOST.revokePlatformInvite({ inviteId });
      return json({ ok: true });
    }

    return null;
  } catch (e) {
    return mapHostError(e);
  }
}

/**
 * @param {Request} request
 * @param {URL} url
 * @param {object} env
 */
async function resolveViewerRole(request, url, env) {
  const q = String(url.searchParams.get("role") || "").trim();
  if (q === "spectator") return "spectator";
  if (q && MAHJONG_ROLES.includes(q)) return q;
  if (env?.SESSION) {
    try {
      const seat = await env.SESSION.getSeat();
      const r = String(seat?.role || "").trim();
      if (r === "spectator") return "spectator";
      if (MAHJONG_ROLES.includes(r)) return r;
    } catch {
      /* ignore */
    }
  }
  return null;
}

const GAME_ACTS = new Set([
  "discard",
  "pass_claim",
  "claim",
  "ankong",
  "jiakong",
  "hu_self",
  "hu_claim",
]);

/**
 * @param {MahjongStore} store
 * @param {string} role
 * @param {Record<string, unknown>} payload
 */
function applyGameAct(store, role, payload) {
  const seat = roleToSeat(role);
  if (seat < 0) return { ok: false, code: "role_forbidden", error: "role 不允許" };
  const type = String(payload.type || "").trim();
  if (!GAME_ACTS.has(type)) {
    return { ok: false, code: "act_rejected", error: "未知 act" };
  }
  if (store.status !== "active") {
    return { ok: false, code: "act_rejected", error: "尚未開始或已結束" };
  }
  const actionSeat = Number(payload.seat);
  if (!Number.isInteger(actionSeat) || actionSeat !== seat) {
    return { ok: false, code: "role_forbidden", error: "seat 與 role 不符" };
  }
  const before = store.game.phase;
  const next = applyAction(store.game, { ...payload, type });
  if (next.lastError) {
    return { ok: false, code: "act_rejected", error: next.lastError };
  }
  store.game = next;
  syncSessionStatus(store, next);
  store.seq += 1;
  return { ok: true, beforePhase: before, afterPhase: next.phase };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";
    const method = request.method.toUpperCase();

    if (path.includes("/api/online/")) {
      const onlineRes = await handleOnlineHostApi(request, env, path, method);
      if (onlineRes) return onlineRes;
    }

    if (env?.SESSION) {
      const isProbe =
        request.method === "GET" &&
        (path.endsWith("/api/session/seat") ||
          path.endsWith("/api/session/channel") ||
          path.endsWith("/api/session/state"));
      try {
        const SESSION = env.SESSION;
        if (path.endsWith("/api/session/seat") && request.method === "GET") {
          return json(await SESSION.getSeat());
        }
        if (path.endsWith("/api/session/channel") && request.method === "GET") {
          return json(await SESSION.getEventChannel());
        }
        if (path.endsWith("/api/session/state") && request.method === "GET") {
          const raw = await SESSION.getState();
          if (raw && typeof raw === "object" && Array.isArray(raw.seats)) {
            const role = await resolveViewerRole(request, url, env);
            return json(viewForRole(/** @type {MahjongStore} */ ({ ...emptyStore(), ...raw, game: raw }), role));
          }
          return json(raw);
        }
        if (path.endsWith("/api/session/act") && request.method === "POST") {
          const body = await request.json();
          return json(await SESSION.act(body));
        }
        if (path.endsWith("/api/session/leave") && request.method === "POST") {
          return json(await SESSION.leave());
        }
        if (path.endsWith("/api/session/meta") && request.method === "GET") {
          return json({
            protocolId: MAHJONG_PROTOCOL_ID,
            apiVersion: MAHJONG_PROTOCOL_API_VERSION,
            roles: [...MAHJONG_ROLES],
          });
        }
      } catch (e) {
        if (e?.code === "session_inactive" && isProbe) {
          return json({
            ready: false,
            code: "session_inactive",
            error: e?.message || "未入座",
          });
        }
        const status = e?.code === "session_inactive" ? 409 : 400;
        return err(e?.code || "error", e?.message || String(e), status);
      }
    }

    if (path.endsWith("/api/session/meta") && request.method === "GET") {
      const spec = mahjongProtocolSpec();
      return json({
        protocolId: spec.protocolId,
        apiVersion: spec.apiVersion,
        roles: spec.roles,
        roleLimits: spec.roleLimits,
        joinPolicy: MAHJONG_JOIN_POLICY,
        capabilities: spec.capabilities,
      });
    }

    if (path.endsWith("/api/session/open") && request.method === "POST") {
      const body = (await request.json().catch(() => ({}))) || {};
      const sessionId = String(body.sessionId || "");
      const channelName = String(body.channelName || "");
      const existing = await loadStore(env);
      if (existing.sessionId && existing.sessionId === sessionId) {
        if (channelName) existing.channelName = channelName;
        await saveStore(env, existing);
        return json({
          ok: true,
          sessionId: existing.sessionId,
          channelName: existing.channelName,
        });
      }
      const store = emptyStore();
      store.sessionId = sessionId;
      store.channelName = channelName;
      store.status = "waiting";
      await saveStore(env, store);
      return json({
        ok: true,
        sessionId: store.sessionId,
        channelName: store.channelName,
      });
    }

    if (path.endsWith("/api/session/state") && request.method === "GET") {
      const store = await loadStore(env);
      const role = await resolveViewerRole(request, url, env);
      return json(viewForRole(store, role));
    }

    if (path.endsWith("/api/session/presence") && request.method === "POST") {
      const store = await loadStore(env);
      if (!store.sessionId) {
        return err("session_inactive", "通道尚未開啟", 409);
      }
      const body = (await request.json().catch(() => null)) || {};
      const nextSeated = parseSeatedFromBody(body);
      const nextCount = seatedCount(nextSeated);
      const wasFull = allSeated(store.seated);
      store.names = namesFromSeats(store.names, body.seats);

      if (
        !allSeated(nextSeated) &&
        store.sessionId &&
        (store.status === "ready" ||
          store.status === "active" ||
          store.status === "ended") &&
        wasFull
      ) {
        const seq = store.seq + 1;
        const channelName = store.channelName;
        const closeReason =
          String(body.reason || "").trim() === "host_closed"
            ? "host_closed"
            : "opponent_left";
        await saveStore(env, emptyStore());
        const event = {
          type: "session.closed",
          reason: closeReason,
          seq,
        };
        return json({
          ok: true,
          events: [event],
          state: viewForRole(emptyStore(), null),
          seq,
          sessionId: null,
          channelName,
        });
      }

      if (
        nextCount < seatedCount(store.seated) &&
        (store.status === "active" || store.status === "ended")
      ) {
        const seq = store.seq + 1;
        const channelName = store.channelName;
        await saveStore(env, emptyStore());
        return json({
          ok: true,
          events: [
            { type: "session.closed", reason: "opponent_left", seq },
          ],
          state: viewForRole(emptyStore(), null),
          seq,
          sessionId: null,
          channelName,
        });
      }

      store.seated = nextSeated;
      if (allSeated(store.seated) && store.status === "waiting") {
        store.status = "ready";
        store.game.message = "滿席 — 主持可發牌開局";
      } else if (!allSeated(store.seated) && store.status === "ready") {
        store.status = "waiting";
        store.game.message = "等候滿席";
      }
      store.seq += 1;
      await saveStore(env, store);
      const event = {
        type: "match.status",
        status: store.status,
        seatedCount: seatedCount(store.seated),
        seated: { ...store.seated },
        names: publicNames(store),
        message: store.game.message,
        seq: store.seq,
      };
      return json({
        ok: true,
        events: [event],
        state: viewForRole(store, null),
        seq: store.seq,
        sessionId: store.sessionId,
        channelName: store.channelName,
      });
    }

    if (path.endsWith("/api/session/act") && request.method === "POST") {
      const store = await loadStore(env);
      if (!store.sessionId) {
        return err("session_inactive", "通道尚未開啟（請先開局）", 409);
      }
      const body = (await request.json().catch(() => null)) || {};
      const role = String(body.role || "");
      const isSpectator = role === "spectator";
      if (!MAHJONG_ROLES.includes(role) && !isSpectator) {
        return err("role_forbidden", "role 不允許");
      }
      const payload =
        body.payload && typeof body.payload === "object" ? body.payload : {};
      const type = String(payload.type || body.type || "").trim();

      if (isSpectator && type !== "sync") {
        return err("role_forbidden", "觀戰只能同步明面狀態");
      }

      if (type === "deal") {
        if (role !== "host") {
          return err("role_forbidden", "僅主持可發牌");
        }
        if (store.status !== "ready" && store.status !== "ended") {
          return err(
            "act_rejected",
            store.status === "waiting"
              ? "尚未滿席，無法發牌"
              : store.status === "active"
                ? "對局進行中"
                : "目前無法發牌",
          );
        }
        if (!allSeated(store.seated)) {
          return err("act_rejected", "尚未滿席，無法發牌");
        }
        store.game = applyAction(store.game, { type: "deal" });
        if (store.game.lastError) {
          return err("act_rejected", store.game.lastError);
        }
        store.status = "active";
        store.seq += 1;
        await saveStore(env, store);
        const event = {
          type: "match.dealt",
          status: store.status,
          phase: store.game.phase,
          turn: store.game.turn,
          dealer: store.game.dealer,
          message: store.game.message,
          names: publicNames(store),
          seq: store.seq,
        };
        return json({
          ok: true,
          events: [event],
          state: viewForRole(store, role),
          seq: store.seq,
          sessionId: store.sessionId,
          channelName: store.channelName,
        });
      }

      if (type === "reset") {
        if (role !== "host") {
          return err("role_forbidden", "僅主持可再來一局");
        }
        if (store.status !== "ended") {
          return err("act_rejected", "僅在終局後可再來一局");
        }
        const scores = store.game.scores;
        const dealer = store.game.dealer;
        const roundWind = store.game.roundWind;
        const dealerStreak = store.game.dealerStreak;
        const ruleset = store.game.ruleset;
        store.game = {
          ...createInitialState(ruleset),
          scores,
          dealer,
          roundWind,
          dealerStreak,
          ruleset,
          message: allSeated(store.seated)
            ? "可發牌再開一局"
            : "等候入座",
        };
        store.status = allSeated(store.seated) ? "ready" : "waiting";
        store.seq += 1;
        await saveStore(env, store);
        return json({
          ok: true,
          events: [
            {
              type: "match.reset",
              status: store.status,
              phase: store.game.phase,
              message: store.game.message,
              names: publicNames(store),
              seq: store.seq,
            },
          ],
          state: viewForRole(store, role),
          seq: store.seq,
          sessionId: store.sessionId,
          channelName: store.channelName,
        });
      }

      if (type === "set_ruleset") {
        if (role !== "host") {
          return err("role_forbidden", "僅主持可改家規");
        }
        if (store.status === "active") {
          return err("act_rejected", "對局中無法改家規");
        }
        const ruleset =
          payload.ruleset && typeof payload.ruleset === "object"
            ? payload.ruleset
            : {};
        store.game = applyAction(store.game, { type: "set_ruleset", ruleset });
        store.seq += 1;
        await saveStore(env, store);
        return json({
          ok: true,
          events: [
            {
              type: "match.ruleset",
              ruleset: store.game.ruleset,
              message: store.game.message,
              seq: store.seq,
            },
          ],
          state: viewForRole(store, role),
          seq: store.seq,
          sessionId: store.sessionId,
          channelName: store.channelName,
        });
      }

      if (GAME_ACTS.has(type)) {
        const result = applyGameAct(store, role, payload);
        if (!result.ok) {
          return err(result.code || "act_rejected", result.error || "無法執行");
        }
        await saveStore(env, store);
        const event = {
          type: "match.action",
          action: type,
          seat: roleToSeat(role),
          status: store.status,
          phase: store.game.phase,
          turn: store.game.turn,
          mustDiscard: store.game.mustDiscard,
          message: store.game.message,
          ended: store.game.phase === "ended",
          names: publicNames(store),
          seq: store.seq,
        };
        const events = [event];
        if (store.game.phase === "ended") {
          events.push({
            type: "match.over",
            status: store.status,
            phase: store.game.phase,
            result: store.game.result,
            message: store.game.message,
            names: publicNames(store),
            seq: store.seq,
          });
        }
        return json({
          ok: true,
          events,
          state: viewForRole(store, role),
          seq: store.seq,
          sessionId: store.sessionId,
          channelName: store.channelName,
        });
      }

      if (type === "sync") {
        if (store.status === "waiting" && !store.sessionId) {
          return err("session_inactive", "通道尚未開啟", 409);
        }
        return json({
          ok: true,
          events: [],
          state: viewForRole(store, role),
          seq: store.seq,
          sessionId: store.sessionId,
          channelName: store.channelName,
        });
      }

      return err("act_rejected", "未知 act");
    }

    return json({
      ok: true,
      name: "pg-mahjong",
      path,
      roles: MAHJONG_ROLES,
      roleLimits: MAHJONG_ROLE_LIMITS,
    });
  },
};
